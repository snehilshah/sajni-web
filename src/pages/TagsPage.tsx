import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

import { useTags, useTagEntities } from '@/queries/tags';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Hash,
  Search,
  X,
  FileText,
  BookOpen,
  NotebookPen,
  CheckSquare,
  ArrowUpRight,
  Receipt,
  Bookmark,
  Film,
} from '@/components/ui/icons';

interface TagEntity {
  type: string;
  id: number;
  title: string;
  subtitle?: string;
  kind?: string;
}

const TYPE_META: Record<string, { label: string; icon: typeof FileText; route: (id: number, e: TagEntity) => string }> =
  {
    memo: { label: 'Memo', icon: FileText, route: () => '/memos' },
    note: { label: 'Note', icon: NotebookPen, route: (id) => `/notes?id=${id}` },
    journal: { label: 'Journal', icon: BookOpen, route: (id) => `/journal?id=${id}` },
    task: { label: 'Task', icon: CheckSquare, route: (id) => `/tasks?focus=${id}` },
    transaction: { label: 'Transaction', icon: Receipt, route: () => '/finance/transactions' },
    media: {
      label: 'Media',
      icon: Film,
      route: (id, e) =>
        `/media?tab=${({ show: 'shows', book: 'books' } as Record<string, string>)[e.kind ?? ''] ?? 'movies'}&id=${id}`,
    },
    bookmark: {
      label: 'Bookmark',
      icon: Bookmark,
      route: (_, e) => `/media?tab=${e.kind === 'video' ? 'videos' : 'sites'}`,
    },
  };

// TagsPanel — lives inside Analytics (?tab=tags). The active tag rides
// the same query string (?tag=x) so deep links survive the merge; old
// /tags/:tag URLs redirect here.
export default function TagsPanel() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTag = searchParams.get('tag') || undefined;
  const setActiveTag = (tag?: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'tags');
    if (tag) next.set('tag', tag);
    else next.delete('tag');
    setSearchParams(next, { replace: true });
  };
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data: tagsList = [], isLoading: loading } = useTags();
  const entitiesQ = useTagEntities(activeTag);
  const entities = activeTag ? ((entitiesQ.data?.entities as TagEntity[] | undefined) ?? null) : null;
  const loadingEntities = !!activeTag && entitiesQ.isLoading;

  const filteredTags = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? tagsList.filter((t) => t.tag.toLowerCase().includes(q)) : tagsList;
  }, [tagsList, search]);

  const maxCount = Math.max(...tagsList.map((t) => t.count), 1);

  const filteredEntities = useMemo(() => {
    if (!entities) return [];
    return typeFilter === 'all' ? entities : entities.filter((e) => e.type === typeFilter);
  }, [entities, typeFilter]);

  const grouped = useMemo(() => {
    const g: Record<string, TagEntity[]> = {};
    for (const e of filteredEntities) {
      if (!g[e.type]) g[e.type] = [];
      g[e.type].push(e);
    }
    return g;
  }, [filteredEntities]);

  const entityTypes = entities ? Array.from(new Set(entities.map((e) => e.type))) : [];

  return (
    <div className="flex flex-col gap-8">
      {/* Filter */}
      <div className="relative w-full sm:w-64">
        <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter tags…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pr-8 pl-9"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Tag cloud */}
      <section>
        {loading ? (
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton key={i} className="h-7 w-20 rounded-full" />
            ))}
          </div>
        ) : filteredTags.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
            <Hash className="mx-auto mb-3 size-8 opacity-30" />
            <p className="text-sm">
              {search
                ? 'No tags match your search.'
                : 'No tags yet. Use #tag in any memo, note, journal, task, media, bookmark, or transaction note.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <AnimatePresence initial={false}>
              {filteredTags.map((t) => {
                const scale = 0.85 + (t.count / maxCount) * 0.6;
                const isActive = activeTag === t.tag;
                return (
                  <motion.div
                    key={t.tag}
                    layout
                    initial={{ opacity: 0, transform: 'scale(0.9)' }}
                    animate={{ opacity: 1, transform: 'scale(1)' }}
                    exit={{ opacity: 0, transform: 'scale(0.9)' }}
                    transition={{ duration: 0.18 }}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveTag(isActive ? undefined : t.tag)}
                      className={`inline-flex items-center gap-1 rounded-full font-mono transition-[background-color,color,box-shadow] ${
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-secondary/40 text-foreground hover:bg-secondary/70'
                      }`}
                      style={{
                        fontSize: `${Math.round(11 * scale)}px`,
                        padding: `${Math.round(4 * scale)}px ${Math.round(11 * scale)}px`,
                      }}
                    >
                      <Hash className="size-3 opacity-70" strokeWidth={2.5} />
                      <span>{t.tag}</span>
                      <span className="text-xs opacity-60">·{t.count}</span>
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Active tag entities */}
      <AnimatePresence mode="wait">
        {activeTag && (
          <motion.section
            key={activeTag}
            initial={{ opacity: 0, transform: 'translateY(8px)' }}
            animate={{ opacity: 1, transform: 'translateY(0)' }}
            exit={{ opacity: 0, transform: 'translateY(-4px)' }}
            transition={{ duration: 0.2 }}
            className="border-t border-border pt-6"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-serif text-xl font-medium">
                Entries tagged
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary px-3 py-0.5 font-mono text-sm text-primary-foreground">
                  <Hash className="size-3" />
                  {activeTag}
                </span>
              </h2>
              {entities && entities.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
                    All ({entities.length})
                  </FilterChip>
                  {entityTypes.map((type) => {
                    const meta = TYPE_META[type];
                    const count = entities.filter((e) => e.type === type).length;
                    return (
                      <FilterChip key={type} active={typeFilter === type} onClick={() => setTypeFilter(type)}>
                        {meta?.label || type} ({count})
                      </FilterChip>
                    );
                  })}
                </div>
              )}
            </div>

            {loadingEntities ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : !entities || entities.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                Nothing tagged with <span className="font-mono">#{activeTag}</span> yet.
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {Object.entries(grouped).map(([type, list]) => {
                  const meta = TYPE_META[type];
                  const Icon = meta?.icon || FileText;
                  return (
                    <div key={type}>
                      <h3 className="label-kicker mb-2 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                        <Icon className="size-3" />
                        {meta?.label || type} <span className="opacity-60">({list.length})</span>
                      </h3>
                      <div className="flex flex-col gap-1.5">
                        {list.map((e) => (
                          <button
                            key={`${e.type}-${e.id}`}
                            onClick={() => navigate(meta?.route(e.id, e) || '/')}
                            className="group flex items-center gap-3 rounded-lg bg-card px-4 py-2.5 text-left transition-colors hover:bg-accent/30"
                          >
                            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{e.title}</div>
                              {e.subtitle && (
                                <div className="mt-0.5 font-mono text-xs text-muted-foreground capitalize">
                                  {e.subtitle.replace('_', ' ')}
                                </div>
                              )}
                              {e.type === 'journal' && (
                                <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                                  {(() => {
                                    try {
                                      return formatDistanceToNow(new Date(e.title), { addSuffix: true });
                                    } catch {
                                      return '';
                                    }
                                  })()}
                                </div>
                              )}
                            </div>
                            <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`label-kicker rounded-full border px-2.5 py-1 font-mono text-xs transition-colors ${
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border text-muted-foreground hover:bg-accent/40'
      }`}
    >
      {children}
    </button>
  );
}
