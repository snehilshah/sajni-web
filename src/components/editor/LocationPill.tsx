import { useEffect, useRef, useState } from 'react';
import { MapPin, X } from '@/components/ui/icons';

import { places, type PlacePrediction, type JournalLocation } from '@/api';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

interface Props {
  value: JournalLocation | null;
  onChange: (next: JournalLocation | null) => void;
  triggerLabel?: string;
}

// LocationPill is a M3-styled chip that resolves a short "Cinepolis, Vashi"
// label via the Google Places (New) proxy. A single session token is reused
// across keystrokes + the final details call so Google bills one session
// per pick, not per keystroke.
export default function LocationPill({ value, onChange, triggerLabel = 'Add location' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string>(makeSession());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef<Map<string, PlacePrediction[]>>(new Map());

  // Request browser location once on first open — used to bias predictions
  // and rank nearby POIs first.
  useEffect(() => {
    if (!open || coords) return;
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 4000 },
    );
  }, [open, coords]);

  // Debounced autocomplete. Cache 5min in-memory so re-typing the same
  // prefix is free.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const cacheKey = `${coords ? `${coords.lat.toFixed(2)},${coords.lon.toFixed(2)}|` : ''}${q.toLowerCase()}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setResults(cached);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await places.autocomplete(q, sessionRef.current, coords || undefined);
        cacheRef.current.set(cacheKey, res.predictions);
        setResults(res.predictions);
      } catch (e) {
        setError((e as Error).message || 'lookup failed');
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, coords]);

  const pick = async (p: PlacePrediction) => {
    try {
      const details = await places.details(p.place_id, sessionRef.current);
      onChange({ label: details.label, lat: details.lat, lon: details.lon });
    } catch {
      // Fallback: use whatever the prediction told us.
      const label = p.secondary ? `${p.primary}, ${firstLine(p.secondary)}` : p.primary;
      onChange({ label, lat: null, lon: null });
    } finally {
      // Each completed pick ends a Places session — start a fresh token for
      // the next lookup.
      sessionRef.current = makeSession();
      setOpen(false);
      setQuery('');
    }
  };

  const applyTyped = () => {
    const q = query.trim();
    if (!q) return;
    onChange({ label: q, lat: null, lon: null });
    sessionRef.current = makeSession();
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm transition-[background-color,color,box-shadow,opacity,transform] ${
            value
              ? 'bg-primary/12 ring-1 ring-primary/30 text-foreground'
              : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <MapPin className="size-3.5" />
          <span className="font-mono text-xs tracking-wide truncate max-w-[160px]">
            {value ? value.label : triggerLabel}
          </span>
          {value ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="opacity-60 hover:opacity-100 hover:text-destructive"
            >
              <X className="size-3" />
            </span>
          ) : null}
        </button>
      } />
      <PopoverContent className="w-72 p-2" align="start">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results.length > 0) {
              e.preventDefault();
              pick(results[0]);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              applyTyped();
            }
          }}
          placeholder="Search a place…"
          className="h-8"
        />
        <div className="mt-1.5 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="text-xs text-muted-foreground px-2 py-3">Searching…</div>
          ) : error ? (
            <div className="text-xs text-destructive px-2 py-3">{error}</div>
          ) : results.length === 0 && query.trim().length >= 2 ? (
            <button
              onClick={applyTyped}
              className="w-full text-left text-xs px-2 py-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              Use “{query.trim()}” as-is
            </button>
          ) : (
            results.map((r) => (
              <button
                key={r.place_id}
                onClick={() => pick(r)}
                className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent flex flex-col gap-0.5"
              >
                <span className="text-sm">{r.primary}</span>
                {r.secondary ? (
                  <span className="text-xs text-muted-foreground">{r.secondary}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function firstLine(s: string) {
  return s.split(',')[0].trim();
}

// makeSession returns a v4-style UUID using crypto.randomUUID when present,
// otherwise a 32-hex fallback. Used purely as a session token, not a
// security primitive.
function makeSession(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Array.from({ length: 4 }).map(() =>
    Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0'),
  ).join('');
}
