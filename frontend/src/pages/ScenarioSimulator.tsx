import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { analyticsApi, portfolioApi } from '../services/api';
import { Portfolio, ScenarioResult, ScenarioType } from '../types';
import { ArrowLeft, Sliders, Play, TrendingUp, TrendingDown, DollarSign, RefreshCw, AlertCircle } from 'lucide-react';

export const ScenarioSimulator: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const portfolioId = parseInt(id || '0', 10);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioType[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>('market_crash');
  const [portfolioValue, setPortfolioValue] = useState<number>(1000000);
  const [customShocks, setCustomShocks] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<'named' | 'custom'>('named');

  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadInitial();
  }, [portfolioId]);

  const loadInitial = async () => {
    try {
      const p = await portfolioApi.getPortfolio(portfolioId);
      setPortfolio(p);

      // Initialize custom shocks dictionary from portfolio holdings
      if (p.holdings) {
        const shocksMap: Record<string, number> = {};
        p.holdings.forEach((h) => {
          shocksMap[h.ticker] = 0;
        });
        setCustomShocks(shocksMap);
      }

      const types = await analyticsApi.getScenarioTypes();
      setScenarios(types);
    } catch (err) {
      console.error('Error loading portfolio for scenario:', err);
    }
  };

  const handleRunScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await analyticsApi.runScenario(
        portfolioId,
        mode === 'named' ? selectedScenario : undefined,
        portfolioValue,
        mode === 'custom' ? customShocks : undefined
      );
      setResult(res);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to simulate scenario.');
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
        <h1 className="text-3xl font-extrabold text-gray-900">Portfolio Stress Scenario Simulator</h1>
        <p className="text-gray-500 text-sm mt-1">Simulate market crashes, sector downturns, or custom macroeconomic shocks</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Controls Column */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            <span>Simulation Parameters</span>
          </h2>

          <form onSubmit={handleRunScenario} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Portfolio Base Value ($)</label>
              <input
                type="number"
                min="1"
                required
                value={portfolioValue}
                onChange={(e) => setPortfolioValue(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Simulation Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('named')}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                    mode === 'named' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-700 border-gray-200'
                  }`}
                >
                  Named Scenario
                </button>
                <button
                  type="button"
                  onClick={() => setMode('custom')}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                    mode === 'custom' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-700 border-gray-200'
                  }`}
                >
                  Custom Shock per Asset
                </button>
              </div>
            </div>

            {mode === 'named' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Predefined Scenario</label>
                <select
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.description}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Custom Asset Return Shock (%)</label>
                {portfolio?.holdings?.map((h) => (
                  <div key={h.ticker} className="flex items-center justify-between space-x-3">
                    <span className="text-xs font-bold text-gray-900 w-16">{h.ticker}</span>
                    <input
                      type="number"
                      step="1"
                      value={(customShocks[h.ticker] || 0) * 100}
                      onChange={(e) =>
                        setCustomShocks({
                          ...customShocks,
                          [h.ticker]: (parseFloat(e.target.value) || 0) / 100,
                        })
                      }
                      className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-right focus:ring-2 focus:ring-indigo-500"
                      placeholder="-10"
                    />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-600 text-xs rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <span>Simulating...</span>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Run Scenario Simulation</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Results Column */}
        <div className="lg:col-span-2 space-y-6">
          {result ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-gray-400">Initial Value</span>
                  <div className="text-xl font-black text-gray-900 mt-1">${result.initial_value.toLocaleString()}</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-gray-400">Final Value</span>
                  <div className="text-xl font-black text-gray-900 mt-1">${result.final_value.toLocaleString()}</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-gray-400">Absolute Change</span>
                  <div className={`text-xl font-black mt-1 ${result.absolute_change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {result.absolute_change >= 0 ? '+' : ''}${result.absolute_change.toLocaleString()}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-gray-400">Percentage Change</span>
                  <div className={`text-xl font-black mt-1 ${result.percentage_change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {result.percentage_change >= 0 ? '+' : ''}{result.percentage_change}%
                  </div>
                </div>
              </div>

              {/* Per Asset Impact Table */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Per-Asset Impact Breakdown</h3>
                  {result.scenario && (
                    <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full">
                      {result.scenario.name}
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                        <th className="px-6 py-3">Ticker</th>
                        <th className="px-6 py-3">Weight</th>
                        <th className="px-6 py-3">Shock applied</th>
                        <th className="px-6 py-3">Initial value</th>
                        <th className="px-6 py-3">Asset change</th>
                        <th className="px-6 py-3">Final value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {result.assets.map((a) => (
                        <tr key={a.ticker} className="hover:bg-gray-50/50">
                          <td className="px-6 py-4 font-bold text-gray-900">{a.ticker}</td>
                          <td className="px-6 py-4 text-gray-700">{a.weight}%</td>
                          <td className={`px-6 py-4 font-semibold ${a.shock >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {a.shock >= 0 ? '+' : ''}{a.shock}%
                          </td>
                          <td className="px-6 py-4 text-gray-900 font-medium">${a.initial_value.toLocaleString()}</td>
                          <td className={`px-6 py-4 font-semibold ${a.change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {a.change >= 0 ? '+' : ''}${a.change.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-gray-900 font-bold">${a.final_value.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
              <Sliders className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-900">Run a Stress Simulation</h3>
              <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
                Configure parameters on the left and click "Run Scenario Simulation" to analyze portfolio impact under market stress.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

