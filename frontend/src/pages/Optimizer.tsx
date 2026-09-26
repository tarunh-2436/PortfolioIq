import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { analyticsApi, portfolioApi } from '../services/api';
import { Portfolio, OptimizationResult } from '../types';
import { ArrowLeft, Cpu, Play, CheckCircle2, AlertCircle } from 'lucide-react';

export const Optimizer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const portfolioId = parseInt(id || '0', 10);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
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
      setPortfolio(p);
      if (p.holdings) {
        setTickerInput(p.holdings.map((h) => h.ticker).join(', '));
      }
    } catch (err) {
      console.error('Error loading portfolio:', err);
    }
  };

  const handleOptimize = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const tickers = tickerInput
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0);

    if (tickers.length < 2) {
      setError('Please provide at least two valid stock tickers for optimization.');
      setLoading(false);
      return;
    }

    try {
      const res = await analyticsApi.optimizePortfolio(portfolioId, tickers);
      setResult(res);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to optimize portfolio.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="border-b border-gray-200 pb-6">
        <Link to={`/portfolios/${portfolioId}`} className="inline-flex items-center space-x-1 text-sm font-medium text-gray-500 hover:text-gray-900 mb-2">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Portfolio</span>
        </Link>
        <h1 className="text-3xl font-extrabold text-gray-900">PyPortfolioOpt Efficient Frontier Optimizer</h1>
        <p className="text-gray-500 text-sm mt-1">Calculate Markowitz optimal Sharpe ratio allocation weights</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Controls Column */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-sky-600" />
            <span>Target Assets</span>
          </h2>

          <form onSubmit={handleOptimize} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock Tickers (comma separated)</label>
              <textarea
                rows={3}
                required
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 font-mono uppercase"
                placeholder="AAPL, MSFT, NVDA, JPM, JNJ"
              />
              <p className="text-xs text-gray-500 mt-1">Enter at least two ticker symbols to compute efficient frontier.</p>
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
              {/* Summary Metrics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-gray-400">Expected Return</span>
                  <div className="text-2xl font-black text-emerald-600 mt-1">+{result.expected_return}%</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-gray-400">Optimized Volatility</span>
                  <div className="text-2xl font-black text-gray-900 mt-1">{result.volatility}%</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-gray-400">Max Sharpe Ratio</span>
                  <div className="text-2xl font-black text-sky-600 mt-1">{result.sharpe_ratio}</div>
                </div>
              </div>

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
                        <th className="px-6 py-3">Optimal Weight (%)</th>
                        <th className="px-6 py-3">Allocation Bar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {Object.entries(result.weights).map(([ticker, weight]) => {
                        const pct = Number(weight) * 100;
                        return (
                          <tr key={ticker} className="hover:bg-gray-50/50">
                            <td className="px-6 py-4 font-bold text-gray-900">{ticker}</td>
                            <td className="px-6 py-4 font-semibold text-sky-600">{pct.toFixed(2)}%</td>
                            <td className="px-6 py-4 w-64">
                              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div
                                  className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                ></div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
              <Cpu className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-900">PyPortfolioOpt Portfolio Optimization</h3>
              <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
                Click "Compute Optimal Weights" to find the maximum Sharpe ratio allocation across your selected tickers.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

