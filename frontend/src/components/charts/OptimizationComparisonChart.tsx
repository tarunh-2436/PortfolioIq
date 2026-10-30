import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, Cell } from 'recharts';
import { OptimizationResult } from '../../types';
import { ChartCard, ChartEmpty, TooltipPanel } from './ChartCard';
import { OTHER_COLOR, PRIMARY, axisProps, gridProps, isNum, pct } from './chartTheme';

const CURRENT_COLOR = OTHER_COLOR;
const OPTIMIZED_COLOR = PRIMARY;
const ROW_HEIGHT = 40;

export interface WeightRow {
  ticker: string;
  /** Percent (0-100) */
  optimized: number;
  /** Percent (0-100); undefined when the current portfolio is not known */
  current?: number;
}

/** Optimal (and current) weights in percent, from the explanation or, failing that, the raw 0-1 weights. */
export function toWeightRows(result: OptimizationResult): WeightRow[] {
  const assets = result.explanation?.assets;
  const rows: WeightRow[] = assets
    ? assets.map((a) => ({ ticker: a.ticker, optimized: a.optimal_weight, current: a.current_weight }))
    : Object.entries(result.weights).map(([ticker, w]) => ({ ticker, optimized: Number(w) * 100 }));
  return rows.filter((r) => isNum(r.optimized)).sort((a, b) => b.optimized - a.optimized);
}

/** Grouped horizontal bars: current vs optimized weight per ticker. */
export const AllocationComparisonChart: React.FC<{ result: OptimizationResult }> = ({ result }) => {
  const rows = toWeightRows(result);
  const hasCurrent = !!result.current && rows.some((r) => isNum(r.current));
  const height = Math.max(180, rows.length * (hasCurrent ? ROW_HEIGHT : 28) + 50);

  return (
    <ChartCard
      title={hasCurrent ? 'Current vs Optimized Allocation' : 'Optimized Weight Distribution'}
      aside="Weight, % of portfolio"
      footnote={
        hasCurrent
          ? 'Current weights are rescaled to the tickers that were optimized. The optimized mix is a suggestion only and is not applied to your portfolio.'
          : 'This ticker set does not match your holdings, so only the suggested weights are shown. Nothing is applied to your portfolio.'
      }
    >
      {rows.length === 0 ? (
        <ChartEmpty message="The optimizer returned no weights." />
      ) : (
        <div className="w-full max-h-96 overflow-y-auto">
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barGap={2} barCategoryGap={8}>
                <CartesianGrid {...gridProps} vertical horizontal={false} />
                <XAxis type="number" domain={[0, 'auto']} tickFormatter={(v) => `${v}%`} {...axisProps} />
                <YAxis type="category" dataKey="ticker" width={84} interval={0} {...axisProps} tick={{ fontSize: 12, fontWeight: 600 }} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const r = payload[0].payload as WeightRow;
                    const d = isNum(r.current) ? r.optimized - r.current : null;
                    return (
                      <TooltipPanel
                        title={r.ticker}
                        rows={[
                          ...(isNum(r.current) ? ([['Current', pct(r.current, 2), CURRENT_COLOR]] as Array<[string, string, string]>) : []),
                          ['Optimized (estimate)', pct(r.optimized, 2), OPTIMIZED_COLOR],
                          ...(d !== null ? ([['Change', `${d >= 0 ? '+' : ''}${d.toFixed(2)} pts`]] as Array<[string, string]>) : []),
                        ]}
                      />
                    );
                  }}
                />
                {hasCurrent && <Legend verticalAlign="top" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
                {hasCurrent && <Bar dataKey="current" name="Current" fill={CURRENT_COLOR} radius={4} maxBarSize={14} />}
                <Bar dataKey="optimized" name="Optimized" fill={OPTIMIZED_COLOR} radius={4} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </ChartCard>
  );
};

/** One small chart per metric (each with its own axis, since % and ratios don't share a scale). */
export const MetricComparisonChart: React.FC<{ result: OptimizationResult }> = ({ result }) => {
  const cur = result.current;
  const metrics: { key: string; label: string; unit: '%' | ''; current?: number; optimized: number; better: 'higher' | 'lower' }[] = [
    { key: 'ret', label: 'Expected Return', unit: '%', current: cur?.expected_return, optimized: result.expected_return, better: 'higher' },
    { key: 'vol', label: 'Volatility', unit: '%', current: cur?.volatility, optimized: result.volatility, better: 'lower' },
    { key: 'sharpe', label: 'Sharpe Ratio', unit: '', current: cur?.sharpe_ratio, optimized: result.sharpe_ratio, better: 'higher' },
  ];

  return (
    <ChartCard
      title="Risk & Return: Current vs Optimized"
      aside="Optimizer estimates"
      footnote="Both columns are in-sample estimates from the same 1Y price history (annualised CAGR and sample covariance, 2% risk-free rate). They differ from the realised figures on the Analytics dashboard and are not forecasts."
    >
      {!cur ? (
        <ChartEmpty height="h-40" message="No current-portfolio baseline: the optimized tickers do not overlap your holdings." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {metrics.map((m) => {
            const data = [
              { name: 'Current', value: m.current ?? 0, color: CURRENT_COLOR },
              { name: 'Optimized', value: m.optimized, color: OPTIMIZED_COLOR },
            ];
            const diff = isNum(m.current) ? m.optimized - m.current : null;
            const improved = diff !== null && (m.better === 'higher' ? diff > 0 : diff < 0);
            const fmt = (v: number) => (m.unit ? `${v.toFixed(2)}%` : v.toFixed(2));
            return (
              <div key={m.key} className="min-w-0">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold uppercase text-gray-400">{m.label}</span>
                  {diff !== null && diff !== 0 && (
                    <span className={`text-xs font-semibold tabular-nums ${improved ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {diff > 0 ? '+' : ''}
                      {m.unit ? `${diff.toFixed(2)} pts` : diff.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 18, right: 4, left: 4, bottom: 0 }}>
                      <XAxis dataKey="name" {...axisProps} tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis hide domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]} />
                      <ReferenceLine y={0} stroke="#cbd5e1" />
                      <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        content={({ active, payload }) =>
                          active && payload?.length ? (
                            <TooltipPanel
                              title={`${m.label} · ${payload[0].payload.name}`}
                              rows={[[m.unit ? 'Annualised' : 'Ratio', fmt(payload[0].payload.value), payload[0].payload.color]]}
                            />
                          ) : null
                        }
                      />
                      <Bar
                        dataKey="value"
                        radius={4}
                        maxBarSize={44}
                        label={(p: any) => (
                          // Always above the bar or the zero line, so negative values never collide with the axis labels
                          <text
                            x={p.x + p.width / 2}
                            y={Math.min(p.y, p.y + p.height) - 6}
                            textAnchor="middle"
                            fontSize={11}
                            fill="#334155"
                          >
                            {fmt(Number(p.value))}
                          </text>
                        )}
                      >
                        {data.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
};
