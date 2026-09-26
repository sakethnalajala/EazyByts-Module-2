import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  FlaskConical,
  Inbox,
  Minus,
  RefreshCw,
  ShieldAlert,
  Clock,
} from 'lucide-react';
import { formatMoney, formatPercent, type Currency, type SourceMeta } from '@smd/shared';
import { cn } from '@/lib/utils';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  Skeleton,
} from '@/components/ui';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/overlays';
import { useAuthStore } from '@/stores/authStore';

/**
 * Shared presentational components.
 *
 * Two of these carry the honesty guarantees the whole project rests on:
 *  - `DataSourceBadge` renders the provenance of every price, so a delayed or
 *    simulated number is never shown as if it were live.
 *  - `PnL` always pairs colour with an arrow and a sign, so profit and loss are
 *    distinguishable without relying on colour vision.
 */

// -------------------------------------------------------- data provenance

export function DataSourceBadge({
  meta,
  className,
  compact = false,
}: {
  meta: SourceMeta | undefined;
  className?: string;
  compact?: boolean;
}) {
  if (!meta) return null;

  const asOf = new Date(meta.asOf);
  const ageMinutes = Math.max(0, Math.round((Date.now() - asOf.getTime()) / 60_000));

  const label = meta.isSimulated ? 'Simulated' : meta.source === 'cache' ? 'Cached' : 'Delayed';
  const Icon = meta.isSimulated ? FlaskConical : Clock;

  const explanation = meta.isSimulated
    ? 'This price comes from the built-in market simulator, not a real exchange feed. It is deterministic and clearly fictional.'
    : `Delayed quote from ${meta.source}. Last updated ${ageMinutes < 1 ? 'less than a minute' : `${ageMinutes} minute${ageMinutes === 1 ? '' : 's'}`} ago. This is not a real-time feed.`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Badge
            variant={meta.isSimulated ? 'stale' : 'outline'}
            className={cn('cursor-help font-normal', className)}
          >
            <Icon className="size-3" aria-hidden="true" />
            {compact ? null : label}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent>{explanation}</TooltipContent>
    </Tooltip>
  );
}

/** Persistent banner stating the platform is a simulation. */
export function SimulationNotice({ className }: { className?: string }) {
  return (
    <Alert variant="warning" className={cn('flex items-start gap-2', className)}>
      <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <AlertDescription>
        <strong className="font-semibold">Simulated trading.</strong> Virtual money only. No real
        orders, no real brokerage account, and nothing here is investment advice.
      </AlertDescription>
    </Alert>
  );
}

// --------------------------------------------------------------- P&L display

/**
 * Profit and loss.
 *
 * Colour is never the only signal: an arrow and an explicit sign always
 * accompany it, which is what makes the figure readable for colour-blind users
 * and in high-contrast modes.
 */
export function PnL({
  value,
  currency,
  percent,
  className,
  showIcon = true,
  size = 'default',
}: {
  value: number | null;
  currency: Currency;
  percent?: number | null;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'default' | 'lg';
}) {
  if (value === null) {
    return <span className={cn('tabular text-muted-foreground', className)}>&mdash;</span>;
  }

  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;

  const tone =
    direction === 'up'
      ? 'text-profit'
      : direction === 'down'
        ? 'text-loss'
        : 'text-muted-foreground';

  const sizeClass = size === 'lg' ? 'text-xl font-semibold' : size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span className={cn('tabular inline-flex items-center gap-1', tone, sizeClass, className)}>
      {showIcon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
      <span>{formatMoney(value, currency, { signed: true })}</span>
      {percent !== undefined && percent !== null ? (
        <span className="opacity-80">({formatPercent(percent)})</span>
      ) : null}
      {/* Screen readers get the direction in words, not just a glyph. */}
      <span className="sr-only">
        {direction === 'up' ? 'profit' : direction === 'down' ? 'loss' : 'no change'}
      </span>
    </span>
  );
}

/** A bare percentage with the same colour-plus-arrow treatment. */
export function PercentChange({
  value,
  className,
  size = 'default',
}: {
  value: number | null;
  className?: string;
  size?: 'sm' | 'default';
}) {
  if (value === null) {
    return <span className={cn('tabular text-muted-foreground', className)}>&mdash;</span>;
  }

  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;
  const tone =
    direction === 'up'
      ? 'text-profit'
      : direction === 'down'
        ? 'text-loss'
        : 'text-muted-foreground';

  return (
    <span
      className={cn(
        'tabular inline-flex items-center gap-0.5',
        tone,
        size === 'sm' ? 'text-xs' : 'text-sm',
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      {formatPercent(value)}
    </span>
  );
}

// ------------------------------------------------------------------- states

export function LoadingState({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: typeof Inbox;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      <div className="mb-3 rounded-full bg-muted p-3">
        <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3 className="mb-1 font-medium">{title}</h3>
      <p className="mb-4 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  requestId,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  requestId?: string | undefined;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      <div className="mb-3 rounded-full bg-destructive/10 p-3">
        <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
      </div>
      <h3 className="mb-1 font-medium">{title}</h3>
      <p className="mb-2 max-w-md text-sm text-muted-foreground">{message}</p>
      {requestId ? (
        // Shown so a user can quote it in a bug report and it can be found in
        // the server logs.
        <p className="mb-4 font-mono text-xs text-muted-foreground">Reference: {requestId}</p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function UnauthorizedState({ message }: { message?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-3 rounded-full bg-destructive/10 p-3">
          <ShieldAlert className="size-6 text-destructive" aria-hidden="true" />
        </div>
        <h3 className="mb-1 font-medium">You do not have access to this page</h3>
        <p className="mb-4 max-w-sm text-sm text-muted-foreground">
          {message ?? 'Your account role does not include permission for this area.'}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/app/dashboard">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Shown when a holding or quote could not be priced. */
export function StaleDataWarning({ className }: { className?: string }) {
  return (
    <Alert variant="warning" className={cn('flex items-start gap-2', className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <AlertDescription>
        Some prices could not be refreshed. Values shown use the last known quote and may be out of
        date.
      </AlertDescription>
    </Alert>
  );
}

// -------------------------------------------------------------------- layout

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const role = useAuthStore((state) => state.user?.role);

  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="animate-fade-up">
        {/*
          Super Admin page titles carry the gold gradient. It is the one place
          gold appears as type, which is what keeps it reading as an executive
          tier rather than as decoration.
        */}
        <h1
          className={cn(
            'text-2xl font-semibold tracking-tight sm:text-3xl',
            role === 'super_admin' && 'text-gold',
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sublabel,
  trend,
  icon: Icon,
  className,
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  trend?: ReactNode;
  icon?: typeof Inbox;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
        </div>
        <div className="tabular text-2xl font-semibold tracking-tight">{value}</div>
        {sublabel ? <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div> : null}
        {trend ? <div className="mt-2">{trend}</div> : null}
      </CardContent>
    </Card>
  );
}

export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
    >
      {children}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

/** Simple page-number pagination for list views. */
export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="flex items-center justify-between gap-2 pt-4" aria-label="Pagination">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        Previous
      </Button>
      <span className="tabular text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        Next
      </Button>
    </nav>
  );
}
