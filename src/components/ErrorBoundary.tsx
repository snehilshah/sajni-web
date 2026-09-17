import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, AlertTriangle } from '@/components/ui/icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled render error caught by ErrorBoundary:', error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  reloadPage = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[50vh] w-full flex-col items-center justify-center p-6 text-center">
          <div className="flex max-w-md flex-col items-center gap-4 rounded-3xl border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container))] p-6 sm:p-8 shadow-sm">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))]">
              <AlertTriangle className="size-6" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="font-sans text-lg font-semibold tracking-tight text-foreground">
                Something went wrong
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
