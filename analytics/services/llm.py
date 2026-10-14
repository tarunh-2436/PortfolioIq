"""Resilient Gemini wrapper.

Gemini models on shared/free keys fail in many different ways (503 high demand,
429 per-model quota, 504 deadline, retired models returning 404, thinking-only
empty replies). This module hides all of that behind one call, ``generate_text``,
which never raises and always returns a result dict:

    {"available": True,  "text": "...", "model": "gemini-3.5-flash"}
    {"available": False, "text": None,  "model": None, "error": "LLM unavailable: ..."}

Reliability measures:
  * model discovery  - only models that actually exist for the key are tried
  * per-model cooldowns - a failing model is skipped for a while (and the
    last model that worked is tried first)
  * bounded retries, per-call timeout and an overall time budget
  * circuit breaker - when every model fails, further calls fail instantly
    for a short period instead of making each request wait
  * response cache - identical prompts are answered from memory
"""

import hashlib
import logging
import os
import random
import threading
import time

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("analytics.llm")
logging.getLogger("google_genai").setLevel(logging.WARNING)

# Preference order. Override with GEMINI_MODELS="model-a,model-b".
DEFAULT_MODELS = [
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-flash-latest",
]

PER_CALL_TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "12"))
TOTAL_BUDGET_S = float(os.getenv("LLM_BUDGET_S", "25"))
BREAKER_S = float(os.getenv("LLM_BREAKER_S", "45"))
CACHE_TTL_S = float(os.getenv("LLM_CACHE_TTL_S", "600"))
DISCOVERY_TTL_S = 1800
MAX_OUTPUT_TOKENS = 4096

# Cooldown applied to a model after each kind of failure (seconds)
COOLDOWN_NOT_FOUND = 3600
COOLDOWN_QUOTA = 60
COOLDOWN_OVERLOAD = 30
COOLDOWN_TIMEOUT = 60
COOLDOWN_EMPTY = 30

UNAVAILABLE_MESSAGE = (
    "LLM unavailable: AI commentary could not be generated right now. "
    "All calculated analytics are still accurate and shown."
)

_lock = threading.Lock()
_cooldowns: dict[str, float] = {}
_last_good: str | None = None
_breaker_until = 0.0
_discovered: tuple[float, set[str]] | None = None
_cache: dict[str, tuple[float, dict]] = {}
_client = None
_client_key = None


def _unavailable(reason: str | None = None) -> dict:
    return {
        "available": False,
        "text": None,
        "model": None,
        "error": reason or UNAVAILABLE_MESSAGE,
    }


def configured_models() -> list[str]:
    raw = os.getenv("GEMINI_MODELS", "")
    models = [m.strip() for m in raw.split(",") if m.strip()]
    return models or list(DEFAULT_MODELS)


def _get_client(api_key: str):
    global _client, _client_key
    if _client is None or _client_key != api_key:
        from google import genai
        from google.genai import types

        _client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=int(PER_CALL_TIMEOUT_S * 1000)),
        )
        _client_key = api_key
    return _client


def _discover_models(client) -> set[str] | None:
    """Names of models usable with generateContent for this key (cached)."""
    global _discovered
    now = time.time()
    with _lock:
        if _discovered and now - _discovered[0] < DISCOVERY_TTL_S:
            return _discovered[1]
    try:
        names = set()
        for m in client.models.list():
            actions = getattr(m, "supported_actions", None) or []
            if "generateContent" in actions:
                names.add((m.name or "").replace("models/", ""))
        if names:
            with _lock:
                _discovered = (now, names)
            return names
    except Exception as e:
        logger.warning("Gemini model discovery failed: %s", e)
    return None


def _candidate_models(client) -> list[str]:
    models = configured_models()
    available = _discover_models(client)
    if available:
        filtered = [m for m in models if m in available]
        if filtered:
            models = filtered
    now = time.time()
    with _lock:
        usable = [m for m in models if _cooldowns.get(m, 0) <= now]
        if _last_good in usable:
            usable.remove(_last_good)
            usable.insert(0, _last_good)
    return usable


def _error_code(exc: Exception) -> int | None:
    code = getattr(exc, "code", None)
    if isinstance(code, int):
        return code
    status = getattr(exc, "status_code", None)
    return status if isinstance(status, int) else None


def _is_timeout(exc: Exception) -> bool:
    name = type(exc).__name__.lower()
    return "timeout" in name or "timedout" in name or _error_code(exc) == 504


def _cool(model: str, seconds: float) -> None:
    with _lock:
        _cooldowns[model] = time.time() + seconds


def _extract_text(response) -> str:
    text = None
    try:
        text = response.text
    except Exception:
        text = None
    if text and text.strip():
        return text.strip()
    parts_text = []
    for cand in getattr(response, "candidates", None) or []:
        content = getattr(cand, "content", None)
        for part in getattr(content, "parts", None) or []:
            if getattr(part, "thought", False):
                continue
            if getattr(part, "text", None):
                parts_text.append(part.text)
    return "".join(parts_text).strip()


def generate_text(
    prompt: str,
    system_instruction: str | None = None,
    temperature: float = 0.2,
) -> dict:
    """Generate text with automatic failover. Never raises."""
    global _last_good, _breaker_until

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return _unavailable("LLM unavailable: GEMINI_API_KEY is not configured.")

    cache_key = hashlib.sha256(
        f"{system_instruction}\n{temperature}\n{prompt}".encode("utf-8")
    ).hexdigest()
    now = time.time()
    with _lock:
        hit = _cache.get(cache_key)
        if hit and now - hit[0] < CACHE_TTL_S:
            return dict(hit[1])
        if _breaker_until > now:
            return _unavailable()

    try:
        from google.genai import types

        client = _get_client(api_key)
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=temperature,
            max_output_tokens=MAX_OUTPUT_TOKENS,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
    except Exception as e:
        logger.error("Could not initialise Gemini client: %s", e)
        return _unavailable()

    started = time.time()
    models = _candidate_models(client)
    if not models:
        # Everything is cooling down: fail fast rather than hammering the API.
        with _lock:
            _breaker_until = time.time() + BREAKER_S
        return _unavailable()

    last_error = None
    for model in models:
        for attempt in range(2):
            if time.time() - started > TOTAL_BUDGET_S:
                break
            try:
                response = client.models.generate_content(
                    model=model, contents=prompt, config=config
                )
                text = _extract_text(response)
                if not text:
                    raise RuntimeError("empty response")
                result = {"available": True, "text": text, "model": model}
                with _lock:
                    _last_good = model
                    _cooldowns.pop(model, None)
                    _breaker_until = 0.0
                    _cache[cache_key] = (time.time(), result)
                    if len(_cache) > 200:
                        oldest = min(_cache, key=lambda k: _cache[k][0])
                        _cache.pop(oldest, None)
                return dict(result)
            except Exception as e:
                last_error = e
                code = _error_code(e)
                logger.warning("Gemini %s failed (attempt %d): %s", model, attempt + 1, str(e)[:200])
                if code in (401, 403):
                    # Key problem - no model will work.
                    with _lock:
                        _breaker_until = time.time() + 300
                    return _unavailable("LLM unavailable: the Gemini API key was rejected.")
                if code in (400, 404):
                    _cool(model, COOLDOWN_NOT_FOUND)
                    break
                if code == 429:
                    _cool(model, COOLDOWN_QUOTA)
                    break
                if _is_timeout(e):
                    _cool(model, COOLDOWN_TIMEOUT)
                    break
                if isinstance(e, RuntimeError):
                    _cool(model, COOLDOWN_EMPTY)
                    break
                # 500/502/503 and other transient failures: one quick retry
                if attempt == 0:
                    time.sleep(0.8 + random.random() * 0.7)
                    continue
                _cool(model, COOLDOWN_OVERLOAD)
        if time.time() - started > TOTAL_BUDGET_S:
            break

    with _lock:
        _breaker_until = time.time() + BREAKER_S
    logger.error("All Gemini models failed; last error: %s", last_error)
    return _unavailable()


def reset_state() -> None:
    """Clear cooldowns/breaker/cache (used by tests)."""
    global _last_good, _breaker_until, _discovered, _client, _client_key
    with _lock:
        _cooldowns.clear()
        _cache.clear()
        _last_good = None
        _breaker_until = 0.0
        _discovered = None
        _client = None
        _client_key = None
