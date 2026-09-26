import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Top-level error boundary.
 *
 * Without one, any render-time throw unmounts the entire tree and leaves a
 * completely blank white page with no explanation - which is exactly as
 * unhelpful as it sounds. This catches the throw, shows what happened, and
 * offers a way out.
 *
 * Must be a class component: React provides no hook equivalent of
 * componentDidCatch.
 */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept as console.error on purpose: this is the last line of defence, and
    // the stack needs to reach the browser console where a developer will see it.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  private readonly handleHome = (): void => {
    window.location.href = '/';
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-dvh place-items-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
          </div>

          <h1 className="mb-2 text-xl font-semibold">Something went wrong</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            The page failed to render. This is a bug in the application, not something you did.
          </p>

          <pre className="mb-6 max-h-40 overflow-auto rounded-lg border border-border bg-muted p-3 text-left text-xs">
            {error.message}
          </pre>

          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Reload the page
            </button>
            <button
              type="button"
              onClick={this.handleHome}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
