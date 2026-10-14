import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { analyticsApi, portfolioApi } from '../services/api';
import { AnalyticsResponse, Portfolio } from '../types';
import { HealthBadge } from '../components/HealthBadge';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  ArrowLeft,
  TrendingUp,
  Activity,
  Shield,
  AlertOctagon,
  Sparkles,
  PieChart as PieIcon,
  RefreshCw,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react';

const COLORS = ['#0284c7', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];

export const Dashboard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const portfolioId = parseInt(id || '0', 10);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [portfolioId]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const p = await portfolioApi.getPortfolio(portfolioId);
      setPortfolio(p);
      const res = await analyticsApi.analyzePortfolio(portfolioId);
      setAnalytics(res);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to compute portfolio analytics.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-32 space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600"></div>
        <p className="text-gray-500 text-sm font-medium">Fetching market data & computing quantitative risk metrics...</p>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white border border-gray-200 rounded-xl shadow-sm text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Analytics Computation Error</h2>
        <p className="text-gray-600 text-sm mb-6">{error || 'Unable to compute analytics for this portfolio.'}</p>
        <div className="flex justify-center space-x-4">
          <Link to={`/portfolios/${portfolioId}`} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Edit Holdings
          </Link>
          <button onClick={loadData} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700">
            Retry Analysis
          </button>
        </div>
      </div>
    );
  }

  const { metrics, diversification, health, performance, holdings, correlation, recommendations, ai } = analytics;

  // Sector chart data format
  const sectorData = Object.entries(diversification.sector_allocation || {}).map(([sector, pct]) => ({
    name: sector,
    value: pct,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <Link to={`/portfolios/${portfolioId}`} className="inline-flex items-center space-x-1 text-sm font-medium text-gray-500 hover:text-gray-900 mb-2">
            <ArrowLeft className="w-4 h-4" />
            <span>Manage Holdings</span>
          </Link>
          <h1 className="text-3xl font-extrabold text-gray-900">{portfolio?.name} Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">Quantitative risk analysis, diversification scores, and AI decision support</p>
        </div>
        <div className="flex items-center space-x-4">
          <HealthBadge score={health.score} />
          <button onClick={loadData} className="p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 shadow-sm" title="Refresh Analytics">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold uppercase text-gray-400">Annual Return</span>
          <div className="text-2xl font-black text-gray-900 mt-1 flex items-baseline space-x-1">
            <span className={metrics.annual_return >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
              {metrics.annual_return >= 0 ? '+' : ''}{metrics.annual_return}%
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold uppercase text-gray-400">Volatility</span>
          <div className="text-2xl font-black text-gray-900 mt-1">{metrics.volatility}%</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold uppercase text-gray-400">Sharpe Ratio</span>
          <div className="text-2xl font-black text-gray-900 mt-1">{metrics.sharpe_ratio}</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold uppercase text-gray-400">Beta vs S&P 500</span>
          <div className="text-2xl font-black text-gray-900 mt-1">{metrics.beta}</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold uppercase text-gray-400">Max Drawdown</span>
          <div className="text-2xl font-black text-rose-600 mt-1">{metrics.max_drawdown}%</div>
        </div>
      </div>

      {/* Main Charts & Allocation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cumulative Performance History */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Historical Value Growth ($1M base)</h3>
            <span className="text-xs text-gray-400 font-medium">1 Year Daily Trailing</span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performance}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 12 }}
                  stroke="#94a3b8"
                />
                <Tooltip
                  formatter={(value: any) => [`$${Number(value).toLocaleString()}`, 'Portfolio Value']}
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                />
                <Line type="monotone" dataKey="value" stroke="#0284c7" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sector Allocation Breakdown */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Domain Breakdown</h3>
              <span className="text-xs font-semibold px-2.5 py-1 bg-sky-50 text-sky-700 rounded-full">
                Diversification: {diversification.score}/100
              </span>
            </div>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sectorData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                    {sectorData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: any) => [`${val}%`, 'Allocation']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-1.5 mt-4 text-xs">
            {sectorData.map((item, idx) => (
              <div key={item.name} className="flex items-center justify-between">
                <span className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                  <span className="text-gray-700 font-medium">{item.name}</span>
                </span>
                <span className="font-semibold text-gray-900">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Holdings & Contribution Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">Holding Return & Contribution Analysis</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                <th className="px-6 py-3">Ticker</th>
                <th className="px-6 py-3">Weight</th>
                <th className="px-6 py-3">Current Price</th>
                <th className="px-6 py-3">1Y Period Return</th>
                <th className="px-6 py-3">Return Contribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {holdings.map((h) => (
                <tr key={h.ticker} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4 font-bold text-gray-900">{h.ticker}</td>
                  <td className="px-6 py-4 font-medium text-gray-700">{h.weight}%</td>
                  <td className="px-6 py-4 text-gray-900 font-medium">
                    {h.current_price !== null ? `$${h.current_price.toFixed(2)}` : 'N/A'}
                  </td>
                  <td className={`px-6 py-4 font-semibold ${h.period_return >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {h.period_return >= 0 ? '+' : ''}{h.period_return}%
                  </td>
                  <td className={`px-6 py-4 font-semibold ${h.contribution >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {h.contribution >= 0 ? '+' : ''}{h.contribution}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Correlation Matrix */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Correlation Matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-center border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-xs font-bold text-gray-400 uppercase text-left">Asset</th>
                {Object.keys(correlation).map((t) => (
                  <th key={t} className="p-2 text-xs font-bold text-gray-700">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(correlation).map(([rowTicker, rowObj]) => (
                <tr key={rowTicker} className="border-t border-gray-100">
                  <td className="p-2 text-xs font-bold text-gray-900 text-left">{rowTicker}</td>
                  {Object.entries(rowObj).map(([colTicker, corrVal]) => {
                    const bg =
                      rowTicker === colTicker
                        ? 'bg-slate-100 font-bold'
                        : corrVal > 0.7
                        ? 'bg-rose-50 text-rose-700 font-semibold'
                        : corrVal < 0.3
                        ? 'bg-emerald-50 text-emerald-700 font-semibold'
                        : 'bg-gray-50 text-gray-700';
                    return (
                      <td key={colTicker} className={`p-2.5 text-xs rounded-md ${bg}`}>
                        {corrVal.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendations & Gemini AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Rule-Based Deterministic Recommendations */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center space-x-2 mb-4">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-bold text-gray-900">Deterministic Recommendations</h3>
          </div>
          <div className="space-y-3">
            {recommendations.map((rec, i) => (
              <div
                key={i}
                className={`p-4 rounded-lg border text-sm flex items-start space-x-3 ${
                  rec.severity === 'high'
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : rec.severity === 'medium'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-sky-50 border-sky-200 text-sky-800'
                }`}
              >
                <div className="mt-0.5">
                  {rec.severity === 'high' ? (
                    <AlertOctagon className="w-4 h-4 text-rose-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  )}
                </div>
                <div>
                  <span className="font-semibold capitalize text-xs block mb-0.5">{rec.type} Risk</span>
                  <p className="text-xs leading-relaxed">{rec.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gemini AI Insights */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 text-white shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-sky-400" />
                <h3 className="text-lg font-bold text-white">Gemini AI Portfolio Explanation</h3>
              </div>
              {ai?.model && (
                <span className="text-xs px-2 py-0.5 bg-slate-800 text-sky-400 border border-slate-700 rounded-full font-mono">
                  {ai.model}
                </span>
              )}
            </div>

            {ai?.available && ai?.analysis ? (
              <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed font-sans max-h-96 overflow-y-auto pr-2">
                {ai.analysis}
              </div>
            ) : (
              <div className="p-4 bg-slate-800/60 rounded-lg text-slate-400 text-xs leading-relaxed border border-slate-700/50">
                <p className="font-semibold text-slate-300">Gemini temporarily unavailable</p>
                <p className="mt-1">
                  {(ai?.error || '').replace(/^LLM unavailable:\s*/, '') ||
                    'Gemini is temporarily unavailable due to high traffic. Please try again in a minute.'}
                </p>
                <p className="mt-2 text-slate-400">
                  All quantitative metrics, charts and recommendations on this page are calculated independently and remain accurate.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

