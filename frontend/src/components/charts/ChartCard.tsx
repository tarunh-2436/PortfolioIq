import React from 'react';
import { BarChart3 } from 'lucide-react';

interface ChartCardProps {
  title: string;
  /** Small grey text or a control shown on the right of the title */
  aside?: React.ReactNode;
  /** Caveat or methodology note under the chart */
  footnote?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** The white card used around every chart (matches the Dashboard cards). */
export const ChartCard: React.FC<ChartCardProps> = ({ title, aside, footnote, className = '', children }) => (
  <div className={`bg-white p-6 rounded-xl border border-gray-200 shadow-sm min-w-0 ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      {typeof aside === 'string' ? <span className="text-xs text-gray-400 font-medium">{aside}</span> : aside}
    </div>
    {children}
    {footnote && <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">{footnote}</p>}
  </div>
);

/** Shown in place of a chart when the API returned nothing to plot. */
export const ChartEmpty: React.FC<{ message: string; height?: string }> = ({ message, height = 'h-64' }) => (
  <div className={`${height} w-full flex flex-col items-center justify-center text-center rounded-lg bg-gray-50 border border-dashed border-gray-200`}>
    <BarChart3 className="w-6 h-6 text-gray-300 mb-2" />
    <p className="text-xs text-gray-500 max-w-xs">{message}</p>
  </div>
);

/** Dark tooltip panel matching the Dashboard tooltips; used as Recharts `content`. */
export const TooltipPanel: React.FC<{ title?: React.ReactNode; rows: Array<[string, React.ReactNode, string?]> }> = ({
  title,
  rows,
}) => (
  <div className="bg-slate-900 text-white rounded-lg px-3 py-2 shadow-lg text-xs min-w-[140px]">
    {title && <div className="font-semibold text-[13px] mb-1">{title}</div>}
    {rows.map(([label, value, swatch]) => (
      <div key={label} className="flex items-center justify-between gap-4 leading-5">
        <span className="flex items-center gap-1.5 text-slate-300">
          {swatch && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: swatch }} />}
          {label}
        </span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
    ))}
  </div>
);
