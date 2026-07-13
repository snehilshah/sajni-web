import { startTransition, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { media as mediaApi, type CollectionPart, type MediaEventRow } from '@/api';
import { useMedia, useCreateMedia, useUpdateMedia, useDeleteMedia } from '@/queries/media';
import BookmarksPanel from '@/pages/BookmarksPanel';
import type { MediaEntry, MediaStatus, MediaSearchResult, MediaPatch } from '@/types';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import PageShell, { PageShellTabs } from '@/components/PageShell';
import { SplitButton } from '@/components/ui/split-button';
import { M3CookieLoader } from '@/components/ui/shapes';
import { SegmentedProgress } from '@/components/ui/segmented-progress';
import { WavyProgress } from '@/components/ui/wavy-progress';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MorphingDialog, type MorphSourceRect } from '@/components/motion/morphing-dialog';
import { Sheet, SheetContent, SheetClose, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useVisualViewportBox } from '@/hooks/use-visual-viewport';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Star, Trash2, Search, Film, Tv, BookOpen, Calendar, ImageIcon, X, LayoutGrid, ListChecks, ArrowUpDown, MonitorPlay, Globe, ChevronRight, Settings } from '@/components/ui/icons';
// No pixel match for these two — straight lucide (same as the shim's passthroughs).
import { GalleryHorizontalEnd, Table2 } from 'lucide-react';

// Pixel-art platform glyphs (pixelarticons), imported as raw SVG strings so
// they bundle offline (no runtime fetch) and render at a fixed size. Each
// platform maps to a DISTINCT glyph + brand-color tint so they stay
// tell-apart even though the set has no real brand logos.
import pxTv from 'pixelarticons/svg/tv.svg?raw';
import pxVideo from 'pixelarticons/svg/video.svg?raw';
import pxCastle from 'pixelarticons/svg/castle.svg?raw';
import pxMonitor from 'pixelarticons/svg/monitor.svg?raw';
import pxAirplay from 'pixelarticons/svg/airplay.svg?raw';
import pxSparkles from 'pixelarticons/svg/sparkles.svg?raw';
import pxPlay from 'pixelarticons/svg/play.svg?raw';
import pxBuilding from 'pixelarticons/svg/building.svg?raw';
import pxDownload from 'pixelarticons/svg/download.svg?raw';
import pxImage from 'pixelarticons/svg/image.svg?raw';

const MEDIA_VIEW_KEY = 'sajni:media:view';
const MEDIA_SORT_KEY = 'sajni:media:sort';

type ViewMode = 'grid' | 'list' | 'shelves' | 'table';
const VIEW_MODES: ViewMode[] = ['grid', 'list', 'shelves', 'table'];

type SortKey =
  | 'updated_desc'   // last touched (existing default)
  | 'added_desc'     // newest add first
  | 'added_asc'
  | 'completed_desc' // most recently finished
  | 'rating_desc'
  | 'year_desc'
  | 'year_asc'
  | 'title_asc'
  | 'status';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'updated_desc',   label: 'Recently updated' },
  { value: 'added_desc',     label: 'Recently added' },
  { value: 'added_asc',      label: 'Oldest added' },
  { value: 'completed_desc', label: 'Recently completed' },
  { value: 'rating_desc',    label: 'Highest rated' },
  { value: 'year_desc',      label: 'Year (new → old)' },
  { value: 'year_asc',       label: 'Year (old → new)' },
  { value: 'title_asc',      label: 'Title (A → Z)' },
  { value: 'status',         label: 'Status' },
];

// STATUS_ORDER groups items by lifecycle when sortBy = 'status' so
// in-progress / pending stay near the top and dropped/scratched sink.
const STATUS_ORDER: Record<MediaStatus, number> = {
  in_progress: 0,
  upcoming: 1,
  pending: 2,
  waiting: 3,
  complete: 4,
  archived: 5,
  dropped: 6,
  scratched: 7,
};

// SeriesRow — what we actually render. A "single" row is one entry; a
// "series" row is a collection of movies that share a TMDB collection
// id, sorted chronologically within. Built from the post-filter, post-
// sort list so the user's sort still controls *placement* of the group.
type SeriesRow =
  | { kind: 'single'; item: MediaEntry }
  | {
      kind: 'series';
      collectionId: string;
      collectionName: string;
      members: MediaEntry[];
    };

const STATUS_OPTIONS: { value: MediaStatus; label: string; dot: string }[] = [
  { value: 'in_progress', label: 'In progress', dot: 'bg-blue-500' },
  { value: 'upcoming', label: 'Upcoming', dot: 'bg-[hsl(var(--tertiary))]' },
  { value: 'pending', label: 'Pending', dot: 'bg-muted-foreground' },
  { value: 'waiting', label: 'Waiting', dot: 'bg-purple-500' },
  { value: 'complete', label: 'Complete', dot: 'bg-emerald-500' },
  { value: 'archived', label: 'Archived', dot: 'bg-stone-500' },
  { value: 'dropped', label: 'Dropped', dot: 'bg-red-500' },
  { value: 'scratched', label: 'Scratched', dot: 'bg-rose-500' },
];

const PLATFORM_OPTIONS = [
  { value: 'netflix', label: 'Netflix' },
  { value: 'amazon', label: 'Amazon Prime' },
  { value: 'disney', label: 'Disney+' },
  { value: 'hbo', label: 'HBO Max' },
  { value: 'apple', label: 'Apple TV+' },
  { value: 'hulu', label: 'Hulu' },
  { value: 'cinema', label: 'Cinema' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'torrent', label: 'Downloaded' },
  { value: 'other', label: 'Other' },
];

const TYPE_META: Record<string, { label: string; plural: string; icon: typeof Film }> = {
  movie: { label: 'Movie', plural: 'Movies', icon: Film },
  show: { label: 'Show', plural: 'Shows', icon: Tv },
  book: { label: 'Book', plural: 'Books', icon: BookOpen },
  // Bookmark shelves — same tab strip, different panel underneath.
  video: { label: 'Video', plural: 'Videos', icon: MonitorPlay },
  site: { label: 'Site', plural: 'Sites', icon: Globe },
};
const BOOKMARK_TYPES = new Set(['video', 'site']);
type MediaKind = MediaEntry['type'];

// `?tab=` ↔ activeType. The share-capture flow deep-links here.
const TAB_TO_TYPE: Record<string, string> = {
  movies: 'movie', shows: 'show', books: 'book', videos: 'video', sites: 'site',
};
const TYPE_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_TO_TYPE).map(([tab, t]) => [t, tab]),
);

const statusMeta = (s: MediaStatus) => STATUS_OPTIONS.find((o) => o.value === s);
const platformLabel = (p: string) => PLATFORM_OPTIONS.find((o) => o.value === p)?.label || p;

function mediaKind(value: string): MediaKind {
  if (value === 'show' || value === 'book') return value;
  return 'movie';
}

function dateOnly(value?: string | null): string {
  const raw = (value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
}

function todayISODate(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatReleaseDate(value?: string | null): string {
  const d = dateOnly(value);
  if (!d) return '';
  try {
    return format(parseISO(d), 'MMM d, yyyy');
  } catch {
    return d;
  }
}

function isUpcomingRelease(item: Pick<MediaEntry, 'status' | 'release_date'>): boolean {
  const d = dateOnly(item.release_date);
  return (item.status === 'pending' || item.status === 'upcoming') && !!d && d > todayISODate();
}

function isUpcomingCollectionPart(part: Pick<CollectionPart, 'release_date' | 'release_state'>): boolean {
  const d = dateOnly(part.release_date);
  return part.release_state === 'upcoming' || (!!d && d > todayISODate());
}

function mediaStatusDisplay(item: MediaEntry): { label: string; shortLabel: string; color: string; chipClass: string } {
  if (isUpcomingRelease(item)) {
    const when = formatReleaseDate(item.release_date);
    return {
      label: when ? `Upcoming ${when}` : 'Upcoming',
      // Poster overlays are too narrow for a date — the full label stays
      // available as the pill's title/tooltip.
      shortLabel: 'Upcoming',
      color: 'hsl(var(--tertiary))',
      chipClass: 'chip-upcoming',
    };
  }
  const label = statusMeta(item.status)?.label || item.status;
  return {
    label,
    shortLabel: label,
    color: statusPillColor(item.status),
    chipClass: chipClassFor(item.status),
  };
}

function nextUpcomingMember(members: MediaEntry[]): MediaEntry | null {
  return members
    .filter(isUpcomingRelease)
    .sort((a, b) => dateOnly(a.release_date).localeCompare(dateOnly(b.release_date)))[0] || null;
}

// Per-platform pixel glyph (distinct each) + brand-color tint. The pixel set
// has no real brand logos, so a varied glyph + colour keeps platforms apart.
// Colour is an intentional exception to the theme-token rule so a platform
// reads as itself; `currentColor` ones inherit the surrounding text colour.
const PIXEL_SVGS: Record<string, string> = {
  tv: pxTv, video: pxVideo, castle: pxCastle, monitor: pxMonitor, airplay: pxAirplay,
  sparkles: pxSparkles, play: pxPlay, building: pxBuilding, download: pxDownload, image: pxImage,
};

const PLATFORM_PIXEL: Record<string, { glyph: keyof typeof PIXEL_SVGS; color: string }> = {
  netflix: { glyph: 'tv',       color: '#E50914' },
  amazon:  { glyph: 'video',    color: '#00A8E1' },
  disney:  { glyph: 'castle',   color: '#113CCF' },
  hbo:     { glyph: 'monitor',  color: '#9D4EDD' },
  apple:   { glyph: 'airplay',  color: 'currentColor' },
  hulu:    { glyph: 'sparkles', color: '#1CE783' },
  youtube: { glyph: 'play',     color: '#FF0000' },
  cinema:  { glyph: 'building', color: 'currentColor' },
  torrent: { glyph: 'download', color: 'currentColor' },
  other:   { glyph: 'image',    color: 'currentColor' },
};

// Renders a raw pixelarticons SVG string at a FIXED size. The source SVG uses
// `fill="currentColor"`, so a `color` on the wrapper tints it; the child-svg
// size utilities override the file's intrinsic 24×24 so every glyph is uniform.
function PixelIcon({ glyph, className, style }: { glyph: string; className?: string; style?: React.CSSProperties }) {
  const svg = PIXEL_SVGS[glyph];
  if (!svg) return null;
  return (
    <span
      aria-hidden
      className={cn('inline-grid place-items-center shrink-0 size-4 [&>svg]:size-full', className)}
      style={style}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// Pixel glyph + label for a media entry's platform. `showLabel=false` renders
// the mark alone (tight rows / dropdown trigger). Fixed-size glyph throughout.
function PlatformLogo({
  platform, showLabel = true, className, iconClassName,
}: {
  platform: string;
  showLabel?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  const meta = PLATFORM_PIXEL[platform] || PLATFORM_PIXEL.other;
  return (
    <span className={cn('inline-flex items-center gap-1.5 align-middle min-w-0', className)}>
      <PixelIcon glyph={meta.glyph} className={iconClassName} style={{ color: meta.color }} />
      {showLabel && <span className="truncate">{platformLabel(platform)}</span>}
    </span>
  );
}

// Returns the accent color for status-colored UI elements (poster pill, etc.)
function statusPillColor(status: MediaStatus): string {
  switch (status) {
    case 'in_progress': return 'hsl(var(--secondary))';
    case 'complete':    return 'hsl(var(--color-complete))';
    case 'dropped':
    case 'scratched':   return 'hsl(var(--destructive))';
    case 'waiting':     return 'hsl(var(--color-waiting))';
    case 'pending':     return 'hsl(var(--muted-foreground))';
    case 'upcoming':    return 'hsl(var(--tertiary))';
    default:            return 'hsl(var(--muted-foreground))';
  }
}

function normalizeMediaTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function yearFromMedia(value: Pick<MediaEntry, 'year' | 'release_date'>): number | null {
  if (value.year) return value.year;
  const raw = dateOnly(value.release_date);
  if (!raw) return null;
  const year = parseInt(raw.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

function findDuplicateMedia(pool: MediaEntry[], draft: FormState, skipId?: number): MediaEntry | null {
  const title = normalizeMediaTitle(draft.title);
  const ext = draft.external_id.trim();
  const draftYear = yearFromMedia(draft);
  if (!title && !ext) return null;
  return pool.find((item) => {
    if (skipId && item.id === skipId) return false;
    if (item.type !== draft.type) return false;
    if (ext && item.external_id === ext) return true;
    if (normalizeMediaTitle(item.title) !== title) return false;
    const itemYear = yearFromMedia(item);
    return !draftYear || !itemYear || draftYear === itemYear;
  }) || null;
}

function duplicateMediaDescription(item: MediaEntry): string {
  const type = TYPE_META[item.type]?.label || 'Item';
  const year = yearFromMedia(item);
  const status = statusMeta(item.status)?.label || item.status;
  return `${type}${year ? ` · ${year}` : ''} · ${status}`;
}



function SegmentedBar({
  watched, total, status, units,
  showLabel = false, label = '', variant = 'row',
  boxH = 6,
}: {
  watched: number;
  total: number;
  status: MediaStatus;
  /** Number of bars to draw. For shows pass seasons_total; for books we
      fall back to a smart bucket count when omitted. */
  units?: number;
  showLabel?: boolean;
  label?: string;
  variant?: 'row' | 'wrap';
  boxH?: number;
}) {
  return (
    <SegmentedProgress
      value={watched}
      total={total}
      units={units}
      state={status === 'complete' ? 'complete' : status === 'dropped' || status === 'scratched' ? 'dropped' : 'active'}
      height={boxH}
      variant={variant}
      label={units && units > 0 ? `${units} ${units === 1 ? 'season' : 'seasons'}` : label}
      showLabel={showLabel}
    />
  );
}

// ProgressBar — kept as alias for SegmentedBar for backward compat.
function ProgressBar({ watched, total, label, itemStatus = 'in_progress' }: {
  watched: number; total: number; label: string; itemStatus?: MediaStatus; color?: string;
}) {
  return (
    <SegmentedBar
      watched={watched} total={total} status={itemStatus}
      boxH={10} variant="wrap"
      showLabel label={label}
    />
  );
}

function StarRating({ value, interactive = false, onChange, size = 'sm' }: { value: number; interactive?: boolean; onChange?: (v: number) => void; size?: 'sm' | 'md' }) {
  const sizeCls = size === 'md' ? 'size-5' : 'size-3.5';
  return (
    <div className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${sizeCls} transition-colors ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'} ${interactive ? 'cursor-pointer hover:text-amber-400' : ''}`}
          onClick={interactive && onChange ? () => onChange(n === value ? 0 : n) : undefined}
        />
      ))}
    </div>
  );
}

// Movie/Show badge label for a search row. Derived from the external_id
// the backend mints (tmdb:movie:… / tmdb:tv:…) so combined results stay
// tell-apart; null for Open Library books (no badge).
function tmdbKindLabel(ext: string): 'Movie' | 'Show' | null {
  if (ext.startsWith('tmdb:tv:')) return 'Show';
  if (ext.startsWith('tmdb:movie:')) return 'Movie';
  return null;
}

/**
 * TitleAutocomplete — single Title field with inline TMDB / Open Library
 * suggestions. Replaces the old split "Search DB" + "Title" inputs so
 * manual entries flow the same as DB-backed ones: type a name → either
 * pick a suggestion or just commit the free-text title.
 */
function TitleAutocomplete({
  value, type, onChange, onSelect, autoFocus, source,
}: {
  value: string;
  type: string;
  onChange: (v: string) => void;
  onSelect: (r: MediaSearchResult) => void;
  autoFocus?: boolean;
  /** Set once a suggestion is picked — used to suppress the dropdown. */
  source?: string;
}) {
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Local copy of the input text. Typing updates THIS (only re-rendering the
  // autocomplete), and we sync up to the parent `form` only on the search
  // debounce / blur / select. That keeps every keystroke off the heavy
  // MediaPage render path — otherwise the controlled `value={form.title}`
  // couldn't repaint until MediaPage finished committing, which is what froze
  // the field during a TMDB search.
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emittedValue = useRef<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Cancels the in-flight search so a slow earlier request can't resolve
  // after a newer one and clobber the dropdown (or pin the spinner open).
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Close dropdown when clicking outside.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Re-seed local text when the parent value changes for an external reason
  // (opening an edit, a picked suggestion filling the title, TMDB details).
  // While typing, value only changes via our own debounced onChange to the
  // same string, so this is a no-op mid-type and never reverts the input.
  useEffect(() => {
    if (emittedValue.current === value) {
      emittedValue.current = null;
      return;
    }
    setText(value);
  }, [value]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { startTransition(() => setResults([])); return; }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    startTransition(() => setLoading(true));
    try {
      const res = await mediaApi.search(q, type, ac.signal);
      if (!ac.signal.aborted) {
        startTransition(() => {
          setResults(res);
          setLoading(false);
        });
      }
    } catch {
      // A superseded request rejects with AbortError — ignore it; the
      // newer request now owns the spinner + results.
      if (!ac.signal.aborted) {
        startTransition(() => {
          setResults([]);
          setLoading(false);
        });
      }
    }
  }, [type]);

  const handleChange = (val: string) => {
    setText(val);            // instant, local — does NOT touch MediaPage
    setHighlight(0);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    // Sync the parent + fire the search together, after the user pauses.
    timer.current = setTimeout(() => {
      timer.current = null;
      emittedValue.current = val;
      startTransition(() => onChange(val));
      doSearch(val);
    }, 320);
  };

  // Push the locally-typed text to the parent immediately — used on blur so a
  // Save click (which blurs first) always sees the latest title.
  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    emittedValue.current = text;
    onChange(text);
  };

  // Commit a picked suggestion: cancel any pending debounce, hand the row to
  // the parent, mirror the title locally, and close.
  const pick = (r: MediaSearchResult) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    emittedValue.current = null;
    onSelect(r);
    setText(r.title);
    setOpen(false);
    setResults([]);
  };

  const placeholder = type === 'book'
    ? 'Title — search Open Library or type manually'
    : 'Title — search movies & shows on TMDB or type manually';

  return (
    <div className="relative group" ref={wrapRef}>
      <Search className="absolute left-5 top-1/2 -translate-y-1/2 size-5 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none z-10" />
      <Input
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={flush}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter')   { e.preventDefault(); const r = results[highlight]; if (r) pick(r); }
          else if (e.key === 'Escape')  { setOpen(false); }
        }}
        autoFocus={autoFocus}
        placeholder={placeholder}
        required
        aria-required="true"
        className="w-full h-14 pl-14 pr-14 rounded-full bg-[hsl(var(--surface-container-high))] font-serif text-lg font-medium tracking-tight outline-none placeholder:text-muted-foreground/55 border-2 border-transparent focus:border-primary focus:bg-[hsl(var(--surface-container-highest))] focus:shadow-[var(--m3-elev-2)] transition-[border-color,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
      />
      {loading && (
        <span className="absolute right-5 top-1/2 -translate-y-1/2"><M3CookieLoader size="sm" tone="primary" /></span>
      )}
      {source && !loading && (
        <span className="absolute right-4 top-1/2 -translate-y-1/2 chip chip-sage h-7 px-2.5 text-xs">
          {source.startsWith('tmdb') ? 'TMDB' : 'Open Library'}
        </span>
      )}
      <AnimatePresence initial={false}>
        {open && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, transform: 'translateY(-4px) scale(0.98)' }}
            animate={{ opacity: 1, transform: 'translateY(0) scale(1)' }}
            exit={{ opacity: 0, transform: 'translateY(-4px) scale(0.98)' }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="absolute left-0 right-0 top-[calc(100%+10px)] z-30 rounded-[28px] bg-[hsl(var(--surface-container-high))] shadow-[var(--m3-elev-3)] max-h-80 overflow-y-auto p-2 origin-top"
          >
            {results.map((r, i) => {
              const kind = tmdbKindLabel(r.external_id);
              return (
              <button
                key={r.external_id + i}
                type="button"
                className={cn(
                  'w-full flex items-start gap-3 p-3 rounded-2xl transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] text-left active:scale-[0.99]',
                  highlight === i ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]' : 'hover:bg-[hsl(var(--on-surface)/0.06)]',
                )}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(r)}
              >
                <div className="w-11 aspect-[2/3] rounded-lg bg-[hsl(var(--surface-container-highest))] shrink-0 overflow-hidden">
                  {r.poster_url ? (
                    <img src={r.poster_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-4" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{r.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {kind && (
                      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md border border-current text-[10px] font-medium uppercase tracking-wide opacity-60 shrink-0">
                        {kind === 'Show' ? <Tv className="size-2.5" /> : <Film className="size-2.5" />}
                        {kind}
                      </span>
                    )}
                    {r.year && <span className="font-mono text-xs opacity-70">{r.year}</span>}
                    {r.release_state === 'upcoming' && (
                      <span className="chip chip-upcoming h-5 px-1.5 text-[10px] uppercase tracking-wide">
                        Upcoming{r.release_date ? ` ${formatReleaseDate(r.release_date)}` : ''}
                      </span>
                    )}
                  </div>
                  {r.overview && <div className="text-xs opacity-75 line-clamp-2 mt-0.5">{r.overview}</div>}
                </div>
              </button>
              );
            })}
            <div className="px-3 pt-2.5 pb-1 mono text-xs uppercase tracking-[0.18em] text-muted-foreground border-t border-[hsl(var(--outline-variant))] mt-1">
              Press Enter to pick · Esc to keep typing
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FormState {
  title: string;
  type: MediaKind;
  status: MediaStatus;
  rating: number;
  notes: string;
  platform: string;
  poster_url: string;
  year: number | null;
  release_date: string;
  genre: string;
  external_id: string;
  // Cumulative episodes watched across all seasons. Derived from
  // current_season + current_episode + season_episodes when the show
  // came from TMDB, or set directly via the input fallback.
  episodes_watched: number;
  episodes_total: number;
  seasons_watched: number;
  seasons_total: number;
  // Per-season episode counts from TMDB (e.g. [10, 12, 8]). When this
  // is non-empty the dialog shows the Microsoft-Todo-style season
  // selector instead of the 4 raw number inputs.
  season_episodes: number[];
  /** Like "tmdb:collection:1234" — empty when the movie has no series. */
  collection_id: string;
  collection_name: string;
}

export default function MediaPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeType, setActiveType] = useState(
    () => TAB_TO_TYPE[searchParams.get('tab') ?? ''] || 'movie',
  );
  const isBookmarkTab = BOOKMARK_TYPES.has(activeType);
  // Page-level Add button → bookmark panel's dialog (see BookmarksPanel).
  const [bookmarkAddSignal, setBookmarkAddSignal] = useState(0);
  // Multi-select: empty set = "All". Filtering is client-side so several
  // statuses can be lit at once (e.g. In progress + Pending together).
  const [statusFilters, setStatusFilters] = useState<Set<MediaStatus>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const isMobileMedia = useIsMobile();
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const stored = localStorage.getItem(MEDIA_VIEW_KEY) as ViewMode;
      return VIEW_MODES.includes(stored) ? stored : 'list';
    } catch { return 'list'; }
  });
  const [sortBy, setSortBy] = useState<SortKey>(() => {
    try { return (localStorage.getItem(MEDIA_SORT_KEY) as SortKey) || 'updated_desc'; }
    catch { return 'updated_desc'; }
  });
  // Series grouping is only meaningful for movies — TMDB collection
  // metadata only attaches to those. We default it on for the movie tab.
  const [groupSeries, setGroupSeries] = useState<boolean>(() => {
    try { return localStorage.getItem('sajni:media:group') !== '0'; }
    catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('sajni:media:group', groupSeries ? '1' : '0'); } catch {}
  }, [groupSeries]);
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());
  const [seriesDialog, setSeriesDialog] = useState<Extract<SeriesRow, { kind: 'series' }> | null>(null);
  const toggleSeries = useCallback((id: string) =>
    setExpandedSeries((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    }), []);
  useEffect(() => {
    try { localStorage.setItem(MEDIA_VIEW_KEY, viewMode); } catch {}
  }, [viewMode]);
  useEffect(() => {
    try { localStorage.setItem(MEDIA_SORT_KEY, sortBy); } catch {}
  }, [sortBy]);

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<MediaEntry | null>(null);
  // Which always-mounted element the desktop dialog morphs out of:
  // a grid poster ('card'), the pill Add button ('add'), or none
  // (list/table/shelves rows → scale/fade fallback).
  const [morphSource, setMorphSource] = useState<'card' | 'add' | null>(null);
  const [morphRect, setMorphRect] = useState<MorphSourceRect | undefined>();
  const [saving, setSaving] = useState(false);
  // On phones the form is a full-height bottom Sheet; track the visual
  // viewport so the sticky footer + focused field stay above the keyboard.
  const vvBox = useVisualViewportBox(showForm && isMobileMedia);

  const blankForm = useCallback((): FormState => ({
    title: '', type: mediaKind(activeType), status: 'pending', rating: 0, notes: '',
    platform: '', poster_url: '', year: null as number | null, release_date: '', genre: '',
    external_id: '', episodes_watched: 0, episodes_total: 0,
    seasons_watched: 0, seasons_total: 0,
    season_episodes: [], collection_id: '', collection_name: '',
  }), [activeType]);

  const [form, setForm] = useState<FormState>(blankForm());

  // Cached library. keepPreviousData (in useMedia) holds the current shelf
  // visible while a tab switch refetches; bookmark tabs load their own data
  // so the media query is disabled there. Status filtering happens client-
  // side (multi-select) so chip counts stay honest while filters are lit.
  const mediaParams = useMemo(
    () => ({ type: activeType }),
    [activeType],
  );
  const { data: items = [], isLoading: loading } = useMedia(mediaParams, !isBookmarkTab) as {
    data: MediaEntry[]; isLoading: boolean;
  };
  const createMedia = useCreateMedia();
  const updateMedia = useUpdateMedia();
  const deleteMedia = useDeleteMedia();

  // Deep-links (`/media?tab=videos` from the share flow) can land while
  // the page is already mounted — follow the param.
  useEffect(() => {
    const t = TAB_TO_TYPE[searchParams.get('tab') ?? ''];
    if (t && t !== activeType) setActiveType(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const switchType = useCallback((key: string) => {
    setActiveType(key);
    setStatusFilters(new Set());
    setSearchQuery('');
    setSearchParams(key === 'movie' ? {} : { tab: TYPE_TO_TAB[key] }, { replace: true });
  }, [setSearchParams]);

  const toggleStatusFilter = useCallback((status: MediaStatus) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }, []);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let matched = statusFilters.size > 0
      ? items.filter((i) => statusFilters.has(i.status))
      : items;
    if (q) {
      matched = matched.filter((i) =>
        i.title.toLowerCase().includes(q) ||
        i.genre.toLowerCase().includes(q) ||
        i.platform.toLowerCase().includes(q),
      );
    }
    return sortMedia(matched, sortBy);
  }, [items, statusFilters, searchQuery, sortBy]);

  // Build the rendering rows. Each row is either a single MediaEntry
  // or a series with its child entries (chronologically sorted). When
  // grouping is off, each item is its own "row".
  const seriesRows = useMemo<SeriesRow[]>(() => {
    if (!groupSeries || activeType !== 'movie') {
      return filteredItems.map((item) => ({ kind: 'single', item }));
    }
    const groups = new Map<string, MediaEntry[]>();
    const order: string[] = [];           // first-seen order (after sortMedia)
    const standalone: MediaEntry[] = [];
    for (const it of filteredItems) {
      if (!it.collection_id) { standalone.push(it); continue; }
      if (!groups.has(it.collection_id)) {
        groups.set(it.collection_id, []);
        order.push(it.collection_id);
      }
      groups.get(it.collection_id)!.push(it);
    }
    const rows: SeriesRow[] = [];
    // Walk in user-sort order: any time a movie belongs to a group we
    // emit the group at its "first appearance" position; standalones
    // emit inline.
    const emitted = new Set<string>();
    for (const it of filteredItems) {
      if (it.collection_id) {
        if (emitted.has(it.collection_id)) continue;
        emitted.add(it.collection_id);
        const members = [...(groups.get(it.collection_id) || [])]
          .sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title));
        if (members.length === 1) {
          rows.push({ kind: 'single', item: members[0] });
        } else {
          rows.push({
            kind: 'series',
            collectionId: it.collection_id,
            collectionName: it.collection_name || 'Movie series',
            members,
          });
        }
      } else {
        rows.push({ kind: 'single', item: it });
      }
    }
    // standalones already pushed via the walk; they're inline.
    void standalone;
    return rows;
  }, [filteredItems, groupSeries, activeType]);

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { all: items.length };
    for (const it of items) byStatus[it.status] = (byStatus[it.status] || 0) + 1;
    return byStatus;
  }, [items]);

  const openForm = useCallback((item?: MediaEntry, morph?: 'card' | 'add', sourceEl?: Element | null) => {
    const rect = sourceEl?.getBoundingClientRect();
    setMorphSource(morph ?? null);
    setMorphRect(rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined);
    if (item) {
      setEditItem(item);
      setForm({
        title: item.title, type: item.type, status: item.status,
        rating: item.rating || 0, notes: item.notes, platform: item.platform,
        poster_url: item.poster_url, year: item.year || null, release_date: item.release_date || '', genre: item.genre,
        external_id: item.external_id,
        episodes_watched: item.episodes_watched, episodes_total: item.episodes_total,
        seasons_watched: item.seasons_watched, seasons_total: item.seasons_total,
        season_episodes: item.season_episodes || [],
        collection_id: item.collection_id || '',
        collection_name: item.collection_name || '',
      });
    } else {
      setEditItem(null);
      setForm(blankForm());
    }
    setShowForm(true);
  }, [blankForm]);

  const mediaAddLabel = `Add ${(TYPE_META[activeType]?.label || 'entry').toLowerCase()}`;
  const handleAdd = useCallback((sourceEl?: Element | null) => {
    if (isBookmarkTab) {
      setBookmarkAddSignal((s) => s + 1);
      return;
    }
    openForm(undefined, 'add', sourceEl);
  }, [isBookmarkTab, openForm]);

  const handleExternalSelect = async (r: MediaSearchResult) => {
    // Combined movie+show search: the picked row's kind (carried in its
    // external_id) sets the form type, so picking a show from the movie
    // tab flips to 'show' and reveals the show-progress section. Books
    // keep their type (Open Library ids carry no tmdb kind).
    const kind = tmdbKindLabel(r.external_id);
    const isUpcoming = r.release_date && dateOnly(r.release_date) > todayISODate();
    // Optimistic prefill from the search row.
    setForm((f) => ({
      ...f,
      title: r.title,
      type: kind === 'Show' ? 'show' : kind === 'Movie' ? 'movie' : f.type,
      status: isUpcoming ? 'upcoming' : 'pending',
      poster_url: r.poster_url,
      year: r.year ? parseInt(r.year) : null,
      release_date: r.release_date || '',
      genre: r.genre,
      external_id: r.external_id,
    }));
    // For TMDB sources we have a details endpoint; book results from
    // Open Library don't support it (and we'd need a different shape).
    if (!r.external_id.startsWith('tmdb:')) return;
    try {
      const d = await mediaApi.details(r.external_id);
      const isUpcomingDetailed = d.release_date && dateOnly(d.release_date) > todayISODate();
      setForm((f) => ({
        ...f,
        // Don't clobber the title if the user already started typing.
        title: f.title || d.title,
        status: isUpcomingDetailed ? 'upcoming' : f.status,
        poster_url: f.poster_url || d.poster_url,
        year: f.year || (d.year ? parseInt(d.year) : null),
        release_date: d.release_date || f.release_date,
        genre: f.genre || d.genre,
        seasons_total: d.seasons_total || f.seasons_total,
        episodes_total: d.episodes_total || f.episodes_total,
        season_episodes: d.season_episodes && d.season_episodes.length > 0
          ? d.season_episodes
          : f.season_episodes,
        collection_id: d.collection_id || f.collection_id,
        collection_name: d.collection_name || f.collection_name,
      }));
    } catch {
      // Detail fetch is a best-effort enrichment — the search row is
      // already in the form; silently fall back if TMDB hiccups.
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      let duplicatePool: MediaEntry[];
      try {
        // `items` is the full (status-unfiltered) shelf for the active type,
        // so it doubles as the duplicate pool whenever types match.
        duplicatePool = form.type === activeType
          ? items
          : await mediaApi.list({ type: form.type });
      } catch {
        toast.error('Could not check for duplicates', {
          description: 'Try saving again in a moment.',
        });
        return;
      }
      const duplicate = findDuplicateMedia(duplicatePool, form, editItem?.id);
      if (duplicate) {
        toast.error(`${TYPE_META[form.type]?.label || 'Item'} already in library`, {
          description: duplicateMediaDescription(duplicate),
        });
        return;
      }

      const payload: MediaPatch = { ...form, rating: form.rating || null };
      // Marking complete snaps progress to the end — last season, last episode —
      // so the S?E? label and bar read 100% instead of wherever the user stopped.
      if (form.status === 'complete') {
        const totalEps = form.season_episodes.length > 0
          ? form.season_episodes.reduce((s, n) => s + n, 0)
          : form.episodes_total;
        if (totalEps > 0) payload.episodes_watched = totalEps;
        if (form.type === 'show') {
          const totalSeasons = form.season_episodes.length > 0 ? form.season_episodes.length : form.seasons_total;
          if (totalSeasons > 0) payload.seasons_watched = totalSeasons;
        }
      }
      if (editItem) await updateMedia.mutateAsync({ id: editItem.id, data: payload });
      else await createMedia.mutateAsync(payload);
      setShowForm(false);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    await deleteMedia.mutateAsync(id);
    setShowForm(false);
  };

  const TypeIcon = TYPE_META[activeType]?.icon || Film;

  // Memoize shelf rendering so typing in the dialog never rerenders it. Motion
  // stays limited to disclosures; filtering and sorting update without layout
  // choreography that previously made the shelf feel unstable.
  const gridEl = useMemo(() => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <M3CookieLoader size="lg" tone="primary" />
          <span className="mono text-xs tracking-[0.22em] uppercase text-muted-foreground">
            opening library…
          </span>
        </div>
      );
    }
    if (filteredItems.length === 0) {
      return (
        <EmptyState type={activeType} hasFilter={statusFilters.size > 0 || !!searchQuery} onAdd={() => openForm()} onClear={() => { setStatusFilters(new Set()); setSearchQuery(''); }} />
      );
    }
    if (viewMode === 'grid') {
      return (
        <div className="grid grid-cols-2 min-[480px]:grid-cols-3 md:[grid-template-columns:repeat(auto-fill,minmax(180px,1fr))] gap-3 min-[480px]:gap-4 md:gap-5">
          {seriesRows.map((row) => (
            row.kind === 'single' ? (
              <PosterCard
                key={'item-' + row.item.id}
                item={row.item}
                onClick={(source) => openForm(row.item, 'card', source)}
                morphOpen={showForm && morphSource === 'card' && editItem?.id === row.item.id}
              />
            ) : (
              <SeriesPosterCard
                key={'series-' + row.collectionId}
                row={row}
                onOpen={() => setSeriesDialog(row)}
              />
            )
          ))}
        </div>
      );
    }
    if (viewMode === 'shelves') {
      return (
        <MediaShelves
          items={filteredItems}
          onPick={(item, source) => openForm(item, 'card', source)}
          openItemId={showForm && morphSource === 'card' ? editItem?.id ?? null : null}
        />
      );
    }
    if (viewMode === 'table') {
      return (
        <MediaTable
          items={filteredItems}
          onPick={(item, source) => openForm(item, 'card', source)}
          openItemId={showForm && morphSource === 'card' ? editItem?.id ?? null : null}
        />
      );
    }
    // List view — rows bucketed into status sections (same lifecycle order
    // as the shelves). Headers disappear when everything shares one status
    // (e.g. a single-status filter), leaving the flat card.
    const statusIdx = (s: MediaStatus) => {
      const i = STATUS_OPTIONS.findIndex((o) => o.value === s);
      return i === -1 ? STATUS_OPTIONS.length : i;
    };
    const rowStatus = (row: SeriesRow): MediaStatus => (
      row.kind === 'single'
        ? row.item.status
        : row.members.reduce(
          (best, m) => (statusIdx(m.status) < statusIdx(best) ? m.status : best),
          row.members[0].status,
        )
    );
    const sectionMap = new Map<MediaStatus, SeriesRow[]>();
    for (const row of seriesRows) {
      const s = rowStatus(row);
      if (!sectionMap.has(s)) sectionMap.set(s, []);
      sectionMap.get(s)!.push(row);
    }
    const sections = STATUS_OPTIONS
      .filter((s) => sectionMap.has(s.value))
      .map((s) => ({ meta: s, rows: sectionMap.get(s.value)! }));
    const showSectionHeaders = sections.length > 1;

    const renderRows = (rows: SeriesRow[]) => rows.map((row, idx) => (
      row.kind === 'single' ? (
        <MediaListRow
          key={'item-' + row.item.id}
          item={row.item}
          index={idx}
          attached
          first={idx === 0}
          morphOpen={showForm && morphSource === 'card' && editItem?.id === row.item.id}
          onClick={(source) => openForm(row.item, 'card', source)}
        />
      ) : (
        <SeriesListRow
          key={'series-' + row.collectionId}
          row={row}
          attached
          first={idx === 0}
          expanded={expandedSeries.has(row.collectionId)}
          onToggle={() => toggleSeries(row.collectionId)}
          onPickItem={(item, source) => openForm(item, 'card', source)}
          openItemId={showForm && morphSource === 'card' ? editItem?.id ?? null : null}
        />
      )
    ));

    return (
      <div className="flex flex-col gap-5">
        {sections.map(({ meta, rows }) => (
          <section key={meta.value} aria-label={meta.label}>
            {showSectionHeaders && (
              <header className="flex items-baseline gap-2 mb-2 px-0.5">
                <span className={cn('size-2 rounded-full self-center shrink-0', meta.dot)} />
                <h3 className="serif text-sm font-semibold tracking-tight">{meta.label}</h3>
                <span className="mono text-xs tabular-nums text-muted-foreground">{rows.length}</span>
              </header>
            )}
            <div className="overflow-hidden rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))]">
              {renderRows(rows)}
            </div>
          </section>
        ))}
      </div>
    );
  }, [loading, filteredItems, seriesRows, viewMode, statusFilters, searchQuery, activeType, expandedSeries, openForm, toggleSeries, setSeriesDialog]);

  // ---- Add/Edit form: shared title + body + footer, hosted in a centered
  // Dialog on desktop and a full-height, keyboard-safe bottom Sheet on phones.
  const mediaFormTitle = (
    <>
      <TypeIcon className="size-5 text-muted-foreground" />
      {editItem ? 'Edit' : 'Add'} {TYPE_META[form.type]?.label || 'Entry'}
    </>
  );
  const mediaFormSubtitle = editItem ? 'Update details below' : 'Search a database or fill it in manually';

  // Grids collapse to one column on narrow screens so nothing shrinks
  // below a usable size; the poster shrinks 120→96px on phones.
  const mediaFormFields = (
    <>
      <div className="grid grid-cols-[96px_1fr] sm:grid-cols-[120px_1fr] gap-4 sm:gap-5">
        {/* Poster preview */}
        <div className="aspect-[2/3] w-full rounded-2xl border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container))] overflow-hidden flex items-center justify-center text-muted-foreground">
          {form.poster_url ? (
            <img src={form.poster_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="size-8 opacity-30" />
          )}
        </div>

        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Title <span className="text-destructive">*</span>
            </Label>
            <TitleAutocomplete
              value={form.title}
              type={form.type}
              autoFocus={!editItem}
              source={form.external_id}
              onChange={(v) => setForm((f) => {
                const changedExternalTitle = !!f.external_id && v !== f.title;
                return {
                  ...f,
                  title: v,
                  external_id: changedExternalTitle ? '' : f.external_id,
                  release_date: changedExternalTitle ? '' : f.release_date,
                };
              })}
              onSelect={handleExternalSelect}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldSimple label="Year">
              <YearField value={form.year} onChange={(y) => setForm({ ...form, year: y })} />
            </FieldSimple>
            <FieldSimple label="Genre">
              <Input value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} placeholder="Action, Drama" />
            </FieldSimple>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Rating</Label>
            <StarRating value={form.rating} interactive size="md" onChange={(v) => setForm({ ...form, rating: v })} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FieldSelect
          label="Type"
          value={form.type}
          onChange={(v) => setForm({ ...form, type: mediaKind(v || 'movie') })}
          options={Object.entries(TYPE_META).map(([k, v]) => ({ value: k, label: v.label }))}
        />
        <FieldSelect
          label="Status"
          value={form.status}
          onChange={(v) => setForm({ ...form, status: (v as MediaStatus) || 'pending' })}
          options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label, dot: s.dot }))}
          renderValue={(value) => {
            const meta = statusMeta(value as MediaStatus);
            return (
              <span className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${meta?.dot}`} />
                {meta?.label}
              </span>
            );
          }}
        />
        <FieldSelect
          label="Platform"
          value={form.platform || 'none'}
          onChange={(v) => setForm({ ...form, platform: !v || v === 'none' ? '' : v })}
          options={[{ value: 'none', label: 'Not specified' }, ...PLATFORM_OPTIONS]}
          renderValue={(v) => (v && v !== 'none'
            ? <PlatformLogo platform={v} />
            : <span className="text-muted-foreground">Not specified</span>)}
          renderOption={(o) => (o.value === 'none'
            ? <span className="text-muted-foreground">Not specified</span>
            : <PlatformLogo platform={o.value} />)}
        />
      </div>

      {form.type === 'show' && (
        <ShowProgressSection form={form} setForm={setForm} />
      )}

      {form.type === 'book' && (
        <Section title="Reading progress">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Pages read" value={form.episodes_watched} onChange={(n) => setForm({ ...form, episodes_watched: n })} />
            <NumberField label="Total pages" value={form.episodes_total} onChange={(n) => setForm({ ...form, episodes_total: n })} />
          </div>
          {form.episodes_total > 0 && <ProgressBar watched={form.episodes_watched} total={form.episodes_total} label="Pages" itemStatus={form.status} />}
        </Section>
      )}

      {/* Movie collection callout — when TMDB tells us the movie is
          part of a series (e.g. "Mission: Impossible Collection"). */}
      {form.type === 'movie' && form.collection_id && (
        <CollectionBadge
          collectionId={form.collection_id}
          collectionName={form.collection_name}
          currentExternalID={form.external_id}
        />
      )}

      <FieldSimple label="Poster URL">
        <Input value={form.poster_url} onChange={(e) => setForm({ ...form, poster_url: e.target.value })} placeholder="https://…" />
      </FieldSimple>

      <FieldSimple label="Notes">
        <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Your thoughts…" />
      </FieldSimple>

      {editItem && <ActivityTimeline mediaId={editItem.id} type={editItem.type} />}
    </>
  );

  const mediaFormFooter = (
    <>
      {editItem && (
        <Button variant="ghost" onClick={() => handleDelete(editItem.id)} className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5">
          <Trash2 className="size-3.5" /> Delete
        </Button>
      )}
      <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
      <Button onClick={handleSave} disabled={saving || !form.title.trim()} className="gap-1.5">
        {saving && <M3CookieLoader size="xs" tone="primary" />}
        {editItem ? 'Save' : 'Add to library'}
      </Button>
    </>
  );

  return (
    <PageShell
      title="Library"
      hideScrollbar
      actions={
        !isMobileMedia ? (
          <span className="inline-flex rounded-full">
            <Button
              type="button"
              variant="tonal"
              size="sm"
              onClick={(e) => handleAdd(e.currentTarget)}
              aria-label={mediaAddLabel}
              className="h-10 gap-2 pl-3.5 pr-4 bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))] hover:brightness-[0.97]"
            >
              <Plus className="size-4" />
              {mediaAddLabel}
            </Button>
          </span>
        ) : undefined
      }
      navigation={
        <PageShellTabs
          bare
          ariaLabel="Media sections"
          value={activeType}
          options={Object.entries(TYPE_META).map(([key, meta]) => ({
            value: key,
            label: meta.plural,
            icon: meta.icon,
          }))}
          onChange={switchType}
        />
      }
    >
      {isBookmarkTab ? (
        <BookmarksPanel kind={activeType as 'video' | 'site'} addSignal={bookmarkAddSignal} />
      ) : (
        <div className="flex flex-col gap-4 min-w-0">
          <section
            aria-label="Library controls"
            className="rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] p-2.5 sm:p-3 flex flex-col gap-2.5"
          >
            <div className="flex items-center gap-2 min-w-0">
              <MediaSearchField
                value={searchQuery}
                onChange={setSearchQuery}
                onClear={() => setSearchQuery('')}
              />
              <MediaControlCluster
                activeType={activeType}
                sortBy={sortBy}
                setSortBy={setSortBy}
                groupSeries={groupSeries}
                setGroupSeries={setGroupSeries}
                viewMode={viewMode}
                setViewMode={setViewMode}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                active={statusFilters.size === 0}
                onClick={() => setStatusFilters(new Set())}
                count={counts.all || 0}
              >
                All
              </FilterChip>
              {STATUS_OPTIONS.map((s) => {
                const c = counts[s.value] || 0;
                if (c === 0 && !statusFilters.has(s.value)) return null;
                return (
                  <FilterChip
                    key={s.value}
                    active={statusFilters.has(s.value)}
                    onClick={() => toggleStatusFilter(s.value)}
                    count={c}
                    dot={s.dot}
                  >
                    {s.label}
                  </FilterChip>
                );
              })}
            </div>
          </section>

          {/* Grid / list (memoized — see gridEl above) */}
          {gridEl}
        </div>
      )}

      {isMobileMedia ? (
        /* Phones: full-height bottom Sheet pinned to the visual viewport so
           the focused field + sticky footer stay above the keyboard. */
        <Sheet
          open={showForm}
          onOpenChange={setShowForm}
          onOpenChangeComplete={(open) => {
            if (!open) setEditItem(null);
          }}
        >
          <SheetContent
            side="bottom"
            showCloseButton={false}
            style={vvBox ? { height: vvBox.height, top: vvBox.top, bottom: 'auto' } : { height: '100dvh' }}
            className="max-w-full p-0 gap-0 rounded-t-[28px]"
          >
            <div className="shrink-0 flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-border">
              <div className="flex flex-col gap-1 min-w-0">
                <SheetTitle className="flex items-center gap-2 font-serif text-xl leading-tight font-semibold tracking-tight normal-case">
                  {mediaFormTitle}
                </SheetTitle>
                <SheetDescription className="mt-0 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {mediaFormSubtitle}
                </SheetDescription>
              </div>
              <SheetClose render={<Button variant="ghost" size="icon-sm" className="shrink-0 bg-secondary" />}>
                <X className="size-4" />
              </SheetClose>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
              {mediaFormFields}
            </div>

            <div className="shrink-0 flex items-center gap-2 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-border bg-muted/20">
              {mediaFormFooter}
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        /* Desktop: morphing dialog — a clicked grid poster or the Add
           button grows into the edit surface and shrinks back on close;
           list/table/shelves opens use the scale/fade fallback. */
        <MorphingDialog
          open={showForm}
          onClose={() => setShowForm(false)}
          onCloseComplete={() => {
            setEditItem(null);
            setMorphSource(null);
            setMorphRect(undefined);
          }}
          sourceRect={morphRect}
          ariaLabel={typeof mediaFormTitle === 'string' ? mediaFormTitle : 'Edit media'}
          className="left-0 right-0 top-[6vh] mx-auto w-[min(48rem,92vw)] max-h-[88vh]"
        >
          <div className="shrink-0 px-6 pt-6 pb-4 pr-14 border-b border-border">
            <div className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight">
              {mediaFormTitle}
            </div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mt-0.5">
              {mediaFormSubtitle}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
            {mediaFormFields}
          </div>

          <div className="shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-muted/20">
            {mediaFormFooter}
          </div>
        </MorphingDialog>
      )}
      <SeriesDialog
        row={seriesDialog}
        onClose={() => setSeriesDialog(null)}
        onPickItem={(item, source) => openForm(item, 'card', source)}
      />

      {isMobileMedia && (
        <Button
          type="button"
          size="fab"
          onClick={(e) => handleAdd(e.currentTarget)}
          aria-label={mediaAddLabel}
          className="md:hidden fixed right-4 z-40 bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))] hover:bg-[hsl(var(--primary-container))] hover:brightness-[0.97]"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom) + 84px)',
          }}
        >
          <Plus className="size-6" />
        </Button>
      )}

    </PageShell>
  );
}

/* ---------------- Helpers ---------------- */

function MediaSearchField({
  value, onChange, onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter library..."
        className="h-12 pl-12 pr-11 w-full rounded-[28px] border-transparent bg-[hsl(var(--surface-container-high))] hover:bg-[hsl(var(--surface-container-highest))] hover:border-transparent focus-visible:rounded-[28px] focus-visible:pl-12 focus-visible:pr-11 focus-visible:bg-[hsl(var(--surface-container-highest))] transition-[background-color,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 size-8 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function MediaControlCluster({
  activeType,
  sortBy,
  setSortBy,
  groupSeries,
  setGroupSeries,
  viewMode,
  setViewMode,
}: {
  activeType: string;
  sortBy: SortKey;
  setSortBy: (value: SortKey) => void;
  groupSeries: boolean;
  setGroupSeries: (update: (value: boolean) => boolean) => void;
  viewMode: ViewMode;
  setViewMode: (value: ViewMode) => void;
}) {
  const [compactOpen, setCompactOpen] = useState(false);
  const viewOptions = [
    { value: 'grid' as const, label: 'Grid', icon: LayoutGrid },
    { value: 'list' as const, label: 'List', icon: ListChecks },
    { value: 'shelves' as const, label: 'Shelves', icon: GalleryHorizontalEnd },
    { value: 'table' as const, label: 'Table', icon: Table2 },
  ];
  const currentSort = SORT_OPTIONS.find((o) => o.value === sortBy)?.label || 'Sort';

  return (
    <>
      <div className="hidden lg:flex items-center gap-2 shrink-0">
        <div className="w-[190px] min-w-0">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)} items={SORT_OPTIONS}>
            <SelectTrigger size="sm" className="h-10 w-full min-w-0 gap-2 rounded-full border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container))] text-xs">
              <ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false} sideOffset={6}>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {activeType === 'movie' && (
          <Button
            type="button"
            variant={groupSeries ? 'tonal' : 'outline'}
            size="sm"
            onClick={() => setGroupSeries((v) => !v)}
            className="h-10 gap-1.5 px-3.5"
            title="Group movies that share a series"
            aria-label="Group movie series"
            aria-pressed={groupSeries}
          >
            <Film className="size-3.5" />
            Series
          </Button>
        )}
        <SplitButton
          size="sm"
          value={viewMode}
          options={viewOptions}
          onChange={(v) => setViewMode(v as ViewMode)}
          onPrimary={() => setViewMode(VIEW_MODES[(VIEW_MODES.indexOf(viewMode) + 1) % VIEW_MODES.length])}
        />
      </div>

      <div className="relative lg:hidden shrink-0">
        <button
          type="button"
          className="size-12 inline-flex items-center justify-center rounded-[22px] bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] shadow-none transition-[background-color,box-shadow,transform,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:brightness-[0.97] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
          aria-label="Library controls"
          aria-expanded={compactOpen}
          title={currentSort}
          onClick={() => setCompactOpen((v) => !v)}
        >
          <Settings className="size-4" />
        </button>
        {compactOpen && (
          <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-high))] p-1.5 shadow-[var(--m3-elev-2)]">
            <div className="px-3 py-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Sort</div>
            {SORT_OPTIONS.map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => { setSortBy(o.value); setCompactOpen(false); }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors hover:bg-[hsl(var(--on-surface)/0.08)]',
                  o.value === sortBy && 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]',
                )}
              >
                <ArrowUpDown className="size-3.5 opacity-75" />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.value === sortBy && <CheckIconCircle />}
              </button>
            ))}
            <div className="mx-1.5 my-1.5 h-px bg-border/50" />
            <div className="px-3 py-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">View</div>
            {viewOptions.map((o) => {
              const Icon = o.icon;
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => { setViewMode(o.value); setCompactOpen(false); }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors hover:bg-[hsl(var(--on-surface)/0.08)]',
                    o.value === viewMode && 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]',
                  )}
                >
                  <Icon className="size-3.5 opacity-75" />
                  <span className="flex-1">{o.label}</span>
                  {o.value === viewMode && <CheckIconCircle />}
                </button>
              );
            })}
            {activeType === 'movie' && (
              <>
                <div className="mx-1.5 my-1.5 h-px bg-border/50" />
                <button
                  type="button"
                  onClick={() => { setGroupSeries((v) => !v); setCompactOpen(false); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors hover:bg-[hsl(var(--on-surface)/0.08)]"
                >
                  <Film className="size-3.5 opacity-75" />
                  <span className="flex-1">Group series</span>
                  {groupSeries && <CheckIconCircle />}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function FilterChip({ active, onClick, children, count, dot }: { active: boolean; onClick: () => void; children: React.ReactNode; count: number; dot?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium transition-[background-color,color,border-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)] border',
        active
          ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] border-transparent'
          : 'bg-transparent text-foreground border-[hsl(var(--outline))] hover:bg-[hsl(var(--on-surface)/0.06)]',
      )}
    >
      {active && (
        <span>
          <CheckIconCircle />
        </span>
      )}
      {dot && !active && <span className={`size-1.5 rounded-full ${dot}`} />}
      {children}
      <span className={`font-mono text-xs tabular-nums ${active ? 'opacity-80' : 'opacity-60'}`}>{count}</span>
    </button>
  );
}

function CheckIconCircle() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function FieldSimple({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function FieldSelect({ label, value, onChange, options, renderValue, renderOption }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; dot?: string }[];
  renderValue?: (v: string) => React.ReactNode;
  renderOption?: (o: { value: string; label: string; dot?: string }) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue>{renderValue ? renderValue(value) : options.find((o) => o.value === value)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {renderOption ? renderOption(o) : (
                <span className="flex items-center gap-2">
                  {o.dot && <span className={`size-2 rounded-full ${o.dot}`} />}
                  {o.label}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/30 p-3 flex flex-col gap-3">
      <h4 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function EmptyState({ type, hasFilter, onAdd, onClear }: { type: string; hasFilter: boolean; onAdd: () => void; onClear: () => void }) {
  const meta = TYPE_META[type];
  const Icon = meta?.icon || Film;
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 border border-dashed border-border rounded-xl">
      <Icon className="size-10 mb-3 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        {hasFilter
          ? `No ${meta?.plural.toLowerCase()} match the current filter.`
          : `No ${meta?.plural.toLowerCase()} tracked yet.`}
      </p>
      <div className="flex gap-2 mt-4">
        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="size-3.5" /> Clear filter
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="size-3.5" /> Add {meta?.label?.toLowerCase()}
        </Button>
      </div>
    </div>
  );
}

function PosterCard({ item, onClick, morphOpen = false }: { item: MediaEntry; onClick: (source: HTMLElement) => void; morphOpen?: boolean }) {
  const statusDisplay = mediaStatusDisplay(item);
  const Icon = TYPE_META[item.type]?.icon || Film;
  const showProgress = item.episodes_total > 0;

  // morphOpen: this item's edit dialog is up. The poster UNMOUNTS its
  // layoutId element (empty slot keeps the grid steady) so framer does a
  // clean unmount→mount handoff — with both mounted, the open morph
  // silently no-ops. Close remounts it and the dialog shrinks back in.
  if (morphOpen) {
    return (
      <button className="group flex flex-col gap-2 text-left w-full" title={item.title} aria-hidden>
        <div className="relative w-full aspect-[2/3] rounded-2xl bg-[hsl(var(--surface-container)/0.5)]" />
        <div className="flex flex-col px-0.5 opacity-40">
          <div className="font-medium text-sm leading-snug line-clamp-2">{item.title}</div>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={(e) => {
        const source = e.currentTarget.querySelector<HTMLElement>('[data-media-morph-source]');
        onClick(source ?? e.currentTarget);
      }}
      className="group flex flex-col gap-2 text-left w-full"
      title={item.title}
    >
      <div
        data-media-morph-source
        className="relative w-full aspect-[2/3] rounded-2xl overflow-hidden bg-[hsl(var(--surface-container))] border border-[hsl(var(--outline-variant))] transition-shadow group-hover:shadow-[var(--m3-elev-2)]"
      >
        {item.poster_url ? (
          <img
            src={item.poster_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-3 text-muted-foreground">
            <Icon className="size-7 opacity-40" />
            <span className="font-serif text-sm text-center line-clamp-3 leading-tight opacity-80">{item.title}</span>
          </div>
        )}

        {/* Status pill — dot + sentence-case short label. Sentence case at
            normal tracking keeps every status ("In progress", "Complete")
            inside a 2-col phone grid tile without truncating to COMPL…. */}
        <div className="absolute top-2 left-2 max-w-[calc(100%-1rem)]">
          <span
            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-background/95 pl-2 pr-2.5 h-6 text-xs font-medium shadow-sm ring-1 ring-foreground/10"
            title={statusDisplay.label}
          >
            <span className="size-1.5 rounded-full shrink-0" style={{ background: statusDisplay.color }} />
            <span className="truncate">{statusDisplay.shortLabel}</span>
          </span>
        </div>

        {/* Rating */}
        {item.rating ? (
          <div className="absolute top-2 right-2 inline-flex items-center gap-0.5 bg-background px-1.5 py-0.5 text-xs font-mono shadow-sm ring-1 ring-foreground/5">
            <Star className="size-2.5 fill-amber-400 text-amber-400" />
            <span>{item.rating}</span>
          </div>
        ) : null}

        {/* Segmented progress overlay — bottom strip.
            Shows for all shows/books regardless of complete status:
            complete = all green, dropped = red/muted, etc. */}
        {showProgress && (
          <div className="absolute bottom-0 inset-x-0">
            <SegmentedBar
              watched={item.episodes_watched}
              total={item.episodes_total}
              status={item.status}
              units={item.type === 'show' ? item.seasons_total : undefined}
              boxH={5}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col px-0.5">
        <div className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {item.title}
        </div>
        {/* Both meta rows keep a fixed line height even when empty so
            neighbouring tiles in a grid row don't ripple vertically. */}
        <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground mt-0.5 min-h-4">
          {item.year && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-2.5" />
              {item.year}
            </span>
          )}
          {item.platform && (
            <>
              {item.year && <span className="opacity-50">·</span>}
              <PlatformLogo platform={item.platform} className="truncate" />
            </>
          )}
        </div>
        <div className="font-mono text-xs text-muted-foreground mt-0.5 truncate min-h-4">
          {watchAgeLabel(item)}
        </div>
      </div>
    </button>
  );
}

// MediaThumb — small thumbnail used in the design's list view. Uses the
// real poster when available, otherwise an index-derived gradient panel
// matching the redesign aesthetic.
function MediaThumb({ item, index, variant = 'sm', className }: {
  item: MediaEntry;
  index: number;
  variant?: 'sm' | 'card';
  className?: string;
}) {
  const sizeClass = variant === 'card'
    ? 'w-[52px] h-[76px] rounded-xl'
    : 'w-12 h-[66px] rounded-lg';
  const classes = cn(sizeClass, 'object-cover ring-1 ring-border/60 shrink-0', className);
  if (item.poster_url) {
    return (
      <img
        data-media-morph-source
        src={item.poster_url}
        alt=""
        loading="lazy"
        className={classes}
      />
    );
  }
  const a = (index % 5) + 1;
  const b = ((index + 2) % 5) + 1;
  return (
    <div
      data-media-morph-source
      className={cn(sizeClass, 'ring-1 ring-border/60 shrink-0', className)}
      style={{ background: `linear-gradient(135deg, hsl(var(--m${a})), hsl(var(--m${b})))` }}
    />
  );
}

// sortMedia — pure sort against the loaded items. Handles missing
// values (empty rating / no completion timestamp) by treating them as
// the "lowest priority" — they sink to the end so the sort stays
// honest. We always return a fresh array so the parent useMemo's
// equality check fires.
function sortMedia(items: MediaEntry[], by: SortKey): MediaEntry[] {
  const cmpStr = (a: string, b: string) => a.localeCompare(b);
  // Helper: descending date — empty pushes to end.
  const byDateDesc = (key: 'created_at' | 'updated_at' | 'last_completed_at') =>
    (a: MediaEntry, b: MediaEntry) => {
      const ax = a[key] || ''; const bx = b[key] || '';
      if (!ax && !bx) return 0;
      if (!ax) return 1;
      if (!bx) return -1;
      return bx.localeCompare(ax);
    };
  // Helper: ascending date — empty pushes to end.
  const byDateAsc = (key: 'created_at' | 'updated_at' | 'last_completed_at') =>
    (a: MediaEntry, b: MediaEntry) => {
      const ax = a[key] || ''; const bx = b[key] || '';
      if (!ax && !bx) return 0;
      if (!ax) return 1;
      if (!bx) return -1;
      return ax.localeCompare(bx);
    };
  const out = [...items];
  switch (by) {
    case 'updated_desc':   out.sort(byDateDesc('updated_at')); break;
    case 'added_desc':     out.sort(byDateDesc('created_at')); break;
    case 'added_asc':      out.sort(byDateAsc('created_at')); break;
    case 'completed_desc': out.sort(byDateDesc('last_completed_at')); break;
    case 'rating_desc':    out.sort((a, b) => (b.rating || 0) - (a.rating || 0) || byDateDesc('updated_at')(a, b)); break;
    case 'year_desc':      out.sort((a, b) => (b.year || 0) - (a.year || 0) || cmpStr(a.title, b.title)); break;
    case 'year_asc':       out.sort((a, b) => (a.year || 9999) - (b.year || 9999) || cmpStr(a.title, b.title)); break;
    case 'title_asc':      out.sort((a, b) => cmpStr(a.title, b.title)); break;
    case 'status':         out.sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99) || cmpStr(a.title, b.title)); break;
  }
  return out;
}

// watchAgeLabel — short relative-time label shown next to title in the
// list view. Prefers "completed" once the user has finished, else
// falls back to "added" so brand-new items still have provenance.
function watchAgeLabel(item: MediaEntry): string {
  if (item.last_completed_at) {
    return 'Completed ' + relativeShort(item.last_completed_at);
  }
  if (item.created_at) {
    return 'Added ' + relativeShort(item.created_at);
  }
  return '';
}

function relativeShort(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function watchAgeLabelShort(item: MediaEntry): string {
  if (item.last_completed_at) {
    return 'Done ' + relativeTiny(item.last_completed_at);
  }
  if (item.created_at) {
    return 'Added ' + relativeTiny(item.created_at);
  }
  return '';
}

function relativeTiny(iso: string): string {
  let long: string;
  try {
    long = formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
  return long
    .replace(/^less than a minute ago$/, 'now')
    .replace(/^about /, '')
    .replace(/^over /, '')
    .replace(/^almost /, '')
    .replace(/ minutes? ago$/, 'm ago')
    .replace(/ hours? ago$/, 'h ago')
    .replace(/ days? ago$/, 'd ago')
    .replace(/ weeks? ago$/, 'w ago')
    .replace(/ months? ago$/, 'mo ago')
    .replace(/ years? ago$/, 'y ago');
}

function progressLabel(item: MediaEntry): string {
  if (item.type === 'show') {
    // Prefer the precise S?E? when we have per-season counts. Walk the
    // array to find the season the cumulative `episodes_watched` lands
    // in, and the offset within that season.
    if (item.season_episodes && item.season_episodes.length > 0) {
      let acc = 0;
      for (let i = 0; i < item.season_episodes.length; i++) {
        const len = item.season_episodes[i];
        if (acc + len >= item.episodes_watched || i === item.season_episodes.length - 1) {
          const epInSeason = Math.max(0, item.episodes_watched - acc);
          return `S${i + 1}E${epInSeason}`;
        }
        acc += len;
      }
    }
    if (item.episodes_total > 0) {
      const s = item.seasons_watched > 0 ? `S${item.seasons_watched}` : 'S?';
      const e = `E${item.episodes_watched}`;
      return `${s}${e}`;
    }
    return '';
  }
  if (item.type === 'book') {
    if (item.episodes_total > 0) return `p. ${item.episodes_watched}/${item.episodes_total}`;
    return '';
  }
  return '';
}

function chipClassFor(status: MediaStatus): string {
  switch (status) {
    case 'in_progress': return 'chip-amber';
    case 'complete':    return 'chip-olive';   // green — done
    case 'waiting':     return 'chip-sky';     // slate — on hold
    case 'dropped':
    case 'scratched':   return 'chip-rose';
    case 'upcoming':    return 'chip-upcoming';
    default:            return '';
  }
}

// RowRail — the fixed right-hand rail every non-progress list row shares:
// ghost numeral slot · five-star slot · chip slot. Slots are RESERVED even
// when data is missing (blank ghost, dim empty stars) so the columns line
// up row after row — no ragged right edge when TMDB has no year or the
// entry is unrated.
function RowRail({ ghost, rating, chip }: {
  ghost?: React.ReactNode;
  rating: number;
  chip: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0 self-center">
      <span
        aria-hidden="true"
        className="hidden lg:block w-16 text-right serif text-[30px] font-semibold tracking-tight leading-none text-foreground/[0.08] select-none pointer-events-none"
      >
        {ghost ?? ''}
      </span>
      <span
        className="hidden md:inline-flex w-[84px] justify-center"
        title={rating ? `Rated ${rating}/5` : 'Not rated'}
      >
        <StarRating value={rating} />
      </span>
      <span className="flex w-auto md:w-28 justify-end">{chip}</span>
    </div>
  );
}

// MediaListRow — dense single-entry list row. One tight flex line:
// thumb · (title + meta + optional thin progress) · (status chip + age).
// The old three-column grid reserved a wide right column that read as
// empty space; everything now hugs the content.
function MediaListRow({
  item, index, onClick, compact = false, attached = false, first = false, morphOpen: _morphOpen = false,
}: {
  item: MediaEntry;
  index: number;
  onClick: (source: HTMLElement) => void;
  compact?: boolean;
  attached?: boolean;
  first?: boolean;
  morphOpen?: boolean;
}) {
  const pct = listProgressPct(item);
  const hasProgress = pct !== null;
  const age = watchAgeLabelShort(item);
  const statusDisplay = mediaStatusDisplay(item);
  return (
    <button
      onClick={(e) => {
        const source = e.currentTarget.querySelector<HTMLElement>('[data-media-morph-source]');
        onClick(source ?? e.currentTarget);
      }}
      className={cn(
        'm3-state group relative w-full overflow-hidden bg-[hsl(var(--surface-container-low))] text-left transition-[background-color,border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-[hsl(var(--surface-container))] active:scale-[0.995]',
        attached
          ? cn('rounded-none border-0', !first && 'border-t border-[hsl(var(--outline-variant))]')
          : 'rounded-2xl border border-[hsl(var(--outline-variant))] hover:border-[hsl(var(--outline))]',
        compact ? 'p-2' : 'p-2.5 sm:px-3',
      )}
    >
      {/* Ambient art: the poster's own colors bleed in from the left and
          dissolve — every row carries its artwork's temperature. */}
      {item.poster_url && (
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-72 pointer-events-none">
          <img
            src={item.poster_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover blur-xl scale-125 opacity-[0.32] dark:opacity-[0.42] saturate-150 transition-opacity duration-300 group-hover:opacity-[0.45] dark:group-hover:opacity-[0.55]"
            style={{
              maskImage: 'linear-gradient(to right, black 30%, transparent 95%)',
              WebkitMaskImage: 'linear-gradient(to right, black 30%, transparent 95%)',
            }}
          />
        </div>
      )}

      <div className="relative flex items-center gap-3 min-w-0">
        <MediaThumb
          item={item}
          index={index}
          variant="sm"
          className="fine-group-hover-scale-105 transition-transform duration-200 ease-[var(--motion-ease-out)] motion-reduce:transition-none"
        />

        <div className="flex-1 min-w-0 flex flex-col gap-0.5 py-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('serif min-w-0 font-medium leading-snug truncate', compact ? 'text-[14px]' : 'text-[15px]')}>
              {item.title || 'Untitled'}
            </span>
            {item.rating ? (
              <span className={cn('inline-flex shrink-0 items-center gap-0.5 text-xs text-secondary', !hasProgress && 'md:hidden')}>
                <Star className="size-3 fill-current" />
                <span className="tabular-nums">{item.rating}</span>
              </span>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-x-2 mono text-xs text-muted-foreground overflow-hidden whitespace-nowrap">
            <span className="shrink-0">{TYPE_META[item.type]?.label || item.type}</span>
            {item.year ? <span className="shrink-0">· {item.year}</span> : null}
            {item.platform ? (
              <PlatformLogo platform={item.platform} className="shrink-0 min-w-0" iconClassName="size-[15px]" />
            ) : null}
            {progressLabel(item) ? <span className="shrink-0 hidden min-[420px]:inline">· {progressLabel(item)}</span> : null}
            {age ? <span className="min-w-0 truncate hidden sm:inline">· {age}</span> : null}
          </div>
          {hasProgress && (
            <div className="mt-1.5 flex items-center gap-2.5">
              <WavyProgress
                value={pct ?? 0}
                height={12}
                active={item.status === 'in_progress'}
                label={`${pct}% watched`}
                className="flex-1"
              />
              <span className="shrink-0 mono text-xs tabular-nums text-muted-foreground">{pct}%</span>
            </div>
          )}
        </div>

        {hasProgress ? (
          <span
            className={cn('chip h-6 shrink-0 px-2.5 text-xs leading-none max-w-[9rem]', statusDisplay.chipClass)}
            title={statusDisplay.label}
          >
            <span className="truncate">{statusDisplay.shortLabel}</span>
          </span>
        ) : (
          <RowRail
            ghost={item.year || undefined}
            rating={item.rating || 0}
            chip={
              <span
                className={cn('chip h-6 px-2.5 text-xs leading-none max-w-[9rem]', statusDisplay.chipClass)}
                title={statusDisplay.label}
              >
                <span className="truncate">{statusDisplay.shortLabel}</span>
              </span>
            }
          />
        )}
      </div>
    </button>
  );
}

// ─── Shelves view — horizontal poster rows grouped by status ────────────
// Streaming-app scan pattern: each lifecycle bucket gets its own shelf so
// "what am I watching" and "what's queued" separate at a glance. Series
// grouping is intentionally ignored here; every entry stands alone.
function MediaShelves({ items, onPick, openItemId = null }: { items: MediaEntry[]; onPick: (item: MediaEntry, source: HTMLElement) => void; openItemId?: number | null }) {
  const shelves = useMemo(() => {
    const buckets = new Map<MediaStatus, MediaEntry[]>();
    for (const it of items) {
      if (!buckets.has(it.status)) buckets.set(it.status, []);
      buckets.get(it.status)!.push(it);
    }
    return STATUS_OPTIONS
      .filter((s) => buckets.has(s.value))
      .map((s) => ({ meta: s, items: buckets.get(s.value)! }));
  }, [items]);

  return (
    <div className="flex flex-col gap-6">
      {shelves.map(({ meta, items: shelfItems }) => (
        <section key={meta.value} aria-label={meta.label}>
          <header className="flex items-baseline gap-2 mb-2.5 px-0.5">
            <span className={cn('size-2 rounded-full self-center shrink-0', meta.dot)} />
            <h3 className="serif text-sm font-semibold tracking-tight">{meta.label}</h3>
            <span className="mono text-xs tabular-nums text-muted-foreground">{shelfItems.length}</span>
          </header>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1 snap-x snap-proximity">
            {shelfItems.map((item) => (
              <div key={item.id} className="w-[124px] sm:w-[148px] shrink-0 snap-start">
                <PosterCard item={item} onClick={(source) => onPick(item, source)} morphOpen={openItemId === item.id} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Table view — maximum density ────────────────────────────────────────
// Sorting stays in the toolbar's sort control; the table is a flat readout.
function MediaTable({ items, onPick, openItemId: _openItemId = null }: { items: MediaEntry[]; onPick: (item: MediaEntry, source: HTMLElement) => void; openItemId?: number | null }) {
  return (
    <div className="overflow-x-auto rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))]">
      <table className="w-full min-w-[560px] text-sm border-collapse">
        <thead>
          <tr className="mono text-xs uppercase tracking-[0.14em] text-muted-foreground text-left">
            <th className="font-medium px-4 py-3">Title</th>
            <th className="font-medium px-3 py-3 w-16">Year</th>
            <th className="font-medium px-3 py-3 w-32">Status</th>
            <th className="font-medium px-3 py-3 w-16">Rating</th>
            <th className="font-medium px-3 py-3 w-24">Progress</th>
            <th className="font-medium px-3 py-3 w-28 text-right pr-4">Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const statusDisplay = mediaStatusDisplay(item);
            const pct = listProgressPct(item);
            return (
              <tr
                key={item.id}
                onClick={(e) => {
                  const source = e.currentTarget.querySelector<HTMLElement>('[data-media-morph-source]');
                  onPick(item, source ?? e.currentTarget);
                }}
                className="group cursor-pointer border-t border-[hsl(var(--outline-variant))] transition-colors hover:bg-[hsl(var(--surface-container))]"
              >
                <td className="relative px-4 py-2">
                  {/* Ambient art — same poster bleed as the list rows,
                      scoped to the title cell (tr can't anchor absolutes). */}
                  {item.poster_url && (
                    <span aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
                      <img
                        src={item.poster_url}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover blur-lg scale-125 opacity-[0.26] dark:opacity-[0.36] saturate-150 transition-opacity duration-300 group-hover:opacity-[0.4] dark:group-hover:opacity-[0.5]"
                        style={{
                          maskImage: 'linear-gradient(to right, black 40%, transparent 98%)',
                          WebkitMaskImage: 'linear-gradient(to right, black 40%, transparent 98%)',
                        }}
                      />
                    </span>
                  )}
                  <span className="relative flex items-center gap-2.5 min-w-0">
                    <MediaThumb
                      item={item}
                      index={idx}
                      variant="sm"
                      className="!w-7 !h-10 !rounded"
                    />
                    <span className="serif font-medium truncate max-w-[18rem]">{item.title || 'Untitled'}</span>
                  </span>
                </td>
                <td className="px-3 py-2 mono text-xs tabular-nums text-muted-foreground">{item.year || '—'}</td>
                <td className="px-3 py-2">
                  <span className={cn('chip h-6 px-2.5 text-xs leading-none max-w-full', statusDisplay.chipClass)} title={statusDisplay.label}>
                    <span className="truncate">{statusDisplay.shortLabel}</span>
                  </span>
                </td>
                <td className="px-3 py-2">
                  {item.rating ? (
                    <span className="inline-flex items-center gap-0.5 text-xs text-secondary">
                      <Star className="size-3 fill-current" />
                      <span className="tabular-nums">{item.rating}</span>
                    </span>
                  ) : <span className="text-muted-foreground/50">—</span>}
                </td>
                <td className="px-3 py-2 mono text-xs tabular-nums text-muted-foreground">
                  {pct !== null ? `${pct}%` : '—'}
                </td>
                <td className="px-3 py-2 mono text-xs text-muted-foreground text-right pr-4 whitespace-nowrap">
                  {item.updated_at ? relativeTiny(item.updated_at) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// listProgressPct — fraction watched in [0..100] for shows/books.
// Returns null when there's nothing to render (movies, no totals
// known, etc.) so the row can skip the bar entirely.
function listProgressPct(item: MediaEntry): number | null {
  if (item.type === 'movie') return null;
  if (!item.episodes_total || item.episodes_total <= 0) return null;
  const pct = Math.min(100, Math.max(0, Math.round((item.episodes_watched / item.episodes_total) * 100)));
  return pct;
}


function SeriesPosterCard({
  row, onOpen,
}: {
  row: Extract<SeriesRow, { kind: 'series' }>;
  onOpen: () => void;
}) {
  const cover = row.members[0];
  const watched = row.members.filter((m) => m.status === 'complete').length;
  const upcoming = nextUpcomingMember(row.members);
  const upcomingDate = upcoming ? formatReleaseDate(upcoming.release_date) : '';
  return (
    <button
      onClick={onOpen}
      className="group relative text-left flex flex-col gap-2 w-full"
      title={`${row.collectionName} — ${watched}/${row.members.length} watched`}
    >
      {/* Identical size to PosterCard — aspect-[2/3] wrapper, real poster
          fills it edge-to-edge. The stacked-card depth shadow is desktop-
          only; on mobile the offsets visually shrink the poster relative
          to single-movie tiles, so the series card matches PosterCard's
          plain border on small screens. */}
      <div
        className="relative w-full aspect-[2/3] rounded-2xl overflow-hidden bg-[hsl(var(--surface-container))] border border-[hsl(var(--outline-variant))] transition-shadow group-hover:shadow-[var(--m3-elev-2)] sm:border-0 sm:shadow-[4px_4px_0_-1px_hsl(var(--outline-variant)),8px_8px_0_-2px_hsl(var(--outline-variant)/0.55)]"
      >
        {cover.poster_url ? (
          <img src={cover.poster_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-muted-foreground">
            <Film className="size-7 opacity-40" />
            <span className="font-serif text-sm text-center line-clamp-3 leading-tight opacity-80">{row.collectionName}</span>
          </div>
        )}
        <span className="absolute top-2 left-2 chip chip-sage h-6 px-2.5 text-xs">
          <Film className="size-3" /> Series
        </span>
        {upcoming && (
          <span className="absolute top-2 right-2 chip chip-upcoming h-6 max-w-[calc(100%-5.75rem)] px-2.5 text-xs" title={`Upcoming ${upcomingDate}`}>
            <span className="truncate">Upcoming</span>
          </span>
        )}
        <span className="absolute bottom-2 right-2 mono text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--inverse-surface))] text-[hsl(var(--inverse-on-surface))]">
          {watched}/{row.members.length}
        </span>
      </div>
      <div className="mt-2 px-0.5">
        <div className="font-medium text-sm leading-snug line-clamp-2">{row.collectionName}</div>
        {/* Two meta rows to mirror PosterCard's block, so series tiles and
            movie tiles keep the same text-zone height in a grid row. */}
        <div className="mono text-xs text-muted-foreground mt-0.5 truncate min-h-4">
          {row.members.length} movies
        </div>
        <div className="mono text-xs text-muted-foreground mt-0.5 truncate min-h-4">
          {upcomingDate ? `Next ${upcomingDate}` : ''}
        </div>
      </div>
    </button>
  );
}

function SeriesDialog({
  row, onClose, onPickItem,
}: {
  row: Extract<SeriesRow, { kind: 'series' }> | null;
  onClose: () => void;
  onPickItem: (m: MediaEntry, source?: HTMLElement) => void;
}) {
  if (!row) return null;
  const cover = row.members[0];
  const watched = row.members.filter((m) => m.status === 'complete').length;
  const upcoming = nextUpcomingMember(row.members);
  const upcomingDate = upcoming ? formatReleaseDate(upcoming.release_date) : '';
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl w-full max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="shrink-0 p-5 border-b border-border flex flex-row items-center gap-4">
          {cover.poster_url ? (
            <img src={cover.poster_url} alt="" className="w-12 h-[68px] rounded object-cover ring-1 ring-border/60 shrink-0" />
          ) : (
            <div className="w-12 h-[68px] rounded bg-muted shrink-0" />
          )}
          <div className="flex-1 min-w-0 text-left">
            <DialogTitle className="serif text-lg font-medium truncate">{row.collectionName}</DialogTitle>
            <div className="mono text-xs text-muted-foreground mt-0.5">
              {row.members.length} movies · {watched}/{row.members.length} watched{upcomingDate ? ` · upcoming ${upcomingDate}` : ''}
            </div>
            <div className="mt-2 w-48">
              <SegmentedBar
                watched={watched}
                total={row.members.length}
                status={watched === row.members.length ? 'complete' : 'in_progress'}
                units={row.members.length}
                boxH={5}
              />
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          {row.members.map((m, mi) => {
            const statusDisplay = mediaStatusDisplay(m);
            return (
            <button
              key={m.id}
              onClick={() => { onPickItem(m); onClose(); }}
              className={`m3-state w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${mi === 0 ? '' : 'border-t border-border/40'}`}
            >
              <span className="mono text-xs text-muted-foreground w-5 tabular-nums text-right shrink-0">
                {mi + 1}
              </span>
              <MediaThumb item={m} index={mi} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <div className="text-[14px] font-medium truncate">{m.title}</div>
                  {m.year ? <span className="mono text-xs text-muted-foreground">{m.year}</span> : null}
                </div>
                <div className="mono text-xs text-muted-foreground mt-0.5 truncate">
                  {watchAgeLabel(m)}
                </div>
              </div>
              <span className={cn('chip max-w-[11rem] shrink-0 px-2.5 text-xs leading-none h-6', statusDisplay.chipClass)} title={statusDisplay.label}>
                <span className="truncate">{statusDisplay.label}</span>
              </span>
            </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// SeriesListRow shares Today’s compact review-disclosure pattern. It spans a
// grid row when needed, so a collection expands without moving poster tiles.
function SeriesListRow({
  row, expanded, onToggle, onPickItem, openItemId = null, className, attached = false, first = false,
}: {
  row: Extract<SeriesRow, { kind: 'series' }>;
  expanded: boolean;
  onToggle: () => void;
  onPickItem: (m: MediaEntry, source?: HTMLElement) => void;
  openItemId?: number | null;
  className?: string;
  attached?: boolean;
  first?: boolean;
}) {
  const cover = row.members[0];
  const watched = row.members.filter((m) => m.status === 'complete').length;
  const upcoming = nextUpcomingMember(row.members);
  const upcomingDate = upcoming ? formatReleaseDate(upcoming.release_date) : '';
  const oldest = row.members[0]?.year;
  const newest = row.members[row.members.length - 1]?.year;
  const yearLabel = oldest && newest && oldest !== newest ? `${oldest}–${newest}` : oldest ? String(oldest) : '';
  // Series rating = best member rating; unrated members don't drag it down.
  const seriesRating = row.members.reduce((m, x) => Math.max(m, x.rating || 0), 0);
  const pct = Math.round((watched / row.members.length) * 100);

  return (
    <div className={cn(
      'overflow-hidden bg-[hsl(var(--surface-container-low))]',
      attached
        ? cn('rounded-none border-0', !first && 'border-t border-[hsl(var(--outline-variant))]')
        : 'rounded-2xl border border-[hsl(var(--outline-variant))]',
      className,
    )}>
      {/* Header — the exact MediaListRow anatomy (thumb · text block ·
          RowRail) so series rows sit flush with single movies. */}
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="m3-state group relative w-full overflow-hidden bg-[hsl(var(--surface-container-low))] p-2.5 sm:px-3 text-left transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-[hsl(var(--surface-container))] active:scale-[0.995]"
      >
        {cover?.poster_url && (
          <div aria-hidden="true" className="absolute inset-y-0 left-0 w-72 pointer-events-none">
            <img
              src={cover.poster_url}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover blur-xl scale-125 opacity-[0.32] dark:opacity-[0.42] saturate-150 transition-opacity duration-300 group-hover:opacity-[0.45] dark:group-hover:opacity-[0.55]"
              style={{
                maskImage: 'linear-gradient(to right, black 30%, transparent 95%)',
                WebkitMaskImage: 'linear-gradient(to right, black 30%, transparent 95%)',
              }}
            />
          </div>
        )}

        <div className="relative flex items-center gap-3 min-w-0">
          <MediaThumb
            item={cover}
            index={0}
            variant="sm"
            className="fine-group-hover-scale-105 transition-transform duration-200 ease-[var(--motion-ease-out)] motion-reduce:transition-none"
          />

          <div className="flex-1 min-w-0 flex flex-col gap-0.5 py-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="serif min-w-0 text-[15px] font-medium leading-snug truncate">
                {row.collectionName}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-x-2 mono text-xs text-muted-foreground overflow-hidden whitespace-nowrap">
              <span className="shrink-0">Series</span>
              {yearLabel && <span className="shrink-0">· {yearLabel}</span>}
              <span className="shrink-0">· {row.members.length} movies</span>
              {upcoming && <span className="min-w-0 truncate hidden sm:inline">· next {upcomingDate}</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-2.5">
              <WavyProgress
                value={pct}
                height={12}
                active={watched > 0 && watched < row.members.length}
                label={`${watched} of ${row.members.length} watched`}
                className="flex-1"
              />
              <span className="shrink-0 mono text-xs tabular-nums text-muted-foreground">
                {watched}/{row.members.length}
              </span>
            </div>
          </div>

          <RowRail
            ghost={`×${row.members.length}`}
            rating={seriesRating}
            chip={
              <span className="chip chip-sage h-6 px-2.5 text-xs leading-none gap-1">
                <Film className="size-3" /> Series
                <ChevronRight className={cn('size-3 transition-transform duration-200', expanded && 'rotate-90')} />
              </span>
            }
          />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden border-t border-[hsl(var(--outline-variant))]"
          >
            {row.members.map((m, mi) => (
              <MediaListRow
                key={m.id}
                item={m}
                index={mi}
                compact
                attached
                first={mi === 0}
                morphOpen={openItemId === m.id}
                onClick={() => onPickItem(m)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ActivityTimeline — watch-history rendered as a vertical list with a
// dot rail. Lazily fetches the events for the open dialog only.
function ActivityTimeline({ mediaId, type }: { mediaId: number; type: MediaKind }) {
  const [events, setEvents] = useState<MediaEventRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    mediaApi.events(mediaId)
      .then((rows) => { if (!cancel) setEvents(rows); })
      .catch(() => { if (!cancel) setEvents([]); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [mediaId]);

  return (
    <Section title="Activity">
      {loading && (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
          <M3CookieLoader size="sm" tone="secondary" /> Loading…
        </div>
      )}
      {!loading && events && events.length === 0 && (
        <div className="text-xs text-muted-foreground">
          No events yet — they're recorded as you update progress.
        </div>
      )}
      {!loading && events && events.length > 0 && (
        <ol className="relative ml-2 border-l border-border/60 pl-4 flex flex-col gap-3 text-sm">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span
                className="absolute -left-[21px] top-[6px] size-2 rounded-full"
                style={{ background: dotColorFor(e.kind) }}
              />
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <span className="font-medium">{eventLabel(e, type)}</span>
                  {eventSublabel(e) && (
                    <span className="ml-1.5 mono text-xs text-muted-foreground">
                      {eventSublabel(e)}
                    </span>
                  )}
                </div>
                <span className="mono text-xs text-muted-foreground" title={e.created_at}>
                  {formatTimelineDate(e.created_at)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function dotColorFor(kind: MediaEventRow['kind']): string {
  switch (kind) {
    case 'completed': return 'hsl(var(--primary))';
    case 'started': return 'hsl(var(--secondary))';
    case 'progress': return 'hsl(var(--secondary) / 0.6)';
    case 'dropped': return 'hsl(var(--destructive))';
    case 'rating': return 'hsl(var(--secondary))';
    default: return 'hsl(var(--muted-foreground) / 0.6)';
  }
}

function eventLabel(e: MediaEventRow, type: MediaKind): string {
  const verb = type === 'book' ? 'reading' : 'watching';
  switch (e.kind) {
    case 'added': return 'Added to library';
    case 'started': return `Started ${verb}`;
    case 'progress': return 'Progress';
    case 'completed': return 'Completed';
    case 'dropped': return 'Dropped';
    case 'rating': return `Rated ${e.meta.rating ?? '?'}/5`;
    default: return e.kind;
  }
}

function eventSublabel(e: MediaEventRow): string {
  // For shows: "S2 · E6 (16/100 episodes)". For books: "p. 184/280".
  const m = e.meta || {};
  const parts: string[] = [];
  if (typeof m.season === 'number' && m.season > 0) {
    parts.push(`S${m.season}`);
    if (typeof m.episode === 'number' && m.episode > 0) parts.push(`E${m.episode}`);
  }
  if (typeof m.episodes_watched === 'number' && typeof m.episodes_total === 'number' && m.episodes_total > 0) {
    parts.push(`${m.episodes_watched}/${m.episodes_total} eps`);
  }
  return parts.join(' · ');
}

function formatTimelineDate(iso: string): string {
  try {
    const d = parseISO(iso);
    const ageDays = (Date.now() - d.getTime()) / 86400000;
    return ageDays < 7
      ? formatDistanceToNow(d, { addSuffix: true })
      : format(d, 'MMM d, yyyy');
  } catch {
    return iso;
  }
}

// NumberField — string-buffered numeric input. Without the buffer the
// controlled `value={number}` flicker against the base-ui Input wrapper
// makes the field feel locked: clearing it snaps back to "0", and
// editing on top of "0" requires manual select-all first. Buffering
// the displayed string lets the user type freely and only reflects the
// canonical number when the field is non-empty.
function NumberField({
  label, value, min = 0, max, onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value || 0));
  // Keep draft synced when external `value` changes (e.g. after fetching
  // TMDB details, season switch, or load existing entry).
  useEffect(() => { setDraft(String(value || 0)); }, [value]);
  return (
    <FieldSimple label={label}>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (next === '') { onChange(0); return; }
          const n = parseInt(next, 10);
          if (!Number.isNaN(n)) {
            const clamped = max !== undefined ? Math.min(max, Math.max(min, n)) : Math.max(min, n);
            onChange(clamped);
          }
        }}
        onBlur={() => { setDraft(String(value || 0)); }}
      />
    </FieldSimple>
  );
}

function YearField({ value, onChange }: { value: number | null; onChange: (y: number | null) => void }) {
  const [draft, setDraft] = useState(value ? String(value) : '');
  useEffect(() => { setDraft(value ? String(value) : ''); }, [value]);
  return (
    <Input
      type="number"
      inputMode="numeric"
      value={draft}
      placeholder="2024"
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (next === '') { onChange(null); return; }
        const n = parseInt(next, 10);
        if (!Number.isNaN(n)) onChange(n);
      }}
    />
  );
}

// ShowProgressSection — Microsoft-Todo-style progress capture for shows.
// When TMDB has given us per-season episode counts, we ask only for the
// current season and the current episode within it, then derive the
// cumulative `episodes_watched`. This makes the progress bar accurate
// even on the final season — being "on season 12 episode 5" of a
// 100-episode show is 95%, not 100%.
function ShowProgressSection({
  form, setForm,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
}) {
  const knownSeasons = form.season_episodes.length > 0;
  const totalSeasons = knownSeasons ? form.season_episodes.length : form.seasons_total;
  const totalEpisodes = knownSeasons
    ? form.season_episodes.reduce((s, n) => s + n, 0)
    : form.episodes_total;

  // Current position. `seasons_watched` is the canonical "I'm on
  // season N" value — we derive only when it's missing (legacy rows
  // imported before we tracked it). Using the explicit field keeps
  // backspacing the in-season episode to 0 from snapping the dropdown
  // back to the previous season at the cumulative-count boundary.
  const { currentSeason, episodesBefore, episodesInSeason } = useMemo(() => {
    if (!knownSeasons) {
      return {
        currentSeason: form.seasons_watched || 0,
        episodesBefore: 0,
        episodesInSeason: form.episodes_total,
      };
    }
    let s = form.seasons_watched;
    if (s < 1 || s > form.season_episodes.length) {
      // Derive from cumulative episodes only when seasons_watched is
      // empty / out of range. Walk until cumulative count would
      // overshoot — i.e. land in the season we're partway through.
      s = 1;
      let acc = 0;
      for (; s <= form.season_episodes.length; s++) {
        const len = form.season_episodes[s - 1];
        if (acc + len > form.episodes_watched) break;
        acc += len;
      }
      if (s > form.season_episodes.length) s = form.season_episodes.length;
    }
    let before = 0;
    for (let i = 0; i < s - 1; i++) before += form.season_episodes[i] || 0;
    return {
      currentSeason: s,
      episodesBefore: before,
      episodesInSeason: form.season_episodes[s - 1] || 0,
    };
  }, [knownSeasons, form.season_episodes, form.episodes_watched, form.seasons_watched, form.episodes_total]);

  const currentEpisode = knownSeasons
    ? Math.max(0, form.episodes_watched - episodesBefore)
    : form.episodes_watched;

  const setSeason = (s: number) => {
    if (!knownSeasons) {
      setForm({ ...form, seasons_watched: s });
      return;
    }
    // Switching seasons: keep episode 1 of the new season as a fresh
    // anchor, but if we land on the same season, leave episodes_watched
    // alone so the user doesn't lose progress.
    if (s === currentSeason) return;
    let before = 0;
    for (let i = 0; i < s - 1; i++) before += form.season_episodes[i] || 0;
    setForm({
      ...form,
      seasons_watched: s,
      episodes_watched: before, // entering the new season at episode 0
    });
  };

  const setEpisodeInSeason = (ep: number) => {
    if (!knownSeasons) {
      setForm({ ...form, episodes_watched: ep });
      return;
    }
    // Clamp to [0..episodesInSeason]. Pinning seasons_watched here
    // keeps the dropdown stable when the user clears the input down to
    // 0 (otherwise the cumulative count lands on a season boundary
    // and the derivation above would flip back to the prior season).
    const clamped = Math.max(0, Math.min(episodesInSeason, ep));
    setForm({
      ...form,
      seasons_watched: currentSeason,
      episodes_watched: episodesBefore + clamped,
    });
  };

  return (
    <Section title="Watch progress">
      {knownSeasons ? (
        <>
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            {totalSeasons} {totalSeasons === 1 ? 'season' : 'seasons'} · {totalEpisodes} total episodes
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldSelect
              label="Current season"
              value={String(currentSeason || 1)}
              onChange={(v) => setSeason(parseInt(v) || 1)}
              options={form.season_episodes.map((eps, i) => ({
                value: String(i + 1),
                label: `Season ${i + 1}  ·  ${eps} ep${eps === 1 ? '' : 's'}`,
              }))}
            />
            <NumberField
              label={`Current episode (1–${episodesInSeason || '?'})`}
              value={currentEpisode}
              min={0}
              max={episodesInSeason || undefined}
              onChange={setEpisodeInSeason}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {form.episodes_watched} of {totalEpisodes} episodes watched
          </div>
          {totalEpisodes > 0 && (
            <ProgressBar watched={form.episodes_watched} total={totalEpisodes} label="Episodes" itemStatus={form.status} />
          )}
        </>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            Per-season counts weren't returned. Enter totals manually, or re-pick the show from search to fetch them.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Current season"
              value={form.seasons_watched}
              onChange={(n) => setForm({ ...form, seasons_watched: n })}
            />
            <NumberField
              label="Total seasons"
              value={form.seasons_total}
              onChange={(n) => setForm({ ...form, seasons_total: n })}
            />
            <NumberField
              label="Episodes watched"
              value={form.episodes_watched}
              onChange={(n) => setForm({ ...form, episodes_watched: n })}
            />
            <NumberField
              label="Total episodes"
              value={form.episodes_total}
              onChange={(n) => setForm({ ...form, episodes_total: n })}
            />
          </div>
          {form.episodes_total > 0 && (
            <ProgressBar watched={form.episodes_watched} total={form.episodes_total} label="Episodes" itemStatus={form.status} />
          )}
        </>
      )}
    </Section>
  );
}

// CollectionBadge — surfaces "this movie is part of <series>" once
// TMDB tells us about a `belongs_to_collection`. Lazily fetches the
// full collection and shows how many of its parts the user has already
// added. Click expands to show the part list with year + poster.
function CollectionBadge({
  collectionId, collectionName, currentExternalID,
}: {
  collectionId: string;
  collectionName: string;
  currentExternalID: string;
}) {
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<CollectionPart[] | null>(null);
  const [mine, setMine] = useState<MediaEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || parts !== null) return;
    let cancel = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const [c, owned] = await Promise.all([
          mediaApi.collection(collectionId),
          mediaApi.list({ collection_id: collectionId }),
        ]);
        if (cancel) return;
        setParts(c.parts);
        setMine(owned);
      } catch (err) {
        if (cancel) return;
        const text = msg(err, 'Could not load collection parts');
        setError(text);
        toast.error('Could not load collection parts', { description: text });
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [open, collectionId, parts]);

  return (
    <Section title="Series">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="chip chip-sage">
          <Film className="size-3" /> {collectionName || 'Movie series'}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          {open ? 'Hide' : 'Show'} parts
        </button>
      </div>
      {open && (
        <div className="rounded-md border border-border/60 bg-background/40 mt-2">
          {loading && (
            <div className="p-3 text-xs text-muted-foreground inline-flex items-center gap-2">
              <M3CookieLoader size="sm" tone="secondary" /> Loading collection…
            </div>
          )}
          {!loading && error && (
            <div className="p-3 text-xs text-destructive">
              {error}
            </div>
          )}
          {!loading && parts && parts.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">No additional parts found.</div>
          )}
          {!loading && parts && parts.length > 0 && (
            <div className="flex flex-col">
              {parts.map((p, i) => {
                const owned = mine?.find((m) => m.external_id === p.external_id);
                const isCurrent = p.external_id === currentExternalID;
                const upcoming = isUpcomingCollectionPart(p);
                const releaseLabel = formatReleaseDate(p.release_date);
                return (
                  <div
                    key={p.external_id}
                    className={`flex items-center gap-3 px-3 py-2 text-sm ${i === 0 ? '' : 'border-t border-border/40'}`}
                  >
                    <span className="mono text-xs text-muted-foreground w-5 tabular-nums text-right">
                      {i + 1}
                    </span>
                    {p.poster_url ? (
                      <img src={p.poster_url} alt="" className="w-7 h-10 object-cover rounded shrink-0" />
                    ) : (
                      <div className="w-7 h-10 rounded bg-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`truncate ${isCurrent ? 'font-medium' : ''}`}>{p.title}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {releaseLabel || p.year}
                      </div>
                    </div>
                    {upcoming && (
                      <span className="chip chip-upcoming text-xs" title={releaseLabel ? `Upcoming ${releaseLabel}` : 'Upcoming'}>
                        Upcoming
                      </span>
                    )}
                    {isCurrent && (
                      <span className="chip chip-amber text-xs">This movie</span>
                    )}
                    {!isCurrent && owned && (
                      <span className="chip chip-sage text-xs">In library</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {mine && parts && (
        <div className="text-xs text-muted-foreground mt-1">
          {mine.length} of {parts.length} in your library
        </div>
      )}
    </Section>
  );
}
