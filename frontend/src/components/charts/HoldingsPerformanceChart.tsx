import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { HoldingAnalysis } from '../../types';
import { ChartCard, ChartEmpty, TooltipPanel } from './ChartCard';
import { NEGATIVE, POSITIVE, axisProps, gridProps, isNum, pct, signedPct } from './chartTheme';

const ROW_HEIGHT = 30;

/** Horizontal bars of each holding's period return, largest position first. */
export const HoldingsPerformanceChart: React.FC<{ holdings: HoldingAnalysis[] | undefined }> = ({ holdings }) => {
  const data = (holdings || []).filter((h) => isNum(h.period_return)).sort((a, b) => b.weight - a.weight);
  const height = Math.max(200, data.length * ROW_HEIGHT + 40);

  return (
    <ChartCard
      title="1Y Return by Holding"
      aside="Sorted by weight"
      footnote="Price return over the same trailing window as the value history. Contribution = weight × return."
    >
      {data.length === 0 ? (
        <ChartEmpty message="No holding-level returns were returned." />
      ) : (
        <div className="w-full max-h-80 overflow-y-auto">
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
                <CartesianGrid {...gridProps} vertical horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${v}%`} {...axisProps} />
                <YAxis type="category" dataKey="ticker" width={84} {...axisProps} tick={{ fontSize: 12, fontWeight: 600 }} interval={0} />
                <ReferenceLine x={0} stroke="#94a3b8" />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const h = payload[0].payload as HoldingAnalysis;
                    return (
                      <TooltipPanel
                        title={h.ticker}
                        rows={[
                          ['1Y return', signedPct(h.period_return, 2), h.period_return >= 0 ? POSITIVE : NEGATIVE],
                          ['Weight', pct(h.weight, 2)],
                          ['Contribution', `${h.contribution >= 0 ? '+' : ''}${h.contribution.toFixed(2)} pts`],
                          ...(h.current_price === null ? ([['Price', 'unavailable']] as Array<[string, string]>) : []),
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="period_return" radius={4} maxBarSize={18}>
                  {data.map((h) => (
                    <Cell key={h.ticker} fill={h.period_return >= 0 ? POSITIVE : NEGATIVE} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </ChartCard>
  );
};
