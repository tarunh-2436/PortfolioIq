// Shared input validation helpers. Each parser returns { value } on success or { error } on failure.

const TICKER_RE = /^[A-Z0-9^][A-Z0-9.\-=&^]{0,19}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LIMITS = {
  name: { min: 2, max: 100 },
  portfolioName: { min: 1, max: 100 },
  description: { max: 500 },
  email: { max: 255 },
  password: { min: 6, max: 128 },
  maxHoldings: 50,
  maxPortfolioValue: 1e12,
  minShock: -1, // -100%
  maxShock: 5, // +500%
};

// Tolerance for floating point sums of weights (e.g. 0.3333 * 3)
const WEIGHT_EPSILON = 0.0005;

function parseText(raw, label, { min = 0, max = 255, required = true } = {}) {
  if (raw === undefined || raw === null || raw === '') {
    return required ? { error: `${label} is required.` } : { value: null };
  }
  if (typeof raw !== 'string') return { error: `${label} must be text.` };
  const value = raw.trim();
  if (required && value.length === 0) return { error: `${label} is required.` };
  if (value.length < min) return { error: `${label} must be at least ${min} characters.` };
  if (value.length > max) return { error: `${label} must be at most ${max} characters.` };
  return { value: value.length ? value : null };
}

function parseEmail(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return { error: 'Email is required.' };
  const value = raw.trim().toLowerCase();
  if (value.length > LIMITS.email.max || !EMAIL_RE.test(value)) {
    return { error: 'Please enter a valid email address.' };
  }
  return { value };
}

function parsePassword(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return { error: 'Password is required.' };
  if (raw.length < LIMITS.password.min) {
    return { error: `Password must be at least ${LIMITS.password.min} characters long.` };
  }
  if (raw.length > LIMITS.password.max) {
    return { error: `Password must be at most ${LIMITS.password.max} characters long.` };
  }
  if (raw.trim().length === 0) return { error: 'Password cannot be only spaces.' };
  return { value: raw };
}

function parseTicker(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return { error: 'A ticker symbol is required.' };
  const value = raw.replace(/\s+/g, '').toUpperCase();
  if (!TICKER_RE.test(value)) {
    return {
      error: `'${raw.trim()}' is not a valid ticker. Use letters/numbers only, e.g. AAPL or RELIANCE.NS.`,
    };
  }
  return { value };
}

// Weight is a fraction: 0 < w <= 1. Rounded to 4 decimals (the DB column precision).
function parseWeight(raw) {
  if (raw === undefined || raw === null || raw === '' || typeof raw === 'boolean') {
    return { error: 'Weight is required.' };
  }
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return { error: 'Weight must be a number.' };
  if (n <= 0 || n > 1) return { error: 'Weight must be greater than 0% and at most 100%.' };
  const value = Math.round(n * 10000) / 10000;
  if (value <= 0) return { error: 'Weight is too small (minimum 0.01%).' };
  return { value };
}

function parseId(raw, label = 'ID') {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return { error: `Invalid ${label}.` };
  return { value: n };
}

function parsePortfolioValue(raw) {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(n)) {
    return { error: 'Portfolio value must be a number.' };
  }
  if (n <= 0) return { error: 'Portfolio value must be greater than 0.' };
  if (n > LIMITS.maxPortfolioValue) return { error: 'Portfolio value is too large.' };
  return { value: n };
}

// Custom shocks: { "Technology": -0.2, ... } as fractions
function parseDomainShocks(raw) {
  if (raw === undefined || raw === null) return { value: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Custom shocks must be an object of domain -> shock.' };
  }
  const value = {};
  for (const [domain, v] of Object.entries(raw)) {
    const n = typeof v === 'number' ? v : Number(v);
    if (v === '' || v === null || !Number.isFinite(n)) {
      return { error: `Shock for '${domain}' must be a number.` };
    }
    if (n < LIMITS.minShock || n > LIMITS.maxShock) {
      return {
        error: `Shock for '${domain}' must be between ${LIMITS.minShock * 100}% and +${LIMITS.maxShock * 100}%.`,
      };
    }
    value[domain] = n;
  }
  return { value };
}

function sumWeights(rows) {
  return rows.reduce((sum, h) => sum + Number(h.weight), 0);
}

module.exports = {
  LIMITS,
  WEIGHT_EPSILON,
  parseText,
  parseEmail,
  parsePassword,
  parseTicker,
  parseWeight,
  parseId,
  parsePortfolioValue,
  parseDomainShocks,
  sumWeights,
};
