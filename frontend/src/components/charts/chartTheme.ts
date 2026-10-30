// Shared chart styling and number formatting, so every chart in the app reads the same way.

/**
 * Categorical palette (identity). The hues are the app's existing ones, ordered so that
 * neighbouring slots stay distinguishable, including for colour-blind readers.
 * Assign in this order; never cycle - fold the tail into "Other" instead.
 */
export const COLORS = ['#0284c7', '#10b981', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];
export const OTHER_COLOR = '#94a3b8';

// Gain / loss encoding used across the app (emerald / rose)
export const POSITIVE = '#10b981';
export const NEGATIVE = '#f43f5e';

export const PRIMARY = '#0284c7';
export const MUTED = '#cbd5e1';

export const tooltipStyle = { backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '13px' };

export const gridProps = { strokeDasharray: '3 3', vertical: false, stroke: '#f1f5f9' } as const;
export const axisProps = { stroke: '#94a3b8', tick: { fontSize: 12 } } as const;

/** Formats a value that is already a percentage (e.g. 12.5 -> "12.5%"). Never multiplies by 100. */
export const pct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;
export const signedPct = (v: number, digits = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;

export const money = (v: number) =>
  `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
export const signedMoney = (v: number) => `${v >= 0 ? '+' : ''}${money(v)}`;

/** $1.2M / $950k style axis labels */
export const compactMoney = (v: number) => {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 2)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}k`;
  return `${sign}$${a.toFixed(0)}`;
};

/** Parses "YYYY-MM-DD" as a local date (avoids the UTC off-by-one of `new Date(str)`). */
export const parseDate = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
};

export const shortDate = (d: string) => parseDate(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const monthYear = (d: string) => parseDate(d).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
export const longDate = (d: string) =>
  parseDate(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
