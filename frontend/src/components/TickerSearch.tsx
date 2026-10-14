import React, { useEffect, useRef, useState } from 'react';
import { Search, Loader2, Star, X } from 'lucide-react';
import { marketApi } from '../services/api';
import { TickerSearchResult } from '../types';

interface Props {
  /** Currently chosen symbol (empty when nothing is chosen) */
  value: string;
  /** Called with the chosen listing, or with the raw typed text (result = null) */
  onChange: (symbol: string, result: TickerSearchResult | null) => void;
  autoFocus?: boolean;
}

const REGIONS = [
  { id: 'auto', label: 'Auto' },
  { id: 'us', label: 'US' },
  { id: 'india', label: 'India' },
  { id: 'global', label: 'Other' },
];

const REGION_STYLE: Record<string, string> = {
  US: 'bg-sky-50 text-sky-700 border-sky-200',
  India: 'bg-orange-50 text-orange-700 border-orange-200',
  Global: 'bg-violet-50 text-violet-700 border-violet-200',
};

export const TickerSearch: React.FC<Props> = ({ value, onChange, autoFocus }) => {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('auto');
  const [results, setResults] = useState<TickerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [selected, setSelected] = useState<TickerSearchResult | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search; aborts the previous request so slow responses never overwrite newer ones
  useEffect(() => {
    const text = query.trim();
    if (selected || text.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await marketApi.search(text, region, controller.signal);
        setResults(found);
        setSearchError(false);
        setHighlight(0);
        setOpen(true);
      } catch (err: any) {
        if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
        setSearchError(true);
        setResults([]);
        setOpen(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, region, selected]);

  // Close the dropdown when clicking elsewhere
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Parent cleared the value (e.g. form reset)
  useEffect(() => {
    if (!value) {
      setSelected(null);
      setQuery('');
    }
  }, [value]);

  const choose = (r: TickerSearchResult) => {
    setSelected(r);
    setQuery('');
    setOpen(false);
    onChange(r.symbol, r);
  };

  const clear = () => {
    setSelected(null);
    setQuery('');
    onChange('', null);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-gray-700">Company or ticker</label>
        <div className="flex items-center space-x-1" role="group" aria-label="Market">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRegion(r.id)}
              className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border transition-colors ${
                region === r.id
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="flex items-center justify-between px-3 py-2 border border-sky-300 bg-sky-50 rounded-lg">
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-900">{selected.symbol}</div>
            <div className="text-xs text-gray-600 truncate">
              {selected.name} · {selected.exchange}
            </div>
          </div>
          <button
            type="button"
            onClick={clear}
            className="p-1 text-gray-400 hover:text-gray-700 rounded"
            aria-label="Clear selected ticker"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            autoFocus={autoFocus}
            value={query || (value && !selected ? value : '')}
            maxLength={60}
            onChange={(e) => {
              setQuery(e.target.value);
              onChange(e.target.value.trim().toUpperCase(), null);
              setOpen(true);
            }}
            onFocus={() => results.length > 0 && setOpen(true)}
            onKeyDown={handleKey}
            className="block w-full pl-9 pr-9 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            placeholder="Search e.g. Apple, Reliance, Lockheed, or type a ticker"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
          />
          {loading && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 animate-spin" />}
        </div>
      )}

      {open && !selected && query.trim().length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {searchError && (
            <div className="px-3 py-3 text-xs text-amber-700 bg-amber-50">
              Search is unavailable right now. You can still type the exact ticker symbol (e.g. AAPL or
              RELIANCE.NS) and it will be validated when you add it.
            </div>
          )}
          {!searchError && !loading && results.length === 0 && (
            <div className="px-3 py-3 text-xs text-gray-500">
              No matches. If you know the exact ticker symbol, you can add it as typed.
            </div>
          )}
          {results.map((r, i) => (
            <button
              type="button"
              key={r.symbol}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(r)}
              className={`w-full text-left px-3 py-2 flex items-center justify-between space-x-3 ${
                i === highlight ? 'bg-sky-50' : 'bg-white'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-bold text-gray-900">{r.symbol}</span>
                  {r.recommended && (
                    <span className="inline-flex items-center space-x-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1">
                      <Star className="w-2.5 h-2.5" />
                      <span>Best match</span>
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 truncate">{r.name}</div>
              </div>
              <div className="flex flex-col items-end flex-shrink-0 space-y-0.5">
                <span className="text-[11px] text-gray-600">{r.exchange}</span>
                <span
                  className={`text-[10px] font-semibold px-1.5 py-px rounded-full border ${
                    REGION_STYLE[r.region] || REGION_STYLE.Global
                  }`}
                >
                  {r.region === 'Global' ? 'International' : r.region}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <p className="mt-1 text-[11px] text-gray-400">
        Pick a result and the right exchange is chosen for you (US, NSE/BSE India or international).
      </p>
    </div>
  );
};
