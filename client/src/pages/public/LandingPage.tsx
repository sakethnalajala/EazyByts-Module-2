import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Globe2,
  LineChart,
  Menu,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { formatMoney, formatPercent, type MarketIndex } from '@smd/shared';
import { useIndices, useMarketStatus, useMovers } from '@/lib/queries';
import { useRoleTheme } from '@/hooks/useRoleTheme';
import { cn } from '@/lib/utils';
import { Badge, Button, Skeleton } from '@/components/ui';
import { DataSourceBadge, PercentChange } from '@/components/common';
import { AmbientBackground } from '@/components/common/AmbientBackground';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { RoleSelector, RoleSwitcherCompact } from '@/features/auth/RoleSelector';

/**
 * Public landing page.
 *
 * Shows a genuine live market snapshot before sign-in, which is only possible
 * because the market-data endpoints are deliberately public - provider keys
 * stay on the server regardless.
 */
export function LandingPage() {
  const { data: indices, isLoading } = useIndices();
  const { data: status } = useMarketStatus();
  const { data: movers } = useMovers('IN', 6);
  // Explicitly clears any role tint left behind by a visit to /login?role=...
  useRoleTheme(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Condenses the header once the hero scrolls away.
  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const indiaOpen = status?.markets?.find((market) => market.market === 'IN')?.isOpen ?? false;
  const usOpen = status?.markets?.find((market) => market.market === 'US')?.isOpen ?? false;

  return (
    <div className="relative min-h-dvh text-foreground">
      <AmbientBackground variant="landing" particles beam />

      {/* ------------------------------------------------------------ header */}
      <header
        className={cn(
          'sticky top-0 z-40 transition-all duration-300',
          // The divider below is always present; scrolling only adds the
          // frosted backing, so the header gains weight over content without
          // the separator appearing and disappearing.
          scrolled ? 'bg-background/70 shadow-lg backdrop-blur-xl' : '',
        )}
      >
        {/*
          Full-width divider under the header.
          A gradient hairline rather than a flat 1px border: it is strongest
          across the middle, where the navigation sits, and fades out at both
          edges, so it separates the header without drawing a hard line across
          the whole viewport. Colour comes from the role accent, so it tracks
          the active theme.
        */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, var(--glass-border) 18%, ' +
              'var(--role-accent) 50%, var(--glass-border) 82%, transparent 100%)',
            opacity: 0.55,
          }}
        />
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="group flex shrink-0 items-center gap-2.5">
            <span
              className="grid size-9 place-items-center rounded-xl text-white shadow-lg transition-transform duration-300 group-hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, var(--role-accent), var(--role-accent-2))',
                boxShadow: '0 8px 24px -8px var(--role-glow)',
              }}
            >
              <TrendingUp className="size-4.5" aria-hidden="true" />
            </span>
            <span className="hidden text-sm font-semibold tracking-tight sm:block">
              Stock Market Dashboard
            </span>
          </Link>

          {/* Role entry points, right side as specified. */}
          <div className="ml-auto hidden lg:block">
            <RoleSwitcherCompact />
          </div>

          <div className="ml-auto flex items-center gap-1.5 lg:ml-3">
            <ThemeToggle />

            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/login">Sign in</Link>
            </Button>

            <Button size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/register">Get started</Link>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileNav(!mobileNav)}
              aria-label={mobileNav ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileNav}
            >
              {mobileNav ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
          </div>
        </div>

        {mobileNav ? (
          <div className="animate-fade-in border-t border-border/60 bg-background/95 px-4 py-4 backdrop-blur-xl lg:hidden">
            <RoleSwitcherCompact className="mb-3 flex-wrap" />

            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Appearance</span>
              <ThemeToggle showLabels />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild className="flex-1">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild className="flex-1">
                <Link to="/register">Get started</Link>
              </Button>
            </div>
          </div>
        ) : null}
      </header>

      <main>
        {/* -------------------------------------------------------------- hero */}
        <section className="mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
            <div>
              <div className="animate-fade-up mb-5 inline-flex items-center gap-2 rounded-full border border-stale/40 bg-stale-muted px-3 py-1.5 text-xs font-medium text-stale">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Simulated trading &middot; virtual money only
              </div>

              <h1 className="animate-fade-up delay-1 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Learn to trade Indian and US{' '}
                <span className="text-gradient">markets</span> without risking a rupee
              </h1>

              <p className="animate-fade-up delay-2 mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                A full paper-trading platform covering NSE, BSE, NASDAQ and NYSE. Real delayed
                market data, realistic brokerage and tax simulation, and a portfolio that tells you
                honestly how you are doing.
              </p>

              <div className="animate-fade-up delay-3 mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" asChild className="group shadow-lg">
                  <Link to="/register">
                    Create a free account
                    <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="glass">
                  <Link to="/login">Try a demo account</Link>
                </Button>
              </div>

              <p className="animate-fade-up delay-4 mt-4 text-xs text-muted-foreground">
                No payment details. No real brokerage account. Nothing here is investment advice.
              </p>

              {/* Quick credibility strip. */}
              <dl className="animate-fade-up delay-5 mt-9 grid max-w-lg grid-cols-3 gap-4 border-t border-border/60 pt-6">
                {[
                  { label: 'Exchanges', value: '4' },
                  { label: 'Instruments', value: '165' },
                  { label: 'Opening capital', value: '₹10L + $10K' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {stat.label}
                    </dt>
                    <dd className="tabular mt-1 text-lg font-semibold">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Right column: role entry + a live floating market card. */}
            <div className="space-y-4">
              <div className="animate-fade-up delay-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Enter as
                </h2>
                <div className="flex items-center gap-1.5">
                  <MarketPill label="NSE/BSE" open={indiaOpen} />
                  <MarketPill label="US" open={usOpen} />
                </div>
              </div>

              <RoleSelector />

              {/* Floating glass card with real movers. */}
              <div className="animate-fade-up delay-5 panel border-live animate-float relative overflow-hidden rounded-2xl p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Activity className="size-3.5" aria-hidden="true" />
                    Top movers &middot; India
                  </span>
                  <DataSourceBadge meta={movers?.sourceMeta} compact />
                </div>

                <div className="space-y-2">
                  {(movers?.gainers ?? []).slice(0, 3).map((entry) => (
                    <div key={entry.symbol} className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium">{entry.symbol}</span>
                      <span className="flex items-center gap-3">
                        <span className="tabular text-sm text-muted-foreground">
                          {formatMoney(entry.ltp, entry.currency)}
                        </span>
                        <PercentChange value={entry.changePercent} size="sm" />
                      </span>
                    </div>
                  ))}
                  {!movers?.gainers?.length ? (
                    <>
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-5 w-full" />
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- market snapshot */}
        <section className="border-y border-border/40 bg-card/20 py-14 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Market snapshot</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Live index levels across both markets, with the source of every figure on show.
                </p>
              </div>
              <DataSourceBadge meta={indices?.indices[0]?.sourceMeta} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {isLoading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-28 w-full rounded-xl" />
                  ))
                : indices?.indices?.map((index, position) => (
                    <IndexCard key={index.symbol} index={index} position={position} />
                  ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- features */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              Everything you need to practise properly
            </h2>
            <p className="mt-3 text-muted-foreground">
              Built to behave like a real broker, including the parts that cost you money.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <article
                key={feature.title}
                className={cn(
                  'group border-sweep lift sheen panel animate-fade-up relative overflow-hidden rounded-xl p-6',
                  `delay-${String((index % 6) + 1)}`,
                )}
              >
                <div
                  className="mb-4 grid size-11 place-items-center rounded-xl text-white shadow-lg transition-transform duration-300 group-hover:scale-105"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--role-accent), var(--role-accent-2))',
                    boxShadow: '0 10px 28px -12px var(--role-glow)',
                  }}
                >
                  <feature.icon className="size-5" aria-hidden="true" />
                </div>
                <h3 className="mb-2 font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* --------------------------------------------------------- honesty */}
        <section className="border-t border-border/60 py-16">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <Badge variant="stale" className="mb-4">
              What this platform does not do
            </Badge>
            <h2 className="mb-4 text-2xl font-semibold tracking-tight">
              Honest about its own limits
            </h2>
            <p className="text-pretty leading-relaxed text-muted-foreground">
              It does not place real orders, hold real money, or provide a real-time feed. Quotes
              are delayed by roughly fifteen minutes, and when a provider is unavailable the
              platform falls back to a clearly labelled simulator rather than showing you a stale
              number as if it were live. Every price on every screen carries a badge telling you
              exactly where it came from.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/register">Start paper trading</Link>
              </Button>
              <Button variant="outline" asChild className="glass">
                <Link to="/login">Explore a demo account</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
          <p>
            Stock Market Dashboard &middot; An educational paper-trading simulation. Not affiliated
            with NSE, BSE, NASDAQ or NYSE.
          </p>
        </div>
      </footer>
    </div>
  );
}

function MarketPill({ label, open }: { label: string; open: boolean }) {
  return (
    <Badge variant={open ? 'profit' : 'secondary'} className="gap-1.5 text-[11px]">
      <span
        className={cn(
          'inline-block size-1.5 rounded-full',
          open ? 'bg-profit animate-glow-pulse' : 'bg-muted-foreground',
        )}
        aria-hidden="true"
      />
      {label} {open ? 'open' : 'closed'}
    </Badge>
  );
}

function IndexCard({ index, position }: { index: MarketIndex; position: number }) {
  const currency = index.market === 'IN' ? 'INR' : 'USD';
  const up = index.changePercent > 0;
  const down = index.changePercent < 0;

  return (
    <article
      className={cn(
        'group border-sweep lift sheen panel animate-fade-up relative overflow-hidden rounded-xl p-5',
        `delay-${String((position % 6) + 1)}`,
      )}
    >
      {/* Direction tint, very low opacity so it reads as a hint not a fill. */}
      <span
        className={cn(
          'absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100',
          up ? 'bg-profit/[0.06]' : down ? 'bg-loss/[0.06]' : 'bg-muted/40',
        )}
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">{index.name}</p>
          <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight">
            {formatMoney(index.value, currency, { symbol: false })}
          </p>
        </div>

        <Badge variant="outline" className="shrink-0 text-[10px]">
          {index.market === 'IN' ? 'India' : 'US'}
        </Badge>
      </div>

      <div className="relative mt-3 flex items-center justify-between gap-2">
        <PercentChange value={index.changePercent} size="sm" />
        <span
          className={cn(
            'tabular text-xs',
            up ? 'text-profit' : down ? 'text-loss' : 'text-muted-foreground',
          )}
        >
          {formatPercent(index.changePercent)}
        </span>
      </div>
    </article>
  );
}

const FEATURES = [
  {
    icon: Globe2,
    title: 'Two markets, two wallets',
    description:
      'A rupee wallet for NSE and BSE, a dollar wallet for NASDAQ and NYSE. Kept fully separate, so no currency conversion ever muddies your returns.',
  },
  {
    icon: Wallet,
    title: 'Realistic charges',
    description:
      'STT, stamp duty, GST, exchange and SEBI fees on Indian trades; SEC and FINRA fees on US sales. Your P&L reflects what trading actually costs.',
  },
  {
    icon: LineChart,
    title: 'Market and limit orders',
    description:
      'Place market orders that fill immediately or limit orders that rest until your price is reached. Funds and shares are reserved while they wait.',
  },
  {
    icon: BarChart3,
    title: 'Portfolio analytics',
    description:
      'Realised and unrealised P&L, weighted average cost, day and overall returns, sector allocation and win rate. Export to CSV or PDF.',
  },
  {
    icon: Star,
    title: 'Watchlists and alerts',
    description:
      'Track what interests you across both markets and get notified when a price crosses the level you care about.',
  },
  {
    icon: Bell,
    title: 'Live notifications',
    description:
      'Order fills, expiries and triggered alerts arrive in-app as they happen, with a full history you can review later.',
  },
  {
    icon: BookOpen,
    title: 'Learning library',
    description:
      'Written guides on order types, valuation, risk sizing, fees and the behavioural traps that cost most people money.',
  },
  {
    icon: ShieldCheck,
    title: 'Proper account security',
    description:
      'Argon2id password hashing, rotating refresh tokens with reuse detection, and role-based access enforced on the server.',
  },
  {
    icon: Building2,
    title: 'Admin and Super Admin',
    description:
      'Full consoles for user management, trade monitoring, platform configuration, role permissions and an append-only audit log.',
  },
];
