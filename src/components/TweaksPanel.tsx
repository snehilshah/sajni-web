import { useEffect, useState } from 'react';
import { X } from '@/components/ui/icons';
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

const TWEAKS: Tweak[] = [{ key: '--text-scale', label: 'Text scale', min: 0.8, max: 1.2, step: 0.02, initial: 1 }];

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
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(TWEAKS.map((t) => [t.key, t.initial ?? t.min])),
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
      className="fixed right-4 bottom-4 z-[80] w-72 border border-border bg-popover text-popover-foreground shadow-xl"
      style={{ borderRadius: 0 }}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="mono label-kicker text-xs">tweaks</div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="mono label-kicker text-xs text-muted-foreground hover:text-foreground"
        >
          {open ? <X className="size-3.5" /> : 'open'}
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-3 p-3">
          {TWEAKS.map((t) => (
            <label key={t.key} className="block">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span>{t.label}</span>
                <span className="mono text-muted-foreground">
                  {values[t.key].toFixed(2)}
                  {t.unit ?? ''}
                </span>
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
          <div className="mono label-kicker border-t border-border pt-1 text-xs text-muted-foreground">
            ?tweaks=1 · runtime preview only
          </div>
        </div>
      )}
    </div>
  );
}
