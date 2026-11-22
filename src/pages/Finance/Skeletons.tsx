// Skeleton placeholders that match the final layout shape so transitions
// don't cause visual jumps. Used while data is loading on first visit.

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-md bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/3 rounded bg-muted" />
              <div className="h-2 w-1/3 rounded bg-muted" />
            </div>
          </div>
          <div className="mt-3 h-7 w-1/2 rounded bg-muted" />
          <div className="mt-1 h-2 w-1/4 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl bg-card">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 border-b border-border px-4 py-3 last:border-0">
          <div className="size-8 shrink-0 rounded-md bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-muted" />
            <div className="h-2 w-1/3 rounded bg-muted" />
          </div>
          <div className="h-3 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse space-y-3 rounded-xl bg-card p-4">
          <div className="h-4 w-1/2 rounded bg-muted" />
          <div className="h-7 w-2/3 rounded bg-muted" />
          <div className="h-2 w-full rounded bg-muted" />
          <div className="h-2 w-3/4 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
