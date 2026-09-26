import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Button, Badge, Card, CardContent } from '@/components/ui';
import { TooltipProvider } from '@/components/ui/overlays';
import { DataSourceBadge, PnL, EmptyState, ErrorState, Pagination } from '@/components/common';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';

/**
 * Render smoke tests.
 *
 * Written after a `Button asChild` shipped two children into Radix's Slot,
 * which throws on render and blanked the whole application. Lint, typecheck
 * and 327 API tests were all green; nothing caught it because nothing mounted
 * a component. These do.
 */

function wrap(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TooltipProvider>{ui}</TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Button', () => {
  it('renders a plain button with its label', () => {
    wrap(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('shows a spinner and marks itself busy while loading', () => {
    wrap(<Button loading>Saving</Button>);
    const button = screen.getByRole('button', { name: /saving/i });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
  });

  it('renders asChild as a link WITHOUT crashing', () => {
    // The exact regression: Slot requires a single element child. Passing the
    // spinner slot alongside `children` threw "Slot failed to slot onto its
    // children" and took down the entire tree.
    wrap(
      <Button asChild>
        <Link to="/register">Get started</Link>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Get started' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/register');
  });

  it('applies button styling to the slotted child', () => {
    wrap(
      <Button asChild variant="outline" size="lg">
        <Link to="/login">Sign in</Link>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Sign in' }).className).toContain('border');
  });

  it('renders asChild with a nested element tree', () => {
    wrap(
      <Button asChild>
        <Link to="/x">
          <span>Icon</span>
          <span>Label</span>
        </Link>
      </Button>,
    );
    expect(screen.getByRole('link')).toBeInTheDocument();
  });
});

describe('P&L display', () => {
  it('shows a profit with a plus sign and a direction word for screen readers', () => {
    wrap(<PnL value={50_000} currency="INR" percent={4.2} />);
    expect(screen.getByText(/\+.*500\.00/)).toBeInTheDocument();
    // Colour is never the only signal.
    expect(screen.getByText('profit')).toBeInTheDocument();
  });

  it('shows a loss with a minus sign', () => {
    wrap(<PnL value={-50_000} currency="INR" />);
    expect(screen.getByText(/-.*500\.00/)).toBeInTheDocument();
    expect(screen.getByText('loss')).toBeInTheDocument();
  });

  it('renders an em dash when the value is unavailable', () => {
    const { container } = wrap(<PnL value={null} currency="INR" />);
    expect(container.textContent).toContain('—');
  });

  it('formats INR with Indian digit grouping', () => {
    wrap(<PnL value={123_456_789} currency="INR" />);
    expect(screen.getByText(/12,34,567\.89/)).toBeInTheDocument();
  });
});

describe('DataSourceBadge', () => {
  it('labels simulated data as simulated', () => {
    wrap(
      <DataSourceBadge
        meta={{
          source: 'mock',
          asOf: new Date().toISOString(),
          isDelayed: true,
          isSimulated: true,
        }}
      />,
    );
    expect(screen.getByText('Simulated')).toBeInTheDocument();
  });

  it('labels a real provider quote as delayed, never as live', () => {
    wrap(
      <DataSourceBadge
        meta={{
          source: 'yahoo',
          asOf: new Date().toISOString(),
          isDelayed: true,
          isSimulated: false,
        }}
      />,
    );
    expect(screen.getByText('Delayed')).toBeInTheDocument();
    expect(screen.queryByText(/live|real-?time/i)).not.toBeInTheDocument();
  });

  it('renders nothing without metadata', () => {
    const { container } = wrap(<DataSourceBadge meta={undefined} />);
    expect(container.textContent).toBe('');
  });
});

describe('UI states', () => {
  it('renders an empty state with its action', () => {
    wrap(
      <EmptyState
        title="No holdings yet"
        description="Buy a stock to get started."
        action={<Button>Browse</Button>}
      />,
    );
    expect(screen.getByText('No holdings yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument();
  });

  it('renders an error state with a retry and a reference id', () => {
    const onRetry = vi.fn();
    wrap(<ErrorState message="Could not load." requestId="abc-123" onRetry={onRetry} />);

    expect(screen.getByText('Could not load.')).toBeInTheDocument();
    expect(screen.getByText(/abc-123/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('hides pagination when there is only one page', () => {
    const { container } = wrap(<Pagination page={1} totalPages={1} onPageChange={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('disables Previous on the first page', () => {
    wrap(<Pagination page={1} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });
});

describe('primitives', () => {
  it('renders a card with its content', () => {
    wrap(
      <Card>
        <CardContent>Card body</CardContent>
      </Card>,
    );
    expect(screen.getByText('Card body')).toBeInTheDocument();
  });

  it('renders badge variants', () => {
    wrap(<Badge variant="profit">Gain</Badge>);
    expect(screen.getByText('Gain')).toBeInTheDocument();
  });
});

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error; silence it so the run stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('shows a recovery screen instead of a blank page when a child throws', async () => {
    function Boom(): never {
      throw new Error('Simulated render failure');
    }

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
    expect(screen.getByText(/Simulated render failure/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });
});
