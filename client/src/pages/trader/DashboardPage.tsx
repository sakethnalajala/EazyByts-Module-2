import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  Briefcase,
  Newspaper,
  Receipt,
  Star,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { formatMoney, type Market, type WalletSummary } from '@smd/shared';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import {
  useAllocation,
  useHoldings,
  useIndices,
  useMovers,
  useNews,
  useOrders,
  usePerformance,
  usePortfolio,
  useWatchlists,
} from '@/lib/queries';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import {
  DataSourceBadge,
  EmptyState,
  PageHeader,
  PercentChange,
  PnL,
  SectionLink,
  SimulationNotice,
  StaleDataWarning,
  StatCard,
} from '@/components/common';
import { AllocationChart, PortfolioValueChart } from '@/components/charts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/overlays';

/**
 * Trader dashboard.
 *
 * Widget visibility and order come from the UI store, so the layout the user
 * configures in Settings is what renders here.
 */
export function DashboardPage() {
  const { user } = useAuthStore();
  const { widgets, activeMarket, setActiveMarket } = useUiStore();

  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { data: indices } = useIndices();
  const { data: holdings } = useHoldings();
  const { data: orders } = useOrders({ limit: 5 });
  const { data: watchlists } = useWatchlists();
  const { data: movers } = useMovers(activeMarket, 5);
  const { data: allocation } = useAllocation();
  const { data: performance } = usePerformance('1M');
  const { data: news } = useNews({ limit: 4 });

  const visible = useMemo(
    () =>
      new Set(
        [...widgets]
          .sort((a, b) => a.order - b.order)
          .filter((w) => w.visible)
          .map((w) => w.id),
      ),
    [widgets],
  );

  const wallets = portfolio?.wallets ?? [];
  const hasStale = wallets.some((wallet) => wallet.hasStalePrices);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.firstName ?? 'trader'}`}
        description="Your simulated portfolio across Indian and US markets."
        actions={
          <>
            <Select
              value={activeMarket}
              onValueChange={(value) => setActiveMarket(value as Market)}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN">India (NSE/BSE)</SelectItem>
                <SelectItem value="US">US (NASDAQ/NYSE)</SelectItem>
              </SelectContent>
            </Select>
            <Button asChild>
              <Link to="/app/stocks">
                Explore stocks
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </>
        }
      />

      <SimulationNotice />
      {hasStale ? <StaleDataWarning /> : null}

      {/* ------------------------------------------------ portfolio summary */}
      {visible.has('portfolio-summary') ? (
        portfolioLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {wallets.map((wallet) => (
              <WalletCard key={wallet.market} wallet={wallet} />
            ))}
            <StatCard
              label="Holdings"
              value={portfolio?.holdingsCount ?? 0}
              sublabel={`${portfolio?.openOrdersCount ?? 0} open order(s)`}
              icon={Briefcase}
            />
            <StatCard
              label="Combined value"
              value={formatMoney(portfolio?.indicative.totalValue ?? 0, 'INR', { compact: true })}
              sublabel="Indicative only - wallets are segregated"
              icon={Wallet}
            />
          </div>
        )
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* ------------------------------------------ performance chart */}
          {visible.has('performance-chart') ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Portfolio value (30 days)</CardTitle>
                <SectionLink to="/app/analytics">Analytics</SectionLink>
              </CardHeader>
              <CardContent>
                <PortfolioValueChart data={performance?.series ?? []} currency="INR" height={260} />
              </CardContent>
            </Card>
          ) : null}

          {/* ------------------------------------------------- holdings */}
          {visible.has('holdings') ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Top holdings</CardTitle>
                <SectionLink to="/app/holdings">All holdings</SectionLink>
              </CardHeader>
              <CardContent className="px-0">
                {!holdings?.holdings?.length ? (
                  <EmptyState
                    icon={Briefcase}
                    title="No holdings yet"
                    description="Buy your first stock and it will appear here."
                    action={
                      <Button asChild size="sm">
                        <Link to="/app/stocks">Browse stocks</Link>
                      </Button>
                    }
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">P&amp;L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {holdings.holdings.slice(0, 5).map((holding) => (
                        <TableRow key={holding.id}>
                          <TableCell>
                            <Link
                              to={`/app/stocks/${holding.symbol}?exchange=${holding.exchange}`}
                              className="font-medium hover:underline"
                            >
                              {holding.symbol}
                            </Link>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {holding.exchange}
                            </span>
                          </TableCell>
                          <TableCell className="tabular text-right">{holding.quantity}</TableCell>
                          <TableCell className="tabular text-right">
                            {holding.marketValue === null
                              ? 'Stale'
                              : formatMoney(holding.marketValue, holding.currency, {
                                  compact: true,
                                })}
                          </TableCell>
                          <TableCell className="text-right">
                            <PnL
                              value={holding.unrealisedPnl}
                              currency={holding.currency}
                              percent={holding.unrealisedPnlPercent}
                              size="sm"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}

          {/* ------------------------------------------- recent orders */}
          {visible.has('recent-orders') ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Recent orders</CardTitle>
                <SectionLink to="/app/orders">All orders</SectionLink>
              </CardHeader>
              <CardContent className="px-0">
                {!orders?.data?.length ? (
                  <EmptyState
                    icon={Receipt}
                    title="No orders yet"
                    description="Your order history will appear here once you place a trade."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.data.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.symbol}</TableCell>
                          <TableCell>
                            <Badge variant={order.side === 'BUY' ? 'profit' : 'loss'}>
                              {order.side}
                            </Badge>
                          </TableCell>
                          <TableCell className="tabular text-right">{order.quantity}</TableCell>
                          <TableCell className="text-right">
                            <OrderStatusBadge status={order.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* ----------------------------------------------------- sidebar */}
        <div className="space-y-6">
          {visible.has('market-indices') ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Indices</CardTitle>
                <DataSourceBadge meta={indices?.indices[0]?.sourceMeta} compact />
              </CardHeader>
              <CardContent className="space-y-3">
                {(indices?.indices ?? []).slice(0, 6).map((index) => (
                  <div key={index.symbol} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{index.name}</p>
                      <p className="tabular text-xs text-muted-foreground">
                        {formatMoney(index.value, index.market === 'IN' ? 'INR' : 'USD', {
                          symbol: false,
                        })}
                      </p>
                    </div>
                    <PercentChange value={index.changePercent} size="sm" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {visible.has('movers') ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Today&apos;s movers</CardTitle>
                <DataSourceBadge meta={movers?.sourceMeta} compact />
              </CardHeader>
              <CardContent className="space-y-4">
                <MoverList title="Gainers" icon={TrendingUp} entries={movers?.gainers ?? []} />
                <MoverList title="Losers" icon={TrendingDown} entries={movers?.losers ?? []} />
              </CardContent>
            </Card>
          ) : null}

          {visible.has('watchlist') ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Watchlist</CardTitle>
                <SectionLink to="/app/watchlist">Manage</SectionLink>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {!watchlists?.watchlists[0]?.items?.length ? (
                  <EmptyState
                    icon={Star}
                    title="Nothing watched yet"
                    description="Add stocks to follow their prices."
                  />
                ) : (
                  watchlists.watchlists[0].items.slice(0, 6).map((item) => (
                    <Link
                      key={`${item.exchange}-${item.symbol}`}
                      to={`/app/stocks/${item.symbol}?exchange=${item.exchange}`}
                      className="flex items-center justify-between gap-3 rounded-md px-1 py-1 hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.symbol}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {item.ltp === null ? 'Stale' : formatMoney(item.ltp, item.currency)}
                        </p>
                      </div>
                      <PercentChange value={item.changePercent} size="sm" />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}

          {visible.has('allocation') ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Allocation by sector</CardTitle>
              </CardHeader>
              <CardContent>
                <AllocationChart data={allocation?.bySector ?? []} currency="INR" height={220} />
              </CardContent>
            </Card>
          ) : null}

          {visible.has('news') ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Market news</CardTitle>
                <SectionLink to="/app/news">More</SectionLink>
              </CardHeader>
              <CardContent className="space-y-3">
                {!news?.data?.length ? (
                  <EmptyState icon={Newspaper} title="No news" description="Check back shortly." />
                ) : (
                  news.data.slice(0, 4).map((article) => (
                    <div key={article.id} className="space-y-1">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">
                        {article.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{article.source}</span>
                        <DataSourceBadge meta={article.sourceMeta} compact />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function WalletCard({ wallet }: { wallet: WalletSummary }) {
  return (
    <StatCard
      label={`${wallet.market === 'IN' ? 'India' : 'US'} wallet`}
      value={formatMoney(wallet.totalValue, wallet.currency, { compact: true })}
      sublabel={`Cash ${formatMoney(wallet.cashAvailable, wallet.currency, { compact: true })}`}
      trend={
        <PnL
          value={wallet.overallReturn}
          currency={wallet.currency}
          percent={wallet.overallReturnPercent}
          size="sm"
        />
      }
      icon={Activity}
    />
  );
}

function MoverList({
  title,
  icon: Icon,
  entries,
}: {
  title: string;
  icon: typeof TrendingUp;
  entries: {
    symbol: string;
    exchange: string;
    changePercent: number;
    ltp: number;
    currency: 'INR' | 'USD';
  }[];
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
      </p>
      <div className="space-y-1.5">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">No data.</p>
        ) : (
          entries.map((entry) => (
            <Link
              key={`${entry.exchange}-${entry.symbol}`}
              to={`/app/stocks/${entry.symbol}?exchange=${entry.exchange}`}
              className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent"
            >
              <span className="truncate font-medium">{entry.symbol}</span>
              <PercentChange value={entry.changePercent} size="sm" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  const variant =
    status === 'FILLED'
      ? 'profit'
      : status === 'PENDING'
        ? 'default'
        : status === 'REJECTED'
          ? 'destructive'
          : 'secondary';

  return <Badge variant={variant}>{status}</Badge>;
}
