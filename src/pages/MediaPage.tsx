import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { media as mediaApi, type CollectionPart, type MediaEventRow } from '@/api';
import type { MediaEntry, MediaStatus, MediaSearchResult } from '@/types';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Star, Trash2, Search, Loader2, Film, Tv, BookOpen, Calendar, ImageIcon, X, Check, LayoutGrid, ListChecks, ArrowUpDown } from 'lucide-react';

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
  { value: 'torrent', label: 'Other download' },
  { value: 'other', label: 'Other' },
];

const TYPE_META: Record<string, { label: string; plural: string; icon: typeof Film }> = {
  movie: { label: 'Movie', plural: 'Movies', icon: Film },
  show: { label: 'Show', plural: 'Shows', icon: Tv },
  book: { label: 'Book', plural: 'Books', icon: BookOpen },
};

const statusMeta = (s: MediaStatus) => STATUS_OPTIONS.find((o) => o.value === s);
const platformLabel = (p: string) => PLATFORM_OPTIONS.find((o) => o.value === p)?.label || p;

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.6 };

function ProgressBar({ watched, total, label, color = 'bg-primary' }: { watched: number; total: number; label: string; color?: string }) {
  if (total <= 0) return null;
  const pct = Math.min(100, Math.round((watched / total) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span>{watched}/{total} · {pct}%</span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={`h-full ${color} rounded-full`}
        />
      </div>
    </div>
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

function ExternalSearch({ type, onSelect }: { type: string; onSelect: (r: MediaSearchResult) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try { setResults(await mediaApi.search(q, type)); }
    catch { setResults([]); }
    finally { setLoading(false); }
  }, [type]);

  const handleChange = (val: string) => {
    setQuery(val);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => doSearch(val), 350);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={type === 'book' ? 'Search Open Library…' : `Search ${TYPE_META[type]?.plural || 'titles'} on TMDB…`}
          className="pl-9 pr-9"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />}
        {!loading && query && (
          <button onClick={() => { setQuery(''); setResults([]); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="border border-border rounded-lg max-h-72 overflow-y-auto divide-y divide-border/60 bg-popover shadow-sm"
          >
            {results.map((r, i) => (
              <button
                key={i}
                className="w-full flex items-start gap-3 p-2.5 hover:bg-accent/40 transition-colors cursor-pointer text-left"
                onClick={() => { onSelect(r); setQuery(''); setResults([]); }}
              >
                <div className="w-10 aspect-[2/3] rounded bg-muted shrink-0 overflow-hidden">
                  {r.poster_url ? (
                    <img src={r.poster_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-4" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{r.title}</div>
                  {r.year && <div className="font-mono text-[10px] text-muted-foreground">{r.year}</div>}
                  {r.overview && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{r.overview}</div>}
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FormState {
  title: string;
  type: string;
  status: MediaStatus;
  rating: number;
  notes: string;
  platform: string;
  poster_url: string;
  year: number | null;
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
  const [activeType, setActiveType] = useState('movie');
  const [statusFilter, setStatusFilter] = useState('');
  const [items, setItems] = useState<MediaEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
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
  const toggleSeries = (id: string) =>
    setExpandedSeries((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  useEffect(() => {
    try { localStorage.setItem(MEDIA_VIEW_KEY, viewMode); } catch {}
  }, [viewMode]);
  useEffect(() => {
    try { localStorage.setItem(MEDIA_SORT_KEY, sortBy); } catch {}
  }, [sortBy]);

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<MediaEntry | null>(null);
  const [saving, setSaving] = useState(false);

  const blankForm = useCallback((): FormState => ({
    title: '', type: activeType, status: 'pending' as MediaStatus, rating: 0, notes: '',
    platform: '', poster_url: '', year: null as number | null, genre: '',
    external_id: '', episodes_watched: 0, episodes_total: 0,
    seasons_watched: 0, seasons_total: 0,
    season_episodes: [], collection_id: '', collection_name: '',
  }), [activeType]);

  const [form, setForm] = useState<FormState>(blankForm());

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { type: activeType };
      if (statusFilter) params.status = statusFilter;
      const data = await mediaApi.list(params);
      setItems(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeType, statusFilter]);

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

  const openForm = (item?: MediaEntry) => {
    if (item) {
      setEditItem(item);
      setForm({
        title: item.title, type: item.type, status: item.status,
        rating: item.rating || 0, notes: item.notes, platform: item.platform,
        poster_url: item.poster_url, year: item.year || null, genre: item.genre,
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
  };

  const handleExternalSelect = async (r: MediaSearchResult) => {
    // Optimistic prefill from the search row.
    setForm((f) => ({
      ...f,
      title: r.title,
      poster_url: r.poster_url,
      year: r.year ? parseInt(r.year) : null,
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
      const payload = { ...form, rating: form.rating || null };
      if (editItem) await mediaApi.update(editItem.id, payload);
      else await mediaApi.create(payload);
      setShowForm(false);
      setEditItem(null);
      load();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    await mediaApi.delete(id);
    setShowForm(false);
    setEditItem(null);
    load();
  };

  const TypeIcon = TYPE_META[activeType]?.icon || Film;

  return (
    <div className="flex flex-col h-full page-fade-in">
      <header className="border-b border-border bg-background/85 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto pl-14 md:pl-8 pr-4 md:pr-8 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif font-semibold tracking-tight text-3xl md:text-4xl">Library</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Movies, shows, books — one shelf.</p>
          </div>
          <Button onClick={() => openForm()} className="gap-1.5">
            <Plus className="size-4" /> Add
          </Button>
        </div>

        {/* Type tabs */}
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <div className="flex gap-1 -mb-px">
            {Object.entries(TYPE_META).map(([key, meta]) => {
              const Icon = meta.icon;
              const active = activeType === key;
              return (
                <button
                  key={key}
                  onClick={() => { setActiveType(key); setStatusFilter(''); setSearchQuery(''); }}
                  className={`relative inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="size-3.5" />
                  {meta.plural}
                  {active && (
                    <motion.div
                      layoutId="media-tab-underline"
                      className="absolute inset-x-0 -bottom-px h-0.5 bg-primary rounded-full"
                      transition={SPRING}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-5 flex flex-col gap-4">
          {/* Toolbar: status chips + search */}
          <div className="flex flex-wrap gap-3 items-center">
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
            <div className="ml-auto flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 h-9 px-2 rounded-md border border-border text-xs">
                <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="bg-transparent outline-none cursor-pointer text-foreground"
                  title="Sort"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {activeType === 'movie' && (
                <button
                  onClick={() => setGroupSeries((v) => !v)}
                  className={`h-9 px-3 rounded-md border border-border text-xs inline-flex items-center gap-1.5 ${groupSeries ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Group movies that share a series (e.g. Mission Impossible)"
                >
                  <Film className="size-3.5" /> Series
                </button>
              )}
              <div className="inline-flex rounded-md border border-border overflow-hidden h-9">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-2.5 inline-flex items-center gap-1 text-xs ${viewMode === 'list' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  title="List view"
                >
                  <ListChecks className="size-3.5" /> List
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-2.5 inline-flex items-center gap-1 text-xs border-l border-border ${viewMode === 'grid' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Grid view"
                >
                  <LayoutGrid className="size-3.5" /> Grid
                </button>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter library…"
                  className="h-9 pl-9 pr-8"
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
            </div>
          </div>

          {/* Grid / list */}
          {loading ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <Skeleton className="w-full aspect-[2/3] rounded-lg" />
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2.5 w-1/2" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            )
          ) : filteredItems.length === 0 ? (
            <EmptyState type={activeType} hasFilter={!!statusFilter || !!searchQuery} onAdd={() => openForm()} onClear={() => { setStatusFilter(''); setSearchQuery(''); }} />
          ) : viewMode === 'grid' ? (
            <motion.div
              layout
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
            >
              <AnimatePresence initial={false}>
                {seriesRows.map((row) => (
                  row.kind === 'single' ? (
                    <motion.div
                      key={'item-' + row.item.id}
                      layout="position"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
                      transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
                    >
                      <PosterCard item={row.item} onClick={() => openForm(row.item)} />
                    </motion.div>
                  ) : (
                    <motion.div
                      key={'series-' + row.collectionId}
                      layout="position"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
                      transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
                    >
                      <SeriesPosterCard
                        row={row}
                        expanded={expandedSeries.has(row.collectionId)}
                        onToggle={() => toggleSeries(row.collectionId)}
                        onPickItem={openForm}
                      />
                    </motion.div>
                  )
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <div className="glass rounded-[14px] overflow-hidden">
              <AnimatePresence initial={false}>
                {seriesRows.map((row, idx) => (
                  row.kind === 'single' ? (
                    <motion.button
                      key={'item-' + row.item.id}
                      layout="position"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
                      onClick={() => openForm(row.item)}
                      className={`w-full flex items-center gap-4 px-5 md:px-6 py-3.5 text-left hover:bg-foreground/[.03] transition-colors
                        ${idx === 0 ? '' : 'border-t border-border/40'}`}
                    >
                      <MediaThumb item={row.item} index={idx} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <div className="serif text-[16px] font-medium truncate">{row.item.title || 'Untitled'}</div>
                          {row.item.year ? <span className="mono text-[11px] text-muted-foreground">{row.item.year}</span> : null}
                          {row.item.rating ? (
                            <span className="inline-flex items-center gap-0.5 text-amber-500">
                              <Star className="size-3 fill-current" />
                              <span className="mono text-[10px]">{row.item.rating}</span>
                            </span>
                          ) : null}
                        </div>
                        <div className="mono text-[11px] text-muted-foreground mt-0.5 truncate">
                          {row.item.type}{progressLabel(row.item) ? ' · ' + progressLabel(row.item) : ''}
                          {row.item.platform ? ' · ' + platformLabel(row.item.platform) : ''}
                          {' · '}{watchAgeLabel(row.item)}
                        </div>
                      </div>
                      <span className={`chip ${chipClassFor(row.item.status)}`}>
                        {(statusMeta(row.item.status)?.label || row.item.status).toLowerCase()}
                      </span>
                    </motion.button>
                  ) : (
                    <SeriesListRow
                      key={'series-' + row.collectionId}
                      row={row}
                      first={idx === 0}
                      expanded={expandedSeries.has(row.collectionId)}
                      onToggle={() => toggleSeries(row.collectionId)}
                      onPickItem={openForm}
                    />
                  )
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setEditItem(null); }}>
        <DialogContent className="sm:max-w-3xl w-full max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2">
              <TypeIcon className="size-5 text-muted-foreground" />
              {editItem ? 'Edit' : 'Add'} {TYPE_META[form.type]?.label || 'Entry'}
            </DialogTitle>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {editItem ? 'Update details below' : 'Search a database or fill it in manually'}
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
            {!editItem && (
              <ExternalSearch type={form.type} onSelect={handleExternalSelect} />
            )}

            <div className="grid grid-cols-[120px_1fr] gap-5">
              {/* Poster preview */}
              <div className="aspect-[2/3] w-full rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center text-muted-foreground">
                {form.poster_url ? (
                  <img src={form.poster_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="size-8 opacity-30" />
                )}
              </div>

              <div className="flex flex-col gap-3 min-w-0">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Title</Label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    autoFocus
                    placeholder="Untitled"
                    className="bg-transparent font-serif text-2xl font-medium tracking-tight outline-none placeholder:text-muted-foreground/40 border-b border-border focus:border-primary transition-colors pb-1.5"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FieldSimple label="Year">
                    <YearField
                      value={form.year}
                      onChange={(y) => setForm({ ...form, year: y })}
                    />
                  </FieldSimple>
                  <FieldSimple label="Genre">
                    <Input value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} placeholder="Action, Drama" />
                  </FieldSimple>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Rating</Label>
                  <StarRating value={form.rating} interactive size="md" onChange={(v) => setForm({ ...form, rating: v })} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <FieldSelect
                label="Type"
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v || 'movie' })}
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
              />
            </div>

            {form.type === 'show' && (
              <ShowProgressSection form={form} setForm={setForm} />
            )}

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
                {form.episodes_total > 0 && <ProgressBar watched={form.episodes_watched} total={form.episodes_total} label="Pages" />}
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
          </div>

          <DialogFooter className="shrink-0 px-6 py-4 border-t border-border bg-muted/20">
            {editItem && (
              <Button variant="ghost" onClick={() => handleDelete(editItem.id)} className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5">
                <Trash2 className="size-3.5" /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => { setShowForm(false); setEditItem(null); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title.trim()} className="gap-1.5">
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {editItem ? 'Save' : 'Add to library'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function FilterChip({ active, onClick, children, count, dot }: { active: boolean; onClick: () => void; children: React.ReactNode; count: number; dot?: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-foreground text-background'
          : 'bg-secondary/50 text-foreground hover:bg-secondary/80'
      }`}
    >
      {dot && <span className={`size-1.5 rounded-full ${active ? 'bg-background' : dot}`} />}
      {children}
      <span className={`font-mono text-[10px] tabular-nums ${active ? 'opacity-80' : 'opacity-60'}`}>{count}</span>
    </button>
  );
}

function FieldSimple({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function FieldSelect({ label, value, onChange, options, renderValue }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; dot?: string }[];
  renderValue?: (v: string) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue>{renderValue ? renderValue(value) : options.find((o) => o.value === value)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <span className="flex items-center gap-2">
                {o.dot && <span className={`size-2 rounded-full ${o.dot}`} />}
                {o.label}
              </span>
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
      <h4 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{title}</h4>
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
  const meta = statusMeta(item.status);
  const Icon = TYPE_META[item.type]?.icon || Film;
  const showProgress = (item.type === 'show' && item.episodes_total > 0) || (item.type === 'book' && item.episodes_total > 0);
  const pct = showProgress ? Math.min(100, Math.round((item.episodes_watched / item.episodes_total) * 100)) : 0;

  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-2 text-left w-full"
      title={item.title}
    >
      <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden bg-muted ring-1 ring-border/60 transition-shadow group-hover:shadow-lg group-hover:ring-ring/40">
        {item.poster_url ? (
          <img
            src={item.poster_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-3 text-muted-foreground">
            <Icon className="size-7 opacity-40" />
            <span className="font-serif text-sm text-center line-clamp-3 leading-tight opacity-80">{item.title}</span>
          </div>
        )}

        {/* Status pill */}
        <div className="absolute top-2 left-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-background/90 backdrop-blur px-2 py-0.5 text-[10px] font-medium shadow-sm ring-1 ring-foreground/5">
            <span className={`size-1.5 rounded-full ${meta?.dot}`} />
            {meta?.label}
          </span>
        </div>

        {/* Rating */}
        {item.rating ? (
          <div className="absolute top-2 right-2 inline-flex items-center gap-0.5 rounded-full bg-background/90 backdrop-blur px-1.5 py-0.5 text-[10px] font-mono shadow-sm ring-1 ring-foreground/5">
            <Star className="size-2.5 fill-amber-400 text-amber-400" />
            <span>{item.rating}</span>
          </div>
        ) : null}

        {/* Complete check */}
        {item.status === 'complete' && (
          <div className="absolute bottom-2 right-2 size-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow">
            <Check className="size-3" strokeWidth={3} />
          </div>
        )}

        {/* Progress bar overlay */}
        {showProgress && item.status !== 'complete' && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-foreground/10">
            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <div className="flex flex-col px-0.5">
        <div className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {item.title}
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground mt-0.5">
          {item.year && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-2.5" />
              {item.year}
            </span>
          )}
          {item.platform && (
            <>
              {item.year && <span className="opacity-50">·</span>}
              <span className="truncate">{platformLabel(item.platform)}</span>
            </>
          )}
        </div>
        <div className="font-mono text-[9.5px] text-muted-foreground mt-0.5 truncate">
          {watchAgeLabel(item)}
        </div>
      </div>
    </button>
  );
}

// MediaThumb — small thumbnail used in the design's list view. Uses the
// real poster when available, otherwise an index-derived gradient panel
// matching the redesign aesthetic.
function MediaThumb({ item, index }: { item: MediaEntry; index: number }) {
  if (item.poster_url) {
    return (
      <img
        src={item.poster_url}
        alt=""
        loading="lazy"
        className="w-11 h-[60px] rounded-md object-cover ring-1 ring-border/60 shrink-0"
      />
    );
  }
  const a = (index % 5) + 1;
  const b = ((index + 2) % 5) + 1;
  return (
    <div
      className="w-11 h-[60px] rounded-md ring-1 ring-border/60 shrink-0"
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
    return 'completed ' + relativeShort(item.last_completed_at);
  }
  if (item.created_at) {
    return 'added ' + relativeShort(item.created_at);
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
    case 'complete': return 'chip-sage';
    case 'dropped':
    case 'scratched': return 'chip-rose';
    default: return '';
  }
}

// SeriesPosterCard — grid-view representation of a movie series.
// Shows a stacked-poster effect using the first member's poster as
// the cover (chronologically earliest, per user request) plus a
// "+N" pill. Clicking expands inline to reveal the parts.
function SeriesPosterCard({
  row, expanded, onToggle, onPickItem,
}: {
  row: Extract<SeriesRow, { kind: 'series' }>;
  expanded: boolean;
  onToggle: () => void;
  onPickItem: (m: MediaEntry) => void;
}) {
  const cover = row.members[0];
  const watched = row.members.filter((m) => m.status === 'complete').length;
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={onToggle}
        className="group relative text-left"
        title={`${row.collectionName} — ${watched}/${row.members.length} watched`}
      >
        <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden ring-1 ring-border/60 bg-muted transition-shadow group-hover:shadow-lg">
          {/* Stack effect: two faint posters peeking behind the cover. */}
          <div
            className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-lg bg-muted opacity-40"
            style={cover.poster_url ? { backgroundImage: `url(${cover.poster_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          />
          <div
            className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-lg bg-muted opacity-70"
            style={cover.poster_url ? { backgroundImage: `url(${cover.poster_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          />
          {cover.poster_url ? (
            <img src={cover.poster_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-muted-foreground">
              <Film className="size-7 opacity-40" />
              <span className="font-serif text-sm text-center line-clamp-3 leading-tight opacity-80">{row.collectionName}</span>
            </div>
          )}
          <span className="absolute top-2 left-2 chip chip-sage">
            <Film className="size-3" /> Series
          </span>
          <span className="absolute bottom-2 right-2 mono text-[10px] px-1.5 py-0.5 rounded bg-background/85 backdrop-blur border border-border/60">
            {watched}/{row.members.length}
          </span>
        </div>
        <div className="mt-2 px-0.5">
          <div className="font-medium text-sm leading-snug line-clamp-2">{row.collectionName}</div>
          <div className="mono text-[10px] text-muted-foreground mt-0.5">{row.members.length} movies</div>
        </div>
      </button>
      {expanded && (
        <div className="grid grid-cols-2 gap-2">
          {row.members.map((m) => (
            <PosterCard key={m.id} item={m} onClick={() => onPickItem(m)} />
          ))}
        </div>
      )}
    </div>
  );
}

// SeriesListRow — list-view representation. Expandable: shows a single
// row with the cover + "X/N watched" summary; click expands to reveal
// each chronological part inline.
function SeriesListRow({
  row, first, expanded, onToggle, onPickItem,
}: {
  row: Extract<SeriesRow, { kind: 'series' }>;
  first: boolean;
  expanded: boolean;
  onToggle: () => void;
  onPickItem: (m: MediaEntry) => void;
}) {
  const cover = row.members[0];
  const watched = row.members.filter((m) => m.status === 'complete').length;
  const oldest = row.members[0]?.year;
  const newest = row.members[row.members.length - 1]?.year;
  const yearLabel = oldest && newest && oldest !== newest ? `${oldest}–${newest}` : oldest ? String(oldest) : '';

  return (
    <>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-4 px-5 md:px-6 py-3.5 text-left hover:bg-foreground/[.03] transition-colors
          ${first ? '' : 'border-t border-border/40'}`}
      >
        <MediaThumb item={cover} index={0} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="serif text-[16px] font-medium truncate">{row.collectionName}</div>
            {yearLabel && <span className="mono text-[11px] text-muted-foreground">{yearLabel}</span>}
            <span className="chip chip-sage text-[10px]"><Film className="size-3" /> Series</span>
          </div>
          <div className="mono text-[11px] text-muted-foreground mt-0.5 truncate">
            {row.members.length} movies · {watched}/{row.members.length} watched
          </div>
        </div>
        <span className={`mono text-[10px] text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </button>
      {expanded && (
        <div className="bg-foreground/[.02] border-t border-border/40">
          {row.members.map((m, mi) => (
            <button
              key={m.id}
              onClick={() => onPickItem(m)}
              className={`w-full flex items-center gap-4 pl-12 md:pl-14 pr-5 md:pr-6 py-2.5 text-left hover:bg-foreground/[.05] transition-colors
                ${mi === 0 ? '' : 'border-t border-border/30'}`}
            >
              <span className="mono text-[10px] text-muted-foreground w-5 tabular-nums text-right shrink-0">
                {mi + 1}
              </span>
              <MediaThumb item={m} index={mi} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <div className="text-[14px] font-medium truncate">{m.title}</div>
                  {m.year ? <span className="mono text-[11px] text-muted-foreground">{m.year}</span> : null}
                  {m.rating ? (
                    <span className="inline-flex items-center gap-0.5 text-amber-500">
                      <Star className="size-3 fill-current" />
                      <span className="mono text-[10px]">{m.rating}</span>
                    </span>
                  ) : null}
                </div>
                <div className="mono text-[11px] text-muted-foreground mt-0.5 truncate">
                  {watchAgeLabel(m)}
                </div>
              </div>
              <span className={`chip ${chipClassFor(m.status)}`}>
                {(statusMeta(m.status)?.label || m.status).toLowerCase()}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
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
          <Loader2 className="size-3 animate-spin" /> Loading…
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
                    <span className="ml-1.5 mono text-[11px] text-muted-foreground">
                      {eventSublabel(e)}
                    </span>
                  )}
                </div>
                <span className="mono text-[10.5px] text-muted-foreground" title={e.created_at}>
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
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
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
          <div className="text-[11px] text-muted-foreground">
            {form.episodes_watched} of {totalEpisodes} episodes watched
          </div>
          {totalEpisodes > 0 && (
            <ProgressBar watched={form.episodes_watched} total={totalEpisodes} label="Episodes" />
          )}
        </>
      ) : (
        <>
          <div className="text-[11px] text-muted-foreground">
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
            <ProgressBar watched={form.episodes_watched} total={form.episodes_total} label="Episodes" />
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
              <Loader2 className="size-3 animate-spin" /> Loading collection…
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
                return (
                  <div
                    key={p.external_id}
                    className={`flex items-center gap-3 px-3 py-2 text-sm ${i === 0 ? '' : 'border-t border-border/40'}`}
                  >
                    <span className="mono text-[10px] text-muted-foreground w-5 tabular-nums text-right">
                      {i + 1}
                    </span>
                    {p.poster_url ? (
                      <img src={p.poster_url} alt="" className="w-7 h-10 object-cover rounded shrink-0" />
                    ) : (
                      <div className="w-7 h-10 rounded bg-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`truncate ${isCurrent ? 'font-medium' : ''}`}>{p.title}</div>
                      {p.year && <div className="font-mono text-[10px] text-muted-foreground">{p.year}</div>}
                    </div>
                    {isCurrent && (
                      <span className="chip chip-amber text-[10px]">this one</span>
                    )}
                    {!isCurrent && owned && (
                      <span className="chip chip-sage text-[10px]">in library</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {mine && parts && (
        <div className="text-[11px] text-muted-foreground mt-1">
          {mine.length} of {parts.length} in your library
        </div>
      )}
    </Section>
  );
}
