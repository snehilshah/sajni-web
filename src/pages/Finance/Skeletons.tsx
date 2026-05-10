// Skeleton placeholders that match the final layout shape so transitions
// don't cause visual jumps. Used while data is loading on first visit.

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-md bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/3 bg-muted rounded" />
              <div className="h-2 w-1/3 bg-muted rounded" />
            </div>
          </div>
          <div className="mt-3 h-7 w-1/2 bg-muted rounded" />
          <div className="mt-1 h-2 w-1/4 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 animate-pulse">
          <div className="size-8 rounded-md bg-muted shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 bg-muted rounded" />
            <div className="h-2 w-1/3 bg-muted rounded" />
          </div>
          <div className="h-3 w-16 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3 animate-pulse">
          <div className="h-4 w-1/2 bg-muted rounded" />
          <div className="h-7 w-2/3 bg-muted rounded" />
          <div className="h-2 w-full bg-muted rounded" />
          <div className="h-2 w-3/4 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div className="rounded-xl bg-muted/40 p-6 space-y-3 animate-pulse">
      <div className="h-3 w-24 bg-muted rounded" />
      <div className="h-10 w-2/3 bg-muted rounded" />
      <div className="h-3 w-1/3 bg-muted rounded" />
      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="h-12 rounded-lg bg-muted" />
        <div className="h-12 rounded-lg bg-muted" />
        <div className="h-12 rounded-lg bg-muted" />
      </div>
    </div>
  );
}
