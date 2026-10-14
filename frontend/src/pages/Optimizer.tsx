import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { analyticsApi, portfolioApi } from '../services/api';
import { OptimizationResult } from '../types';
import {
  ArrowLeft,
  Cpu,
  Play,
  AlertCircle,
  Info,
  Sparkles,
  TriangleAlert,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';

const TICKER_RE = /^[A-Z0-9^][A-Z0-9.\-=&^]{0,19}$/;
const MAX_TICKERS = 50;

type Tab = 'allocation' | 'explanation' | 'ai';

const ACTION_STYLE: Record<string, string> = {
  Add: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Increase: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Reduce: 'bg-amber-50 text-amber-700 border-amber-200',
  Exit: 'bg-rose-50 text-rose-700 border-rose-200',
  Hold: 'bg-gray-50 text-gray-600 border-gray-200',
};

// Parse and validate the ticker box. Returns tickers or an error message.
const parseTickers = (text: string): { tickers: string[]; error: string } => {
  const raw = text
    .split(/[\s,;]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  const bad = raw.find((t) => !TICKER_RE.test(t));
  if (bad) return { tickers: [], error: `"${bad}" is not a valid ticker symbol.` };
  const unique = Array.from(new Set(raw));
  if (unique.length < 2) return { tickers: unique, error: 'Enter at least two different ticker symbols.' };
  if (unique.length > MAX_TICKERS) return { tickers: unique, error: `At most ${MAX_TICKERS} tickers are supported.` };
  return { tickers: unique, error: '' };
};

export const Optimizer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const portfolioId = parseInt(id || '0', 10);
  const [tickerInput, setTickerInput] = useState<string>('');
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('allocation');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadPortfolio();
  }, [portfolioId]);

  const loadPortfolio = async () => {
    try {
      const p = await portfolioApi.getPortfolio(portfolioId);
      if (p.holdings) {
        setTickerInput(p.holdings.map((h) => h.ticker).join(', '));
      }
    } catch (err) {
      console.error('Error loading portfolio:', err);
    }
  };

  const handleOptimize = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const { tickers, error: parseError } = parseTickers(tickerInput);
    if (parseError) {
      setError(parseError);
      return;
    }

    setLoading(true);
    try {
      const res = await analyticsApi.optimizePortfolio(portfolioId, tickers);
      setResult(res);
      setTab('allocation');
      setExpanded(new Set());
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to optimize portfolio.');
    } finally {
      setLoading(false);
    }
  };

  const liveCheck = tickerInput.trim() ? parseTickers(tickerInput) : { tickers: [], error: '' };
  const explanation = result?.explanation;
  const hasCurrent = !!result?.current;

  const delta = (optimal: number, current: number, digits = 2) => {
    const d = optimal - current;
    return `${d >= 0 ? '+' : ''}${d.toFixed(digits)}`;
  };

  const rows: any[] = result
    ? explanation?.assets ??
      Object.entries(result.weights).map(([ticker, w]) => ({
        ticker,
        optimal_weight: Number(w) * 100,
        role: '',
        reasons: [] as string[],
      }))
    : [];

  const toggleRow = (ticker: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const expandableRows = rows.filter((r) => r.reasons && r.reasons.length > 0);
  const allExpanded = expandableRows.length > 0 && expandableRows.every((r) => expanded.has(r.ticker));
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(expandableRows.map((r) => r.ticker)));

  const aiReady = !!(result?.ai?.available && result.ai.analysis);
  const noteCount = explanation?.notes?.length ?? 0;

  const TABS: { id: Tab; label: string; badge?: string }[] = [
    { id: 'allocation', label: 'Allocation' },
    { id: 'explanation', label: 'Explanation', badge: noteCount > 0 ? String(noteCount) : undefined },
    { id: 'ai', label: 'AI Commentary', badge: aiReady ? undefined : '!' },
  ];

  // Compact metric: label, big value, and the change versus the current portfolio
  const Metric: React.FC<{ label: string; value: string; tone: string; sub?: string }> = ({ label, value, tone, sub }) => (
    <div className="px-4 py-3 min-w-0">
      <div className="text-[11px] font-semibold uppercase text-gray-400 truncate">{label}</div>
      <div className={`text-xl font-black leading-tight ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 truncate">{sub}</div>}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <Link to={`/portfolios/${portfolioId}`} className="inline-flex items-center space-x-1 text-sm font-medium text-gray-500 hover:text-gray-900 mb-1">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Portfolio</span>
        </Link>
        <h1 className="text-2xl font-extrabold text-gray-900">Portfolio Optimizer</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Finds the mix with the best return per unit of risk (maximum Sharpe ratio) and explains every weight.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Controls Column: stays in view while the results scroll */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4 lg:sticky lg:top-20">
          <h2 className="text-base font-bold text-gray-900 flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-sky-600" />
            <span>Target Assets</span>
          </h2>

          <form onSubmit={handleOptimize} className="space-y-3" noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock Tickers (comma separated)</label>
              <textarea
                rows={3}
                required
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-sky-500 font-mono uppercase ${
                  liveCheck.error && tickerInput.trim() ? 'border-amber-400' : 'border-gray-300'
                }`}
                placeholder="AAPL, MSFT, NVDA, RELIANCE.NS"
              />
              {liveCheck.error ? (
                <p className="text-xs text-amber-600 mt-1">{liveCheck.error}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  {liveCheck.tickers.length} tickers. Include the exchange suffix for non-US stocks (e.g. .NS for NSE India).
                </p>
              )}
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-600 text-xs rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <span>Optimizing...</span>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Compute Optimal Weights</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Results Column */}
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {result ? (
            <>
              {/* Metrics: one compact strip, optimal vs current */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm grid grid-cols-3 divide-x divide-gray-100">
                <Metric
                  label="Expected Return"
                  value={`${result.expected_return >= 0 ? '+' : ''}${result.expected_return}%`}
                  tone="text-emerald-600"
                  sub={hasCurrent ? `was ${result.current!.expected_return}% (${delta(result.expected_return, result.current!.expected_return)})` : undefined}
                />
                <Metric
                  label="Volatility"
                  value={`${result.volatility}%`}
                  tone="text-gray-900"
                  sub={hasCurrent ? `was ${result.current!.volatility}% (${delta(result.volatility, result.current!.volatility)})` : undefined}
                />
                <Metric
                  label={result.method === 'min_volatility' ? 'Sharpe Ratio' : 'Max Sharpe'}
                  value={String(result.sharpe_ratio)}
                  tone="text-sky-600"
                  sub={hasCurrent ? `was ${result.current!.sharpe_ratio} (${delta(result.sharpe_ratio, result.current!.sharpe_ratio)})` : undefined}
                />
              </div>

              {/* Tabs */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex border-b border-gray-200 px-2" role="tablist">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      role="tab"
                      aria-selected={tab === t.id}
                      onClick={() => setTab(t.id)}
                      className={`relative px-4 py-3 text-sm font-semibold transition-colors flex items-center space-x-1.5 ${
                        tab === t.id ? 'text-sky-700' : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      <span>{t.label}</span>
                      {t.badge && (
                        <span
                          className={`text-[10px] font-bold px-1.5 rounded-full ${
                            t.badge === '!' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {t.badge}
                        </span>
                      )}
                      {tab === t.id && <span className="absolute inset-x-3 -bottom-px h-0.5 bg-sky-600 rounded-full" />}
                    </button>
                  ))}
                </div>

                {/* Allocation tab: compact table, click a row for its reasons */}
                {tab === 'allocation' && (
                  <div>
                    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/60">
                      <span className="text-xs text-gray-500">Click a row to see why the optimizer chose that weight.</span>
                      {expandableRows.length > 0 && (
                        <button onClick={toggleAll} className="text-xs font-semibold text-sky-600 hover:text-sky-800">
                          {allExpanded ? 'Collapse all' : 'Expand all'}
                        </button>
                      )}
                    </div>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[11px] font-semibold text-gray-400 uppercase border-b border-gray-100">
                          <th className="pl-4 pr-2 py-2">Ticker</th>
                          <th className="px-2 py-2">{hasCurrent ? 'Current → Optimal' : 'Optimal'}</th>
                          <th className="px-2 py-2 hidden sm:table-cell w-40">Allocation</th>
                          {hasCurrent && <th className="pl-2 pr-4 py-2 text-right">Action</th>}
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {rows.map((a) => {
                          const open = expanded.has(a.ticker);
                          const canOpen = a.reasons && a.reasons.length > 0;
                          return (
                            <React.Fragment key={a.ticker}>
                              <tr
                                onClick={() => canOpen && toggleRow(a.ticker)}
                                className={`border-b border-gray-100 ${canOpen ? 'cursor-pointer hover:bg-gray-50' : ''} ${open ? 'bg-sky-50/40' : ''}`}
                              >
                                <td className="pl-4 pr-2 py-2.5">
                                  <div className="flex items-center space-x-1.5">
                                    {canOpen &&
                                      (open ? (
                                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                                      ))}
                                    <div>
                                      <div className="font-bold text-gray-900 leading-tight">{a.ticker}</div>
                                      {a.role && <div className="text-[11px] text-gray-400 leading-tight">{a.role}</div>}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-2 py-2.5 whitespace-nowrap">
                                  {hasCurrent && a.current_weight !== undefined && (
                                    <span className="text-gray-500">
                                      {Number(a.current_weight).toFixed(1)}%
                                      <ArrowRight className="inline w-3 h-3 mx-1 text-gray-300" />
                                    </span>
                                  )}
                                  <span className="font-semibold text-sky-600">{Number(a.optimal_weight).toFixed(1)}%</span>
                                </td>
                                <td className="px-2 py-2.5 hidden sm:table-cell">
                                  <div className="relative w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                    {hasCurrent && a.current_weight !== undefined && (
                                      <div
                                        className="absolute inset-y-0 left-0 bg-gray-300 rounded-full"
                                        style={{ width: `${Math.min(100, Number(a.current_weight))}%` }}
                                      />
                                    )}
                                    <div
                                      className="absolute inset-y-0 left-0 bg-emerald-500/80 rounded-full"
                                      style={{ width: `${Math.min(100, Number(a.optimal_weight))}%`, mixBlendMode: 'multiply' }}
                                    />
                                  </div>
                                </td>
                                {hasCurrent && (
                                  <td className="pl-2 pr-4 py-2.5 text-right whitespace-nowrap">
                                    {a.action && (
                                      <span
                                        className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                          ACTION_STYLE[a.action] || ACTION_STYLE.Hold
                                        }`}
                                      >
                                        {a.action}
                                        {a.change !== undefined && a.action !== 'Hold' && (
                                          <span className="font-normal opacity-80">
                                            {' '}
                                            {a.change >= 0 ? '+' : ''}
                                            {Number(a.change).toFixed(1)}
                                          </span>
                                        )}
                                      </span>
                                    )}
                                  </td>
                                )}
                              </tr>
                              {open && canOpen && (
                                <tr className="bg-sky-50/40 border-b border-gray-100">
                                  <td colSpan={hasCurrent ? 4 : 3} className="pl-10 pr-4 pb-3 pt-0.5">
                                    <ul className="space-y-1 text-xs text-gray-600 leading-relaxed list-disc list-outside ml-3">
                                      {a.reasons.map((r: string, i: number) => (
                                        <li key={i}>{r}</li>
                                      ))}
                                    </ul>
                                    {a.annual_return !== undefined && (
                                      <p className="mt-1.5 text-[11px] text-gray-400">
                                        {a.annual_return}% return · {a.volatility}% volatility · Sharpe {a.sharpe_ratio}
                                      </p>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Explanation tab: summary + caveats */}
                {tab === 'explanation' && (
                  <div className="p-4 space-y-4">
                    {explanation ? (
                      <>
                        <div className="bg-sky-50 border border-sky-100 rounded-lg p-4">
                          <div className="flex items-center space-x-2 mb-1.5">
                            <Info className="w-4 h-4 text-sky-600" />
                            <h3 className="text-sm font-bold text-sky-900">Why this allocation?</h3>
                          </div>
                          <p className="text-sm text-sky-900/90 leading-relaxed">{explanation.summary}</p>
                        </div>

                        {explanation.notes.length > 0 && (
                          <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
                            <div className="flex items-center space-x-2 mb-1.5">
                              <TriangleAlert className="w-4 h-4 text-amber-600" />
                              <h3 className="text-sm font-bold text-amber-900">Things to keep in mind</h3>
                            </div>
                            <ul className="space-y-1 list-disc list-outside ml-4">
                              {explanation.notes.map((n, i) => (
                                <li key={i} className="text-xs text-amber-900/90 leading-relaxed">
                                  {n}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">No explanation is available for this result.</p>
                    )}
                  </div>
                )}

                {/* AI commentary tab */}
                {tab === 'ai' && (
                  <div className="p-4">
                    <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 text-white">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <Sparkles className="w-4 h-4 text-sky-400" />
                          <h3 className="text-sm font-bold">AI Commentary</h3>
                        </div>
                        {result.ai?.model && (
                          <span className="text-xs px-2 py-0.5 bg-slate-800 text-sky-400 border border-slate-700 rounded-full font-mono">
                            {result.ai.model}
                          </span>
                        )}
                      </div>
                      {aiReady ? (
                        <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">{result.ai!.analysis}</p>
                      ) : (
                        <div className="p-3 bg-slate-800/60 rounded-lg text-slate-400 text-xs leading-relaxed border border-slate-700/50">
                          <p className="font-semibold text-slate-300">Gemini temporarily unavailable</p>
                          <p className="mt-1">
                            {(result.ai?.error || '').replace(/^LLM unavailable:\s*/, '') ||
                              'Gemini is temporarily unavailable due to high traffic. Please try again in a minute.'}{' '}
                            The allocation and the explanation are calculated directly from your price data and are unaffected.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
              <Cpu className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-900">Portfolio Optimization</h3>
              <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
                Click "Compute Optimal Weights" to find the highest risk-adjusted-return allocation across your selected tickers,
                with an explanation for every weight.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
