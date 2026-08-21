import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sun, Moon, Monitor, Type, LogOut, Download, Upload, AlertTriangle, Trash2, Star, Wand2, Pencil, Mail, Check, X, RefreshCw } from '@/components/ui/icons';
// No pixel match — straight lucide (same as the icon shim's passthroughs).
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { M3CookieLoader } from '@/components/ui/shapes';
import { useAuth } from '@/auth/AuthContext';
import { useMode, useDensity, type ModePref, type Density } from '@/hooks/useThemePrefs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { account, type UserTheme } from '@/api';
import { useThemes } from '@/queries/themes';
import { qk } from '@/queries/keys';
import { confirmDialog } from '@/lib/confirm';
import { format, parseISO } from 'date-fns';
import { useTheme as useUserTheme } from '@/theme/ThemeProvider';
import { previewSwatches } from '@/theme/applyM3';
import { getPreset, THEMES } from '@/theme/presets';
import PageShell from '@/components/PageShell';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { AnimatePresence, motion } from 'framer-motion';

// AIThemes — prompt input + saved theme list. Generated palettes are
// applied through the ThemeProvider so other pages observe the swap
// the moment activate fires.
function AIThemes() {
  const {
    mode,
    active,
    action,
    activateTheme,
    generateTheme,
    deleteTheme,
  } = useUserTheme();
  const qc = useQueryClient();
  const { data: list = [], isLoading: loading } = useThemes();
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const generating = action?.kind === 'generate';
  const busy = action !== null;

  // ThemeProvider owns mutations and painting; this query is only the stable
  // management list shown here.
  const reloadThemes = () => qc.invalidateQueries({ queryKey: qk.themes.all });

  const generate = async () => {
    const p = prompt.trim();
    if (!p || busy) return;
    setError(null);
    try {
      await generateTheme(p);
      setPrompt('');
      await reloadThemes();
    } catch (e) {
      const message = (e as Error).message;
      setError(message === 'internal error' ? 'Couldn’t mix this theme. Try again.' : message || 'Generation failed');
    }
  };

  const activate = async (theme: UserTheme) => {
    if (busy || active?.id === theme.id) return;
    setError(null);
    try {
      await activateTheme(theme);
      await reloadThemes();
    } catch (e) {
      setError((e as Error).message || 'Couldn’t activate this theme');
    }
  };

  const remove = async (theme: UserTheme) => {
    if (busy) return;
    if (!(await confirmDialog('Delete this theme?'))) return;
    setError(null);
    try {
      await deleteTheme(theme);
      await reloadThemes();
    } catch (e) {
      setError((e as Error).message || 'Couldn’t delete this theme');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. forest morning, calm, dark-leaning"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); generate(); } }}
            disabled={generating}
          />
          <Button onClick={generate} disabled={busy || !prompt.trim()} className="w-full gap-2 sm:w-auto sm:shrink-0">
            {generating ? <M3CookieLoader size="xs" tone="primary" /> : <Wand2 className="size-4" />}
            {generating ? 'Mixing…' : 'Generate'}
          </Button>
        </div>
        {error && <div role="alert" className="text-xs text-destructive">{error}</div>}
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
            const isActive = active?.id === t.id;
            const isActivating = action?.kind === 'activate' && action.id === t.id;
            const isDeleting = action?.kind === 'delete' && action.id === t.id;
            const swatches = previewSwatches(t.seeds, mode);
            return (
              <div
                key={t.id}
                className={cn(
                  'flex min-w-0 items-stretch rounded-2xl border transition-[border-color,box-shadow]',
                  isActive
                    ? 'border-primary ring-1 ring-primary/30'
                    : 'border-border hover:border-muted-foreground/30',
                )}
              >
                <button
                  type="button"
                  onClick={() => activate(t)}
                  disabled={busy || isActive}
                  aria-pressed={isActive}
                  aria-label={isActive ? `${t.name}, active theme` : `Activate ${t.name}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-l-2xl p-3 text-left outline-none transition-colors enabled:hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
                >
                  <span className="flex shrink-0" aria-hidden="true">
                    {swatches.map((swatch, index) => (
                      <span
                        key={index}
                        className={cn(
                          'size-7 rounded-full border-2 border-[hsl(var(--surface))]',
                          index > 0 && '-ml-2',
                        )}
                        style={{ background: swatch }}
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-sm font-semibold">{t.name}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {t.prompt}
                    </span>
                  </span>
                  <span className="grid size-8 shrink-0 place-items-center text-primary" aria-hidden="true">
                    {isActivating
                      ? <M3CookieLoader size="xs" tone="primary" />
                      : <Star className={cn('size-4', isActive && 'fill-current')} />}
                  </span>
                </button>
                <div className="my-2 w-px bg-border" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => remove(t)}
                  disabled={busy}
                  className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-r-2xl text-muted-foreground outline-none transition-colors enabled:hover:bg-accent enabled:hover:text-destructive focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50"
                  title={`Delete ${t.name}`}
                  aria-label={`Delete ${t.name}`}
                >
                  {isDeleting
                    ? <M3CookieLoader size="xs" tone="primary" />
                    : <Trash2 className="size-4" />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-xs font-mono text-muted-foreground inline-flex items-center gap-1">
        <Pencil className="size-3" /> Tip: Sajni mixes seeds for primary, secondary, tertiary, neutral; the rest of the
        M3 token set is derived per mode.
      </div>
    </div>
  );
}

function Section({ id, title, caption, children }: { id?: string; title: string; caption?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="border-t border-border first:border-t-0 py-6 first:pt-0 scroll-mt-6">
      <div className="mono text-xs uppercase tracking-[0.22em] text-muted-foreground mb-1">{title}</div>
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

// PROVIDER_META renders the small chip for each linked sign-in method.
// Glyphs match the SignIn page so the user sees a consistent mark.
const PROVIDER_META: Record<
  'google' | 'github' | 'email',
  { label: string; bg: string; fg: string; node: React.ReactNode }
> = {
  google: {
    label: 'Google',
    bg: '#fff',
    fg: '#3c4043',
    node: (
      <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.08-1.79 2.72v2.26h2.9c1.69-1.56 2.67-3.86 2.67-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.06-3.72H.96v2.33A9 9 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.94 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.28-1.7V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l2.98-2.34z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96L3.94 7.3C4.66 5.17 6.65 3.58 9 3.58z" />
      </svg>
    ),
  },
  github: {
    label: 'GitHub',
    bg: '#0d1117',
    fg: '#fff',
    node: (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.16-.89-1.16-.72-.49.06-.48.06-.48.8.06 1.23.82 1.23.82.71 1.22 1.87.87 2.33.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.74.54 1.49v2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
    ),
  },
  email: {
    label: 'Email code',
    bg: 'hsl(var(--surface-container))',
    fg: 'hsl(var(--on-surface))',
    node: <Mail className="size-3.5" />,
  },
};

// NameEditor: inline edit-in-place for the display name. Save is
// optimistic on the server side (HandleUpdateProfile returns the new
// /me payload), so AuthContext re-renders with the fresh user.
function NameEditor() {
  const { user, updateName } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const begin = () => {
    setDraft(user.name || '');
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    const v = draft.trim();
    if (!v) { setError('Name cannot be empty.'); return; }
    setSaving(true);
    try {
      await updateName(v);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="serif font-semibold">{user.name || '—'}</span>
        <button
          onClick={begin}
          className="size-7 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--on-surface)/0.06)]"
          title="Edit name"
          aria-label="Edit display name"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          disabled={saving}
          autoFocus
          className="max-w-xs"
        />
        <Button size="icon-sm" onClick={save} disabled={saving} title="Save" aria-label="Save display name">
          {saving ? <M3CookieLoader size="xs" tone="primary" /> : <Check className="size-4" />}
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={cancel} disabled={saving} title="Cancel" aria-label="Cancel display name edit">
          <X className="size-4" />
        </Button>
      </div>
      {error && <div className="text-xs text-destructive">{error}</div>}
    </div>
  );
}

export default function SettingsPage() {
  const { hash } = useLocation();
  const { user, logout, rerollAvatar } = useAuth();
  const {
    preset,
    setPreset,
    active: activeUserTheme,
    mode: resolvedMode,
    action: themeAction,
  } = useUserTheme();
  const { mode, setMode } = useMode();
  const { density, setDensity } = useDensity();
  const qc = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const [rerollingAvatar, setRerollingAvatar] = useState(false);

  // Data — takeout / import / delete
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Deletion state — null = not loaded yet; { scheduled: false } = active.
  const [delState, setDelState] = useState<{ scheduled: boolean; purge_after?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);

  // AI action cards use /settings#themes. Settings loads lazily, so browser
  // anchor scrolling can run before target exists. Scroll after mount.
  useEffect(() => {
    if (hash !== '#themes') return;
    const frame = requestAnimationFrame(() => {
      document.getElementById('themes')?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  useEffect(() => {
    account.deletionStatus().then(setDelState).catch(() => setDelState({ scheduled: false }));
  }, []);

  const onExport = async () => {
    setExporting(true);
    try { await account.exportData(); }
    catch (e) { toast.error((e as Error).message); }
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
      toast.error((e as Error).message);
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
      toast.error((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <PageShell
      title="Settings"
      contentClassName="max-w-3xl w-full mx-auto px-5 md:px-10 pt-8 pb-24"
    >
      <div>
        {user && (
          <section
            aria-label="Profile"
            className="mb-8 rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] p-4 sm:p-5 shadow-[var(--m3-elev-1)]"
          >
            <div className="grid grid-cols-[88px_minmax(0,1fr)] sm:grid-cols-[112px_minmax(0,1fr)] gap-4 sm:gap-5 items-start">
              <ProfileAvatar
                user={user}
                size={112}
                className="!size-[88px] sm:!size-[112px]"
              />
              <div className="min-w-0 flex flex-col gap-3">
                <div className="min-w-0">
                  <NameEditor />
                  <div className="mt-1 text-sm text-muted-foreground break-all">{user.email}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {user.identities.length === 0 && (
                    <span className="text-xs text-muted-foreground">No sign-in methods linked.</span>
                  )}
                  {user.identities.map((identity) => {
                    const meta = PROVIDER_META[identity.provider];
                    return (
                      <span
                        key={identity.provider}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border border-[hsl(var(--outline-variant))]"
                        style={{ background: meta.bg, color: meta.fg }}
                      >
                        {meta.node}
                        {meta.label}
                      </span>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="tonal"
                    size="sm"
                    disabled={rerollingAvatar}
                    onClick={async () => {
                      setRerollingAvatar(true);
                      try { await rerollAvatar(); }
                      catch (error) { toast.error((error as Error).message); }
                      finally { setRerollingAvatar(false); }
                    }}
                  >
                    {rerollingAvatar
                      ? <M3CookieLoader size="xs" tone="primary" />
                      : <RefreshCw className="size-3.5" />}
                    {rerollingAvatar ? 'Rerolling…' : 'Reroll avatar'}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={signingOut}
                    onClick={async () => {
                      setSigningOut(true);
                      try { await logout(); }
                      finally { setSigningOut(false); }
                    }}
                  >
                    {signingOut
                      ? <M3CookieLoader size="xs" tone="primary" className="!text-destructive-foreground" />
                      : <LogOut className="size-3.5" />}
                    {signingOut ? 'Signing out…' : 'Sign out'}
                  </Button>
                </div>
              </div>
            </div>
            <p className="mt-4 sm:ml-[132px] text-xs text-muted-foreground">
              Sign in again with Google, GitHub, or email code and Sajni links it to this account when the email matches.
            </p>
          </section>
        )}

        <Section title="Appearance" caption="Light, dark, or follow the OS.">
          <div className="flex flex-wrap gap-2">
            <Choice value={'system' as ModePref} current={mode} onSelect={setMode} Icon={Monitor} label="System" />
            <Choice value={'light'  as ModePref} current={mode} onSelect={setMode} Icon={Sun} label="Light" />
            <Choice value={'dark'   as ModePref} current={mode} onSelect={setMode} Icon={Moon} label="Dark" />
          </div>
        </Section>

        <Section title="Theme" caption="Each theme has light and dark variants — toggle with Appearance above.">
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => {
              const active = !activeUserTheme && preset === t.id;
              const swatches = previewSwatches(getPreset(t.id).seeds, resolvedMode);
              return (
                <button
                  key={t.id}
                  // setPreset applies the preset and releases any active
                  // Release the server-side AI theme, then refresh the saved
                  // list's persistence metadata.
                  onClick={async () => {
                    try {
                      await setPreset(t.id);
                      await qc.invalidateQueries({ queryKey: qk.themes.all });
                    } catch (error) {
                      toast.error((error as Error).message || 'Couldn’t change theme');
                    }
                  }}
                  disabled={themeAction !== null}
                  aria-pressed={active}
                  aria-busy={themeAction?.kind === 'preset' && themeAction.preset === t.id}
                  className={cn(
                    'h-11 pl-2 pr-5 inline-flex items-center gap-2.5 border text-sm rounded-full transition-colors disabled:opacity-60',
                    active
                      ? 'bg-primary text-primary-foreground border-primary shadow-[var(--m3-elev-1)]'
                      : 'bg-transparent border-[hsl(var(--outline))] text-foreground/80 hover:bg-[hsl(var(--on-surface)/0.06)]',
                  )}
                >
                  <span className="flex -space-x-1" aria-hidden="true">
                    {swatches.slice(0, 3).map((c, i) => (
                      <span
                        key={i}
                        className="size-4 rounded-full ring-1 ring-[hsl(var(--surface)/0.6)]"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </Section>

        <Section
          id="themes"
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
              <Input
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
          <AnimatePresence initial={false} mode="wait">
          {delState?.scheduled ? (
            <motion.div
              key="scheduled"
              initial={{ opacity: 0, transform: 'translateY(4px)' }}
              animate={{ opacity: 1, transform: 'translateY(0)' }}
              exit={{ opacity: 0, transform: 'translateY(-4px)' }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className="flex flex-col gap-3 rounded-xl border border-[hsl(var(--error))] bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))] px-4 py-3.5"
            >
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
            </motion.div>
          ) : confirmDelete ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, transform: 'translateY(4px)' }}
              animate={{ opacity: 1, transform: 'translateY(0)' }}
              exit={{ opacity: 0, transform: 'translateY(-4px)' }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className="flex flex-col gap-3 rounded-xl border border-[hsl(var(--error))] px-4 py-3.5"
            >
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
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              <Button variant="destructive" onClick={() => setConfirmDelete(true)} className="gap-2 w-fit">
                <Trash2 className="size-4" /> Delete my account
              </Button>
            </motion.div>
          )}
          </AnimatePresence>
        </Section>

        {/* Brand mark — moved here from the rail. */}
        <div className="border-t border-border mt-10 pt-8 flex items-center gap-3 opacity-80">
          <span className="sajni-logo" aria-hidden="true" />
          <div>
            <div className="serif text-base font-semibold leading-tight">sajni</div>
            <div className="mono text-xs uppercase tracking-[0.22em] text-muted-foreground mt-0.5">
              your second brain · v1
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
