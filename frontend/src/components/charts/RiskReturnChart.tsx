import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, LabelList } from 'recharts';
import { ChartCard, ChartEmpty, TooltipPanel } from './ChartCard';
import { OTHER_COLOR, axisProps, gridProps, isNum, signedPct, pct } from './chartTheme';

export interface RiskReturnPoint {
  label: string;
  /** Annualised volatility, % */
  volatility: number;
  /** Annualised return, % */
  annual_return: number;
  sharpe_ratio?: number;
  /** Optional weight, % */
  weight?: number;
}

interface Props {
  title: string;
  /** Individual assets (plotted in grey) */
  assets: RiskReturnPoint[];
  /** Highlighted portfolio points, each its own series */
  highlights: Array<{ name: string; color: string; point: RiskReturnPoint | null }>;
  footnote?: React.ReactNode;
}

const PortfolioDot = (color: string) => (props: any) => (
  <circle cx={props.cx} cy={props.cy} r={7} fill={color} stroke="#fff" strokeWidth={2} />
);

/**
 * Risk-return scatter: x = annualised volatility (%), y = annualised return (%).
 * Up-and-left is better (more return for less risk). Only data passed in is plotted.
 */
export const RiskReturnChart: React.FC<Props> = ({ title, assets, highlights, footnote }) => {
  const pts = assets.filter((a) => isNum(a.volatility) && isNum(a.annual_return));
  const shown = highlights.filter((h) => h.point && isNum(h.point.volatility) && isNum(h.point.annual_return));
  const all = [...pts, ...shown.map((h) => h.point!)];

  const tooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as RiskReturnPoint;
    return (
      <TooltipPanel
        title={p.label}
        rows={[
          ['Return (ann.)', signedPct(p.annual_return, 2)],
          ['Volatility (ann.)', pct(p.volatility, 2)],
          ...(isNum(p.sharpe_ratio) ? ([['Sharpe', p.sharpe_ratio.toFixed(2)]] as Array<[string, string]>) : []),
          ...(isNum(p.weight) ? ([['Optimized weight', pct(p.weight, 1)]] as Array<[string, string]>) : []),
        ]}
      />
    );
  };

  return (
    <ChartCard title={title} aside="Up and left is better" footnote={footnote}>
      {all.length === 0 ? (
        <ChartEmpty message="No per-asset return and volatility estimates were returned." />
      ) : (
        <>
        {/* Legend kept outside the plot so point labels near the top can't run into it */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: OTHER_COLOR }} />
            Individual assets
          </span>
          {shown.map((h) => (
            <span key={h.name} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: h.color }} />
              {h.name}
            </span>
          ))}
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 24, left: 0, bottom: 18 }}>
              <CartesianGrid {...gridProps} vertical />
              <XAxis
                type="number"
                dataKey="volatility"
                name="Volatility"
                domain={[0, 'auto']}
                tickFormatter={(v) => `${v}%`}
                {...axisProps}
                label={{ value: 'Annualised volatility (risk)', position: 'insideBottom', offset: -12, fontSize: 11, fill: '#64748b' }}
              />
              <YAxis
                type="number"
                dataKey="annual_return"
                name="Return"
                domain={[(min: number) => Math.min(0, Math.floor(min)), 'auto']}
                tickFormatter={(v) => `${v}%`}
                width={56}
                padding={{ top: 24 }}
                {...axisProps}
                label={{ value: 'Annualised return', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b', style: { textAnchor: 'middle' } }}
              />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Tooltip content={tooltip} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter name="Individual assets" data={pts} fill={OTHER_COLOR}>
                <LabelList dataKey="label" position="top" fontSize={10} fill="#475569" offset={8} />
              </Scatter>
              {shown.map((h) => (
                <Scatter key={h.name} name={h.name} data={[h.point!]} fill={h.color} shape={PortfolioDot(h.color)} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        </>
      )}
    </ChartCard>
  );
};
