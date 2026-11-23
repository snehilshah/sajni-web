import { startTransition, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { media as mediaApi, type CollectionPart, type MediaEventRow } from '@/api';
import { useMedia, useCreateMedia, useSaveMedia, useDeleteMedia } from '@/queries/media';
import BookmarksPanel from '@/pages/BookmarksPanel';
import type { MediaEntry, MediaStatus, MediaSearchResult, MediaPatch } from '@/types';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import PageShell, { PageShellTabs } from '@/components/PageShell';
import { SplitButton } from '@/components/ui/split-button';
import { M3CookieLoader } from '@/components/ui/shapes';
import { SegmentedProgress } from '@/components/ui/segmented-progress';
import { titleToneVars, tt } from '@/lib/titleTones';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IntInput } from '@/components/ui/int-input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MorphingDialog, type MorphSourceRect } from '@/components/motion/morphing-dialog';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useVisualViewportBox } from '@/hooks/use-visual-viewport';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus,
  Pencil,
  ArrowLeft,
  ChevronRight,
  Star,
  Trash2,
  Search,
  Film,
  Tv,
  BookOpen,
  ImageIcon,
  X,
  LayoutGrid,
  ListChecks,
  ArrowUpDown,
  MonitorPlay,
  Globe,
  Settings,
  Play,
  Sparkles,
  CalendarClock,
  Hourglass,
  Clock,
  CheckCircle2,
  Archive,
  Ban,
  type LucideIcon,
} from '@/components/ui/icons';
import { HuePill } from '@/components/ui/hue-pill';
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
import pxSparkle from 'pixelarticons/svg/sparkle.svg?raw';
import pxSparkles from 'pixelarticons/svg/sparkles.svg?raw';
import pxPlay from 'pixelarticons/svg/play.svg?raw';
import pxBuilding from 'pixelarticons/svg/building.svg?raw';
import pxDownload from 'pixelarticons/svg/download.svg?raw';
import pxImage from 'pixelarticons/svg/image.svg?raw';
import { useEditorDraft } from '@/hooks/use-editor-draft';
import { EditActions } from '@/components/editor-actions';
import { failureText } from '@/lib/errors';

const MEDIA_VIEW_KEY = 'sajni:media:view';
const MEDIA_SORT_KEY = 'sajni:media:sort';

type ViewMode = 'grid' | 'list' | 'shelves' | 'table';
const VIEW_MODES: ViewMode[] = ['grid', 'list', 'shelves', 'table'];

type SortKey =
  | 'updated_desc' // last touched (existing default)
  | 'added_desc' // newest add first
  | 'added_asc'
  | 'completed_desc' // most recently finished
  | 'rating_desc'
  | 'year_desc'
  | 'year_asc'
  | 'title_asc'
  | 'status';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'added_desc', label: 'Recently added' },
  { value: 'added_asc', label: 'Oldest added' },
  { value: 'completed_desc', label: 'Recently completed' },
  { value: 'rating_desc', label: 'Highest rated' },
  { value: 'year_desc', label: 'Year (new → old)' },
  { value: 'year_asc', label: 'Year (old → new)' },
  { value: 'title_asc', label: 'Title (A → Z)' },
  { value: 'status', label: 'Status' },
];

// STATUS_ORDER groups items by lifecycle when sortBy = 'status' so
// in-progress / pending stay near the top and dropped/scratched sink.
const STATUS_ORDER: Record<MediaStatus, number> = {
  in_progress: 0,
  new_season: 1,
  upcoming: 2,
  pending: 3,
  waiting: 4,
  complete: 5,
  archived: 6,
  dropped: 7,
  scratched: 8,
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

const STATUS_OPTIONS: { value: MediaStatus; label: string }[] = [
  { value: 'in_progress', label: 'In progress' },
  { value: 'new_season', label: 'New Season' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'pending', label: 'Pending' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'complete', label: 'Complete' },
  { value: 'archived', label: 'Archived' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'scratched', label: 'Scratched' },
];
// One status palette on web and Android (Android: mediaStatusColor).
// Status shows as a solid badge in its colour, never a dot.
const STATUS_SOLID: Record<MediaStatus, { bg: string; fg: string }> = {
  in_progress: { bg: '#3A6FD8', fg: '#fff' },
  new_season: { bg: '#3A6FD8', fg: '#fff' },
  upcoming: { bg: 'hsl(var(--tertiary-container))', fg: 'hsl(var(--on-tertiary-container))' },
  pending: { bg: '#E39A00', fg: '#fff' },
  waiting: { bg: '#64748B', fg: '#fff' },
  complete: { bg: '#1F9D6A', fg: '#fff' },
  archived: { bg: '#78716C', fg: '#fff' },
  dropped: { bg: '#D14343', fg: '#fff' },
  scratched: { bg: '#D14343', fg: '#fff' },
};
// Filter chips and the status menu: status glyph + its palette colour.
const STATUS_LOOK: Record<MediaStatus, { icon: LucideIcon; hue: string }> = {
  in_progress: { icon: Play, hue: STATUS_SOLID.in_progress.bg },
  new_season: { icon: Sparkles, hue: STATUS_SOLID.new_season.bg },
  upcoming: { icon: CalendarClock, hue: 'hsl(var(--tertiary))' },
  pending: { icon: Hourglass, hue: STATUS_SOLID.pending.bg },
  waiting: { icon: Clock, hue: STATUS_SOLID.waiting.bg },
  complete: { icon: CheckCircle2, hue: STATUS_SOLID.complete.bg },
  archived: { icon: Archive, hue: STATUS_SOLID.archived.bg },
  dropped: { icon: X, hue: STATUS_SOLID.dropped.bg },
  scratched: { icon: Ban, hue: STATUS_SOLID.scratched.bg },
};

function MediaStatusBadge({
  status,
  label,
  title,
  className,
}: {
  status: MediaStatus;
  label?: string;
  title?: string;
  className?: string;
}) {
  const look = STATUS_SOLID[status] ?? STATUS_SOLID.pending;
  return (
    <span
      title={title}
      className={cn('inline-flex h-6 max-w-full items-center rounded-lg px-2 text-xs font-semibold', className)}
      style={{ background: look.bg, color: look.fg }}
    >
      <span className="truncate">{label ?? STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}</span>
    </span>
  );
}
const EDITABLE_STATUS_OPTIONS = STATUS_OPTIONS.filter(
  (status) => status.value !== 'upcoming' && status.value !== 'new_season',
);

const PLATFORM_OPTIONS = [
  { value: 'netflix', label: 'Netflix' },
  { value: 'amazon', label: 'Amazon Prime' },
  { value: 'disney', label: 'Disney+' },
  { value: 'hotstar', label: 'Hotstar' },
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
  movies: 'movie',
  shows: 'show',
  books: 'book',
  videos: 'video',
  sites: 'site',
};
const TYPE_TO_TAB: Record<string, string> = Object.fromEntries(Object.entries(TAB_TO_TYPE).map(([tab, t]) => [t, tab]));

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

function hasFutureRelease(type: MediaKind, releaseDate?: string | null): boolean {
  const d = dateOnly(releaseDate);
  return (type === 'movie' || type === 'show') && !!d && d > todayISODate();
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
  return (
    members
      .filter(isUpcomingRelease)
      .sort((a, b) => dateOnly(a.release_date).localeCompare(dateOnly(b.release_date)))[0] || null
  );
}

// Per-platform pixel glyph (distinct each) + brand-color tint. The pixel set
// has no real brand logos, so a varied glyph + colour keeps platforms apart.
// Colour is an intentional exception to the theme-token rule so a platform
// reads as itself; `currentColor` ones inherit the surrounding text colour.
const PIXEL_SVGS: Record<string, string> = {
  tv: pxTv,
  video: pxVideo,
  castle: pxCastle,
  monitor: pxMonitor,
  airplay: pxAirplay,
  sparkle: pxSparkle,
  sparkles: pxSparkles,
  play: pxPlay,
  building: pxBuilding,
  download: pxDownload,
  image: pxImage,
};

const PLATFORM_PIXEL: Record<string, { glyph: keyof typeof PIXEL_SVGS; color: string }> = {
  netflix: { glyph: 'tv', color: '#E50914' },
  amazon: { glyph: 'video', color: '#00A8E1' },
  disney: { glyph: 'castle', color: '#113CCF' },
  hotstar: { glyph: 'sparkle', color: '#00AEEF' },
  hbo: { glyph: 'monitor', color: '#9D4EDD' },
  apple: { glyph: 'airplay', color: 'currentColor' },
  hulu: { glyph: 'sparkles', color: '#1CE783' },
  youtube: { glyph: 'play', color: '#FF0000' },
  cinema: { glyph: 'building', color: 'currentColor' },
  torrent: { glyph: 'download', color: 'currentColor' },
  other: { glyph: 'image', color: 'currentColor' },
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
      className={cn('inline-grid size-4 shrink-0 place-items-center [&>svg]:size-full', className)}
      style={style}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// Pixel glyph + label for a media entry's platform. `showLabel=false` renders
// the mark alone (tight rows / dropdown trigger). Fixed-size glyph throughout.
function PlatformLogo({
  platform,
  showLabel = true,
  className,
  iconClassName,
}: {
  platform: string;
  showLabel?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  const meta = PLATFORM_PIXEL[platform] || PLATFORM_PIXEL.other;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 align-middle', className)}>
      <PixelIcon glyph={meta.glyph} className={iconClassName} style={{ color: meta.color }} />
      {showLabel && <span className="truncate">{platformLabel(platform)}</span>}
    </span>
  );
}

// Returns the accent color for status-colored UI elements (poster pill, etc.)
function statusPillColor(status: MediaStatus): string {
  switch (status) {
    case 'in_progress':
      return 'hsl(var(--secondary))';
    case 'new_season':
      return 'hsl(var(--secondary))';
    case 'complete':
      return 'hsl(var(--color-complete))';
    case 'dropped':
    case 'scratched':
      return 'hsl(var(--destructive))';
    case 'waiting':
      return 'hsl(var(--color-waiting))';
    case 'pending':
      return 'hsl(var(--muted-foreground))';
    case 'upcoming':
      return 'hsl(var(--tertiary))';
    default:
      return 'hsl(var(--muted-foreground))';
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
  return (
    pool.find((item) => {
      if (skipId && item.id === skipId) return false;
      if (item.type !== draft.type) return false;
      if (ext && item.external_id === ext) return true;
      if (normalizeMediaTitle(item.title) !== title) return false;
      const itemYear = yearFromMedia(item);
      return !draftYear || !itemYear || draftYear === itemYear;
    }) || null
  );
}

function duplicateMediaDescription(item: MediaEntry): string {
  const type = TYPE_META[item.type]?.label || 'Item';
  const year = yearFromMedia(item);
  const status = statusMeta(item.status)?.label || item.status;
  return `${type}${year ? ` · ${year}` : ''} · ${status}`;
}

function SegmentedBar({
  watched,
  total,
  status,
  units,
  showLabel = false,
  label = '',
  variant = 'row',
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
function ProgressBar({
  watched,
  total,
  label,
  itemStatus = 'in_progress',
}: {
  watched: number;
  total: number;
  label: string;
  itemStatus?: MediaStatus;
  color?: string;
}) {
  return (
    <SegmentedBar
      watched={watched}
      total={total}
      status={itemStatus}
      boxH={10}
      variant="wrap"
      showLabel
      label={label}
    />
  );
}

function StarRating({
  value,
  interactive = false,
  onChange,
  size = 'sm',
}: {
  value: number;
  interactive?: boolean;
  onChange?: (v: number) => void;
  size?: 'sm' | 'md';
}) {
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
  value,
  type,
  onChange,
  onSelect,
  autoFocus,
  source,
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

  const doSearch = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        startTransition(() => setResults([]));
        return;
      }
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
    },
    [type],
  );

  const handleChange = (val: string) => {
    setText(val); // instant, local — does NOT touch MediaPage
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
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    emittedValue.current = text;
    onChange(text);
  };

  // Commit a picked suggestion: cancel any pending debounce, hand the row to
  // the parent, mirror the title locally, and close.
  const pick = (r: MediaSearchResult) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    emittedValue.current = null;
    onSelect(r);
    setText(r.title);
    setOpen(false);
    setResults([]);
  };

  const placeholder =
    type === 'book'
      ? 'Title: search Open Library or type manually'
      : 'Title: search movies & shows on TMDB or type manually';

  return (
    <div className="group relative" ref={wrapRef}>
      <Search className="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary sm:left-5" />
      <Input
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={flush}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        // With suggestions showing, Escape closes them, not the editor.
        data-own-escape={open && results.length > 0 ? '' : undefined}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const r = results[highlight];
            if (r) pick(r);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        autoFocus={autoFocus}
        placeholder={placeholder}
        required
        aria-required="true"
        className="h-14 w-full rounded-full border-0 bg-[hsl(var(--surface-container-highest))] pr-12 pl-12 font-serif text-lg font-medium tracking-tight transition-[background-color,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)] outline-none placeholder:text-muted-foreground/55 focus:shadow-[inset_0_0_0_2px_hsl(var(--primary))] sm:pr-14 sm:pl-14"
      />
      {loading && (
        <span className="absolute top-1/2 right-4 -translate-y-1/2 sm:right-5">
          <M3CookieLoader size="sm" tone="primary" />
        </span>
      )}
      {source && !loading && (
        <span className="chip chip-sage absolute top-1/2 right-3 h-7 -translate-y-1/2 px-2.5 text-xs sm:right-4">
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
            className="absolute top-[calc(100%+10px)] right-0 left-0 z-30 max-h-[min(55vh,26rem)] origin-top overflow-y-auto overscroll-contain rounded-[28px] bg-[hsl(var(--surface-container-high))] p-2 shadow-[var(--m3-elev-3)]"
          >
            {results.map((r, i) => {
              const kind = tmdbKindLabel(r.external_id);
              return (
                <button
                  key={r.external_id + i}
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.99]',
                    highlight === i
                      ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
                      : 'hover:bg-[hsl(var(--on-surface)/0.06)]',
                  )}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(r)}
                >
                  <div className="aspect-[2/3] w-11 shrink-0 overflow-hidden rounded-lg bg-[hsl(var(--surface-container-highest))]">
                    {r.poster_url ? (
                      <img
                        src={r.poster_url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageIcon className="size-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.title}</div>
                    <div className="mt-0.5 flex items-center gap-2">
                      {kind && (
                        <span className="label-kicker inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-current px-1.5 text-xs font-medium opacity-60">
                          {kind === 'Show' ? <Tv className="size-2.5" /> : <Film className="size-2.5" />}
                          {kind}
                        </span>
                      )}
                      {r.year && <span className="font-mono text-xs opacity-70">{r.year}</span>}
                      {r.release_state === 'upcoming' && (
                        <span className="chip chip-upcoming label-kicker h-5 px-1.5 text-xs">
                          Upcoming{r.release_date ? ` ${formatReleaseDate(r.release_date)}` : ''}
                        </span>
                      )}
                    </div>
                    {r.overview && <div className="mt-0.5 line-clamp-2 text-xs opacity-75">{r.overview}</div>}
                  </div>
                </button>
              );
            })}
            {/* Keyboard hint — pointless on touch, so hover-capable devices only. */}
            <div className="mono label-kicker mt-1 hidden border-t border-[hsl(var(--outline-variant))] px-3 pt-2.5 pb-1 text-xs text-muted-foreground [@media(hover:hover)]:block">
              Enter to pick · Esc to close
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

function mediaFormOf(item: MediaEntry): FormState {
  return {
    title: item.title,
    type: item.type,
    status: item.status,
    rating: item.rating || 0,
    notes: item.notes,
    platform: item.platform,
    poster_url: item.poster_url,
    year: item.year || null,
    release_date: item.release_date || '',
    genre: item.genre,
    external_id: item.external_id,
    episodes_watched: item.episodes_watched,
    episodes_total: item.episodes_total,
    seasons_watched: item.seasons_watched,
    seasons_total: item.seasons_total,
    season_episodes: item.season_episodes || [],
    collection_id: item.collection_id || '',
    collection_name: item.collection_name || '',
  };
}

// The PUT/POST body. Upcoming follows the release date; marking complete
// snaps progress to the end (last season, last episode) so the S?E? label
// and bar read 100% instead of wherever the user stopped.
function mediaPayload(form: FormState): MediaPatch {
  const upcoming = hasFutureRelease(form.type, form.release_date);
  const payload: MediaPatch = {
    ...form,
    status: upcoming ? 'upcoming' : form.status === 'upcoming' ? 'pending' : form.status,
    rating: form.rating || null,
  };
  if (form.status === 'complete') {
    const totalEps =
      form.season_episodes.length > 0 ? form.season_episodes.reduce((s, n) => s + n, 0) : form.episodes_total;
    if (totalEps > 0) payload.episodes_watched = totalEps;
    if (form.type === 'show') {
      const totalSeasons = form.season_episodes.length > 0 ? form.season_episodes.length : form.seasons_total;
      if (totalSeasons > 0) payload.seasons_watched = totalSeasons;
    }
  }
  return payload;
}

export default function MediaPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeType, setActiveType] = useState(() => TAB_TO_TYPE[searchParams.get('tab') ?? ''] || 'movie');
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
    } catch {
      return 'list';
    }
  });
  const [sortBy, setSortBy] = useState<SortKey>(() => {
    try {
      return (localStorage.getItem(MEDIA_SORT_KEY) as SortKey) || 'updated_desc';
    } catch {
      return 'updated_desc';
    }
  });
  // Series grouping is only meaningful for movies — TMDB collection
  // metadata only attaches to those. We default it on for the movie tab.
  const [groupSeries, setGroupSeries] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sajni:media:group') !== '0';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('sajni:media:group', groupSeries ? '1' : '0');
    } catch {}
  }, [groupSeries]);
  const [seriesDialog, setSeriesDialog] = useState<Extract<SeriesRow, { kind: 'series' }> | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(MEDIA_VIEW_KEY, viewMode);
    } catch {}
  }, [viewMode]);
  useEffect(() => {
    try {
      localStorage.setItem(MEDIA_SORT_KEY, sortBy);
    } catch {}
  }, [sortBy]);

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<MediaEntry | null>(null);
  // An existing item opens as itself (MediaDetailView); its form is behind
  // "Edit details". A new one opens straight to the form.
  const [detailsForm, setDetailsForm] = useState(false);
  // Which always-mounted element the desktop dialog morphs out of:
  // a grid poster ('card'), the pill Add button ('add'), or none
  // (list/table/shelves rows → scale/fade fallback).
  const [morphSource, setMorphSource] = useState<'card' | 'add' | null>(null);
  const [morphRect, setMorphRect] = useState<MorphSourceRect | undefined>();
  const [saving, setSaving] = useState(false);
  // On phones the form is a full-height bottom Sheet; track the visual
  // viewport so the sticky footer + focused field stay above the keyboard.
  const vvBox = useVisualViewportBox(showForm && isMobileMedia);

  const blankForm = useCallback(
    (): FormState => ({
      title: '',
      type: mediaKind(activeType),
      status: 'pending',
      rating: 0,
      notes: '',
      platform: '',
      poster_url: '',
      year: null as number | null,
      release_date: '',
      genre: '',
      external_id: '',
      episodes_watched: 0,
      episodes_total: 0,
      seasons_watched: 0,
      seasons_total: 0,
      season_episodes: [],
      collection_id: '',
      collection_name: '',
    }),
    [activeType],
  );

  const [form, setForm] = useState<FormState>(blankForm());
  const formIsUpcoming = hasFutureRelease(form.type, form.release_date);

  // Cached library. keepPreviousData (in useMedia) holds the current shelf
  // visible while a tab switch refetches; bookmark tabs load their own data
  // so the media query is disabled there. Status filtering happens client-
  // side (multi-select) so chip counts stay honest while filters are lit.
  const mediaParams = useMemo(() => ({ type: activeType }), [activeType]);
  const { data: items = [], isLoading: loading } = useMedia(mediaParams, !isBookmarkTab) as {
    data: MediaEntry[];
    isLoading: boolean;
  };
  const createMedia = useCreateMedia();
  const writeMedia = useSaveMedia();
  const deleteMedia = useDeleteMedia();

  // Deep-links (`/media?tab=videos` from the share flow) can land while
  // the page is already mounted — follow the param.
  useEffect(() => {
    const t = TAB_TO_TYPE[searchParams.get('tab') ?? ''];
    if (t && t !== activeType) setActiveType(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const switchType = useCallback(
    (key: string) => {
      setActiveType(key);
      setStatusFilters(new Set());
      setSearchQuery('');
      setSearchParams(key === 'movie' ? {} : { tab: TYPE_TO_TAB[key] }, { replace: true });
    },
    [setSearchParams],
  );

  const toggleStatusFilter = useCallback((status: MediaStatus) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let matched = statusFilters.size > 0 ? items.filter((i) => statusFilters.has(i.status)) : items;
    if (q) {
      matched = matched.filter(
        (i) =>
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
    const order: string[] = []; // first-seen order (after sortMedia)
    const standalone: MediaEntry[] = [];
    for (const it of filteredItems) {
      if (!it.collection_id) {
        standalone.push(it);
        continue;
      }
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
        const members = [...(groups.get(it.collection_id) || [])].sort(
          (a, b) => (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title),
        );
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

  // Throws the user-facing reason when `candidate` would duplicate a library
  // entry. `items` is the full (status-unfiltered) shelf for the active type,
  // so it doubles as the duplicate pool whenever types match.
  const assertNotDuplicate = async (candidate: FormState, selfId?: number) => {
    const pool = candidate.type === activeType ? items : await mediaApi.list({ type: candidate.type });
    const duplicate = findDuplicateMedia(pool, candidate, selfId);
    if (duplicate) {
      throw new Error(
        `${TYPE_META[candidate.type]?.label || 'Item'} already in library: ${duplicateMediaDescription(duplicate)}`,
      );
    }
  };

  // Nothing saves until Save (or Add to library); closing with changes asks twice.
  const editor = useEditorDraft({
    open: showForm,
    editing: !!(showForm && editItem),
    value: form,
    invalid: form.title.trim() ? null : 'an entry needs a title.',
    save: async (v) => {
      if (!editItem) return;
      await assertNotDuplicate(v, editItem.id);
      await writeMedia(editItem.id, mediaPayload(v));
    },
  });
  const loadDraft = editor.load;
  const closeForm = () => editor.close(() => setShowForm(false));

  const openForm = useCallback(
    (item?: MediaEntry, morph?: 'card' | 'add', sourceEl?: Element | null) => {
      const rect = sourceEl?.getBoundingClientRect();
      setMorphSource(morph ?? null);
      setMorphRect(rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined);
      setDetailsForm(false);
      if (item) {
        const loaded = mediaFormOf(item);
        setEditItem(item);
        setForm(loaded);
        loadDraft(loaded);
      } else {
        const blank = blankForm();
        setEditItem(null);
        setForm(blank);
        loadDraft(blank);
      }
      setShowForm(true);
    },
    [blankForm, loadDraft],
  );

  // `?id=` (from a tag reference) opens that entry once its shelf loads.
  const deepLinkId = Number(searchParams.get('id')) || null;
  useEffect(() => {
    if (!deepLinkId || loading) return;
    const item = items.find((m) => m.id === deepLinkId);
    if (item) openForm(item);
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, loading, items]);

  const mediaAddLabel = `Add ${(TYPE_META[activeType]?.label || 'entry').toLowerCase()}`;
  const handleAdd = useCallback(
    (sourceEl?: Element | null) => {
      if (isBookmarkTab) {
        setBookmarkAddSignal((s) => s + 1);
        return;
      }
      openForm(undefined, 'add', sourceEl);
    },
    [isBookmarkTab, openForm],
  );

  const handleExternalSelect = async (r: MediaSearchResult) => {
    // Combined movie+show search: the picked row's kind (carried in its
    // external_id) sets the form type, so picking a show from the movie
    // tab flips to 'show' and reveals the show-progress section. Books
    // keep their type (Open Library ids carry no tmdb kind).
    const kind = tmdbKindLabel(r.external_id);
    const selectedType = kind === 'Show' ? 'show' : kind === 'Movie' ? 'movie' : form.type;
    const isUpcoming = hasFutureRelease(selectedType, r.release_date);
    // Optimistic prefill from the search row.
    setForm((f) => ({
      ...f,
      title: r.title,
      type: selectedType,
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
      const detailedType = d.type;
      setForm((f) => {
        const releaseDate = d.release_date || f.release_date;
        return {
          ...f,
          // Don't clobber the title if the user already started typing.
          title: f.title || d.title,
          type: detailedType,
          status: hasFutureRelease(detailedType, releaseDate)
            ? 'upcoming'
            : f.status === 'upcoming'
              ? 'pending'
              : f.status,
          poster_url: f.poster_url || d.poster_url,
          year: f.year || (d.year ? parseInt(d.year) : null),
          release_date: releaseDate,
          genre: f.genre || d.genre,
          seasons_total: d.seasons_total || f.seasons_total,
          episodes_total: d.episodes_total || f.episodes_total,
          season_episodes: d.season_episodes && d.season_episodes.length > 0 ? d.season_episodes : f.season_episodes,
          collection_id: d.collection_id || f.collection_id,
          collection_name: d.collection_name || f.collection_name,
        };
      });
    } catch {
      // Detail fetch is a best-effort enrichment — the search row is
      // already in the form; silently fall back if TMDB hiccups.
    }
  };

  const handleSave = async () => {
    if (editItem) {
      await editor.save(() => setShowForm(false));
      return;
    }
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      try {
        await assertNotDuplicate(form);
      } catch (err) {
        toast.error(failureText(err, 'Could not check for duplicates. Try again in a moment.'));
        return;
      }
      await createMedia.mutateAsync(mediaPayload(form));
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    editor.cancel();
    await deleteMedia.mutateAsync(id);
    setShowForm(false);
  };

  const TypeIcon = TYPE_META[activeType]?.icon || Film;

  // The open item as the library has it now (quick changes refetch it).
  const liveItem = editItem ? (items.find((m) => m.id === editItem.id) ?? editItem) : null;
  const showDetail = !!liveItem && !detailsForm;
  const openDetailsForm = () => {
    if (!liveItem) return;
    const loaded = mediaFormOf(liveItem);
    setEditItem(liveItem);
    setForm(loaded);
    loadDraft(loaded);
    setDetailsForm(true);
  };
  const detailView = liveItem ? (
    <MediaDetailView
      item={liveItem}
      library={items}
      onClose={closeForm}
      onEdit={openDetailsForm}
      onOpen={(m) => openForm(m)}
      save={writeMedia}
      create={(patch) => createMedia.mutateAsync(patch)}
    />
  ) : null;

  // +1 on a row or card: the next episode, saved at once.
  const stepEpisode = useCallback(
    (item: MediaEntry) => {
      const step = nextEpisodeStep(item);
      if (!step) return;
      writeMedia(item.id, {
        episodes_watched: step.watched,
        seasons_watched: step.season,
        ...(step.complete ? { status: 'complete' as const } : {}),
      }).catch((err) => toast.error(failureText(err, 'Could not save progress')));
    },
    [writeMedia],
  );

  // Memoize shelf rendering so typing in the dialog never rerenders it. Motion
  // stays limited to disclosures; filtering and sorting update without layout
  // choreography that previously made the shelf feel unstable.
  const gridEl = useMemo(() => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <M3CookieLoader size="lg" tone="primary" />
          <span className="mono label-kicker text-xs tracking-[0.22em] text-muted-foreground">opening library…</span>
        </div>
      );
    }
    if (filteredItems.length === 0) {
      return (
        <EmptyState
          type={activeType}
          hasFilter={statusFilters.size > 0 || !!searchQuery}
          onAdd={() => openForm()}
          onClear={() => {
            setStatusFilters(new Set());
            setSearchQuery('');
          }}
        />
      );
    }
    if (viewMode === 'grid') {
      return (
        <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 min-[480px]:gap-4 md:[grid-template-columns:repeat(auto-fill,minmax(180px,1fr))] md:gap-5">
          {seriesRows.map((row) =>
            row.kind === 'single' ? (
              <PosterCard
                key={'item-' + row.item.id}
                item={row.item}
                onClick={(source) => openForm(row.item, 'card', source)}
                morphOpen={showForm && morphSource === 'card' && editItem?.id === row.item.id}
              />
            ) : (
              <SeriesPosterCard key={'series-' + row.collectionId} row={row} onOpen={() => setSeriesDialog(row)} />
            ),
          )}
        </div>
      );
    }
    if (viewMode === 'shelves') {
      return (
        <MediaShelves
          items={filteredItems}
          onPick={(item, source) => openForm(item, 'card', source)}
          openItemId={showForm && morphSource === 'card' ? (editItem?.id ?? null) : null}
        />
      );
    }
    if (viewMode === 'table') {
      return (
        <MediaTable
          items={filteredItems}
          showPlatform={activeType === 'movie'}
          onPick={(item, source) => openForm(item, 'card', source)}
          openItemId={showForm && morphSource === 'card' ? (editItem?.id ?? null) : null}
        />
      );
    }
    // List view: what's in progress as wide art cards (Up next), then the
    // rest grouped by status as rows tinted with each title's own colour.
    const statusIdx = (s: MediaStatus) => {
      const i = STATUS_OPTIONS.findIndex((o) => o.value === s);
      return i === -1 ? STATUS_OPTIONS.length : i;
    };
    const rowStatus = (row: SeriesRow): MediaStatus =>
      row.kind === 'single'
        ? row.item.status
        : row.members.reduce(
            (best, m) => (statusIdx(m.status) < statusIdx(best) ? m.status : best),
            row.members[0].status,
          );
    const upNext = seriesRows.filter(
      (row): row is Extract<SeriesRow, { kind: 'single' }> =>
        row.kind === 'single' && (row.item.status === 'in_progress' || row.item.status === 'new_season'),
    );
    const sectionMap = new Map<MediaStatus, SeriesRow[]>();
    for (const row of seriesRows) {
      if (row.kind === 'single' && upNext.includes(row)) continue;
      const s = rowStatus(row);
      if (!sectionMap.has(s)) sectionMap.set(s, []);
      sectionMap.get(s)!.push(row);
    }
    const sections = STATUS_OPTIONS.filter((s) => sectionMap.has(s.value)).map((s) => ({
      meta: s,
      rows: sectionMap.get(s.value)!,
    }));

    return (
      <div className="flex flex-col gap-6">
        {upNext.length > 0 && (
          <section aria-label="Up next">
            <ListHeader label="Up next" count={upNext.length} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {upNext.map(({ item }) => (
                <UpNextCard
                  key={item.id}
                  item={item}
                  onOpen={(source) => openForm(item, 'card', source)}
                  onPlusOne={stepEpisode}
                />
              ))}
            </div>
          </section>
        )}
        {sections.map(({ meta, rows }) => (
          <section key={meta.value} aria-label={meta.label}>
            <ListHeader label={meta.label} count={rows.length} />
            <div className="grid gap-2.5 md:grid-cols-2">
              {rows.map((row) =>
                row.kind === 'single' ? (
                  <TintRow
                    key={'item-' + row.item.id}
                    item={row.item}
                    onOpen={(source) => openForm(row.item, 'card', source)}
                    onPlusOne={
                      ['complete', 'dropped', 'scratched', 'archived'].includes(row.item.status)
                        ? undefined
                        : stepEpisode
                    }
                  />
                ) : (
                  <SeriesTintRow key={'series-' + row.collectionId} row={row} onOpen={() => setSeriesDialog(row)} />
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    );
  }, [
    loading,
    filteredItems,
    seriesRows,
    viewMode,
    statusFilters,
    searchQuery,
    activeType,
    openForm,
    stepEpisode,
    setSeriesDialog,
    editItem?.id,
    morphSource,
    showForm,
  ]);

  // ---- Add/Edit form: shared title + body + footer, hosted in a centered
  // Dialog on desktop and a full-height, keyboard-safe bottom Sheet on phones.
  const mediaFormTitle = (
    <>
      <TypeIcon className="size-5 text-muted-foreground" />
      {editItem ? 'Edit' : 'Add'} {TYPE_META[form.type]?.label || 'Entry'}
    </>
  );
  const mediaFormSubtitle = editItem ? null : 'Search a database or fill it in manually';

  // Grids collapse to one column on narrow screens so nothing shrinks
  // below a usable size; the poster shrinks 120→96px on phones.
  const mediaFormFields = (
    <>
      {/* Phones: full-width title row; the poster preview lives in the sheet
          header backdrop instead of a column (restore grid-cols-[96px_1fr]
          to bring the mobile column back). Desktop keeps the 120px poster
          column exactly as before. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_1fr] sm:gap-5">
        {/* Poster preview — desktop column */}
        <div className="hidden aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-2xl border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container))] text-muted-foreground sm:flex">
          {form.poster_url ? (
            <img src={form.poster_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="size-8 opacity-30" />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="label-kicker font-mono text-xs text-muted-foreground">
              Title <span className="text-destructive">*</span>
            </Label>
            <TitleAutocomplete
              value={form.title}
              type={form.type}
              autoFocus={!editItem}
              source={form.external_id}
              onChange={(v) =>
                setForm((f) => {
                  const changedExternalTitle = !!f.external_id && v !== f.title;
                  return {
                    ...f,
                    title: v,
                    external_id: changedExternalTitle ? '' : f.external_id,
                    release_date: changedExternalTitle ? '' : f.release_date,
                    status:
                      changedExternalTitle && (f.status === 'upcoming' || f.status === 'new_season')
                        ? 'pending'
                        : f.status,
                  };
                })
              }
              onSelect={handleExternalSelect}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldSimple label="Year">
              <YearField value={form.year} onChange={(y) => setForm({ ...form, year: y })} />
            </FieldSimple>
            <FieldSimple label="Genre">
              <Input
                value={form.genre}
                onChange={(e) => setForm({ ...form, genre: e.target.value })}
                placeholder="Action, Drama"
              />
            </FieldSimple>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="label-kicker font-mono text-xs text-muted-foreground">Rating</Label>
            <StarRating value={form.rating} interactive size="md" onChange={(v) => setForm({ ...form, rating: v })} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FieldSelect
          label="Type"
          value={form.type}
          onChange={(v) => {
            const type = mediaKind(v || 'movie');
            setForm({
              ...form,
              type,
              status: hasFutureRelease(type, form.release_date)
                ? 'upcoming'
                : form.status === 'upcoming' || form.status === 'new_season'
                  ? 'pending'
                  : form.status,
            });
          }}
          options={Object.entries(TYPE_META).map(([k, v]) => ({ value: k, label: v.label }))}
        />
        <FieldSelect
          label={formIsUpcoming ? 'Status · automatic' : 'Status'}
          value={form.status}
          onChange={(v) => setForm({ ...form, status: (v as MediaStatus) || 'pending' })}
          options={EDITABLE_STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
          disabled={formIsUpcoming}
          renderValue={(value) => <MediaStatusBadge status={value as MediaStatus} />}
          renderOption={(o) => {
            const look = STATUS_LOOK[o.value as MediaStatus];
            const Glyph = look?.icon;
            return (
              <span className="flex items-center gap-2">
                {Glyph && <Glyph className="size-4" style={{ color: look.hue }} />}
                {o.label}
              </span>
            );
          }}
        />
        <FieldSelect
          label="Platform"
          value={form.platform || 'none'}
          onChange={(v) => setForm({ ...form, platform: !v || v === 'none' ? '' : v })}
          options={[{ value: 'none', label: 'Not specified' }, ...PLATFORM_OPTIONS]}
          renderValue={(v) =>
            v && v !== 'none' ? (
              <PlatformLogo platform={v} />
            ) : (
              <span className="text-muted-foreground">Not specified</span>
            )
          }
          renderOption={(o) =>
            o.value === 'none' ? (
              <span className="text-muted-foreground">Not specified</span>
            ) : (
              <PlatformLogo platform={o.value} />
            )
          }
        />
      </div>

      {form.type === 'show' && <ShowProgressSection form={form} setForm={setForm} />}

      {form.type === 'book' && (
        <Section title="Reading progress">
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Pages read"
              value={form.episodes_watched}
              onChange={(n) => setForm({ ...form, episodes_watched: n })}
            />
            <NumberField
              label="Total pages"
              value={form.episodes_total}
              onChange={(n) => setForm({ ...form, episodes_total: n })}
            />
          </div>
          {form.episodes_total > 0 && (
            <ProgressBar
              watched={form.episodes_watched}
              total={form.episodes_total}
              label="Pages"
              itemStatus={form.status}
            />
          )}
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
        <Input
          value={form.poster_url}
          onChange={(e) => setForm({ ...form, poster_url: e.target.value })}
          placeholder="https://…"
        />
      </FieldSimple>

      <FieldSimple label="Notes">
        <Textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={3}
          placeholder="Your thoughts…"
        />
      </FieldSimple>

      {editItem && <ActivityTimeline mediaId={editItem.id} type={editItem.type} />}
    </>
  );

  const mediaFormFooter = (
    <>
      {editItem && (
        <Button variant="destructive-quiet" onClick={() => handleDelete(editItem.id)} className="mr-auto gap-1.5">
          <Trash2 className="size-3.5" /> Delete
        </Button>
      )}
      <EditActions
        draft={editor}
        onCancel={() => setShowForm(false)}
        onSave={() => void handleSave()}
        saveLabel={editItem ? 'Save' : saving ? 'Adding…' : 'Add to library'}
        disabled={saving || !form.title.trim()}
      />
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
              className="h-10 gap-2 bg-[hsl(var(--primary-container))] pr-4 pl-3.5 text-[hsl(var(--on-primary-container))] hover:brightness-[0.97]"
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
        <div className="relative flex min-w-0 flex-col gap-4">
          {/* The theme's own wash behind the top of the list view. */}
          {viewMode === 'list' && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-10 h-[520px] bg-[radial-gradient(ellipse_at_30%_20%,hsl(var(--primary-container)/0.75),hsl(var(--tertiary-container)/0.35)_50%,transparent_85%)]"
              style={{
                maskImage: 'radial-gradient(closest-side at 40% 40%, black 40%, transparent)',
                WebkitMaskImage: 'radial-gradient(closest-side at 40% 40%, black 40%, transparent)',
              }}
            />
          )}
          <section aria-label="Library controls" className="relative flex flex-col gap-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <MediaSearchField value={searchQuery} onChange={setSearchQuery} onClear={() => setSearchQuery('')} />
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

            <div className="flex flex-wrap gap-2">
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
                    status={s.value}
                  >
                    {s.label}
                  </FilterChip>
                );
              })}
            </div>
          </section>

          {/* Grid / list (memoized — see gridEl above) */}
          <div className="relative">{gridEl}</div>
        </div>
      )}

      {isMobileMedia ? (
        /* Phones: full-height bottom Sheet pinned to the visual viewport so
           the focused field + sticky footer stay above the keyboard. */
        <Sheet
          open={showForm}
          onOpenChange={(open) => (open ? setShowForm(true) : closeForm())}
          onOpenChangeComplete={(open) => {
            if (!open) setEditItem(null);
          }}
        >
          <SheetContent
            side="bottom"
            showCloseButton={false}
            style={vvBox ? { height: vvBox.height, top: vvBox.top, bottom: 'auto' } : { height: '100dvh' }}
            className="max-w-full gap-0 rounded-t-[28px] p-0"
          >
            {showDetail ? (
              <>
                <SheetTitle className="sr-only">{liveItem?.title}</SheetTitle>
                <SheetDescription className="sr-only">Media details</SheetDescription>
                {detailView}
              </>
            ) : (
              <>
                {/* EXPERIMENTAL poster header: when the entry has art, the title
                bar shows it full-bleed under a gradient scrim that resolves
                into the sheet surface — image + solid scrim, no blur/glass.
                No poster → plain header, exactly the old look. */}
                <div className="relative shrink-0 overflow-hidden">
                  {form.poster_url && (
                    <>
                      <img
                        src={form.poster_url}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 h-full w-full object-cover object-[center_22%]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--surface-container-high))] via-[hsl(var(--surface-container-high)/0.72)] to-[hsl(var(--surface-container-high)/0.18)]" />
                    </>
                  )}
                  <div className={cn('relative flex flex-col gap-1 px-5 pb-3', form.poster_url ? 'pt-20' : 'pt-5')}>
                    <SheetTitle className="flex items-center gap-2 font-serif text-xl leading-tight font-semibold tracking-tight normal-case">
                      {mediaFormTitle}
                    </SheetTitle>
                    <SheetDescription className="label-kicker mt-0 font-mono text-xs text-muted-foreground">
                      {mediaFormSubtitle}
                    </SheetDescription>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">{mediaFormFields}</div>

                <div className="flex shrink-0 items-center gap-2 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  {mediaFormFooter}
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      ) : (
        /* Desktop: morphing dialog — a clicked grid poster or the Add
           button grows into the edit surface and shrinks back on close;
           list/table/shelves opens use the scale/fade fallback. */
        <MorphingDialog
          open={showForm}
          showClose={false}
          onClose={closeForm}
          onCloseComplete={() => {
            setEditItem(null);
            setMorphSource(null);
            setMorphRect(undefined);
          }}
          sourceRect={morphRect}
          ariaLabel={typeof mediaFormTitle === 'string' ? mediaFormTitle : 'Edit media'}
          className="top-[6vh] right-0 left-0 mx-auto max-h-[88vh] w-[min(48rem,92vw)]"
        >
          {showDetail ? (
            detailView
          ) : (
            <>
              <div className="shrink-0 px-6 pt-6 pb-4">
                <div className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight">
                  {mediaFormTitle}
                </div>
                <p className="label-kicker mt-0.5 font-mono text-xs text-muted-foreground">{mediaFormSubtitle}</p>
              </div>

              <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">{mediaFormFields}</div>

              <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4">{mediaFormFooter}</div>
            </>
          )}
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
          className="fixed right-4 z-40 bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))] hover:bg-[hsl(var(--primary-container))] hover:brightness-[0.97] md:hidden"
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
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter library..."
        className="h-12 w-full rounded-[28px] border-transparent bg-[hsl(var(--surface-container-high))] pr-11 pl-12 transition-[background-color,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:border-transparent hover:bg-[hsl(var(--surface-container-highest))] focus-visible:rounded-[28px] focus-visible:bg-[hsl(var(--surface-container-highest))] focus-visible:pr-11 focus-visible:pl-12"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
      <div className="hidden shrink-0 items-center gap-2 lg:flex">
        <div className="w-[190px] min-w-0">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)} items={SORT_OPTIONS}>
            <SelectTrigger
              size="sm"
              className="h-10 w-full min-w-0 gap-2 rounded-full border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container))] text-xs"
            >
              <ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false} sideOffset={6}>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
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

      <div className="relative shrink-0 lg:hidden">
        <button
          type="button"
          className="inline-flex size-12 items-center justify-center rounded-[22px] bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] shadow-none transition-[background-color,box-shadow,transform,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] outline-none hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
          aria-label="Library controls"
          aria-expanded={compactOpen}
          title={currentSort}
          onClick={() => setCompactOpen((v) => !v)}
        >
          <Settings className="size-4" />
        </button>
        {compactOpen && (
          <div className="absolute top-[calc(100%+0.5rem)] right-0 z-40 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-high))] p-1.5 shadow-[var(--m3-elev-2)]">
            <div className="label-kicker px-3 py-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground">
              Sort
            </div>
            {SORT_OPTIONS.map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => {
                  setSortBy(o.value);
                  setCompactOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[hsl(var(--on-surface)/0.08)]',
                  o.value === sortBy &&
                    'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]',
                )}
              >
                <ArrowUpDown className="size-3.5 opacity-75" />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.value === sortBy && <CheckIconCircle />}
              </button>
            ))}
            <div className="mx-1.5 my-1.5 h-px bg-border/50" />
            <div className="label-kicker px-3 py-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground">
              View
            </div>
            {viewOptions.map((o) => {
              const Icon = o.icon;
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => {
                    setViewMode(o.value);
                    setCompactOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[hsl(var(--on-surface)/0.08)]',
                    o.value === viewMode &&
                      'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]',
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
                  onClick={() => {
                    setGroupSeries((v) => !v);
                    setCompactOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[hsl(var(--on-surface)/0.08)]"
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

function FilterChip({
  active,
  onClick,
  children,
  count,
  status,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count: number;
  status?: MediaStatus;
}) {
  const look = status ? STATUS_LOOK[status] : null;
  return (
    <HuePill selected={active} onClick={onClick} count={count} icon={look?.icon ?? ListChecks} hue={look?.hue}>
      {children}
    </HuePill>
  );
}

function CheckIconCircle() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function FieldSimple({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="label-kicker font-mono text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
  renderValue,
  renderOption,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  renderValue?: (v: string) => React.ReactNode;
  renderOption?: (o: { value: string; label: string }) => React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="label-kicker font-mono text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')} disabled={disabled}>
        <SelectTrigger className="h-9 text-sm" aria-label={disabled ? `${label}: ${value}` : undefined}>
          <SelectValue>{renderValue ? renderValue(value) : options.find((o) => o.value === value)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {renderOption ? renderOption(o) : o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-card p-3">
      <h4 className="label-kicker font-mono text-xs text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function EmptyState({
  type,
  hasFilter,
  onAdd,
  onClear,
}: {
  type: string;
  hasFilter: boolean;
  onAdd: () => void;
  onClear: () => void;
}) {
  const meta = TYPE_META[type];
  const Icon = meta?.icon || Film;
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
      <Icon className="mb-3 size-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        {hasFilter
          ? `No ${meta?.plural.toLowerCase()} match the current filter.`
          : `No ${meta?.plural.toLowerCase()} tracked yet.`}
      </p>
      <div className="mt-4 flex gap-2">
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

function PosterCard({
  item,
  onClick,
  morphOpen = false,
}: {
  item: MediaEntry;
  onClick: (source: HTMLElement) => void;
  morphOpen?: boolean;
}) {
  const statusDisplay = mediaStatusDisplay(item);
  const Icon = TYPE_META[item.type]?.icon || Film;
  const showProgress = item.episodes_total > 0;

  // morphOpen: this item's edit dialog is up. The poster UNMOUNTS its
  // layoutId element (empty slot keeps the grid steady) so framer does a
  // clean unmount→mount handoff — with both mounted, the open morph
  // silently no-ops. Close remounts it and the dialog shrinks back in.
  if (morphOpen) {
    return (
      <button className="group flex w-full flex-col gap-2 text-left" title={item.title} aria-hidden>
        <div className="relative aspect-[2/3] w-full rounded-2xl bg-[hsl(var(--surface-container)/0.5)]" />
        <div className="flex flex-col px-0.5 opacity-40">
          <div className="line-clamp-2 text-sm leading-snug font-medium">{item.title}</div>
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
      className="group flex w-full flex-col gap-2 text-left"
      title={item.title}
    >
      <div
        data-media-morph-source
        className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container))] transition-shadow group-hover:shadow-[var(--m3-elev-2)]"
      >
        {item.poster_url ? (
          <img src={item.poster_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-muted-foreground">
            <Icon className="size-7 opacity-40" />
            <span className="line-clamp-3 text-center font-serif text-sm leading-tight opacity-80">{item.title}</span>
          </div>
        )}

        {/* Status as a solid badge in its colour; sentence case keeps every
            status inside a 2-col phone grid tile without truncating. */}
        {item.status !== 'pending' && (
          <div className="absolute top-2 left-2 max-w-[calc(100%-1rem)]">
            <MediaStatusBadge
              status={isUpcomingRelease(item) ? 'upcoming' : item.status}
              label={statusDisplay.shortLabel}
              title={statusDisplay.label}
              className="shadow-sm"
            />
          </div>
        )}

        {/* Rating */}
        {item.rating ? (
          <div className="absolute top-2 right-2 inline-flex items-center gap-0.5 bg-background px-1.5 py-0.5 font-mono text-xs shadow-sm ring-1 ring-foreground/5">
            <Star className="size-2.5 fill-amber-400 text-amber-400" />
            <span>{item.rating}</span>
          </div>
        ) : null}

        {/* Segmented progress overlay — bottom strip.
            Shows for all shows/books regardless of complete status:
            complete = all green, dropped = red/muted, etc. */}
        {showProgress && (
          <div className="absolute inset-x-0 bottom-0">
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
        <div className="line-clamp-2 text-sm leading-snug font-medium transition-colors group-hover:text-primary">
          {item.title}
        </div>
        {/* Both meta rows keep a fixed line height even when empty so
            neighbouring tiles in a grid row don't ripple vertically. */}
        <div className="mt-0.5 flex min-h-4 items-center gap-1.5 font-mono text-xs text-muted-foreground">
          {item.year && <span>{item.year}</span>}
          {item.platform && (
            <>
              {item.year && <span className="opacity-50">·</span>}
              <PlatformLogo platform={item.platform} className="truncate" />
            </>
          )}
        </div>
      </div>
    </button>
  );
}

// MediaThumb — small thumbnail used in the design's list view. Uses the
// real poster when available, otherwise an index-derived gradient panel
// matching the redesign aesthetic.
function MediaThumb({
  item,
  index,
  variant = 'sm',
  className,
}: {
  item: MediaEntry;
  index: number;
  variant?: 'sm' | 'card';
  className?: string;
}) {
  const sizeClass = variant === 'card' ? 'w-[52px] h-[76px] rounded-xl' : 'w-12 h-[66px] rounded-lg';
  const classes = cn(sizeClass, 'shrink-0 object-cover ring-1 ring-border/60', className);
  if (item.poster_url) {
    return <img data-media-morph-source src={item.poster_url} alt="" loading="lazy" className={classes} />;
  }
  const a = (index % 5) + 1;
  const b = ((index + 2) % 5) + 1;
  return (
    <div
      data-media-morph-source
      className={cn(sizeClass, 'shrink-0 ring-1 ring-border/60', className)}
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
  const byDateDesc = (key: 'created_at' | 'updated_at' | 'last_completed_at') => (a: MediaEntry, b: MediaEntry) => {
    const ax = a[key] || '';
    const bx = b[key] || '';
    if (!ax && !bx) return 0;
    if (!ax) return 1;
    if (!bx) return -1;
    return bx.localeCompare(ax);
  };
  // Helper: ascending date — empty pushes to end.
  const byDateAsc = (key: 'created_at' | 'updated_at' | 'last_completed_at') => (a: MediaEntry, b: MediaEntry) => {
    const ax = a[key] || '';
    const bx = b[key] || '';
    if (!ax && !bx) return 0;
    if (!ax) return 1;
    if (!bx) return -1;
    return ax.localeCompare(bx);
  };
  const out = [...items];
  switch (by) {
    case 'updated_desc':
      out.sort(byDateDesc('updated_at'));
      break;
    case 'added_desc':
      out.sort(byDateDesc('created_at'));
      break;
    case 'added_asc':
      out.sort(byDateAsc('created_at'));
      break;
    case 'completed_desc':
      out.sort(byDateDesc('last_completed_at'));
      break;
    case 'rating_desc':
      out.sort((a, b) => (b.rating || 0) - (a.rating || 0) || byDateDesc('updated_at')(a, b));
      break;
    case 'year_desc':
      out.sort((a, b) => (b.year || 0) - (a.year || 0) || cmpStr(a.title, b.title));
      break;
    case 'year_asc':
      out.sort((a, b) => (a.year || 9999) - (b.year || 9999) || cmpStr(a.title, b.title));
      break;
    case 'title_asc':
      out.sort((a, b) => cmpStr(a.title, b.title));
      break;
    case 'status':
      out.sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99) || cmpStr(a.title, b.title));
      break;
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

function chipClassFor(status: MediaStatus): string {
  switch (status) {
    case 'in_progress':
      return 'chip-amber';
    case 'new_season':
      return 'chip-sky';
    case 'complete':
      return 'chip-olive'; // green — done
    case 'waiting':
      return 'chip-sky'; // slate — on hold
    case 'dropped':
    case 'scratched':
      return 'chip-rose';
    case 'upcoming':
      return 'chip-upcoming';
    default:
      return '';
  }
}

// MediaListRow — dense single-entry list row. One tight flex line:
// thumb · (title + meta + optional thin progress) · (status chip + age).
// The old three-column grid reserved a wide right column that read as
// empty space; everything now hugs the content.
/** A show's episode count (seasons summed when known). */
function totalEpisodes(item: MediaEntry): number {
  return item.season_episodes?.length ? item.season_episodes.reduce((a, b) => a + b, 0) : item.episodes_total;
}

/** The season (1-based) holding episode number `episode` (1-based). */
function seasonOfEpisode(seasons: number[], episode: number): number {
  let seen = 0;
  for (let i = 0; i < seasons.length; i++) {
    seen += seasons[i];
    if (episode <= seen) return i + 1;
  }
  return Math.max(1, seasons.length);
}

/** "Next: S5 E13", "Next: episode 89", "All 153 episodes"; null when not a show with episodes. */
function nextEpisodeLabel(item: MediaEntry): string | null {
  const total = totalEpisodes(item);
  if (item.type !== 'show' || total <= 0) return null;
  if (item.episodes_watched >= total) return `All ${total} episodes`;
  const next = item.episodes_watched + 1;
  if (!item.season_episodes?.length) return `Next: episode ${next}`;
  const season = seasonOfEpisode(item.season_episodes, next);
  const before = item.season_episodes.slice(0, season - 1).reduce((a, b) => a + b, 0);
  return `Next: S${season} E${next - before}`;
}

/** The +1 step: episodes watched after it, its season, and whether that finishes the show. */
function nextEpisodeStep(item: MediaEntry): { watched: number; season: number; complete: boolean } | null {
  const total = totalEpisodes(item);
  if (item.type !== 'show' || total <= 0 || item.episodes_watched >= total) return null;
  const next = item.episodes_watched + 1;
  const season = item.season_episodes?.length ? seasonOfEpisode(item.season_episodes, next) : item.seasons_watched;
  return { watched: next, season, complete: next >= total };
}

function mediaMeta(item: MediaEntry): string {
  const genres = item.genre
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(', ');
  return [item.year ? String(item.year) : '', genres].filter(Boolean).join(', ');
}

function ListHeader({ label, count }: { label: string; count: number }) {
  return (
    <h3 className="serif mb-2.5 px-0.5 text-sm font-semibold tracking-tight">
      {label} <span className="mono text-xs font-normal text-muted-foreground">({count})</span>
    </h3>
  );
}

function PlusOneButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Watched one more episode"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'grid shrink-0 place-items-center font-bold transition-transform active:scale-95 motion-reduce:transition-none',
        className,
      )}
    >
      +1
    </button>
  );
}

// Up next: a wide art card, progress along its bottom edge, +1 at hand.
function UpNextCard({
  item,
  onOpen,
  onPlusOne,
}: {
  item: MediaEntry;
  onOpen: (source: HTMLElement) => void;
  onPlusOne: (item: MediaEntry) => void;
}) {
  const total = totalEpisodes(item);
  const label = nextEpisodeLabel(item);
  const left = total - item.episodes_watched;
  const sub = label
    ? left > 0
      ? `${label}, ${left} to go`
      : label
    : item.status === 'new_season'
      ? 'New season out'
      : item.type === 'book'
        ? 'Reading'
        : 'Watching';
  const step = nextEpisodeStep(item);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onOpen(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(e.currentTarget);
        }
      }}
      data-media-morph-source
      style={titleToneVars(item.poster_color)}
      className={cn(
        'group relative h-[190px] cursor-pointer overflow-hidden rounded-[26px] text-white outline-none focus-visible:ring-2 focus-visible:ring-ring',
        tt.accentBg,
      )}
    >
      {item.poster_url && (
        <img
          src={item.poster_url}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-[center_20%] transition-transform duration-500 ease-[var(--motion-ease-out)] group-hover:scale-[1.03] motion-reduce:transition-none"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <div className="absolute inset-x-4 bottom-4 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <div className="serif line-clamp-2 text-xl leading-tight font-semibold">{item.title}</div>
          <div className="mt-0.5 truncate text-xs text-white/85">{sub}</div>
        </div>
        {step && (
          <PlusOneButton
            onClick={() => onPlusOne(item)}
            className="size-12 rounded-2xl bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]"
          />
        )}
      </div>
      {total > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-[5px] bg-white/20">
          <div
            className="h-full bg-[hsl(var(--primary-container))]"
            style={{ width: `${Math.min(100, (item.episodes_watched / total) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// Every other title: a row in its own poster's colour.
function TintRow({
  item,
  onOpen,
  onPlusOne,
}: {
  item: MediaEntry;
  onOpen: (source: HTMLElement) => void;
  onPlusOne?: (item: MediaEntry) => void;
}) {
  const line =
    item.status === 'upcoming' && item.release_date
      ? `Releases ${formatReleaseDate(item.release_date)}`
      : nextEpisodeLabel(item);
  const step = onPlusOne ? nextEpisodeStep(item) : null;
  const meta = mediaMeta(item);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onOpen(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(e.currentTarget);
        }
      }}
      style={titleToneVars(item.poster_color)}
      className={cn(
        'flex cursor-pointer items-center gap-3.5 rounded-[22px] py-2.5 pr-3.5 pl-2.5 transition-[filter] outline-none hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-ring dark:hover:brightness-110',
        tt.container,
        tt.onContainer,
      )}
    >
      <div data-media-morph-source className="h-[75px] w-[50px] shrink-0 overflow-hidden rounded-[11px] bg-black/5">
        {item.poster_url && <img src={item.poster_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="serif line-clamp-2 text-[15.5px] leading-snug font-semibold">{item.title}</div>
        {meta && <div className="truncate text-xs opacity-70">{meta}</div>}
        {(line || !!item.rating) && (
          <div className="mt-0.5 flex items-center gap-2 text-xs font-semibold">
            {line && <span>{line}</span>}
            {item.rating ? <StarRating value={item.rating} /> : null}
          </div>
        )}
      </div>
      {step && onPlusOne && (
        <PlusOneButton
          onClick={() => onPlusOne(item)}
          className={cn('size-11 rounded-[14px]', tt.accentBg, tt.onAccent)}
        />
      )}
    </div>
  );
}

function SeriesTintRow({ row, onOpen }: { row: Extract<SeriesRow, { kind: 'series' }>; onOpen: () => void }) {
  const watched = row.members.filter((m) => m.status === 'complete').length;
  const shown = row.members.slice(0, 3);
  return (
    <button
      type="button"
      onClick={onOpen}
      style={titleToneVars(row.members[0]?.poster_color)}
      className={cn(
        'flex items-center gap-3.5 rounded-[22px] py-2.5 pr-3.5 pl-2.5 text-left transition-[filter] hover:brightness-[0.98] dark:hover:brightness-110',
        tt.container,
        tt.onContainer,
      )}
    >
      <div className="relative h-[75px] shrink-0" style={{ width: 50 + (shown.length - 1) * 12 }}>
        {shown
          .slice()
          .reverse()
          .map((m, i) => (
            <div
              key={m.id}
              className="absolute top-0 h-[75px] w-[50px] overflow-hidden rounded-[11px] bg-black/5 shadow-sm"
              style={{ left: (shown.length - 1 - i) * 12 }}
            >
              {m.poster_url && <img src={m.poster_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
            </div>
          ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="serif line-clamp-2 text-[15.5px] leading-snug font-semibold">{row.collectionName}</div>
        <div className="text-xs font-semibold">
          {watched} of {row.members.length} watched
        </div>
      </div>
    </button>
  );
}

// ─── Shelves view — horizontal poster rows grouped by status ────────────
// Streaming-app scan pattern: each lifecycle bucket gets its own shelf so
// "what am I watching" and "what's queued" separate at a glance. Series
// grouping is intentionally ignored here; every entry stands alone.
function MediaShelves({
  items,
  onPick,
  openItemId = null,
}: {
  items: MediaEntry[];
  onPick: (item: MediaEntry, source: HTMLElement) => void;
  openItemId?: number | null;
}) {
  const shelves = useMemo(() => {
    const buckets = new Map<MediaStatus, MediaEntry[]>();
    for (const it of items) {
      if (!buckets.has(it.status)) buckets.set(it.status, []);
      buckets.get(it.status)!.push(it);
    }
    return STATUS_OPTIONS.filter((s) => buckets.has(s.value)).map((s) => ({ meta: s, items: buckets.get(s.value)! }));
  }, [items]);

  return (
    <div className="flex flex-col gap-6">
      {shelves.map(({ meta, items: shelfItems }) => (
        <section key={meta.value} aria-label={meta.label}>
          <header className="mb-2.5 px-0.5">
            <h3 className="serif text-sm font-semibold tracking-tight">
              {meta.label} <span className="mono text-xs font-normal text-muted-foreground">({shelfItems.length})</span>
            </h3>
          </header>
          <div className="no-scrollbar -mx-1 flex snap-x snap-proximity gap-3 overflow-x-auto px-1 pb-1">
            {shelfItems.map((item) => (
              <div key={item.id} className="w-[124px] shrink-0 snap-start sm:w-[148px]">
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
function MediaTable({
  items,
  showPlatform,
  onPick,
  openItemId: _openItemId = null,
}: {
  items: MediaEntry[];
  showPlatform: boolean;
  onPick: (item: MediaEntry, source: HTMLElement) => void;
  openItemId?: number | null;
}) {
  return (
    <div className="overflow-x-auto rounded-[20px] bg-card">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="mono label-kicker text-left text-xs text-muted-foreground">
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="w-16 px-3 py-3 font-medium">Year</th>
            <th className="w-32 px-3 py-3 font-medium">Status</th>
            <th className="w-16 px-3 py-3 font-medium">Rating</th>
            <th className={cn('px-3 py-3 font-medium', showPlatform ? 'w-36' : 'w-24')}>
              {showPlatform ? 'Platform' : 'Progress'}
            </th>
            <th className="w-28 px-3 py-3 pr-4 text-right font-medium">Updated</th>
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
                    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                      <img
                        src={item.poster_url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full scale-125 object-cover opacity-[0.26] blur-lg saturate-150 transition-opacity duration-300 group-hover:opacity-[0.4] dark:opacity-[0.36] dark:group-hover:opacity-[0.5]"
                        style={{
                          maskImage: 'linear-gradient(to right, black 40%, transparent 98%)',
                          WebkitMaskImage: 'linear-gradient(to right, black 40%, transparent 98%)',
                        }}
                      />
                    </span>
                  )}
                  <span className="relative flex min-w-0 items-center gap-2.5">
                    <MediaThumb item={item} index={idx} variant="sm" className="!h-10 !w-7 !rounded" />
                    <span className="serif max-w-[18rem] truncate font-medium">{item.title || 'Untitled'}</span>
                  </span>
                </td>
                <td className="mono px-3 py-2 text-xs text-muted-foreground tabular-nums">{item.year || '–'}</td>
                <td className="px-3 py-2">
                  <MediaStatusBadge
                    status={isUpcomingRelease(item) ? 'upcoming' : item.status}
                    label={statusDisplay.shortLabel}
                    title={statusDisplay.label}
                  />
                </td>
                <td className="px-3 py-2">
                  {item.rating ? (
                    <span className="inline-flex items-center gap-0.5 text-xs text-secondary">
                      <Star className="size-3 fill-current" />
                      <span className="tabular-nums">{item.rating}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">–</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {showPlatform ? (
                    item.platform ? (
                      <PlatformLogo platform={item.platform} iconClassName="size-[15px]" />
                    ) : (
                      <span className="text-muted-foreground/50">–</span>
                    )
                  ) : (
                    <span className="mono tabular-nums">{pct !== null ? `${pct}%` : '–'}</span>
                  )}
                </td>
                <td className="mono px-3 py-2 pr-4 text-right text-xs whitespace-nowrap text-muted-foreground">
                  {item.updated_at ? relativeTiny(item.updated_at) : '–'}
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

function SeriesPosterCard({ row, onOpen }: { row: Extract<SeriesRow, { kind: 'series' }>; onOpen: () => void }) {
  const cover = row.members[0];
  const watched = row.members.filter((m) => m.status === 'complete').length;
  const upcoming = nextUpcomingMember(row.members);
  const upcomingDate = upcoming ? formatReleaseDate(upcoming.release_date) : '';
  return (
    <button
      onClick={onOpen}
      className="group relative flex w-full flex-col gap-2 text-left"
      title={`${row.collectionName}, ${watched}/${row.members.length} watched`}
    >
      {/* Identical size to PosterCard — aspect-[2/3] wrapper, real poster
          fills it edge-to-edge. The stacked-card depth shadow is desktop-
          only; on mobile the offsets visually shrink the poster relative
          to single-movie tiles, so the series card matches PosterCard's
          plain border on small screens. */}
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-[hsl(var(--surface-container))] transition-shadow group-hover:shadow-[var(--m3-elev-2)] sm:border-0 sm:shadow-[4px_4px_0_-1px_hsl(var(--outline-variant)),8px_8px_0_-2px_hsl(var(--outline-variant)/0.55)]">
        {cover.poster_url ? (
          <img src={cover.poster_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-muted-foreground">
            <Film className="size-7 opacity-40" />
            <span className="line-clamp-3 text-center font-serif text-sm leading-tight opacity-80">
              {row.collectionName}
            </span>
          </div>
        )}
        <span className="chip chip-sage absolute top-2 left-2 h-6 px-2.5 text-xs">
          <Film className="size-3" /> Series
        </span>
        {upcoming && (
          <span
            className="chip chip-upcoming absolute top-2 right-2 h-6 max-w-[calc(100%-5.75rem)] px-2.5 text-xs"
            title={`Upcoming ${upcomingDate}`}
          >
            <span className="truncate">Upcoming</span>
          </span>
        )}
        <span className="mono absolute right-2 bottom-2 rounded-full bg-[hsl(var(--inverse-surface))] px-2 py-0.5 text-xs text-[hsl(var(--inverse-on-surface))]">
          {watched}/{row.members.length}
        </span>
      </div>
      <div className="mt-2 px-0.5">
        <div className="line-clamp-2 text-sm leading-snug font-medium">{row.collectionName}</div>
        {/* Two meta rows to mirror PosterCard's block, so series tiles and
            movie tiles keep the same text-zone height in a grid row. */}
        <div className="mono mt-0.5 min-h-4 truncate text-xs text-muted-foreground">{row.members.length} movies</div>
        <div className="mono mt-0.5 min-h-4 truncate text-xs text-muted-foreground">
          {upcomingDate ? `Next ${upcomingDate}` : ''}
        </div>
      </div>
    </button>
  );
}

function SeriesDialog({
  row,
  onClose,
  onPickItem,
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="flex shrink-0 flex-row items-center gap-4 p-5">
          {cover.poster_url ? (
            <img
              src={cover.poster_url}
              alt=""
              className="h-[68px] w-12 shrink-0 rounded object-cover ring-1 ring-border/60"
            />
          ) : (
            <div className="h-[68px] w-12 shrink-0 rounded bg-muted" />
          )}
          <div className="min-w-0 flex-1 text-left">
            <DialogTitle className="serif truncate text-lg font-medium">{row.collectionName}</DialogTitle>
            <div className="mono mt-0.5 text-xs text-muted-foreground">
              {row.members.length} movies · {watched}/{row.members.length} watched
              {upcomingDate ? ` · upcoming ${upcomingDate}` : ''}
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
                onClick={() => {
                  onPickItem(m);
                  onClose();
                }}
                className={`m3-state flex w-full items-center gap-3 px-5 py-3 text-left transition-colors ${mi === 0 ? '' : 'border-t border-border/40'}`}
              >
                <span className="mono w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {mi + 1}
                </span>
                <MediaThumb item={m} index={mi} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <div className="truncate text-[14px] font-medium">{m.title}</div>
                    {m.year ? <span className="mono text-xs text-muted-foreground">{m.year}</span> : null}
                  </div>
                  <div className="mono mt-0.5 truncate text-xs text-muted-foreground">{watchAgeLabel(m)}</div>
                </div>
                <MediaStatusBadge
                  status={isUpcomingRelease(m) ? 'upcoming' : m.status}
                  label={statusDisplay.label}
                  title={statusDisplay.label}
                  className="max-w-[11rem] shrink-0"
                />
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
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
    mediaApi
      .events(mediaId)
      .then((rows) => {
        if (!cancel) setEvents(rows);
      })
      .catch(() => {
        if (!cancel) setEvents([]);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [mediaId]);

  return (
    <Section title="Activity">
      {loading && (
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <M3CookieLoader size="sm" tone="secondary" /> Loading…
        </div>
      )}
      {!loading && events && events.length === 0 && (
        <div className="text-xs text-muted-foreground">No events yet. They're recorded as you update progress.</div>
      )}
      {!loading && events && events.length > 0 && (
        <ol className="relative ml-2 flex flex-col gap-3 border-l border-border/60 pl-4 text-sm">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span
                className="absolute top-[6px] -left-[21px] size-2 rounded-full"
                style={{ background: dotColorFor(e.kind) }}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium">{eventLabel(e, type)}</span>
                  {eventSublabel(e) && (
                    <span className="mono ml-1.5 text-xs text-muted-foreground">{eventSublabel(e)}</span>
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
    case 'completed':
      return 'hsl(var(--primary))';
    case 'started':
      return 'hsl(var(--secondary))';
    case 'progress':
      return 'hsl(var(--secondary) / 0.6)';
    case 'released':
      return 'hsl(var(--tertiary))';
    case 'new_season':
      return 'hsl(var(--secondary))';
    case 'dropped':
      return 'hsl(var(--destructive))';
    case 'rating':
      return 'hsl(var(--secondary))';
    default:
      return 'hsl(var(--muted-foreground) / 0.6)';
  }
}

function eventLabel(e: MediaEventRow, type: MediaKind): string {
  const verb = type === 'book' ? 'reading' : 'watching';
  switch (e.kind) {
    case 'added':
      return 'Added to library';
    case 'started':
      return `Started ${verb}`;
    case 'progress': {
      const n = watchedInRun(e);
      return type === 'show' && n > 0 ? `Watched ${n} episode${n === 1 ? '' : 's'}` : 'Progress';
    }
    case 'released':
      return 'Released · moved to Pending';
    case 'new_season':
      return 'New season detected';
    case 'completed':
      return 'Completed';
    case 'dropped':
      return 'Dropped';
    case 'rating':
      return `Rated ${e.meta.rating ?? '?'}/5`;
    default:
      return e.kind;
  }
}

/** Episodes a merged progress entry covers, when it records where it started. */
function watchedInRun(e: MediaEventRow): number {
  const { from_episodes_watched: from, episodes_watched: at } = e.meta || {};
  return typeof from === 'number' && typeof at === 'number' ? at - from : 0;
}

function eventSublabel(e: MediaEventRow): string {
  // For shows: "S2 · E6 (16/100 episodes)". For books: "p. 184/280".
  const m = e.meta || {};
  const parts: string[] = [];
  if (e.kind === 'new_season' && typeof m.old_seasons === 'number' && typeof m.new_seasons === 'number') {
    parts.push(`${m.old_seasons} → ${m.new_seasons} seasons`);
  }
  if (typeof m.season === 'number' && m.season > 0) {
    const at = `S${m.season}` + (typeof m.episode === 'number' && m.episode > 0 ? ` · E${m.episode}` : '');
    const from = m.from_season && m.from_episode ? `S${m.from_season} · E${m.from_episode}` : null;
    parts.push(from && from !== at ? `${from} → ${at}` : at);
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
    return ageDays < 7 ? formatDistanceToNow(d, { addSuffix: true }) : format(d, 'MMM d, yyyy');
  } catch {
    return iso;
  }
}

function NumberField({
  label,
  value,
  min = 0,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  return (
    <FieldSimple label={label}>
      <IntInput min={min} max={max} value={value || 0} onChange={onChange} />
    </FieldSimple>
  );
}

function YearField({ value, onChange }: { value: number | null; onChange: (y: number | null) => void }) {
  const [draft, setDraft] = useState(value ? String(value) : '');
  useEffect(() => {
    setDraft(value ? String(value) : '');
  }, [value]);
  return (
    <Input
      type="number"
      inputMode="numeric"
      value={draft}
      placeholder="2024"
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (next === '') {
          onChange(null);
          return;
        }
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
function ShowProgressSection({ form, setForm }: { form: FormState; setForm: (next: FormState) => void }) {
  const knownSeasons = form.season_episodes.length > 0;
  const totalSeasons = knownSeasons ? form.season_episodes.length : form.seasons_total;
  const totalEpisodes = knownSeasons ? form.season_episodes.reduce((s, n) => s + n, 0) : form.episodes_total;

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

  const currentEpisode = knownSeasons ? Math.max(0, form.episodes_watched - episodesBefore) : form.episodes_watched;

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
          <div className="label-kicker font-mono text-xs text-muted-foreground">
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
            <ProgressBar
              watched={form.episodes_watched}
              total={totalEpisodes}
              label="Episodes"
              itemStatus={form.status}
            />
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
            <ProgressBar
              watched={form.episodes_watched}
              total={form.episodes_total}
              label="Episodes"
              itemStatus={form.status}
            />
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
  collectionId,
  collectionName,
  currentExternalID,
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
    return () => {
      cancel = true;
    };
  }, [open, collectionId, parts]);

  return (
    <Section title="Series">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip chip-sage">
          <Film className="size-3" /> {collectionName || 'Movie series'}
        </span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-primary hover:underline">
          {open ? 'Hide' : 'Show'} parts
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded-md border border-border/60 bg-background/40">
          {loading && (
            <div className="inline-flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <M3CookieLoader size="sm" tone="secondary" /> Loading collection…
            </div>
          )}
          {!loading && error && <div className="p-3 text-xs text-destructive">{error}</div>}
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
                    <span className="mono w-5 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    {p.poster_url ? (
                      <img src={p.poster_url} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-10 w-7 shrink-0 rounded bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className={`truncate ${isCurrent ? 'font-medium' : ''}`}>{p.title}</div>
                      <div className="font-mono text-xs text-muted-foreground">{releaseLabel || p.year}</div>
                    </div>
                    {upcoming && (
                      <span
                        className="chip chip-upcoming text-xs"
                        title={releaseLabel ? `Upcoming ${releaseLabel}` : 'Upcoming'}
                      >
                        Upcoming
                      </span>
                    )}
                    {isCurrent && <span className="chip chip-amber text-xs">This movie</span>}
                    {!isCurrent && owned && <span className="chip chip-sage text-xs">In library</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {mine && parts && (
        <div className="mt-1 text-xs text-muted-foreground">
          {mine.length} of {parts.length} in your library
        </div>
      )}
    </Section>
  );
}

// ─── An item, opened ─────────────────────────────────────────────────────
// The cover hero, then what changes most (the next episode, status, stars,
// where you watch), the story, the series and notes. Taps save at once
// (status offers Undo); title, year, genre and poster sit behind Edit
// details (the form). Coloured with the title's own tones. Same as Android.
const MAIN_STATUSES: MediaStatus[] = ['pending', 'in_progress', 'complete'];

function MediaDetailView({
  item,
  library,
  onClose,
  onEdit,
  onOpen,
  save,
  create,
}: {
  item: MediaEntry;
  library: MediaEntry[];
  onClose: () => void;
  onEdit: () => void;
  onOpen: (item: MediaEntry) => void;
  save: (id: number, patch: MediaPatch) => Promise<void>;
  create: (patch: MediaPatch) => Promise<unknown>;
}) {
  // Taps show at once; the server's copy replaces them when it lands.
  const [over, setOver] = useState<MediaPatch>({});
  const [seenAt, setSeenAt] = useState(item.updated_at);
  if (seenAt !== item.updated_at) {
    setSeenAt(item.updated_at);
    setOver({});
  }
  const shown = { ...item, ...over } as MediaEntry;
  const [preview, setPreview] = useState<CollectionPart | null>(null);
  const details = useQuery({
    queryKey: ['media-details', item.external_id],
    queryFn: () => mediaApi.details(item.external_id),
    enabled: item.external_id.startsWith('tmdb:'),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const collection = useQuery({
    queryKey: ['media-collection', item.collection_id],
    queryFn: () => mediaApi.collection(item.collection_id),
    enabled: !!item.collection_id,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const apply = (patch: MediaPatch) => {
    setOver((o) => ({ ...o, ...patch }));
    save(item.id, patch).catch((err) => {
      setOver({});
      toast.error(failureText(err, 'Could not save'));
    });
  };
  const setStatus = (next: MediaStatus) => {
    const before = shown.status;
    if (next === before) return;
    apply({ status: next });
    toast(`Marked ${statusMeta(next)?.label ?? next}`, {
      id: 'media-status',
      action: { label: 'Undo', onClick: () => apply({ status: before }) },
    });
  };

  if (preview) {
    return (
      <SeriesPartPreview
        part={preview}
        seriesName={item.collection_name}
        onBack={() => setPreview(null)}
        onAdd={async (status) => {
          const d = await mediaApi.details(preview.external_id).catch(() => null);
          await create({
            title: preview.title,
            type: 'movie',
            status,
            poster_url: preview.poster_url || d?.poster_url || '',
            year: preview.year ? parseInt(preview.year) : null,
            release_date: preview.release_date || d?.release_date || '',
            genre: d?.genre ?? '',
            external_id: preview.external_id,
            collection_id: item.collection_id,
            collection_name: item.collection_name,
          });
          toast.success(`Added ${preview.title}`);
          setPreview(null);
        }}
      />
    );
  }

  const total = totalEpisodes(shown);
  const step = nextEpisodeStep(shown);
  const upcoming = hasFutureRelease(shown.type, shown.release_date);
  const overview = details.data?.overview ?? '';
  const parts = collection.data?.parts ?? [];
  const meta = [shown.year ? String(shown.year) : '', shown.genre].filter(Boolean).join(', ');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" style={titleToneVars(item.poster_color)}>
      <MediaHero
        posterUrl={shown.poster_url}
        title={shown.title}
        lines={[
          meta,
          shown.platform ? platformLabel(shown.platform) : '',
          upcoming && shown.release_date ? `Releases ${formatReleaseDate(shown.release_date)}` : '',
        ]}
        leading={<HeroButton label="Close" onClick={onClose} icon={<X className="size-4" />} />}
        trailing={<HeroButton label="Edit details" onClick={onEdit} icon={<Pencil className="size-4" />} />}
      />
      <div className="grid gap-3 px-4 pb-6 md:grid-cols-[1.1fr_1fr] md:px-6">
        <div className="flex min-w-0 flex-col gap-3">
          {shown.type === 'show' && total > 0 && (
            <div className={cn('rounded-[24px] p-4', tt.container, tt.onContainer)}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="serif text-2xl font-semibold">
                    {(nextEpisodeLabel(shown) ?? '').replace('Next: ', '')}
                  </div>
                  <div className="text-xs opacity-75">
                    {total - shown.episodes_watched > 0
                      ? `Up next, episode ${shown.episodes_watched + 1} of ${total}, ${total - shown.episodes_watched} to go`
                      : "You've watched every episode"}
                  </div>
                </div>
                {step && (
                  <PlusOneButton
                    onClick={() =>
                      apply({
                        episodes_watched: step.watched,
                        seasons_watched: step.season,
                        ...(step.complete ? { status: 'complete' as const } : {}),
                      })
                    }
                    className={cn('h-14 w-[72px] rounded-[20px] text-lg', tt.accentBg, tt.onAccent)}
                  />
                )}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div
                  className={cn('h-full rounded-full', tt.accentBg)}
                  style={{ width: `${Math.min(100, (shown.episodes_watched / total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {upcoming ? (
            <div className="rounded-[20px] bg-[hsl(var(--tertiary-container))] p-4 text-sm text-[hsl(var(--on-tertiary-container))]">
              Upcoming. It moves to Pending on its release day.
            </div>
          ) : (
            <StatusButtons status={shown.status} onStatus={setStatus} />
          )}

          <div className="flex items-center justify-between rounded-[20px] bg-[hsl(var(--surface-container-lowest))] px-4 py-3">
            <span className="text-sm text-muted-foreground">Your rating</span>
            <StarRating
              value={shown.rating || 0}
              interactive
              size="md"
              onChange={(v) => apply({ rating: v || null })}
            />
          </div>

          {shown.type !== 'book' && (
            <div>
              <div className="mb-2 px-1 text-sm text-muted-foreground">Where</div>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map((p) => {
                  const on = p.value === shown.platform;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => apply({ platform: on ? '' : p.value })}
                      className={cn(
                        'h-9 rounded-xl px-3 text-sm transition-colors',
                        on
                          ? cn('font-semibold', tt.accentBg, tt.onAccent)
                          : 'bg-[hsl(var(--surface-container-lowest))] hover:bg-[hsl(var(--surface-container-highest))]',
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {overview && <AboutCard text={overview} />}
          {parts.length > 1 && (
            <SeriesShelf
              name={collection.data?.name || item.collection_name}
              parts={parts}
              current={shown}
              library={library}
              onOpen={onOpen}
              onPreview={setPreview}
            />
          )}
          {shown.notes && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-[20px] bg-[hsl(var(--surface-container-lowest))] p-4 text-left"
            >
              <div className="mb-1 text-sm text-muted-foreground">Notes</div>
              <div className="text-sm whitespace-pre-wrap">{shown.notes}</div>
            </button>
          )}
        </div>
        <div className="md:col-span-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex w-full items-center gap-2 rounded-[20px] bg-[hsl(var(--surface-container-lowest))] px-4 py-3.5 text-left hover:bg-[hsl(var(--surface-container-highest))]"
          >
            <span className="flex-1">Edit details</span>
            <span className="text-xs text-muted-foreground">Title, year, genre, poster, notes</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}

function HeroButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
    >
      {icon}
    </button>
  );
}

// The cover hero: the poster blurred behind, the poster itself, the title in white.
function MediaHero({
  posterUrl,
  title,
  lines,
  leading,
  trailing,
}: {
  posterUrl: string;
  title: string;
  lines: string[];
  leading: React.ReactNode;
  trailing: React.ReactNode;
}) {
  const fade = 'linear-gradient(to bottom, black 78%, transparent)';
  return (
    <div className="relative h-[270px] shrink-0 overflow-hidden text-white">
      <div className="absolute inset-0" style={{ maskImage: fade, WebkitMaskImage: fade }}>
        {posterUrl ? (
          <img src={posterUrl} alt="" className="h-full w-full scale-125 object-cover blur-2xl saturate-150" />
        ) : (
          <div className="h-full w-full bg-[hsl(var(--inverse-surface))]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/45 to-black/60" />
      </div>
      <div className="absolute inset-x-3 top-3 flex justify-between">
        {leading}
        {trailing}
      </div>
      <div className="absolute inset-x-5 bottom-7 flex items-end gap-4 md:inset-x-6">
        <div className="h-[168px] w-[112px] shrink-0 overflow-hidden rounded-2xl bg-black/20 shadow-2xl">
          {posterUrl && <img src={posterUrl} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="serif line-clamp-3 text-2xl leading-tight font-semibold drop-shadow md:text-[28px]">
            {title}
          </div>
          {lines.filter(Boolean).map((l) => (
            <div key={l} className="mt-0.5 truncate text-xs text-white/85">
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Pending, In progress, Complete as one connected row; the rest under More.
function StatusButtons({ status, onStatus }: { status: MediaStatus; onStatus: (s: MediaStatus) => void }) {
  const inMore = !MAIN_STATUSES.includes(status);
  const others = EDITABLE_STATUS_OPTIONS.filter((s) => !MAIN_STATUSES.includes(s.value));
  // Connected row: outer ends round, inner joins small; the chosen one is a full pill.
  const seg = (on: boolean, edge: 'first' | 'middle' | 'last') =>
    cn(
      'h-11 min-w-0 flex-1 px-2 text-sm transition-all',
      on
        ? cn('rounded-full font-semibold', tt.accentBg, tt.onAccent)
        : cn(
            'bg-[hsl(var(--surface-container-lowest))] hover:bg-[hsl(var(--surface-container-highest))]',
            edge === 'first'
              ? 'rounded-l-full rounded-r-lg'
              : edge === 'last'
                ? 'rounded-l-lg rounded-r-full'
                : 'rounded-lg',
          ),
    );
  return (
    <div className="flex gap-[3px]" role="group" aria-label="Status">
      {MAIN_STATUSES.map((s, i) => (
        <button
          key={s}
          type="button"
          aria-pressed={status === s}
          onClick={() => onStatus(s)}
          className={seg(status === s, i === 0 ? 'first' : 'middle')}
        >
          <span className="truncate">{statusMeta(s)?.label}</span>
        </button>
      ))}
      <Select value={inMore ? status : ''} onValueChange={(v) => v && onStatus(v as MediaStatus)}>
        {/* Inline radius: the trigger's own rounded-xl would win over the end shape in CSS order. */}
        <SelectTrigger
          aria-label="More statuses"
          className={cn(seg(inMore, 'last'), 'h-11 justify-center border-0')}
          style={{ borderRadius: inMore ? 9999 : '8px 9999px 9999px 8px' }}
        >
          <span className="truncate">{inMore ? statusMeta(status)?.label : 'More'}</span>
        </SelectTrigger>
        <SelectContent>
          {others.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AboutCard({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="rounded-[20px] bg-[hsl(var(--surface-container-lowest))] p-4 text-left"
    >
      <div className="mb-1 text-sm text-muted-foreground">About</div>
      <div className={cn('text-sm leading-relaxed', !open && 'line-clamp-4')}>{text}</div>
      {!open && text.length > 220 && <div className={cn('mt-1 text-sm font-semibold', tt.accentText)}>More</div>}
    </button>
  );
}

// The other parts of this movie's series: one you have opens it; one you
// don't opens a preview you can add from.
function SeriesShelf({
  name,
  parts,
  current,
  library,
  onOpen,
  onPreview,
}: {
  name: string;
  parts: CollectionPart[];
  current: MediaEntry;
  library: MediaEntry[];
  onOpen: (item: MediaEntry) => void;
  onPreview: (part: CollectionPart) => void;
}) {
  const owned = new Map(parts.map((p) => [p.external_id, library.find((m) => m.external_id === p.external_id)]));
  const watched = [...owned.values()].filter((m) => m?.status === 'complete').length;
  return (
    <div className="rounded-[20px] bg-[hsl(var(--surface-container-lowest))] py-4">
      <div className="mb-2.5 flex items-baseline gap-2 px-4">
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{name || 'In this series'}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {watched} of {parts.length} watched
        </span>
      </div>
      <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4">
        {parts.map((p) => {
          const mine = owned.get(p.external_id);
          const here = p.external_id === current.external_id;
          return (
            <button
              key={p.external_id}
              type="button"
              disabled={here}
              onClick={() => (mine ? onOpen(mine) : onPreview(p))}
              className="w-[92px] shrink-0 text-left disabled:cursor-default"
            >
              <div
                className={cn(
                  'relative h-[138px] w-[92px] overflow-hidden rounded-[14px] bg-[hsl(var(--surface-container-high))]',
                  here &&
                    cn(
                      'ring-[3px] ring-offset-2 ring-offset-[hsl(var(--surface-container-lowest))]',
                      'ring-[var(--tt-accent)] dark:ring-[var(--tt-accent-d)]',
                    ),
                )}
              >
                {p.poster_url && (
                  <img
                    src={p.poster_url}
                    alt=""
                    loading="lazy"
                    className={cn('h-full w-full object-cover', !mine && 'opacity-60 saturate-50')}
                  />
                )}
                {mine ? (
                  <MediaStatusBadge status={mine.status} className="absolute top-1.5 left-1.5 h-5 px-1.5 text-[10px]" />
                ) : (
                  <span className="absolute right-1.5 bottom-1.5 grid size-8 place-items-center rounded-xl bg-background text-foreground shadow">
                    <Plus className="size-4" />
                  </span>
                )}
              </div>
              <div className="mt-1.5 line-clamp-2 text-xs leading-tight font-semibold">{p.title}</div>
              <div className="text-[11px] text-muted-foreground">
                {here
                  ? 'This one'
                  : mine
                    ? p.year
                    : p.release_state === 'upcoming'
                      ? 'Upcoming'
                      : `${p.year}, not added`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A series part not in the library: its hero and story, and Add.
function SeriesPartPreview({
  part,
  seriesName,
  onBack,
  onAdd,
}: {
  part: CollectionPart;
  seriesName: string;
  onBack: () => void;
  onAdd: (status: MediaStatus) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const upcoming = part.release_state === 'upcoming' || hasFutureRelease('movie', part.release_date);
  const add = async (status: MediaStatus) => {
    setAdding(true);
    try {
      await onAdd(status);
    } catch (err) {
      toast.error(failureText(err, `Could not add ${part.title}`));
    } finally {
      setAdding(false);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <MediaHero
        posterUrl={part.poster_url}
        title={part.title}
        lines={[
          part.year,
          seriesName,
          upcoming && part.release_date ? `Releases ${formatReleaseDate(part.release_date)}` : '',
        ]}
        leading={<HeroButton label="Back" onClick={onBack} icon={<ArrowLeft className="size-4" />} />}
        trailing={<span />}
      />
      <div className="flex flex-col gap-3 px-4 pb-6 md:px-6">
        {part.overview && <AboutCard text={part.overview} />}
        <div className="px-1 text-sm text-muted-foreground">Add to your library as</div>
        <div className="flex gap-2.5">
          {!upcoming && (
            <Button variant="tonal" disabled={adding} onClick={() => void add('complete')} className="h-12 flex-1">
              Complete
            </Button>
          )}
          <Button disabled={adding} onClick={() => void add(upcoming ? 'upcoming' : 'pending')} className="h-12 flex-1">
            {adding ? 'Adding…' : upcoming ? 'Upcoming' : 'Pending'}
          </Button>
        </div>
      </div>
    </div>
  );
}
