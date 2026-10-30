import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { ChartCard, ChartEmpty, TooltipPanel } from './ChartCard';
import { COLORS, OTHER_COLOR, isNum, pct } from './chartTheme';

export interface AllocationSlice {
  name: string;
  /** Percent of the portfolio (0-100) */
  value: number;
}

interface Slice extends AllocationSlice {
  color: string;
  members?: AllocationSlice[];
}

/** Sorts by size and folds everything past the palette into a grey "Other" slice. */
export function toSlices(items: AllocationSlice[], maxNamed = COLORS.length): Slice[] {
  const sorted = items.filter((i) => isNum(i.value) && i.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= maxNamed) return sorted.map((s, i) => ({ ...s, color: COLORS[i] }));
  const named = sorted.slice(0, maxNamed - 1).map((s, i) => ({ ...s, color: COLORS[i] }));
  const rest = sorted.slice(maxNamed - 1);
  const otherValue = rest.reduce((a, b) => a + b.value, 0);
  return [...named, { name: `Other (${rest.length})`, value: +otherValue.toFixed(2), color: OTHER_COLOR, members: rest }];
}

interface Props {
  title: string;
  items: AllocationSlice[];
  /** Label under the centre total, e.g. "8 holdings" */
  centerLabel: string;
  /** Badge shown on the right of the title */
  badge?: React.ReactNode;
  /** Slices above this percentage are flagged as concentrated */
  concentrationThreshold?: number;
  emptyMessage: string;
  footnote?: React.ReactNode;
}

export const AllocationDonut: React.FC<Props> = ({
  title,
  items,
  centerLabel,
  badge,
  concentrationThreshold,
  emptyMessage,
  footnote,
}) => {
  const slices = useMemo(() => toSlices(items), [items]);
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((a, b) => a + b.value, 0);
  const isConcentrated = (s: Slice) => !s.members && concentrationThreshold !== undefined && s.value > concentrationThreshold;
  const concentrated = slices.filter(isConcentrated);

  return (
    <ChartCard title={title} aside={badge} footnote={footnote}>
      {slices.length === 0 ? (
        <ChartEmpty height="h-52" message={emptyMessage} />
      ) : (
        <>
          <div className="relative h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={84}
                  paddingAngle={slices.length > 1 ? 2 : 0}
                  stroke="#fff"
                  strokeWidth={2}
                  onMouseEnter={(_, i) => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  isAnimationActive={false}
                >
                  {slices.map((s, i) => (
                    <Cell key={s.name} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.35} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const s = payload[0].payload as Slice;
                    return (
                      <TooltipPanel
                        title={s.name}
                        rows={[
                          ['Allocation', pct(s.value, 2), s.color],
                          ...((s.members || []).slice(0, 8).map((m) => [m.name, pct(m.value, 2)]) as Array<[string, string]>),
                        ]}
                      />
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Centre total: the API weights should add to 100% */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-black text-gray-900 tabular-nums">{pct(total, total % 1 === 0 ? 0 : 1)}</span>
              <span className="text-[11px] text-gray-400 font-medium">{centerLabel}</span>
            </div>
          </div>

          <div className="space-y-1.5 mt-4 text-xs max-h-48 overflow-y-auto pr-1">
            {slices.map((s, i) => (
              <div
                key={s.name}
                className={`flex items-center justify-between rounded px-1 -mx-1 ${hover === i ? 'bg-gray-50' : ''}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="flex items-center space-x-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }}></span>
                  <span className="text-gray-700 font-medium truncate">{s.name}</span>
                  {isConcentrated(s) && <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" aria-label="Concentrated" />}
                </span>
                <span className="font-semibold text-gray-900 tabular-nums">{pct(s.value, 2)}</span>
              </div>
            ))}
          </div>

          {concentrated.length > 0 && (
            <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
              {concentrated.map((s) => s.name).join(', ')} {concentrated.length === 1 ? 'is' : 'are'} above {concentrationThreshold}% of the portfolio,
              a concentration flagged in the recommendations below.
            </p>
          )}
        </>
      )}
    </ChartCard>
  );
};
