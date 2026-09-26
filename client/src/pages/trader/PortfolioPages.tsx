import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Briefcase, Download, FileText, Receipt, XCircle } from 'lucide-react';
import {
  formatMoney,
  formatPercent,
  type Market,
  type Order,
  type WalletSummary,
} from '@smd/shared';
import { api, ApiClientError } from '@/lib/apiClient';
import {
  useAllocation,
  useCancelOrder,
  useHoldings,
  useOrders,
  usePerformance,
  usePortfolio,
  useTradeStats,
  useTransactions,
} from '@/lib/queries';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/overlays';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  PnL,
  StaleDataWarning,
  StatCard,
} from '@/components/common';
import { AllocationChart, PortfolioValueChart } from '@/components/charts';
import { OrderStatusBadge } from './DashboardPage';

/** Market filter shared by several portfolio pages. */
function MarketFilter({
  value,
  onChange,
}: {
  value: Market | 'all';
  onChange: (value: Market | 'all') => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Market | 'all')}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Both wallets</SelectItem>
        <SelectItem value="IN">India (INR)</SelectItem>
        <SelectItem value="US">US (USD)</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ExportButtons({ market }: { market: Market | 'all' }) {
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (format: 'csv' | 'pdf', report: string): Promise<void> => {
    setBusy(`${format}-${report}`);
    try {
      await api.download(
        '/portfolio/export',
        { format, report, ...(market !== 'all' ? { market } : {}) },
        `portfolio-${report}.${format}`,
      );
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void download('csv', 'holdings')}
        loading={busy === 'csv-holdings'}
      >
        <Download className="size-4" />
        Holdings CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void download('csv', 'transactions')}
        loading={busy === 'csv-transactions'}
      >
        <Download className="size-4" />
        Transactions CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void download('pdf', 'summary')}
        loading={busy === 'pdf-summary'}
      >
        <FileText className="size-4" />
        PDF report
      </Button>
    </div>
  );
}

// ------------------------------------------------------------- portfolio

export function PortfolioPage() {
  const [market, setMarket] = useState<Market | 'all'>('all');
  const marketParam = market === 'all' ? undefined : market;

  const { data, isLoading, isError, error, refetch } = usePortfolio(marketParam);
  const { data: allocation } = useAllocation(marketParam);
  const { data: performance } = usePerformance('3M', marketParam);

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) {
    return (
      <ErrorState
        message={error instanceof ApiClientError ? error.message : 'Could not load your portfolio.'}
        onRetry={() => void refetch()}
      />
    );
  }

  const wallets = data?.wallets ?? [];
  const hasStale = wallets.some((wallet) => wallet.hasStalePrices);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio"
        description="Your two segregated wallets. No currency conversion happens in the ledger."
        actions={
          <>
            <MarketFilter value={market} onChange={setMarket} />
            <ExportButtons market={market} />
          </>
        }
      />

      {hasStale ? <StaleDataWarning /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {wallets.map((wallet) => (
          <WalletPanel key={wallet.market} wallet={wallet} />
        ))}
      </div>

      {data?.indicative ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Combined value (indicative)
              </p>
              <p className="tabular text-xl font-semibold">
                {formatMoney(data.indicative.totalValue, 'INR')}
              </p>
            </div>
            <p className="max-w-md text-xs text-muted-foreground">{data.indicative.disclaimer}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Value over time</CardTitle>
          </CardHeader>
          <CardContent>
            <PortfolioValueChart data={performance?.series ?? []} currency="INR" />
            {performance?.note ? (
              <p className="mt-2 text-xs text-muted-foreground">{performance.note}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="sector">
              <TabsList>
                <TabsTrigger value="sector">Sector</TabsTrigger>
                <TabsTrigger value="holding">Holding</TabsTrigger>
                <TabsTrigger value="cash">Cash</TabsTrigger>
              </TabsList>
              <TabsContent value="sector">
                <AllocationChart data={allocation?.bySector ?? []} currency="INR" />
              </TabsContent>
              <TabsContent value="holding">
                <AllocationChart data={allocation?.byHolding ?? []} currency="INR" />
              </TabsContent>
              <TabsContent value="cash">
                <AllocationChart data={allocation?.cashVsInvested ?? []} currency="INR" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function WalletPanel({ wallet }: { wallet: WalletSummary }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          {wallet.market === 'IN' ? 'India wallet' : 'US wallet'}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{wallet.currency}</span>
        </CardTitle>
        <PnL
          value={wallet.overallReturn}
          currency={wallet.currency}
          percent={wallet.overallReturnPercent}
        />
      </CardHeader>
      <CardContent className="space-y-2.5 text-sm">
        <Row label="Total value" value={formatMoney(wallet.totalValue, wallet.currency)} emphasis />
        <Row label="Cash available" value={formatMoney(wallet.cashAvailable, wallet.currency)} />
        {wallet.cashBlocked > 0 ? (
          <Row
            label="Reserved (open orders)"
            value={formatMoney(wallet.cashBlocked, wallet.currency)}
          />
        ) : null}
        <Row label="Holdings value" value={formatMoney(wallet.holdingsValue, wallet.currency)} />
        <Row label="Invested" value={formatMoney(wallet.investedAmount, wallet.currency)} />
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Unrealised P&amp;L</span>
          <PnL value={wallet.unrealisedPnl} currency={wallet.currency} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Realised P&amp;L</span>
          <PnL value={wallet.realisedPnl} currency={wallet.currency} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Day change</span>
          <PnL
            value={wallet.dayChange}
            currency={wallet.currency}
            percent={wallet.dayChangePercent}
          />
        </div>
        <Row label="Charges paid" value={formatMoney(wallet.totalFeesPaid, wallet.currency)} />
        <Row label="Opening capital" value={formatMoney(wallet.initialCapital, wallet.currency)} />
      </CardContent>
    </Card>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${emphasis ? 'font-semibold' : ''}`}>
      <span className={emphasis ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

// -------------------------------------------------------------- holdings

export function HoldingsPage() {
  const [market, setMarket] = useState<Market | 'all'>('all');
  const { data, isLoading, isError, refetch } = useHoldings(market === 'all' ? undefined : market);

  const holdings = data?.holdings ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Holdings"
        description="Every open position, valued at the latest available price."
        actions={<MarketFilter value={market} onChange={setMarket} />}
      />

      {holdings.some((holding) => holding.isStale) ? <StaleDataWarning /> : null}

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="p-5">
              <LoadingState rows={5} />
            </div>
          ) : isError ? (
            <ErrorState message="Could not load holdings." onRetry={() => void refetch()} />
          ) : holdings.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No holdings yet"
              description="When you buy a stock it will appear here with its cost basis and live P&L."
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
                  <TableHead className="text-right">Avg cost</TableHead>
                  <TableHead className="text-right">Last price</TableHead>
                  <TableHead className="text-right">Invested</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Unrealised P&amp;L</TableHead>
                  <TableHead className="text-right">Day</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((holding) => (
                  <TableRow key={holding.id}>
                    <TableCell>
                      <Link
                        to={`/app/stocks/${holding.symbol}?exchange=${holding.exchange}`}
                        className="font-medium hover:underline"
                      >
                        {holding.symbol}
                      </Link>
                      <div className="text-xs text-muted-foreground">{holding.exchange}</div>
                      {holding.isStale ? (
                        <Badge variant="stale" className="mt-1">
                          Stale price
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {holding.quantity}
                      {holding.blockedQuantity > 0 ? (
                        <div className="text-xs text-muted-foreground">
                          {holding.blockedQuantity} reserved
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatMoney(holding.averageCost, holding.currency)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {holding.lastPrice === null
                        ? '--'
                        : formatMoney(holding.lastPrice, holding.currency)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatMoney(holding.investedAmount, holding.currency)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {holding.marketValue === null
                        ? '--'
                        : formatMoney(holding.marketValue, holding.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <PnL
                        value={holding.unrealisedPnl}
                        currency={holding.currency}
                        percent={holding.unrealisedPnlPercent}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <PnL
                        value={holding.dayChange}
                        currency={holding.currency}
                        percent={holding.dayChangePercent}
                        size="sm"
                        showIcon={false}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- orders

export function OrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('all');

  const { data, isLoading, isError, refetch } = useOrders({
    page,
    limit: 20,
    ...(status !== 'all' ? { status } : {}),
  });
  const cancelMutation = useCancelOrder();

  const cancel = async (order: Order): Promise<void> => {
    try {
      await cancelMutation.mutateAsync(order.id);
      toast.success(`Order for ${order.symbol} cancelled; reserved funds returned.`);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not cancel the order.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Every order you have placed, including those still resting."
        actions={
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="FILLED">Filled</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="p-5">
              <LoadingState rows={5} />
            </div>
          ) : isError ? (
            <ErrorState message="Could not load orders." onRetry={() => void refetch()} />
          ) : !data?.data?.length ? (
            <EmptyState
              icon={Receipt}
              title="No orders"
              description={
                status === 'all'
                  ? 'Place your first trade and it will show up here.'
                  : `You have no ${status.toLowerCase()} orders.`
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Placed</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(order.placedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/app/stocks/${order.symbol}?exchange=${order.exchange}`}
                          className="font-medium hover:underline"
                        >
                          {order.symbol}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={order.side === 'BUY' ? 'profit' : 'loss'}>
                          {order.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {order.type}
                        {order.type === 'LIMIT' ? (
                          <div className="text-muted-foreground">{order.validity}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular text-right">{order.quantity}</TableCell>
                      <TableCell className="tabular text-right">
                        {order.averageFillPrice !== null
                          ? formatMoney(order.averageFillPrice, order.currency)
                          : order.limitPrice !== null
                            ? `${formatMoney(order.limitPrice, order.currency)} limit`
                            : 'Market'}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {order.netAmount === null
                          ? '--'
                          : formatMoney(order.netAmount, order.currency)}
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                        {order.rejectReason ? (
                          <div className="mt-1 max-w-[180px] text-xs text-muted-foreground">
                            {order.rejectReason}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {order.status === 'PENDING' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void cancel(order)}
                            disabled={cancelMutation.isPending}
                          >
                            <XCircle className="size-4" />
                            Cancel
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-5">
                <Pagination page={page} totalPages={data.meta.totalPages} onPageChange={setPage} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------- transactions

export function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [market, setMarket] = useState<Market | 'all'>('all');

  const { data, isLoading, isError, refetch } = useTransactions({
    page,
    limit: 20,
    ...(market !== 'all' ? { market } : {}),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="The immutable ledger. Every fill, with its full charge breakdown and resulting balance."
        actions={
          <>
            <MarketFilter
              value={market}
              onChange={(value) => {
                setMarket(value);
                setPage(1);
              }}
            />
            <ExportButtons market={market} />
          </>
        }
      />

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="p-5">
              <LoadingState rows={5} />
            </div>
          ) : isError ? (
            <ErrorState message="Could not load transactions." onRetry={() => void refetch()} />
          ) : !data?.data?.length ? (
            <EmptyState
              icon={Receipt}
              title="No transactions"
              description="Ledger entries appear here after your first filled order."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Charges</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Realised P&amp;L</TableHead>
                    <TableHead className="text-right">Balance after</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            entry.type === 'BUY'
                              ? 'profit'
                              : entry.type === 'SELL'
                                ? 'loss'
                                : 'secondary'
                          }
                        >
                          {entry.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{entry.symbol ?? '--'}</TableCell>
                      <TableCell className="tabular text-right">{entry.quantity ?? '--'}</TableCell>
                      <TableCell className="tabular text-right">
                        {entry.price === null ? '--' : formatMoney(entry.price, entry.currency)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(entry.grossAmount, entry.currency)}
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {formatMoney(entry.fees.total, entry.currency)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(entry.netAmount, entry.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <PnL
                          value={entry.realisedPnl}
                          currency={entry.currency}
                          size="sm"
                          showIcon={false}
                        />
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {formatMoney(entry.cashAfter, entry.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-5">
                <Pagination page={page} totalPages={data.meta.totalPages} onPageChange={setPage} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------------------------------------------------- analytics

export function AnalyticsPage() {
  const [market, setMarket] = useState<Market | 'all'>('all');
  const [range, setRange] = useState('3M');
  const marketParam = market === 'all' ? undefined : market;

  const { data: stats, isLoading } = useTradeStats(marketParam);
  const { data: performance } = usePerformance(range, marketParam);
  const { data: allocation } = useAllocation(marketParam);

  const currency = market === 'US' ? 'USD' : 'INR';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trading analytics"
        description="How your decisions have actually performed, after charges."
        actions={
          <>
            <MarketFilter value={market} onChange={setMarket} />
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1W">1 week</SelectItem>
                <SelectItem value="1M">1 month</SelectItem>
                <SelectItem value="3M">3 months</SelectItem>
                <SelectItem value="6M">6 months</SelectItem>
                <SelectItem value="1Y">1 year</SelectItem>
                <SelectItem value="ALL">All time</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      {isLoading ? (
        <LoadingState rows={4} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Closed trades"
              value={stats?.closedTrades ?? 0}
              sublabel={`${stats?.buyTrades ?? 0} buys, ${stats?.sellTrades ?? 0} sells`}
            />
            <StatCard
              label="Win rate"
              value={formatPercent(stats?.winRatePercent ?? 0).replace('+', '')}
              sublabel={`${stats?.winningTrades ?? 0} winners, ${stats?.losingTrades ?? 0} losers`}
            />
            <StatCard
              label="Realised P&L"
              value={<PnL value={stats?.totalRealisedPnl ?? 0} currency={currency} size="lg" />}
              sublabel="Locked in, after charges"
            />
            <StatCard
              label="Charges paid"
              value={formatMoney(stats?.totalFeesPaid ?? 0, currency)}
              sublabel="Brokerage, taxes and exchange fees"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Portfolio value</CardTitle>
              </CardHeader>
              <CardContent>
                <PortfolioValueChart data={performance?.series ?? []} currency={currency} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Trade quality</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Average win" value={formatMoney(stats?.averageWin ?? 0, currency)} />
                <Row label="Average loss" value={formatMoney(stats?.averageLoss ?? 0, currency)} />
                <Row
                  label="Profit factor"
                  value={
                    stats?.profitFactor === null || stats?.profitFactor === undefined
                      ? 'n/a (no losses yet)'
                      : String(stats.profitFactor)
                  }
                />
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Best trade</span>
                  {stats?.bestTrade ? (
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{stats.bestTrade.symbol}</span>
                      <PnL value={stats.bestTrade.pnl} currency={currency} size="sm" />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Worst trade</span>
                  {stats?.worstTrade ? (
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{stats.worstTrade.symbol}</span>
                      <PnL value={stats.worstTrade.pnl} currency={currency} size="sm" />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By sector</CardTitle>
              </CardHeader>
              <CardContent>
                <AllocationChart data={allocation?.bySector ?? []} currency={currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By holding</CardTitle>
              </CardHeader>
              <CardContent>
                <AllocationChart data={allocation?.byHolding ?? []} currency={currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By market</CardTitle>
              </CardHeader>
              <CardContent>
                <AllocationChart data={allocation?.byMarket ?? []} currency={currency} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
