import React, { useMemo, useState } from 'react';
import { ChartCard, ChartEmpty } from './ChartCard';
import { isNum } from './chartTheme';

type Matrix = Record<string, Record<string, number>>;

// Diverging scale: negative -> sky, 0 -> neutral grey, positive -> rose
const NEG = [2, 132, 199];
const MID = [241, 245, 249];
const POS = [225, 29, 72];

export function correlationColor(v: number) {
  const t = Math.max(-1, Math.min(1, v));
  const end = t < 0 ? NEG : POS;
  const k = Math.abs(t);
  const [r, g, b] = MID.map((m, i) => Math.round(m + (end[i] - m) * k));
  return `rgb(${r}, ${g}, ${b})`;
}

export function describeCorrelation(v: number) {
  const a = Math.abs(v);
  const strength = a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.2 ? 'weak' : 'little or no';
  if (strength === 'little or no') return 'Little or no linear relationship';
  return `${strength[0].toUpperCase()}${strength.slice(1)} ${v > 0 ? 'positive' : 'negative'} co-movement`;
}

/** Interactive heatmap of pairwise daily-return correlations. */
export const CorrelationHeatmap: React.FC<{ correlation: Matrix | undefined }> = ({ correlation }) => {
  const tickers = useMemo(() => Object.keys(correlation || {}), [correlation]);
  const [hover, setHover] = useState<{ r: string; c: string } | null>(null);

  const get = (r: string, c: string): number | null => {
    const v = correlation?.[r]?.[c];
    return isNum(v) ? v : null;
  };

  // Off-diagonal pairs (upper triangle) for the summary
  const pairs = useMemo(() => {
    const out: { a: string; b: string; v: number }[] = [];
    tickers.forEach((a, i) =>
      tickers.slice(i + 1).forEach((b) => {
        const v = correlation?.[a]?.[b];
        if (isNum(v)) out.push({ a, b, v });
      })
    );
    return out;
  }, [tickers, correlation]);

  const avg = pairs.length ? pairs.reduce((s, p) => s + p.v, 0) / pairs.length : null;
  const highest = pairs.reduce<(typeof pairs)[number] | null>((m, p) => (!m || p.v > m.v ? p : m), null);
  const lowest = pairs.reduce<(typeof pairs)[number] | null>((m, p) => (!m || p.v < m.v ? p : m), null);

  const showValues = tickers.length <= 12;
  const cell = tickers.length <= 6 ? 'min-w-[64px] h-12' : tickers.length <= 12 ? 'min-w-[52px] h-10' : 'min-w-[34px] h-8';
  const hv = hover ? get(hover.r, hover.c) : null;

  return (
    <ChartCard
      title="Correlation Matrix"
      aside="Daily returns, trailing 1Y"
      footnote="Correlation measures how closely daily returns moved together in the past; it does not imply that one asset drives another, and it can change over time."
    >
      {tickers.length < 2 ? (
        <ChartEmpty height="h-40" message="Correlation needs at least two holdings with price history." />
      ) : (
        <>
          {/* Summary + hover readout */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase text-gray-400">Average pairwise</div>
              <div className="text-lg font-black text-gray-900 tabular-nums">{avg !== null ? avg.toFixed(2) : '–'}</div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2 min-w-0">
              <div className="text-[11px] font-semibold uppercase text-gray-400">Most correlated</div>
              <div className="text-sm font-bold text-gray-900 truncate">
                {highest ? `${highest.a} / ${highest.b}` : '–'}{' '}
                {highest && <span className="text-rose-600 tabular-nums">{highest.v.toFixed(2)}</span>}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2 min-w-0">
              <div className="text-[11px] font-semibold uppercase text-gray-400">Least correlated</div>
              <div className="text-sm font-bold text-gray-900 truncate">
                {lowest ? `${lowest.a} / ${lowest.b}` : '–'}{' '}
                {lowest && <span className="text-sky-700 tabular-nums">{lowest.v.toFixed(2)}</span>}
              </div>
            </div>
          </div>

          <div className="h-5 mb-2 text-xs text-gray-600" aria-live="polite">
            {hover &&
              (hover.r === hover.c ? (
                <span>
                  <b>{hover.r}</b> with itself: always 1.00
                </span>
              ) : hv === null ? (
                <span>
                  <b>{hover.r}</b> × <b>{hover.c}</b>: not available
                </span>
              ) : (
                <span>
                  <b>{hover.r}</b> × <b>{hover.c}</b>: <b className="tabular-nums">{hv.toFixed(3)}</b> · {describeCorrelation(hv)}
                </span>
              ))}
          </div>

          <div className="overflow-auto max-h-[480px] border border-gray-100 rounded-lg" onMouseLeave={() => setHover(null)}>
            <table className="border-separate" style={{ borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-20 bg-white" />
                  {tickers.map((t) => (
                    <th
                      key={t}
                      className={`sticky top-0 z-10 bg-white px-1 py-1.5 text-[11px] font-bold whitespace-nowrap ${
                        hover?.c === t ? 'text-sky-700' : 'text-gray-600'
                      }`}
                    >
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickers.map((r) => (
                  <tr key={r}>
                    <th
                      className={`sticky left-0 z-10 bg-white pl-2 pr-3 text-[11px] font-bold text-left whitespace-nowrap ${
                        hover?.r === r ? 'text-sky-700' : 'text-gray-600'
                      }`}
                    >
                      {r}
                    </th>
                    {tickers.map((c) => {
                      const v = get(r, c);
                      const diag = r === c;
                      const inCross = hover && (hover.r === r || hover.c === c);
                      const bg = diag ? '#e2e8f0' : v === null ? '#fff' : correlationColor(v);
                      const dark = !diag && v !== null && Math.abs(v) >= 0.5;
                      return (
                        <td
                          key={c}
                          onMouseEnter={() => setHover({ r, c })}
                          title={diag ? `${r}: self-correlation 1.00` : v === null ? `${r} × ${c}: n/a` : `${r} × ${c}: ${v.toFixed(3)}`}
                          className={`${cell} rounded text-center text-[11px] tabular-nums transition-opacity cursor-default ${
                            dark ? 'text-white font-semibold' : 'text-gray-700'
                          } ${diag ? 'font-bold text-gray-500' : ''} ${v === null && !diag ? 'border border-dashed border-gray-200' : ''} ${
                            hover && !inCross ? 'opacity-60' : ''
                          } ${hover?.r === r && hover?.c === c ? 'ring-2 ring-slate-900' : ''}`}
                          style={{ backgroundColor: bg }}
                        >
                          {showValues ? (diag ? '1.00' : v === null ? '–' : v.toFixed(2)) : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Scale legend */}
          <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500">
            <span className="tabular-nums">-1</span>
            <div
              className="h-2 w-40 rounded-full"
              style={{ background: `linear-gradient(to right, ${correlationColor(-1)}, ${correlationColor(0)}, ${correlationColor(1)})` }}
            />
            <span className="tabular-nums">+1</span>
            <span className="ml-2 hidden sm:inline">Blue: moved in opposite directions · Red: moved together (less diversification)</span>
          </div>
        </>
      )}
    </ChartCard>
  );
};
