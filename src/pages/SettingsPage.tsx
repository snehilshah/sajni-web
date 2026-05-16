import { useState } from 'react';
import { Sun, Moon, Monitor, Type, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/AuthContext';
import { useMode, useDensity, useTheme, type ModePref, type Density } from '@/hooks/useThemePrefs';
import { cn } from '@/lib/utils';

function Section({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border first:border-t-0 py-6 first:pt-0">
      <div className="mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">{title}</div>
      {caption && <div className="serif italic text-sm text-muted-foreground mb-4">{caption}</div>}
      {!caption && <div className="h-3" />}
      {children}
    </section>
  );
}

function Choice<T extends string>({
  value, current, onSelect, Icon, label,
}: {
  value: T; current: T; onSelect: (v: T) => void;
  Icon?: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const active = value === current;
  return (
    <button
      onClick={() => onSelect(value)}
      className={cn(
        'h-10 px-5 inline-flex items-center justify-center gap-2 border text-sm capitalize rounded-full transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-[var(--m3-elev-1)]'
          : 'bg-transparent border-[hsl(var(--outline))] text-foreground/80 hover:bg-[hsl(var(--on-surface)/0.06)]',
      )}
    >
      {Icon && <Icon className="size-3.5" />}
      {label}
    </button>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { theme, setTheme, themes } = useTheme();
  const { mode, setMode } = useMode();
  const { density, setDensity } = useDensity();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="page-fade-in flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-5 md:px-10 pt-10 pb-24">
        <header className="mb-8">
          <div className="mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">preferences</div>
          <h1 className="serif text-4xl md:text-5xl font-medium tracking-tight">Settings</h1>
          <p className="text-base text-muted-foreground mt-1">Tune how Sajni looks and feels.</p>
        </header>

        <Section title="Appearance" caption="Light, dark, or follow the OS.">
          <div className="flex flex-wrap gap-2">
            <Choice value={'system' as ModePref} current={mode} onSelect={setMode} Icon={Monitor} label="System" />
            <Choice value={'light'  as ModePref} current={mode} onSelect={setMode} Icon={Sun} label="Light" />
            <Choice value={'dark'   as ModePref} current={mode} onSelect={setMode} Icon={Moon} label="Dark" />
          </div>
        </Section>

        <Section title="Theme" caption="Each theme has light and dark variants — toggle with Appearance above.">
          <div className="flex flex-wrap gap-2">
            {themes.map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    'h-10 px-5 inline-flex items-center gap-2 border text-sm rounded-full transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground border-primary shadow-[var(--m3-elev-1)]'
                      : 'bg-transparent border-[hsl(var(--outline))] text-foreground/80 hover:bg-[hsl(var(--on-surface)/0.06)]',
                  )}
                >
                  <span>{t.emoji}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Density" caption="How much room each thing takes.">
          <div className="flex flex-wrap gap-2">
            <Choice value={'compact'      as Density} current={density} onSelect={setDensity} Icon={Type} label="Compact" />
            <Choice value={'comfortable'  as Density} current={density} onSelect={setDensity} Icon={Type} label="Comfortable" />
            <Choice value={'cozy'         as Density} current={density} onSelect={setDensity} Icon={Type} label="Cozy" />
          </div>
        </Section>

        <Section title="Account">
          <div className="flex flex-col gap-3">
            <div className="text-sm">
              Signed in as <span className="serif font-semibold">{user?.email || '—'}</span>
            </div>
            <Button
              variant="destructive"
              className="w-fit"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                try { await logout(); }
                finally { setSigningOut(false); }
              }}
            >
              {signingOut ? <M3CookieLoader size="xs" tone="primary" className="!bg-destructive-foreground" /> : <LogOut className="size-3.5" />}
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </Section>

        {/* Brand mark — moved here from the rail. */}
        <div className="border-t border-border mt-10 pt-8 flex items-center gap-3 opacity-80">
          <span className="sajni-orb" aria-hidden="true" />
          <div>
            <div className="serif text-base font-semibold leading-tight">sajni</div>
            <div className="mono text-[9.5px] uppercase tracking-[0.22em] text-muted-foreground mt-0.5">
              your second brain · v1
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
