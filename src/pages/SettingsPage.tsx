import { useEffect, useRef, useState } from 'react';
import { Sun, Moon, Monitor, Type, LogOut, Download, Upload, AlertTriangle, Trash2, Sparkles, Star, Wand2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { M3CookieLoader } from '@/components/ui/shapes';
import { useAuth } from '@/auth/AuthContext';
import { useMode, useDensity, useTheme, type ModePref, type Density } from '@/hooks/useThemePrefs';
import { cn } from '@/lib/utils';
import { account, themes as themesApi, type UserTheme } from '@/api';
import { format, parseISO } from 'date-fns';
import { useTheme as useUserTheme } from '@/theme/ThemeProvider';
import { previewSwatches } from '@/theme/applyM3';

// AIThemes — prompt input + saved theme list. Generated palettes are
// applied through the ThemeProvider so other pages observe the swap
// the moment activate fires.
function AIThemes() {
  const { mode, apply, active, refresh } = useUserTheme();
  const [list, setList] = useState<UserTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setList(await themesApi.list()); }
    catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    const p = prompt.trim();
    if (!p) return;
    setGenerating(true);
    setError(null);
    try {
      const t = await themesApi.generate(p, { activate: true });
      setPrompt('');
      apply(t);
      await load();
      await refresh();
    } catch (e) {
      setError((e as Error).message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const activate = async (id: number) => {
    try {
      const t = await themesApi.activate(id);
      apply(t);
      await load();
    } catch (e) { console.error(e); }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this theme?')) return;
    await themesApi.delete(id);
    if (active?.id === id) {
      apply(null);
    }
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. forest morning, calm, dark-leaning"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); generate(); } }}
            disabled={generating}
          />
          <Button onClick={generate} disabled={generating || !prompt.trim()} className="shrink-0 gap-2">
            {generating ? <M3CookieLoader size="xs" tone="primary" /> : <Wand2 className="size-4" />}
            {generating ? 'Mixing…' : 'Generate'}
          </Button>
        </div>
        {error && <div className="text-xs text-destructive">{error}</div>}
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
          No themes yet. Describe a vibe above to generate one.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {list.map((t) => {
            const isActive = t.is_active;
            const previewMode = t.mode_pref === 'auto' ? mode : t.mode_pref;
            const swatches = previewSwatches(t.seeds, previewMode);
            return (
              <div
                key={t.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3',
                  isActive ? 'border-primary ring-1 ring-primary/30' : 'border-border',
                )}
              >
                <div className="flex shrink-0">
                  {swatches.map((s, i) => (
                    <span
                      key={i}
                      className={cn(
                        'size-7 rounded-full border-2 border-[hsl(var(--surface))]',
                        i > 0 && '-ml-2',
                      )}
                      style={{ background: s }}
                    />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-serif font-semibold text-sm truncate">{t.name}</span>
                    {t.source === 'ai' && (
                      <Sparkles className="size-3 text-primary shrink-0" />
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground truncate">
                    {t.prompt || (t.source === 'manual' ? 'custom' : t.source)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!isActive && (
                    <button
                      onClick={() => activate(t.id)}
                      className="size-8 rounded-md grid place-items-center text-muted-foreground hover:text-primary hover:bg-accent"
                      title="Activate"
                    >
                      <Star className="size-4" />
                    </button>
                  )}
                  {isActive && (
                    <span className="size-8 rounded-md grid place-items-center text-primary" title="Active">
                      <Star className="size-4 fill-current" />
                    </span>
                  )}
                  <button
                    onClick={() => remove(t.id)}
                    className="size-8 rounded-md grid place-items-center text-muted-foreground hover:text-destructive hover:bg-accent"
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-[10px] font-mono text-muted-foreground inline-flex items-center gap-1">
        <Pencil className="size-3" /> Tip: Sajni mixes seeds for primary, secondary, tertiary, neutral; the rest of the
        M3 token set is derived per mode.
      </div>
    </div>
  );
}

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

  // Data — takeout / import / delete
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Deletion state — null = not loaded yet; { scheduled: false } = active.
  const [delState, setDelState] = useState<{ scheduled: boolean; purge_after?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    account.deletionStatus().then(setDelState).catch(() => setDelState({ scheduled: false }));
  }, []);

  const onExport = async () => {
    setExporting(true);
    try { await account.exportData(); }
    catch (e) { alert((e as Error).message); }
    finally { setExporting(false); }
  };

  const onImportFile = async (file: File) => {
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await account.importData(file);
      const total = Object.values(res.imported || {}).reduce((a, b) => a + b, 0);
      setImportMsg(`Imported ${total} items: ${Object.entries(res.imported).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    } catch (e) {
      setImportMsg('Import failed: ' + (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const onScheduleDelete = async () => {
    setWorking(true);
    try {
      const res = await account.scheduleDelete();
      setDelState({ scheduled: true, purge_after: res.purge_after });
      setConfirmDelete(false);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const onCancelDelete = async () => {
    setWorking(true);
    try {
      await account.cancelDelete();
      setDelState({ scheduled: false });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

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

        <Section
          title="AI themes"
          caption='Describe a vibe — "moss & bone, calm, dark-leaning" — and Sajni will mix you an M3 palette.'
        >
          <AIThemes />
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

        <Section title="Your data" caption="Take a copy with you. Or restore from a previous takeout.">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={exporting} onClick={onExport} className="gap-2">
                {exporting ? <M3CookieLoader size="xs" tone="primary" /> : <Download className="size-4" />}
                {exporting ? 'Preparing…' : 'Download takeout (.zip)'}
              </Button>
              <Button variant="outline" disabled={importing} onClick={() => fileRef.current?.click()} className="gap-2">
                {importing ? <M3CookieLoader size="xs" tone="primary" /> : <Upload className="size-4" />}
                {importing ? 'Importing…' : 'Import from takeout'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImportFile(f);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Memos, journal and notes export as .md · everything else as .csv. Import merges new rows
              into your account; IDs are remapped, so re-importing the same archive will create duplicates.
            </div>
            {importMsg && (
              <div className="text-xs text-foreground/80 border border-border rounded-md px-3 py-2">
                {importMsg}
              </div>
            )}
          </div>
        </Section>

        <Section title="Danger zone" caption="Permanently remove your account and all of its content.">
          {delState?.scheduled ? (
            <div className="flex flex-col gap-3 rounded-xl border border-[hsl(var(--error))] bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))] px-4 py-3.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                <div className="text-sm">
                  Your account is scheduled for deletion
                  {delState.purge_after && (
                    <> on <span className="serif font-semibold">{format(parseISO(delState.purge_after), 'PPP p')}</span></>
                  )}
                  . Cancel any time before then to keep your data.
                </div>
              </div>
              <Button onClick={onCancelDelete} disabled={working} className="w-fit gap-2">
                {working ? <M3CookieLoader size="xs" tone="primary" /> : null}
                Cancel deletion
              </Button>
            </div>
          ) : confirmDelete ? (
            <div className="flex flex-col gap-3 rounded-xl border border-[hsl(var(--error))] px-4 py-3.5">
              <div className="text-sm">
                Are you sure? Your data will live for <span className="serif font-semibold">7 days</span> after
                you confirm, then everything (memos, tasks, notes, habits, media, finance, journals) will be
                permanently deleted. Consider downloading a takeout first.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" disabled={working} onClick={onScheduleDelete} className="gap-2">
                  {working ? <M3CookieLoader size="xs" tone="primary" /> : <Trash2 className="size-4" />}
                  Yes, schedule deletion
                </Button>
                <Button variant="outline" disabled={working} onClick={onExport} className="gap-2">
                  <Download className="size-4" /> Download takeout first
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Nevermind</Button>
              </div>
            </div>
          ) : (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} className="gap-2 w-fit">
              <Trash2 className="size-4" /> Delete my account
            </Button>
          )}
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
