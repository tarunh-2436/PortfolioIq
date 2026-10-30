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
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ReferenceLine,
} from 'recharts';
import {
  ArrowLeft,
  TrendingUp,
  Activity,
  Shield,
  AlertOctagon,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react';
import { tooltipStyle } from '../components/charts/chartTheme';
import { PortfolioPerformanceChart } from '../components/charts/PortfolioPerformanceChart';
import { AllocationDonut } from '../components/charts/AllocationDonut';
import { HoldingsPerformanceChart } from '../components/charts/HoldingsPerformanceChart';
import { CorrelationHeatmap } from '../components/charts/CorrelationHeatmap';

/** Derives extra chart series from the daily portfolio value history. */
function deriveSeries(performance: { date: string; value: number }[]) {
  const returns = performance.slice(1).map((p, i) => ({
    date: p.date,
    ret: performance[i].value > 0 ? (p.value / performance[i].value - 1) * 100 : 0,
  }));

  // Drawdown from the running peak
  let peak = -Infinity;
  const drawdown = performance.map((p) => {
    peak = Math.max(peak, p.value);
    return { date: p.date, drawdown: peak > 0 ? +(((p.value - peak) / peak) * 100).toFixed(2) : 0 };
  });

  // Rolling 30-day annualised volatility
  const WINDOW = 30;
  const rollingVol = returns.slice(WINDOW - 1).map((r, i) => {
    const w = returns.slice(i, i + WINDOW).map((x) => x.ret / 100);
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const variance = w.reduce((a, b) => a + (b - mean) ** 2, 0) / (w.length - 1);
    return { date: r.date, vol: +(Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(2) };
  });

  // Histogram of daily returns (0.5% buckets)
  const buckets: Record<string, number> = {};
  returns.forEach((r) => {
    const key = (Math.floor(r.ret / 0.5) * 0.5).toFixed(1);
    buckets[key] = (buckets[key] || 0) + 1;
  });
  const histogram = Object.entries(buckets)
    .map(([bucket, count]) => ({ bucket: `${Number(bucket) >= 0 ? '+' : ''}${bucket}%`, start: Number(bucket), count }))
    .sort((a, b) => a.start - b.start);

  // Monthly returns
  const byMonth = new Map<string, { first: number; last: number }>();
  performance.forEach((p, i) => {
    const m = String(p.date).slice(0, 7);
    const entry = byMonth.get(m);
    if (!entry) byMonth.set(m, { first: i > 0 ? performance[i - 1].value : p.value, last: p.value });
    else entry.last = p.value;
  });
  const monthly = Array.from(byMonth.entries()).map(([month, v]) => ({
    month,
    ret: v.first > 0 ? +((v.last / v.first - 1) * 100).toFixed(2) : 0,
  }));

  return { drawdown, rollingVol, histogram, monthly };
}

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

  const { drawdown, rollingVol, histogram, monthly } = deriveSeries(performance || []);
  const holdingBars = holdings.map((h) => ({
    ticker: h.ticker,
    weight: h.weight,
    period_return: h.period_return,
    contribution: h.contribution,
  }));

  // Allocation chart data (all values are already percentages)
  const sectorData = Object.entries(diversification.sector_allocation || {}).map(([sector, pct]) => ({
    name: sector,
    value: pct,
  }));
  const assetData = holdings.length
    ? holdings.map((h) => ({ name: h.ticker, value: h.weight }))
    : (analytics.portfolio || []).map((p) => ({ name: p.ticker, value: p.weight * 100 }));

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
        <PortfolioPerformanceChart performance={performance} />

        <AllocationDonut
          title="Asset Allocation"
          items={assetData}
          centerLabel={`${assetData.length} ${assetData.length === 1 ? 'holding' : 'holdings'}`}
          emptyMessage="This portfolio has no holdings to chart."
          footnote="Target weights as saved in the portfolio."
        />
      </div>

      {/* Additional Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <AllocationDonut
          title="Domain Breakdown"
          items={sectorData}
          centerLabel={`${sectorData.length} ${sectorData.length === 1 ? 'domain' : 'domains'}`}
          concentrationThreshold={40}
          badge={
            <span className="text-xs font-semibold px-2.5 py-1 bg-sky-50 text-sky-700 rounded-full">
              Diversification: {diversification.score}/100
            </span>
          }
          emptyMessage="Domain classification is unavailable for these holdings."
        />

        <HoldingsPerformanceChart holdings={holdings} />

        {/* Drawdown */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Drawdown (Underwater Chart)</h3>
            <span className="text-xs text-gray-400 font-medium">Decline from peak</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={drawdown}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" minTickGap={40} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip formatter={(v: any) => [`${v}%`, 'Drawdown']} contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="drawdown" stroke="#e11d48" fill="#fecdd3" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Rolling Volatility */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Rolling 30-Day Volatility</h3>
            <span className="text-xs text-gray-400 font-medium">Annualised</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rollingVol}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" minTickGap={40} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip formatter={(v: any) => [`${v}%`, 'Volatility']} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="vol" stroke="#6366f1" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Returns */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Monthly Returns</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip formatter={(v: any) => [`${v}%`, 'Return']} contentStyle={tooltipStyle} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Bar dataKey="ret" radius={[4, 4, 0, 0]}>
                  {monthly.map((m, i) => (
                    <Cell key={i} fill={m.ret >= 0 ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Return Distribution */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Daily Return Distribution</h3>
            <span className="text-xs text-gray-400 font-medium">Days per return bucket</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip formatter={(v: any) => [v, 'Days']} contentStyle={tooltipStyle} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {histogram.map((h, i) => (
                    <Cell key={i} fill={h.start >= 0 ? '#0284c7' : '#f59e0b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Contribution vs Weight */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Weight vs Return Contribution</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={holdingBars}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="ticker" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip formatter={(v: any, name: any) => [`${v}%`, name]} contentStyle={tooltipStyle} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Bar dataKey="weight" name="Weight" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="contribution" name="Return Contribution" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
      <CorrelationHeatmap correlation={correlation} />

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

