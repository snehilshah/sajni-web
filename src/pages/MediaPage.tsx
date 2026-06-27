import { startTransition, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import { media as mediaApi, type CollectionPart, type MediaEventRow } from '@/api';
import { useMedia, useCreateMedia, useUpdateMedia, useDeleteMedia } from '@/queries/media';
import BookmarksPanel from '@/pages/BookmarksPanel';
import type { MediaEntry, MediaStatus, MediaSearchResult, MediaPatch } from '@/types';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import PageShell from '@/components/PageShell';
import { SplitButton } from '@/components/ui/split-button';
import { M3CookieLoader } from '@/components/ui/shapes';
import { SegmentedProgress } from '@/components/ui/segmented-progress';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetClose, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useVisualViewportBox } from '@/hooks/use-visual-viewport';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Star, Trash2, Search, Film, Tv, BookOpen, Calendar, ImageIcon, X, LayoutGrid, ListChecks, ArrowUpDown, MonitorPlay, Globe, ChevronRight } from '@/components/ui/icons';

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
  pending: 1,
  waiting: 2,
  complete: 3,
  archived: 4,
  dropped: 5,
  scratched: 6,
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
  { value: 'pending', label: 'Pending', dot: 'bg-amber-500' },
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
  return item.status === 'pending' && !!d && d > todayISODate();
}

function isUpcomingCollectionPart(part: Pick<CollectionPart, 'release_date' | 'release_state'>): boolean {
  const d = dateOnly(part.release_date);
  return part.release_state === 'upcoming' || (!!d && d > todayISODate());
}

function mediaStatusDisplay(item: MediaEntry): { label: string; color: string; chipClass: string } {
  if (isUpcomingRelease(item)) {
    const when = formatReleaseDate(item.release_date);
    return {
      label: when ? `Upcoming ${when}` : 'Upcoming',
      color: 'hsl(var(--primary))',
      chipClass: 'chip-amber',
    };
  }
  return {
    label: statusMeta(item.status)?.label || item.status,
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
    default:            return 'hsl(var(--muted-foreground))';
  }
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
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
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
                      <span className="chip chip-amber h-5 px-1.5 text-[10px] uppercase tracking-wide">
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
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const isMobileMedia = useIsMobile();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try { return (localStorage.getItem(MEDIA_VIEW_KEY) as 'grid' | 'list') || 'list'; }
    catch { return 'list'; }
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
  // visible while a filter switch refetches; bookmark tabs load their own data
  // so the media query is disabled there.
  const mediaParams = useMemo(
    () => ({ type: activeType, ...(statusFilter ? { status: statusFilter } : {}) }),
    [activeType, statusFilter],
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
    setStatusFilter('');
    setSearchQuery('');
    setSearchParams(key === 'movie' ? {} : { tab: TYPE_TO_TAB[key] }, { replace: true });
  }, [setSearchParams]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matched = q
      ? items.filter((i) =>
          i.title.toLowerCase().includes(q) ||
          i.genre.toLowerCase().includes(q) ||
          i.platform.toLowerCase().includes(q),
        )
      : items;
    return sortMedia(matched, sortBy);
  }, [items, searchQuery, sortBy]);

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

  const openForm = useCallback((item?: MediaEntry) => {
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

  const handleExternalSelect = async (r: MediaSearchResult) => {
    // Combined movie+show search: the picked row's kind (carried in its
    // external_id) sets the form type, so picking a show from the movie
    // tab flips to 'show' and reveals the show-progress section. Books
    // keep their type (Open Library ids carry no tmdb kind).
    const kind = tmdbKindLabel(r.external_id);
    // Optimistic prefill from the search row.
    setForm((f) => ({
      ...f,
      title: r.title,
      type: kind === 'Show' ? 'show' : kind === 'Movie' ? 'movie' : f.type,
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
      setForm((f) => ({
        ...f,
        // Don't clobber the title if the user already started typing.
        title: f.title || d.title,
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
        <EmptyState type={activeType} hasFilter={!!statusFilter || !!searchQuery} onAdd={() => openForm()} onClear={() => { setStatusFilter(''); setSearchQuery(''); }} />
      );
    }
    return viewMode === 'grid' ? (
      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 md:[grid-template-columns:repeat(auto-fill,minmax(180px,1fr))] gap-3 min-[480px]:gap-4 md:gap-5">
        {seriesRows.map((row) => (
          row.kind === 'single' ? (
            <PosterCard key={'item-' + row.item.id} item={row.item} onClick={() => openForm(row.item)} />
          ) : (
            <SeriesPosterCard
              key={'series-' + row.collectionId}
              row={row}
              onOpen={() => setSeriesDialog(row)}
            />
          )
        ))}
      </div>
    ) : (
      <div className="overflow-hidden rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))]">
        {seriesRows.map((row, idx) => (
          row.kind === 'single' ? (
            <MediaListRow
              key={'item-' + row.item.id}
              item={row.item}
              index={idx}
              attached
              first={idx === 0}
              onClick={() => openForm(row.item)}
            />
          ) : (
            <SeriesListRow
              key={'series-' + row.collectionId}
              row={row}
              attached
              first={idx === 0}
              expanded={expandedSeries.has(row.collectionId)}
              onToggle={() => toggleSeries(row.collectionId)}
              onPickItem={openForm}
            />
          )
        ))}
      </div>
    );
  }, [loading, filteredItems, seriesRows, viewMode, statusFilter, searchQuery, activeType, expandedSeries, openForm, toggleSeries, setSeriesDialog]);

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

      {editItem && <ActivityTimeline mediaId={editItem.id} />}
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
      caption={isBookmarkTab
        ? 'saved links · open to mark read'
        : `${items.length} ${items.length === 1 ? 'entry' : 'entries'} · ${counts['in_progress'] || 0} in progress`}
      title="Library"
      subtitle="Movies, shows, books, links — one shelf."
      hideScrollbar
      actions={
        <Button
          onClick={() => (isBookmarkTab ? setBookmarkAddSignal((s) => s + 1) : openForm())}
          className="gap-1.5"
        >
          <Plus className="size-4" /> Add
        </Button>
      }
    >
      {/* Type tabs — horizontally scrollable on narrow screens */}
      <div className="border-b border-border -mt-3">
        <div className="flex gap-1 -mb-px overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {Object.entries(TYPE_META).map(([key, meta]) => {
            const Icon = meta.icon;
            const active = activeType === key;
            return (
              <button
                key={key}
                onClick={() => switchType(key)}
                className={`relative inline-flex items-center gap-2 px-3 py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="size-3.5" />
                {meta.plural}
                {active && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {isBookmarkTab ? (
        <BookmarksPanel kind={activeType as 'video' | 'site'} addSignal={bookmarkAddSignal} />
      ) : (
      <div className="flex flex-col gap-4 min-w-0">
          {/* Toolbar: status chips + search. On mobile the chips wrap freely
              (no horizontal scroll) and the sort/actions block drops to its
              own row beneath them; on md+ it all sits on one row. */}
          <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-3 min-w-0 w-full">
            <div className="flex flex-wrap gap-1">
              <FilterChip
                active={statusFilter === ''}
                onClick={() => setStatusFilter('')}
                count={counts.all || 0}
              >
                All
              </FilterChip>
              {STATUS_OPTIONS.map((s) => {
                const c = counts[s.value] || 0;
                if (c === 0 && statusFilter !== s.value) return null;
                return (
                  <FilterChip
                    key={s.value}
                    active={statusFilter === s.value}
                    onClick={() => setStatusFilter(s.value)}
                    count={c}
                    dot={s.dot}
                  >
                    {s.label}
                  </FilterChip>
                );
              })}
            </div>
            <div className={cn(
              'md:ml-auto flex flex-wrap items-center gap-2 min-w-0',
              isMobileMedia && searchExpanded ? 'w-full' : '',
            )}>
              {!(isMobileMedia && searchExpanded) && (
                <div className="min-w-[132px] flex-1 md:min-w-[180px] md:flex-none">
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)} items={SORT_OPTIONS}>
                    <SelectTrigger size="sm" className="h-9 w-full min-w-0 gap-2 text-xs">
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
              )}
              {activeType === 'movie' && !(isMobileMedia && searchExpanded) && (
                <button
                  onClick={() => setGroupSeries((v) => !v)}
                  className={cn(
                    'h-9 rounded-full text-xs inline-flex items-center justify-center gap-1.5 border transition-colors',
                    isMobileMedia ? 'w-9 px-0' : 'px-3.5',
                    groupSeries
                      ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] border-transparent'
                      : 'border-[hsl(var(--outline))] text-foreground hover:bg-[hsl(var(--on-surface)/0.06)]',
                  )}
                  title="Group movies that share a series (e.g. Mission Impossible)"
                  aria-label="Group movie series"
                >
                  <Film className="size-3.5" />
                  {!isMobileMedia && 'Series'}
                </button>
              )}
              {/* List/grid switch.
                  M3 split button: primary toggles the OTHER view instantly,
                  chevron opens a menu with both options. */}
              {!(isMobileMedia && searchExpanded) && (
                <SplitButton
                  size="sm"
                  iconOnly={isMobileMedia}
                  value={viewMode}
                  options={[
                    { value: 'grid', label: 'Grid', icon: LayoutGrid },
                    { value: 'list', label: 'List', icon: ListChecks },
                  ]}
                  onChange={(v) => setViewMode(v as 'grid' | 'list')}
                  onPrimary={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                />
              )}
              {/* Search — desktop = inline input; mobile = icon only. Both
                  use the same searchQuery; clicking the mobile icon opens
                  a small inline input that takes the toolbar's full row. */}
              {isMobileMedia ? (
                searchExpanded ? (
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter library…"
                      autoFocus
                      onBlur={() => { if (!searchQuery) setSearchExpanded(false); }}
                      className="h-11 pl-11 pr-10 w-full rounded-full bg-[hsl(var(--surface-container-high))] border-transparent hover:bg-[hsl(var(--surface-container-highest))] hover:border-transparent focus-visible:rounded-full focus-visible:pl-11 focus-visible:pr-10 focus-visible:border-2 focus-visible:border-primary focus-visible:bg-[hsl(var(--surface-container-highest))] focus-visible:shadow-[var(--m3-elev-1)] transition-[background-color,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
                    />
                    {(searchQuery || searchExpanded) && (
                      <button
                        onClick={() => { setSearchQuery(''); setSearchExpanded(false); }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setSearchExpanded(true)}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--on-surface)/0.06)] transition-colors"
                    aria-label="Search library"
                  >
                    <Search className="size-4" />
                  </button>
                )
              ) : (
                <div className="relative w-64">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter library…"
                    className="h-11 pl-11 pr-10 w-full rounded-full bg-[hsl(var(--surface-container-high))] border-transparent hover:bg-[hsl(var(--surface-container-highest))] hover:border-transparent focus-visible:rounded-full focus-visible:pl-11 focus-visible:pr-10 focus-visible:border-2 focus-visible:border-primary focus-visible:bg-[hsl(var(--surface-container-highest))] focus-visible:shadow-[var(--m3-elev-1)] transition-[background-color,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

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
        <Dialog
          open={showForm}
          onOpenChange={setShowForm}
          onOpenChangeComplete={(open) => {
            if (!open) setEditItem(null);
          }}
        >
          <DialogContent className="sm:max-w-3xl w-full max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
            <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
              <DialogTitle className="flex items-center gap-2">
                {mediaFormTitle}
              </DialogTitle>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {mediaFormSubtitle}
              </p>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
              {mediaFormFields}
            </div>

            <DialogFooter className="shrink-0 px-6 py-4 border-t border-border bg-muted/20">
              {mediaFormFooter}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <SeriesDialog
        row={seriesDialog}
        onClose={() => setSeriesDialog(null)}
        onPickItem={openForm}
      />

    </PageShell>
  );
}

/* ---------------- Helpers ---------------- */

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

function PosterCard({ item, onClick }: { item: MediaEntry; onClick: () => void }) {
  const statusDisplay = mediaStatusDisplay(item);
  const Icon = TYPE_META[item.type]?.icon || Film;
  const showProgress = item.episodes_total > 0;

  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-2 text-left w-full"
      title={item.title}
    >
      <div className="relative w-full aspect-[2/3] rounded-2xl overflow-hidden bg-[hsl(var(--surface-container))] border border-[hsl(var(--outline-variant))] transition-shadow group-hover:shadow-[var(--m3-elev-2)]">
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

        {/* Status pill — color-coded per status */}
        <div className="absolute top-2 left-2">
          <span
            className="inline-flex max-w-[calc(100%-0.5rem)] items-center gap-1 bg-background px-2 py-0.5 text-xs font-mono font-medium shadow-sm ring-1 ring-foreground/5"
            style={{
              color: statusDisplay.color,
              borderLeft: `2px solid ${statusDisplay.color}`,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
            title={statusDisplay.label}
          >
            <span className="truncate">{statusDisplay.label}</span>
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
        <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground mt-0.5">
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
        <div className="font-mono text-xs text-muted-foreground mt-0.5 truncate">
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
    : 'w-11 h-[60px] rounded-md';
  const classes = cn(sizeClass, 'object-cover ring-1 ring-border/60 shrink-0', className);
  if (item.poster_url) {
    return (
      <img
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
  const out = [...items];
  switch (by) {
    case 'updated_desc':   out.sort(byDateDesc('updated_at')); break;
    case 'added_desc':     out.sort(byDateDesc('created_at')); break;
    case 'added_asc':      out.sort((a, b) => cmpStr(a.created_at || '', b.created_at || '')); break;
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
    default:            return '';
  }
}

// MediaListRow — single-entry list row (split out so we can render a
// thin progress bar at the bottom for in-progress shows/books without
// duplicating the row markup inline).
function MediaListRow({
  item, index, onClick, compact = false, attached = false, first = false,
}: {
  item: MediaEntry;
  index: number;
  onClick: () => void;
  compact?: boolean;
  attached?: boolean;
  first?: boolean;
}) {
  const hasProgress = listProgressPct(item) !== null;
  const progress = hasProgress ? progressDetailLabel(item) : '';
  const pct = listProgressPct(item);
  const age = watchAgeLabelShort(item);
  const statusDisplay = mediaStatusDisplay(item);
  return (
    <button
      onClick={onClick}
      className={cn(
        'm3-state group relative w-full overflow-hidden bg-[hsl(var(--surface-container-low))] text-left transition-[background-color,border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-[hsl(var(--surface-container))] active:scale-[0.995]',
        attached
          ? cn('rounded-none border-0', !first && 'border-t border-[hsl(var(--outline-variant))]')
          : 'rounded-2xl border border-[hsl(var(--outline-variant))] hover:border-[hsl(var(--outline))]',
        compact ? 'min-h-[82px] p-2.5' : 'min-h-[96px] p-3 md:p-3.5',
      )}
    >
      <div className={cn('flex min-w-0 gap-3', compact ? 'items-center' : 'items-stretch')}>
        <MediaThumb item={item} index={index} variant={compact ? 'sm' : 'card'} />
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className={cn('serif min-w-0 font-medium leading-snug truncate', compact ? 'text-[14px]' : 'text-[16px]')}>
                  {item.title || 'Untitled'}
                </div>
              </div>
              <span className={cn('chip max-w-[11rem] shrink-0 px-2.5 text-xs leading-none', compact ? 'h-6' : 'h-7', statusDisplay.chipClass)} title={statusDisplay.label}>
                <span className="truncate">{statusDisplay.label}</span>
              </span>
            </div>
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 mono text-xs text-muted-foreground">
              <span className="shrink-0">{TYPE_META[item.type]?.label || item.type}</span>
              {item.year ? <span className="shrink-0">{item.year}</span> : null}
              {item.rating ? (
                <span className="inline-flex shrink-0 items-center gap-0.5 text-secondary">
                  <Star className="size-3 fill-current" />
                  <span className="tabular-nums">{item.rating}</span>
                </span>
              ) : null}
              {item.platform ? (
                <PlatformLogo
                  platform={item.platform}
                  className="shrink-0"
                  iconClassName={compact ? 'size-[15px]' : 'size-4'}
                />
              ) : null}
              {progressLabel(item) ? <span className="shrink-0">{progressLabel(item)}</span> : null}
              {age ? <span className="min-w-0 truncate">{age}</span> : null}
            </div>
          </div>
          {hasProgress && (
            <div className="flex flex-col gap-1.5">
              <div className="flex min-w-0 items-center justify-between gap-2 mono text-xs text-muted-foreground">
                <span className="min-w-0 truncate">{progress}</span>
                {pct !== null && <span className="shrink-0 tabular-nums">{pct}%</span>}
              </div>
              <SegmentedBar
                watched={item.episodes_watched}
                total={item.episodes_total}
                status={item.status}
                units={item.type === 'show' ? item.seasons_total : undefined}
                boxH={compact ? 4 : 6}
              />
            </div>
          )}
        </div>
      </div>
    </button>
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

function progressDetailLabel(item: MediaEntry): string {
  if (item.type === 'show') {
    const pos = progressLabel(item);
    return `${pos || 'Progress'} · ${item.episodes_watched}/${item.episodes_total} episodes`;
  }
  if (item.type === 'book') {
    return `Pages ${item.episodes_watched}/${item.episodes_total}`;
  }
  return '';
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
          <span className="absolute top-2 right-2 chip chip-amber h-6 max-w-[calc(100%-5.75rem)] px-2.5 text-xs" title={`Upcoming ${upcomingDate}`}>
            <span className="truncate">Upcoming</span>
          </span>
        )}
        <span className="absolute bottom-2 right-2 mono text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--inverse-surface))] text-[hsl(var(--inverse-on-surface))]">
          {watched}/{row.members.length}
        </span>
      </div>
      <div className="mt-2 px-0.5">
        <div className="font-medium text-sm leading-snug line-clamp-2">{row.collectionName}</div>
        <div className="mono text-xs text-muted-foreground mt-0.5 truncate">
          {row.members.length} movies{upcomingDate ? ` · ${upcomingDate}` : ''}
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
  onPickItem: (m: MediaEntry) => void;
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
  row, expanded, onToggle, onPickItem, className, attached = false, first = false,
}: {
  row: Extract<SeriesRow, { kind: 'series' }>;
  expanded: boolean;
  onToggle: () => void;
  onPickItem: (m: MediaEntry) => void;
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

  return (
    <div className={cn(
      'overflow-hidden bg-[hsl(var(--surface-container-low))]',
      attached
        ? cn('rounded-none border-0', !first && 'border-t border-[hsl(var(--outline-variant))]')
        : 'rounded-2xl border border-[hsl(var(--outline-variant))]',
      className,
    )}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="m3-state group relative w-full bg-[hsl(var(--surface-container-low))] p-3 md:p-3.5 text-left transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-[hsl(var(--surface-container))]"
      >
        <div className="flex min-w-0 gap-3">
          <MediaThumb item={cover} index={0} variant="card" />
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
            <div className="min-w-0">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="serif text-[16px] font-medium leading-snug truncate">{row.collectionName}</div>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 mono text-xs text-muted-foreground">
                    {yearLabel && <span className="shrink-0">{yearLabel}</span>}
                    <span className="shrink-0">{row.members.length} movies</span>
                    {upcomingDate && <span className="shrink-0">Upcoming {upcomingDate}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {upcoming && (
                    <span className="chip chip-amber h-7 max-w-[11rem] px-2.5 text-xs leading-none" title={`Upcoming ${upcomingDate}`}>
                      <span className="truncate">Upcoming</span>
                    </span>
                  )}
                  <span className="chip chip-sage h-7 px-2.5 text-xs leading-none">
                    <Film className="size-3" /> Series
                  </span>
                  <ChevronRight className={cn('size-4 transition-transform duration-200', expanded && 'rotate-90')} />
                </div>
              </div>
              <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2 mono text-xs text-muted-foreground">
                <span>Watched {watched}/{row.members.length}</span>
                <span className="font-medium text-foreground/80">{expanded ? 'Hide movies' : 'View movies'}</span>
              </div>
            </div>
            <SegmentedBar
              watched={watched}
              total={row.members.length}
              status={watched === row.members.length ? 'complete' : 'in_progress'}
              units={row.members.length}
              boxH={6}
            />
          </div>
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
function ActivityTimeline({ mediaId }: { mediaId: number }) {
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
                  <span className="font-medium">{eventLabel(e)}</span>
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

function eventLabel(e: MediaEventRow): string {
  switch (e.kind) {
    case 'added': return 'Added to library';
    case 'started': return 'Started watching';
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

  useEffect(() => {
    if (!open || parts !== null) return;
    let cancel = false;
    setLoading(true);
    (async () => {
      try {
        const [c, owned] = await Promise.all([
          mediaApi.collection(collectionId),
          mediaApi.list({ collection_id: collectionId }),
        ]);
        if (cancel) return;
        setParts(c.parts);
        setMine(owned);
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
                      <span className="chip chip-amber text-xs" title={releaseLabel ? `Upcoming ${releaseLabel}` : 'Upcoming'}>
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
