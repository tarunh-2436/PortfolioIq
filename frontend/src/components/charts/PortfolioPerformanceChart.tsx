import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PerformancePoint } from '../../types';
import { ChartCard, ChartEmpty, TooltipPanel } from './ChartCard';
import { PRIMARY, axisProps, compactMoney, gridProps, isNum, longDate, money, monthYear, parseDate, shortDate, signedPct } from './chartTheme';

const RANGES: { id: string; label: string; days: number }[] = [
  { id: '1M', label: '1M', days: 30 },
  { id: '3M', label: '3M', days: 91 },
  { id: '6M', label: '6M', days: 182 },
  { id: '1Y', label: '1Y', days: 365 },
];

/** Keeps points on or after `days` before the last date. */
export function sliceByDays(points: PerformancePoint[], days: number) {
  if (points.length === 0) return points;
  const end = parseDate(points[points.length - 1].date).getTime();
  const start = end - days * 86400000;
  return points.filter((p) => parseDate(p.date).getTime() >= start);
}

interface Props {
  performance: PerformancePoint[] | undefined;
}

/** Back-tested portfolio value over time, with a range selector limited to the history actually returned. */
export const PortfolioPerformanceChart: React.FC<Props> = ({ performance }) => {
  const points = useMemo(() => (performance || []).filter((p) => p && p.date && isNum(p.value)), [performance]);
  const [range, setRange] = useState('ALL');

  const spanDays =
    points.length > 1 ? (parseDate(points[points.length - 1].date).getTime() - parseDate(points[0].date).getTime()) / 86400000 : 0;
  // Only offer ranges shorter than the history we have; "ALL" covers the full span
  const ranges = RANGES.filter((r) => r.days < spanDays - 7);
  const active = ranges.find((r) => r.id === range);
  const data = active ? sliceByDays(points, active.days) : points;

  const first = data[0]?.value;
  const last = data[data.length - 1]?.value;
  const rangeReturn = data.length > 1 && first > 0 ? (last / first - 1) * 100 : null;
  const up = (rangeReturn ?? 0) >= 0;
  const color = PRIMARY;
  const useMonths = (active?.days ?? spanDays) > 120;

  const selector = (
    <div className="flex items-center gap-3">
      {rangeReturn !== null && (
        <span className={`text-sm font-bold tabular-nums ${up ? 'text-emerald-600' : 'text-rose-600'}`}>{signedPct(rangeReturn, 2)}</span>
      )}
      <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50" role="group" aria-label="Time range">
        {[...ranges.map((r) => r.id), 'ALL'].map((id) => (
          <button
            key={id}
            onClick={() => setRange(id)}
            aria-pressed={range === id || (id === 'ALL' && !active)}
            className={`px-2 py-0.5 text-xs font-semibold rounded-md transition-colors ${
              range === id || (id === 'ALL' && !active) ? 'bg-white text-sky-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {id}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <ChartCard
      title="Historical Value Growth ($1M base)"
      aside={points.length > 1 ? selector : undefined}
      className="lg:col-span-2"
      footnote={
        points.length > 1
          ? `Back-test of the current weights from ${longDate(points[0].date)} to ${longDate(points[points.length - 1].date)} (daily closes). Past performance does not guarantee future results.`
          : undefined
      }
    >
      {points.length < 2 ? (
        <ChartEmpty height="h-72" message="No price history was returned for these holdings, so the value history cannot be shown." />
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="date"
                {...axisProps}
                tickFormatter={useMonths ? monthYear : shortDate}
                minTickGap={40}
              />
              <YAxis tickFormatter={compactMoney} domain={['auto', 'auto']} width={64} {...axisProps} />
              <Tooltip
                cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                content={({ active: on, payload }) => {
                  if (!on || !payload?.length) return null;
                  const p = payload[0].payload as PerformancePoint;
                  const chg = first > 0 ? (p.value / first - 1) * 100 : null;
                  return (
                    <TooltipPanel
                      title={longDate(p.date)}
                      rows={[
                        ['Portfolio value', money(p.value), color],
                        ...(chg !== null ? ([['Since range start', signedPct(chg, 2)]] as Array<[string, string]>) : []),
                      ]}
                    />
                  );
                }}
              />
              <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#perfFill)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
};
