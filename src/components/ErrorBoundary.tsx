import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, AlertTriangle } from '@/components/ui/icons';
import { isChunkLoadError, isReloadPending, startRecovery } from '@/lib/chunkReload';

interface Props {
  children: ReactNode;
  /** Shown instead of the error card (and the recovery status). Optional
   *  surfaces pass `null`, so a failed chunk hides them without blanking the
   *  app; the page-level boundary still drives recovery. */
  fallback?: ReactNode;
}

// Recovery status. A reload is scheduled; if the page is still here after a
// while (slow or dead connection), offer the reload by hand instead of
// leaving "Updating…" on screen forever.
function Recovering() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div role="status" className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
      <span>{slow ? 'Still loading. The connection looks slow.' : 'Loading Sajni…'}</span>
      {slow && (
        <Button size="sm" onClick={() => window.location.reload()} className="gap-1.5">
          <RotateCcw className="size-3.5" /> Reload
        </Button>
      )}
    </div>
  );
}

// A chunk that wouldn't load after the automatic retries: almost always the
// connection. Comes back by itself when the browser reports it's online.
function ChunkFailed() {
  useEffect(() => {
    const onOnline = () => window.location.reload();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
      <p className="font-medium text-foreground">Couldn't load this page</p>
      <p className="text-muted-foreground">Check your connection, then retry.</p>
      <Button size="sm" onClick={() => window.location.reload()} className="gap-1.5">
        <RotateCcw className="size-3.5" /> Retry
      </Button>
    </div>
  );
}

interface State {
  hasError: boolean;
  error: Error | null;
  // A lazy chunk failed (stale deploy or network) and a reload is scheduled.
  reloading: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, reloading: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, reloading: isReloadPending() || isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // startRecovery's reload budget runs out for a chunk that is genuinely
    // missing, which then falls through to the error card.
    if (isReloadPending() || (isChunkLoadError(error) && startRecovery())) return;
    if (this.state.reloading) this.setState({ reloading: false });
    console.error('Unhandled render error caught by ErrorBoundary:', error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null, reloading: false });
  };

  reloadPage = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      if (this.state.reloading) return <Recovering />;
      if (isChunkLoadError(this.state.error)) return <ChunkFailed />;

      return (
        <div className="flex min-h-[50vh] w-full flex-col items-center justify-center p-6 text-center">
          <div className="flex max-w-md flex-col items-center gap-4 rounded-3xl bg-[hsl(var(--surface-container))] p-6 sm:p-8 shadow-sm">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))]">
              <AlertTriangle className="size-6" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="font-sans text-lg font-semibold tracking-tight text-foreground">
                Something Went Wrong
              </h3>
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred while rendering this section.
              </p>
            </div>
            {this.state.error?.message && (
              <pre className="max-h-24 w-full overflow-auto rounded-lg bg-[hsl(var(--surface-container-high))] p-2.5 text-left font-mono text-xs text-muted-foreground">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex items-center gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={this.resetError}>
                Try again
              </Button>
              <Button size="sm" onClick={this.reloadPage} className="gap-1.5">
                <RotateCcw className="size-3.5" />
                Reload page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
