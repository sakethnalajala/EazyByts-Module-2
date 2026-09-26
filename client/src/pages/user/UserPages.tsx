import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BookOpen,
  Clock,
  Eye,
  Globe2,
  GraduationCap,
  Mail,
  Newspaper,
  Search,
  Star,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { formatMoney, ROLE_LABELS } from '@smd/shared';
import {
  useEducation,
  useIndices,
  useInstrumentList,
  useMarketStatus,
  useMovers,
  useNews,
  useWatchlists,
} from '@/lib/queries';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
} from '@/components/ui';
import {
  DataSourceBadge,
  EmptyState,
  ErrorState,
  PnL,
  LoadingState,
  PageHeader,
  PercentChange,
  StatCard,
} from '@/components/common';

/**
 * The six portals for the view-only User role.
 *
 * Every page here is strictly read-only. That is enforced by the server - the
 * User bundle holds no mutating permission - so these components simply have
 * no affordance to trade, and say so where a visitor might expect one.
 */

/** Shown wherever a Trader would see a Buy/Sell control. */
function ViewOnlyNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'glass flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-xs text-muted-foreground',
        className,
      )}
    >
      <Eye className="mt-0.5 size-3.5 shrink-0 text-role" aria-hidden="true" />
      <span>
        This is a view-only account. Trading, orders and portfolio tools need a Trader account.{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Create one
        </Link>
        .
      </span>
    </div>
  );
}

// ------------------------------------------------------------- 1. dashboard

export function UserDashboardPage() {
  const user = useAuthStore((state) => state.user);
  const { data: indices, isLoading: indicesLoading } = useIndices();
  const { data: status } = useMarketStatus();
  const { data: movers } = useMovers('IN', 5);
  const { data: news } = useNews({ limit: 4 });
  const { data: watchlists } = useWatchlists();
  const { data: education } = useEducation({ limit: 3 });

  const indiaOpen = status?.markets?.find((m) => m.market === 'IN')?.isOpen ?? false;
  const usOpen = status?.markets?.find((m) => m.market === 'US')?.isOpen ?? false;
  const watchCount = watchlists?.watchlists?.[0]?.items?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${user?.firstName ?? 'there'}`}
        description="A read-only view of both markets, your watchlist and the learning library."
      />

      <ViewOnlyNotice />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="NSE / BSE"
          value={<Badge variant={indiaOpen ? 'profit' : 'secondary'}>{indiaOpen ? 'Open' : 'Closed'}</Badge>}
          sublabel="Indian markets"
          icon={Globe2}
        />
        <StatCard
          label="NASDAQ / NYSE"
          value={<Badge variant={usOpen ? 'profit' : 'secondary'}>{usOpen ? 'Open' : 'Closed'}</Badge>}
          sublabel="US markets"
          icon={Globe2}
        />
        <StatCard label="Watchlist" value={watchCount} sublabel="symbols followed" icon={Star} />
        <StatCard
          label="Learning"
          // meta.total, not data.length - the query is limited to 3 for the
          // preview list below, which would otherwise under-report the library.
          value={education?.meta?.total ?? 0}
          sublabel="resources available"
          icon={GraduationCap}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Market indices</CardTitle>
          <DataSourceBadge meta={indices?.indices?.[0]?.sourceMeta} />
        </CardHeader>
        <CardContent>
          {indicesLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : !indices?.indices?.length ? (
            <EmptyState title="No index data" description="Index levels are unavailable right now." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {indices.indices.map((index) => (
                <div key={index.symbol} className="glass rounded-lg p-3.5">
                  <p className="truncate text-xs font-medium text-muted-foreground">{index.name}</p>
                  <p className="tabular mt-1 text-lg font-semibold">
                    {(index.value / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  <PercentChange value={index.changePercent} className="mt-0.5 text-xs" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <MoversCard title="Top gainers" icon={TrendingUp} rows={movers?.gainers ?? []} />
        <MoversCard title="Top losers" icon={TrendingDown} rows={movers?.losers ?? []} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Latest news</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/u/news">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {!news?.data?.length ? (
              <EmptyState title="No articles yet" description="Market news will appear here." />
            ) : (
              news.data.slice(0, 4).map((article) => (
                <div key={article.id} className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
                  <p className="text-sm font-medium leading-snug">{article.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {article.source} &middot; {new Date(article.publishedAt).toLocaleDateString()}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Start learning</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/u/education">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {!education?.data?.length ? (
              <EmptyState title="No resources yet" description="Learning content will appear here." />
            ) : (
              education.data.slice(0, 3).map((resource) => (
                <Link
                  key={resource.id}
                  to={`/u/education/${resource.slug}`}
                  className="glass lift block rounded-lg p-3"
                >
                  <p className="text-sm font-medium">{resource.title}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{resource.category}</Badge>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" aria-hidden="true" />
                      {resource.readMinutes} min
                    </span>
                  </p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MoversCard({
  title,
  icon: Icon,
  rows,
}: {
  title: string;
  icon: typeof TrendingUp;
  rows: { symbol: string; name?: string; ltp: number; changePercent: number; currency?: string }[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title="No data" description="Movers are unavailable right now." />
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.symbol} className="flex items-center justify-between gap-3 text-sm">
                <span className="tabular font-medium">{row.symbol}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular text-muted-foreground">
                    {formatMoney(row.ltp, (row.currency as 'INR' | 'USD') ?? 'INR')}
                  </span>
                  <PercentChange value={row.changePercent} className="w-16 justify-end text-xs" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- 2. market

type SortKey = 'name' | 'price' | 'change' | 'market' | 'sector';

const EXCHANGE_FILTERS = ['all', 'NSE', 'BSE', 'NASDAQ', 'NYSE'] as const;
type ExchangeFilter = (typeof EXCHANGE_FILTERS)[number];

export function UserMarketPage() {
  const [term, setTerm] = useState('');
  const [exchange, setExchange] = useState<ExchangeFilter>('all');
  const [sector, setSector] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [ascending, setAscending] = useState(true);

  /*
   * The query term is optional server-side, which is what lets the first paint
   * show the whole universe instead of an empty state. Exchange and sector are
   * filtered on the server so the row budget is spent on matches; only sorting
   * happens here, over the page already returned.
   */
  const { data, isLoading, isError, refetch } = useInstrumentList({
    limit: 300,
    ...(term.trim() ? { q: term.trim() } : {}),
    ...(exchange !== 'all' ? { exchange } : {}),
    ...(sector !== 'all' ? { sector } : {}),
  });

  const { data: status } = useMarketStatus();
  const { data: movers } = useMovers('IN', 5);

  const indiaOpen = status?.markets?.find((m) => m.market === 'IN')?.isOpen ?? false;
  const usOpen = status?.markets?.find((m) => m.market === 'US')?.isOpen ?? false;

  const rows = useMemo(() => {
    const list = [...(data?.results ?? [])];
    const direction = ascending ? 1 : -1;

    list.sort((a, b) => {
      switch (sortKey) {
        case 'price':
          // Nulls sort last whichever way the column points: a missing price
          // is unknown, not cheap.
          if (a.ltp === null) return 1;
          if (b.ltp === null) return -1;
          return (a.ltp - b.ltp) * direction;
        case 'change':
          if (a.changePercent === null) return 1;
          if (b.changePercent === null) return -1;
          return (a.changePercent - b.changePercent) * direction;
        case 'market':
          return a.exchange.localeCompare(b.exchange) * direction;
        case 'sector':
          return (a.sector ?? '').localeCompare(b.sector ?? '') * direction;
        default:
          return a.name.localeCompare(b.name) * direction;
      }
    });
    return list;
  }, [data, sortKey, ascending]);

  const toggleSort = (key: SortKey): void => {
    if (key === sortKey) {
      setAscending((value) => !value);
    } else {
      setSortKey(key);
      setAscending(true);
    }
  };

  const arrow = (key: SortKey): string =>
    sortKey === key ? (ascending ? ' ↑' : ' ↓') : '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Explore Stocks"
        description="Browse stocks and market information across NSE, BSE, NASDAQ and NYSE."
        actions={
          <div className="flex items-center gap-1.5">
            <Badge variant={indiaOpen ? 'profit' : 'secondary'}>
              NSE/BSE {indiaOpen ? 'open' : 'closed'}
            </Badge>
            <Badge variant={usOpen ? 'profit' : 'secondary'}>US {usOpen ? 'open' : 'closed'}</Badge>
          </div>
        }
      />

      <ViewOnlyNotice />

      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search by symbol or company name, e.g. TCS, RELIANCE, Infosys"
              aria-label="Search stocks"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1.5">
              {EXCHANGE_FILTERS.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={exchange === option ? 'default' : 'outline'}
                  onClick={() => setExchange(option)}
                >
                  {option === 'all' ? 'All markets' : option}
                </Button>
              ))}
            </div>

            {data?.sectors?.length ? (
              <select
                value={sector}
                onChange={(event) => setSector(event.target.value)}
                aria-label="Filter by sector"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All sectors</option>
                {data.sectors.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : null}

            <span className="ml-auto text-xs text-muted-foreground">
              Showing {rows.length} of {data?.total ?? 0}
            </span>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={8} />
      ) : isError ? (
        <ErrorState message="Could not load the instrument list." onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching stocks"
          description="Nothing matches that search or filter. Try a different symbol, company or market."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Symbol</th>
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('name')} className="hover:text-foreground">
                        Company{arrow('name')}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('market')} className="hover:text-foreground">
                        Market{arrow('market')}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('sector')} className="hover:text-foreground">
                        Sector{arrow('sector')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      <button type="button" onClick={() => toggleSort('price')} className="hover:text-foreground">
                        Price{arrow('price')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Change</th>
                    <th className="px-4 py-3 text-right font-medium">
                      <button type="button" onClick={() => toggleSort('change')} className="hover:text-foreground">
                        % Change{arrow('change')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.exchange}-${row.symbol}`}
                      className="border-b border-border/40 transition-colors last:border-0 hover:bg-accent/40"
                    >
                      <td className="tabular px-4 py-3 font-medium">
                        <Link
                          to={`/u/market/${row.symbol}?exchange=${row.exchange}`}
                          className="hover:text-primary hover:underline"
                        >
                          {row.symbol}
                        </Link>
                      </td>
                      <td className="max-w-[16rem] truncate px-4 py-3 text-muted-foreground">
                        {row.name}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{row.exchange}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.sector ?? '—'}</td>
                      <td className="tabular px-4 py-3 text-right">
                        {row.ltp === null ? '—' : formatMoney(row.ltp, row.currency)}
                      </td>
                      <td className="tabular px-4 py-3 text-right">
                        {row.change === null ? (
                          '—'
                        ) : (
                          <PnL value={row.change} currency={row.currency} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.changePercent === null ? (
                          '—'
                        ) : (
                          <PercentChange value={row.changePercent} className="justify-end text-xs" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <MoversCard title="Top gainers" icon={TrendingUp} rows={movers?.gainers ?? []} />
        <MoversCard title="Top losers" icon={TrendingDown} rows={movers?.losers ?? []} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------- 3. watchlist

export function UserWatchlistPage() {
  const { data, isLoading } = useWatchlists();
  const list = data?.watchlists?.[0];

  return (
    <div className="space-y-6">
      <PageHeader title="Watchlist" description="The symbols you are following, updated on each refresh." />

      <ViewOnlyNotice />

      {isLoading ? (
        <LoadingState rows={5} />
      ) : !list?.items?.length ? (
        <EmptyState
          icon={Star}
          title="Your watchlist is empty"
          description="A Trader account can add and remove symbols."
        />
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{list.name}</CardTitle>
            <Badge variant="secondary">{list.items.length} symbols</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Symbol</th>
                    <th className="px-4 py-3 font-medium">Exchange</th>
                    <th className="px-4 py-3 text-right font-medium">Price</th>
                    <th className="px-4 py-3 text-right font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((item) => (
                    <tr
                      key={`${item.symbol}-${item.exchange}`}
                      className="border-b border-border/40 transition-colors last:border-0 hover:bg-accent/40"
                    >
                      <td className="tabular px-4 py-3 font-medium">
                        <Link
                          to={`/u/market/${item.symbol}`}
                          className="hover:text-primary hover:underline"
                        >
                          {item.symbol}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.exchange}</td>
                      <td className="tabular px-4 py-3 text-right">
                        {item.ltp === null ? '—' : formatMoney(item.ltp, item.currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.changePercent === null ? (
                          '—'
                        ) : (
                          <PercentChange
                            value={item.changePercent}
                            className="justify-end text-xs"
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ 4. news

export function UserNewsPage() {
  const { data, isLoading } = useNews({ limit: 30 });

  return (
    <div className="space-y-6">
      <PageHeader title="Market news" description="Headlines across the Indian and US markets." />

      {isLoading ? (
        <LoadingState rows={6} />
      ) : !data?.data?.length ? (
        <EmptyState icon={Newspaper} title="No articles" description="News will appear here." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.data.map((article) => (
            <Card key={article.id} interactive>
              <CardContent className="space-y-3 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  {article.symbols.slice(0, 3).map((symbol) => (
                    <Badge key={symbol} variant="outline" className="tabular">
                      {symbol}
                    </Badge>
                  ))}
                  <DataSourceBadge meta={article.sourceMeta} />
                </div>

                <h3 className="text-base font-semibold leading-snug">{article.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{article.summary}</p>

                <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                  <span>
                    {article.source} &middot;{' '}
                    {new Date(article.publishedAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                  {article.url ? (
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      Read
                      <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- 5. education

export function UserEducationPage() {
  const [category, setCategory] = useState<string>('all');
  const { data, isLoading } = useEducation({ limit: 50 });

  const categories = useMemo(() => {
    const set = new Set((data?.data ?? []).map((item) => item.category));
    return ['all', ...Array.from(set).sort()];
  }, [data]);

  const resources = useMemo(() => {
    const rows = data?.data ?? [];
    return category === 'all' ? rows : rows.filter((row) => row.category === category);
  }, [data, category]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Education"
        description="Work through the fundamentals before risking anything, even virtual money."
      />

      {categories.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {categories.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={category === option ? 'default' : 'outline'}
              onClick={() => setCategory(option)}
            >
              {option === 'all' ? 'All topics' : option}
            </Button>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <LoadingState rows={6} />
      ) : resources.length === 0 ? (
        <EmptyState icon={BookOpen} title="No resources" description="Content will appear here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((resource) => (
            <Link key={resource.id} to={`/u/education/${resource.slug}`} className="block">
              <Card interactive className="h-full">
                <CardContent className="flex h-full flex-col gap-3 py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{resource.category}</Badge>
                    <Badge variant="outline">{resource.level}</Badge>
                  </div>

                  <h3 className="text-base font-semibold leading-snug">{resource.title}</h3>
                  <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                    {resource.summary}
                  </p>

                  <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden="true" />
                    {resource.readMinutes} min read
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------- 6. profile

export function UserProfilePage() {
  const user = useAuthStore((state) => state.user);

  const rows: { label: string; value: string }[] = [
    { label: 'Name', value: user?.fullName ?? '—' },
    { label: 'Email', value: user?.email ?? '—' },
    { label: 'Account type', value: user?.isDemo ? 'Demo account' : 'Standard account' },
    { label: 'Role', value: user ? ROLE_LABELS[user.role] : '—' },
    { label: 'Status', value: user?.status ?? '—' },
    {
      label: 'Member since',
      value: user?.createdAt
        ? new Date(user.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })
        : '—',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Your account details." />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <dl>
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 border-b border-border/40 px-5 py-3.5 last:border-0"
                >
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="text-sm font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What this account can do</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              A User account is read-only by design. It can browse the market, follow a watchlist,
              read news and study the education library.
            </p>
            <p className="text-muted-foreground">
              Placing orders, holding a portfolio and tracking P&amp;L require a Trader account.
              The restriction is enforced by the server, not just hidden in this interface.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/register">
                <Mail className="size-4" aria-hidden="true" />
                Create a Trader account
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
