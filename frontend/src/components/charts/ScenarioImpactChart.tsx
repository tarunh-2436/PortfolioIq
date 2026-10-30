import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { CompanyImpact, ScenarioResult } from '../../types';
import { ChartCard, ChartEmpty, TooltipPanel } from './ChartCard';
import { NEGATIVE, POSITIVE, axisProps, compactMoney, gridProps, money, signedMoney, signedPct } from './chartTheme';

const TOTAL_COLOR = '#475569';
const MAX_STEPS = 12;

interface Step {
  name: string;
  range: [number, number];
  kind: 'total' | 'step';
  value: number;
  change?: number;
  company?: CompanyImpact;
  members?: number;
}

/** Start value -> one step per company change (largest losses first) -> end value. */
export function toWaterfall(result: ScenarioResult): Step[] {
  let companies = [...result.companies].sort((a, b) => a.change - b.change);
  let others: { change: number; count: number } | null = null;
  if (companies.length > MAX_STEPS) {
    const keep = new Set(
      [...companies].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, MAX_STEPS - 1).map((c) => c.ticker)
    );
    const rest = companies.filter((c) => !keep.has(c.ticker));
    others = { change: rest.reduce((s, c) => s + c.change, 0), count: rest.length };
    companies = companies.filter((c) => keep.has(c.ticker));
  }

  const steps: Step[] = [{ name: 'Start', range: [0, result.initial_value], kind: 'total', value: result.initial_value }];
  let running = result.initial_value;
  const push = (name: string, change: number, extra: Partial<Step>) => {
    const next = running + change;
    steps.push({ name, range: [Math.min(running, next), Math.max(running, next)], kind: 'step', value: next, change, ...extra });
    running = next;
  };
  companies.forEach((c) => push(c.ticker, c.change, { company: c }));
  if (others) push(`Others (${others.count})`, others.change, { members: others.count });
  steps.push({ name: 'End', range: [0, result.final_value], kind: 'total', value: result.final_value });
  return steps;
}

export const ScenarioImpactChart: React.FC<{ result: ScenarioResult }> = ({ result }) => {
  const steps = toWaterfall(result);
  const color = (s: Step) => (s.kind === 'total' ? TOTAL_COLOR : (s.change ?? 0) >= 0 ? POSITIVE : NEGATIVE);

  return (
    <ChartCard
      title="Value Bridge: Start → Scenario"
      aside={signedPct(result.percentage_change, 2)}
      footnote="Each bar is one holding's change in value under the assumed shocks. Shocks are illustrative stress assumptions, not forecasts."
    >
      {result.companies.length === 0 ? (
        <ChartEmpty message="The scenario returned no holding-level results." />
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={steps} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="name" {...axisProps} tick={{ fontSize: 11 }} interval={0} angle={steps.length > 8 ? -35 : 0} textAnchor={steps.length > 8 ? 'end' : 'middle'} height={steps.length > 8 ? 50 : 30} />
              <YAxis domain={[0, 'auto']} tickFormatter={compactMoney} width={64} {...axisProps} />
              <ReferenceLine y={result.initial_value} stroke="#cbd5e1" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const s = payload[0].payload as Step;
                  if (s.kind === 'total') {
                    return <TooltipPanel title={s.name === 'Start' ? 'Initial value' : 'Value after scenario'} rows={[['Value', money(s.value), TOTAL_COLOR]]} />;
                  }
                  const c = s.company;
                  return (
                    <TooltipPanel
                      title={c ? `${c.ticker} · ${c.domain}` : s.name}
                      rows={[
                        ['Change', signedMoney(s.change ?? 0), color(s)],
                        ...(c
                          ? ([
                              ['Shock', signedPct(c.shock, 1)],
                              ['Allocation', `${c.weight}%`],
                              ['Effect on portfolio', `${c.impact >= 0 ? '+' : ''}${c.impact.toFixed(2)} pts`],
                            ] as Array<[string, string]>)
                          : []),
                        ['Running total', money(s.value)],
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="range" radius={4} maxBarSize={48} isAnimationActive={false}>
                {steps.map((s) => (
                  <Cell key={s.name} fill={color(s)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
};

export interface ScenarioRun {
  key: string;
  label: string;
  percentage_change: number;
  absolute_change: number;
  initial_value: number;
}

/** Compares the scenarios run during this visit (only real results, no extra requests). */
export const ScenarioComparisonChart: React.FC<{ runs: ScenarioRun[]; activeKey?: string }> = ({ runs, activeKey }) => {
  const data = [...runs].sort((a, b) => a.percentage_change - b.percentage_change);
  const height = Math.max(140, data.length * 30 + 40);

  return (
    <ChartCard
      title="Scenario Comparison"
      aside="Runs this session"
      footnote="Percentage change is independent of the base value, so runs with different base values remain comparable. Results are cleared when you leave this page."
    >
      {data.length < 2 ? (
        <ChartEmpty height="h-32" message="Run another scenario to compare outcomes side by side." />
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
              <CartesianGrid {...gridProps} vertical horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `${v}%`} {...axisProps} />
              <YAxis type="category" dataKey="label" width={150} interval={0} {...axisProps} tick={{ fontSize: 11 }} />
              <ReferenceLine x={0} stroke="#94a3b8" />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload as ScenarioRun;
                  return (
                    <TooltipPanel
                      title={r.label}
                      rows={[
                        ['Change', signedPct(r.percentage_change, 2), r.percentage_change >= 0 ? POSITIVE : NEGATIVE],
                        ['Absolute', signedMoney(r.absolute_change)],
                        ['Base value', money(r.initial_value)],
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="percentage_change" radius={4} maxBarSize={18}>
                {data.map((r) => (
                  <Cell
                    key={r.key}
                    fill={r.percentage_change >= 0 ? POSITIVE : NEGATIVE}
                    fillOpacity={activeKey && r.key !== activeKey ? 0.55 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
};
