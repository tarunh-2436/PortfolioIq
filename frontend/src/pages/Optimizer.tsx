import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { analyticsApi, portfolioApi } from '../services/api';
import { OptimizationResult } from '../types';
import { ArrowLeft, Cpu, Play, AlertCircle, Info, Sparkles, TriangleAlert } from 'lucide-react';

const TICKER_RE = /^[A-Z0-9^][A-Z0-9.\-=&^]{0,19}$/;
const MAX_TICKERS = 50;

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="border-b border-gray-200 pb-6">
        <Link to={`/portfolios/${portfolioId}`} className="inline-flex items-center space-x-1 text-sm font-medium text-gray-500 hover:text-gray-900 mb-2">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Portfolio</span>
        </Link>
        <h1 className="text-3xl font-extrabold text-gray-900">Portfolio Optimizer</h1>
        <p className="text-gray-500 text-sm mt-1">
          Finds the mix with the best return per unit of risk (maximum Sharpe ratio) and explains every weight.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Controls Column */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6 self-start">
          <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-sky-600" />
            <span>Target Assets</span>
          </h2>

          <form onSubmit={handleOptimize} className="space-y-4" noValidate>
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
        <div className="lg:col-span-2 space-y-6">
          {result ? (
            <>
              {/* Summary Metrics Cards, optimal vs current */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-gray-400">Expected Return</span>
                  <div className="text-2xl font-black text-emerald-600 mt-1">
                    {result.expected_return >= 0 ? '+' : ''}
                    {result.expected_return}%
                  </div>
                  {hasCurrent && (
                    <p className="text-xs text-gray-500 mt-1">
                      Current {result.current!.expected_return}% ({delta(result.expected_return, result.current!.expected_return)} pts)
                    </p>
                  )}
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-gray-400">Optimized Volatility</span>
                  <div className="text-2xl font-black text-gray-900 mt-1">{result.volatility}%</div>
                  {hasCurrent && (
                    <p className="text-xs text-gray-500 mt-1">
                      Current {result.current!.volatility}% ({delta(result.volatility, result.current!.volatility)} pts)
                    </p>
                  )}
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-gray-400">
                    {result.method === 'min_volatility' ? 'Sharpe Ratio' : 'Max Sharpe Ratio'}
                  </span>
                  <div className="text-2xl font-black text-sky-600 mt-1">{result.sharpe_ratio}</div>
                  {hasCurrent && (
                    <p className="text-xs text-gray-500 mt-1">
                      Current {result.current!.sharpe_ratio} ({delta(result.sharpe_ratio, result.current!.sharpe_ratio)})
                    </p>
                  )}
                </div>
              </div>

              {/* Why this allocation */}
              {explanation && (
                <div className="bg-sky-50 border border-sky-100 rounded-xl p-5">
                  <div className="flex items-center space-x-2 mb-2">
                    <Info className="w-4 h-4 text-sky-600" />
                    <h3 className="text-sm font-bold text-sky-900">Why this allocation?</h3>
                  </div>
                  <p className="text-sm text-sky-900/90 leading-relaxed">{explanation.summary}</p>
                </div>
              )}

              {/* Optimized Weights Table */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900">Optimal Asset Allocations</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                        <th className="px-6 py-3">Ticker</th>
                        {hasCurrent && <th className="px-6 py-3">Current</th>}
                        <th className="px-6 py-3">Optimal</th>
                        {hasCurrent && <th className="px-6 py-3">Action</th>}
                        <th className="px-6 py-3">Why</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm align-top">
                      {(explanation?.assets ??
                        Object.entries(result.weights).map(([ticker, w]) => ({
                          ticker,
                          optimal_weight: Number(w) * 100,
                          role: '',
                          reasons: [] as string[],
                        }))
                      ).map((a: any) => (
                        <tr key={a.ticker} className="hover:bg-gray-50/50">
                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-900">{a.ticker}</div>
                            {a.role && <div className="text-[11px] text-gray-400">{a.role}</div>}
                          </td>
                          {hasCurrent && (
                            <td className="px-6 py-4 text-gray-600">
                              {a.current_weight !== undefined ? `${Number(a.current_weight).toFixed(2)}%` : '-'}
                            </td>
                          )}
                          <td className="px-6 py-4 min-w-[140px]">
                            <div className="font-semibold text-sky-600">{Number(a.optimal_weight).toFixed(2)}%</div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden mt-1.5">
                              <div
                                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, Number(a.optimal_weight))}%` }}
                              ></div>
                            </div>
                          </td>
                          {hasCurrent && (
                            <td className="px-6 py-4">
                              {a.action && (
                                <div>
                                  <span
                                    className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                      ACTION_STYLE[a.action] || ACTION_STYLE.Hold
                                    }`}
                                  >
                                    {a.action}
                                  </span>
                                  {a.change !== undefined && a.action !== 'Hold' && (
                                    <div className="text-[11px] text-gray-500 mt-1">
                                      {a.change >= 0 ? '+' : ''}
                                      {Number(a.change).toFixed(1)} pts
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          )}
                          <td className="px-6 py-4 text-xs text-gray-600 leading-relaxed min-w-[260px]">
                            {a.reasons && a.reasons.length > 0 ? (
                              <ul className="space-y-1">
                                {a.reasons.map((r: string, i: number) => (
                                  <li key={i}>{r}</li>
                                ))}
                                {a.annual_return !== undefined && (
                                  <li className="text-gray-400">
                                    {a.annual_return}% return · {a.volatility}% volatility · Sharpe {a.sharpe_ratio}
                                  </li>
                                )}
                              </ul>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Caveats */}
              {explanation && explanation.notes.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-5">
                  <div className="flex items-center space-x-2 mb-2">
                    <TriangleAlert className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-bold text-amber-900">Things to keep in mind</h3>
                  </div>
                  <ul className="space-y-1 list-disc list-inside">
                    {explanation.notes.map((n, i) => (
                      <li key={i} className="text-xs text-amber-900/90 leading-relaxed">
                        {n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* AI commentary (optional) */}
              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 text-white">
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
                {result.ai?.available && result.ai.analysis ? (
                  <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">{result.ai.analysis}</p>
                ) : (
                  <div className="p-3 bg-slate-800/60 rounded-lg text-slate-400 text-xs leading-relaxed border border-slate-700/50">
                    <p className="font-semibold text-slate-300">Gemini temporarily unavailable</p>
                    <p className="mt-1">
                      {(result.ai?.error || '').replace(/^LLM unavailable:\s*/, '') ||
                        'Gemini is temporarily unavailable due to high traffic. Please try again in a minute.'}{' '}
                      The allocation and the explanation above are calculated directly from your price data and are unaffected.
                    </p>
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
