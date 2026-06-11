import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Input } from './ui/input';

type Tweak = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  initial?: number;
};

const TWEAKS: Tweak[] = [
  { key: '--backdrop-intensity', label: 'Backdrop intensity', min: 0, max: 1, step: 0.05, initial: 0.5 },
  { key: '--backdrop-grain',     label: 'Grain opacity',      min: 0, max: 0.4, step: 0.01, initial: 0.14 },
  { key: '--text-scale',         label: 'Text scale',         min: 0.8, max: 1.2, step: 0.02, initial: 1 },
];

function useEnabled(): boolean {
  const [on, setOn] = useState(() => new URLSearchParams(window.location.search).get('tweaks') === '1');
  useEffect(() => {
    const onPop = () => setOn(new URLSearchParams(window.location.search).get('tweaks') === '1');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return on;
}

export default function TweaksPanel() {
  const enabled = useEnabled();
  const [open, setOpen] = useState(true);
  const [values, setValues] = useState<Record<string, number>>(
    () => Object.fromEntries(TWEAKS.map((t) => [t.key, t.initial ?? t.min])),
  );

  useEffect(() => {
    if (!enabled) return;
    for (const t of TWEAKS) {
      document.documentElement.style.setProperty(t.key, String(values[t.key]));
    }
  }, [enabled, values]);

  if (!enabled) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[80] w-72 bg-popover text-popover-foreground border border-border shadow-xl"
      style={{ borderRadius: 0 }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="mono text-xs tracking-[0.18em] uppercase">tweaks</div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="mono text-xs tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground"
        >
          {open ? <X className="size-3.5" /> : 'open'}
        </button>
      </div>
      {open && (
        <div className="p-3 flex flex-col gap-3">
          {TWEAKS.map((t) => (
            <label key={t.key} className="block">
              <div className="flex items-center justify-between text-xs mb-1">
                <span>{t.label}</span>
                <span className="mono text-muted-foreground">{values[t.key].toFixed(2)}{t.unit ?? ''}</span>
              </div>
              <Input
                type="range"
                min={t.min}
                max={t.max}
                step={t.step}
                value={values[t.key]}
                onChange={(e) => setValues((v) => ({ ...v, [t.key]: Number(e.target.value) }))}
                className="w-full accent-primary"
              />
            </label>
          ))}
          <div className="mono text-xs uppercase tracking-[0.18em] text-muted-foreground pt-1 border-t border-border">
            ?tweaks=1 · runtime preview only
          </div>
        </div>
      )}
    </div>
  );
}
