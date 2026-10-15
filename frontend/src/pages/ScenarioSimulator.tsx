import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { analyticsApi, portfolioApi } from '../services/api';
import { Portfolio, PortfolioDomain, ScenarioResult, ScenarioType } from '../types';
import { ArrowLeft, Sliders, Play, AlertCircle, Lightbulb, RotateCcw } from 'lucide-react';

const MIN_SHOCK_PCT = -100;
const MAX_SHOCK_PCT = 500;
const MAX_VALUE = 1e12;

const money = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const signed = (v: number, digits = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;

// Returns an error message for a percent-shock text input, or '' when valid/empty
const shockError = (text: string): string => {
  if (text.trim() === '' || text === '-') return '';
  const n = Number(text);
  if (!Number.isFinite(n)) return 'Enter a number';
  if (n < MIN_SHOCK_PCT) return `Cannot be below ${MIN_SHOCK_PCT}%`;
  if (n > MAX_SHOCK_PCT) return `Cannot exceed +${MAX_SHOCK_PCT}%`;
  return '';
};

export const ScenarioSimulator: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const portfolioId = parseInt(id || '0', 10);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [domains, setDomains] = useState<PortfolioDomain[]>([]);
  const [domainsError, setDomainsError] = useState('');
  const [scenarios, setScenarios] = useState<ScenarioType[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>('market_crash');
  const [portfolioValue, setPortfolioValue] = useState<string>('1000000');
  const [shockText, setShockText] = useState<Record<string, string>>({});
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
    } catch (err) {
      console.error('Error loading portfolio for scenario:', err);
    }

    try {
      const types = await analyticsApi.getScenarioTypes();
      setScenarios(types);
      if (types.length > 0 && !types.some((t) => t.id === 'market_crash')) {
        setSelectedScenario(types[0].id);
      }
    } catch (err) {
      console.error('Error loading scenarios:', err);
    }

    try {
      const d = await analyticsApi.getDomains(portfolioId);
      setDomains(d);
      setDomainsError('');
    } catch (err: any) {
      setDomainsError(
        err.response?.data?.error || 'Could not classify holdings into domains. Is the analytics service running?'
      );
    }
  };

  const grouped = useMemo(() => {
    const map: Record<string, ScenarioType[]> = {};
    scenarios.forEach((s) => {
      const key = s.category || 'Other';
      (map[key] = map[key] || []).push(s);
    });
    return map;
  }, [scenarios]);

  const activeScenario = scenarios.find((s) => s.id === selectedScenario);

  const valueNum = Number(portfolioValue);
  const valueError =
    portfolioValue.trim() === '' || !Number.isFinite(valueNum)
      ? 'Enter a number'
      : valueNum <= 0
      ? 'Must be greater than 0'
      : valueNum > MAX_VALUE
      ? 'Value is too large'
      : '';

  const shockErrors: Record<string, string> = {};
  domains.forEach((d) => {
    shockErrors[d.domain] = shockError(shockText[d.domain] ?? '');
  });
  const hasShockError = Object.values(shockErrors).some(Boolean);
  const hasAnyShock = domains.some((d) => (shockText[d.domain] ?? '').trim() !== '' && Number(shockText[d.domain]) !== 0);
  const noHoldings = !!portfolio && (portfolio.holdings?.length ?? 0) === 0;

  const canRun =
    !loading &&
    !valueError &&
    !noHoldings &&
    (mode === 'named' ? !!selectedScenario : !hasShockError && hasAnyShock && domains.length > 0);

  const handleRunScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRun) return;
    setLoading(true);
    setError('');
    try {
      let custom: Record<string, number> | undefined;
      if (mode === 'custom') {
        custom = {};
        domains.forEach((d) => {
          const t = (shockText[d.domain] ?? '').trim();
          if (t !== '') custom![d.domain] = Number(t) / 100;
        });
      }
      const res = await analyticsApi.runScenario(
        portfolioId,
        mode === 'named' ? selectedScenario : undefined,
        valueNum,
        custom
      );
      setResult(res);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to simulate scenario.');
    } finally {
      setLoading(false);
    }
  };

  // Largest absolute impact, used to scale the impact bars
  const maxImpact = result ? Math.max(0.01, ...result.companies.map((company) => Math.abs(company.impact))) : 1;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="border-b border-gray-200 pb-6">
        <Link to={`/portfolios/${portfolioId}`} className="inline-flex items-center space-x-1 text-sm font-medium text-gray-500 hover:text-gray-900 mb-2">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Portfolio</span>
        </Link>
        <h1 className="text-3xl font-extrabold text-gray-900">Portfolio Stress Scenario Simulator</h1>
        <p className="text-gray-500 text-sm mt-1">
          Set stress inputs by investment domain, then see the impact on every company in your portfolio.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Controls Column */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6 self-start">
          <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            <span>Simulation Parameters</span>
          </h2>

          <form onSubmit={handleRunScenario} className="space-y-6" noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Portfolio Base Value ($)</label>
              <input
                type="number"
                min="1"
                max={MAX_VALUE}
                step="any"
                required
                value={portfolioValue}
                onChange={(e) => setPortfolioValue(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 ${
                  valueError ? 'border-rose-400' : 'border-gray-300'
                }`}
              />
              {valueError && <p className="mt-1 text-xs text-rose-600">{valueError}</p>}
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
                  Custom Shock per Domain
                </button>
              </div>
            </div>

            {mode === 'named' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Predefined Scenario</label>
                  <select
                    value={selectedScenario}
                    onChange={(e) => setSelectedScenario(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    {Object.entries(grouped).map(([category, list]) => (
                      <optgroup key={category} label={category}>
                        {list.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {scenarios.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">Scenarios could not be loaded. Is the analytics service running?</p>
                  )}
                </div>

                {activeScenario && (
                  <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg">
                    <p className="text-xs text-indigo-900 leading-relaxed">{activeScenario.description}</p>
                    {activeScenario.domain_shocks && domains.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[11px] font-semibold uppercase text-indigo-400 mb-1">
                          Assumed shock for your domains
                        </p>
                        <ul className="space-y-1">
                          {domains.map((d) => {
                            const shock = activeScenario.domain_shocks![d.domain] ?? 0;
                            return (
                              <li key={d.domain} className="flex justify-between text-xs">
                                <span className="text-gray-700">{d.domain}</span>
                                <span className={`font-semibold ${shock >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {signed(shock)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    <p className="mt-2 text-[11px] text-gray-400">
                      Illustrative stress assumptions based on historical episodes, not forecasts.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">Return Shock per Domain (%)</label>
                  <button
                    type="button"
                    onClick={() => setShockText({})}
                    className="inline-flex items-center space-x-1 text-xs text-gray-500 hover:text-gray-800"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </div>

                {domainsError && (
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg">{domainsError}</div>
                )}
                {!domainsError && domains.length === 0 && (
                  <p className="text-xs text-gray-500">Add holdings to the portfolio to set domain shocks.</p>
                )}

                {domains.map((d) => (
                  <div key={d.domain}>
                    <div className="flex items-center justify-between space-x-3">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-gray-900 truncate">{d.domain}</div>
                        <div className="text-[11px] text-gray-400">
                          {(d.weight * 100).toFixed(1)}% of portfolio · {d.holdings_count}{' '}
                          {d.holdings_count === 1 ? 'holding' : 'holdings'}
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 flex-shrink-0">
                        <input
                          type="number"
                          step="any"
                          min={MIN_SHOCK_PCT}
                          max={MAX_SHOCK_PCT}
                          value={shockText[d.domain] ?? ''}
                          onChange={(e) => setShockText({ ...shockText, [d.domain]: e.target.value })}
                          className={`w-24 px-2 py-1 border rounded-md text-xs text-right focus:ring-2 focus:ring-indigo-500 ${
                            shockErrors[d.domain] ? 'border-rose-400' : 'border-gray-300'
                          }`}
                          placeholder="0"
                        />
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                    </div>
                    {shockErrors[d.domain] && (
                      <p className="mt-0.5 text-[11px] text-rose-600 text-right">{shockErrors[d.domain]}</p>
                    )}
                  </div>
                ))}
                {domains.length > 0 && !hasAnyShock && (
                  <p className="text-[11px] text-gray-400">Enter a shock for at least one domain. Blank means no change.</p>
                )}
              </div>
            )}

            {noHoldings && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg">
                This portfolio has no holdings yet.
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
              disabled={!canRun}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <div className="text-xl font-black text-gray-900 mt-1">{money(result.initial_value)}</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-gray-400">Final Value</span>
                  <div className="text-xl font-black text-gray-900 mt-1">{money(result.final_value)}</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-gray-400">Absolute Change</span>
                  <div className={`text-xl font-black mt-1 ${result.absolute_change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {result.absolute_change >= 0 ? '+' : ''}
                    {money(result.absolute_change)}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-gray-400">Percentage Change</span>
                  <div className={`text-xl font-black mt-1 ${result.percentage_change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {signed(result.percentage_change, 2)}
                  </div>
                </div>
              </div>

              {/* Insights */}
              {result.insights && result.insights.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
                  <div className="flex items-center space-x-2 mb-2">
                    <Lightbulb className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-indigo-900">What this means</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {result.insights.map((line, i) => (
                      <li key={i} className="text-sm text-indigo-900/90 leading-relaxed">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Per Company Impact Table */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Impact by Company</h3>
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
                        <th className="px-6 py-3">Company</th>
                        <th className="px-6 py-3">Domain</th>
                        <th className="px-6 py-3">Allocation</th>
                        <th className="px-6 py-3">Shock</th>
                        <th className="px-6 py-3">Initial</th>
                        <th className="px-6 py-3">Change</th>
                        <th className="px-6 py-3">Final</th>
                        <th className="px-6 py-3 min-w-[160px]">Effect on portfolio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {result.companies.map((d) => (
                        <tr key={d.ticker} className="hover:bg-gray-50/50">
                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-900">{d.ticker}</div>
                          </td>
                          <td className="px-6 py-4 text-gray-700">{d.domain}</td>
                          <td className="px-6 py-4 text-gray-700">{d.weight}%</td>
                          <td className={`px-6 py-4 font-semibold ${d.shock >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {signed(d.shock)}
                          </td>
                          <td className="px-6 py-4 text-gray-900 font-medium">{money(d.initial_value)}</td>
                          <td className={`px-6 py-4 font-semibold ${d.change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {d.change >= 0 ? '+' : ''}
                            {money(d.change)}
                          </td>
                          <td className="px-6 py-4 text-gray-900 font-bold">{money(d.final_value)}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-2">
                              {/* Diverging bar centred on zero */}
                              <div className="relative flex-1 h-2 bg-gray-100 rounded-full">
                                <div className="absolute inset-y-0 left-1/2 w-px bg-gray-300" />
                                <div
                                  className={`absolute inset-y-0 rounded-full ${d.impact >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                  style={
                                    d.impact >= 0
                                      ? { left: '50%', width: `${(Math.abs(d.impact) / maxImpact) * 50}%` }
                                      : { right: '50%', width: `${(Math.abs(d.impact) / maxImpact) * 50}%` }
                                  }
                                />
                              </div>
                              <span className={`text-xs font-semibold w-16 text-right ${d.impact >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {d.impact >= 0 ? '+' : ''}
                                {d.impact.toFixed(2)} pts
                              </span>
                            </div>
                          </td>
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
                Pick one of {scenarios.length || 'the'} scenarios or set your own shock per domain, then run the simulation to
                see which parts of your portfolio take the hit.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
