import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BellPlus, GitCompare, Star } from 'lucide-react';
import {
  HISTORY_RANGES,
  PERMISSIONS,
  formatMoney,
  formatQuantity,
  toMajor,
  type Exchange,
  type HistoryRange,
} from '@smd/shared';
import {
  useAddToWatchlist,
  useCreateAlert,
  useHistory,
  useHoldings,
  useMarketStatus,
  useStockDetail,
  useWatchlists,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/apiClient';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
  Skeleton,
} from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui/overlays';
import { DataSourceBadge, ErrorState, LoadingState, PnL } from '@/components/common';
import { PriceChart } from '@/components/charts';
import { OrderTicket } from '@/features/trading/OrderTicket';
import { useAuthStore } from '@/stores/authStore';

/** Stock detail: chart, fundamentals, your position, and the order ticket. */
export function StockDetailPage() {
  const { symbol = '' } = useParams();
  const [params] = useSearchParams();
  const exchange = (params.get('exchange') ?? undefined) as Exchange | undefined;

  const [range, setRange] = useState<HistoryRange>('1M');

  const { data, isLoading, isError, error, refetch } = useStockDetail(symbol, exchange);
  const { data: history, isLoading: historyLoading } = useHistory(symbol, range, exchange);
  const { data: status } = useMarketStatus();
  const { data: holdings } = useHoldings();

  const [alertOpen, setAlertOpen] = useState(false);

  // Permission-derived, not role-derived: a Super Admin re-bundling
  // permissions at runtime changes this without touching the component.
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);
  const canTrade = permissions.includes(PERMISSIONS.ORDER_CREATE);
  const canManage = permissions.includes(PERMISSIONS.WATCHLIST_MANAGE);

  if (isLoading) return <LoadingState rows={8} />;

  if (isError || !data) {
    return (
      <ErrorState
        title="Stock not found"
        message={
          error instanceof ApiClientError
            ? error.message
            : `No instrument matching "${symbol}" is available on this platform.`
        }
        requestId={error instanceof ApiClientError ? error.requestId : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  const { instrument, quote, fundamentals } = data;
  const marketOpen =
    status?.markets?.find((market) => market.market === instrument.market)?.isOpen ?? false;

  const holding = holdings?.holdings?.find(
    (entry) => entry.symbol === instrument.symbol && entry.exchange === instrument.exchange,
  );

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------- header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{instrument.symbol}</h1>
            <Badge variant="outline">{instrument.exchange}</Badge>
            {instrument.sector ? <Badge variant="secondary">{instrument.sector}</Badge> : null}
            <DataSourceBadge meta={quote.sourceMeta} />
          </div>
          <p className="text-muted-foreground">{instrument.name}</p>

          <div className="mt-3 flex flex-wrap items-baseline gap-3">
            <span className="tabular text-3xl font-semibold">
              {formatMoney(quote.ltp, quote.currency)}
            </span>
            <PnL
              value={quote.change}
              currency={quote.currency}
              percent={quote.changePercent}
              size="lg"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/*
            The view-only User role shares this page. Its account holds no
            watchlist:manage or alert:manage permission, so these controls would
            only produce a 403 - hiding them is honest, not cosmetic.
          */}
          {canManage ? (
            <>
              <AddToWatchlistButton symbol={instrument.symbol} exchange={instrument.exchange} />
              <Button variant="outline" size="sm" onClick={() => setAlertOpen(true)}>
                <BellPlus className="size-4" />
                Set alert
              </Button>
            </>
          ) : null}

          {/*
            Compare lives under /app, which the User role is redirected away
            from - so the link would be a dead end for them rather than a
            refusal. Hidden alongside the other trader-area affordances.
          */}
          {canManage ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/app/compare?symbols=${instrument.symbol}`}>
                <GitCompare className="size-4" />
                Compare
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* ---------------------------------------------------- chart */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">Price history</CardTitle>
              <div className="flex flex-wrap gap-1">
                {HISTORY_RANGES.map((option) => (
                  <Button
                    key={option}
                    variant={range === option ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setRange(option)}
                    className="h-7 px-2 text-xs"
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : (
                <PriceChart
                  data={history?.candles ?? []}
                  currency={instrument.currency}
                  height={280}
                />
              )}
              <div className="mt-2 flex justify-end">
                <DataSourceBadge meta={history?.sourceMeta} />
              </div>
            </CardContent>
          </Card>

          {/* -------------------------------------------- day statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Today</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Open" value={formatMoney(quote.open, quote.currency)} />
              <Stat
                label="Previous close"
                value={formatMoney(quote.previousClose, quote.currency)}
              />
              <Stat label="Day high" value={formatMoney(quote.dayHigh, quote.currency)} />
              <Stat label="Day low" value={formatMoney(quote.dayLow, quote.currency)} />
              <Stat label="Volume" value={formatQuantity(quote.volume, quote.currency)} />
              <Stat
                label="Day range"
                value={`${toMajor(quote.dayLow).toFixed(2)} - ${toMajor(quote.dayHigh).toFixed(2)}`}
              />
            </CardContent>
          </Card>

          {/* ------------------------------------------------ fundamentals */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Fundamentals</CardTitle>
              <DataSourceBadge meta={fundamentals?.sourceMeta} />
            </CardHeader>
            <CardContent>
              {!fundamentals ? (
                <p className="text-sm text-muted-foreground">
                  No fundamental data is available for this instrument from the current provider.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Stat
                    label="Market cap"
                    value={
                      fundamentals.marketCap === null
                        ? '--'
                        : formatMoney(fundamentals.marketCap, quote.currency, { compact: true })
                    }
                  />
                  <Stat label="P/E ratio" value={fundamentals.peRatio?.toFixed(2) ?? '--'} />
                  <Stat label="EPS" value={fundamentals.eps?.toFixed(2) ?? '--'} />
                  <Stat
                    label="Dividend yield"
                    value={
                      fundamentals.dividendYield === null
                        ? '--'
                        : `${fundamentals.dividendYield.toFixed(2)}%`
                    }
                  />
                  <Stat
                    label="52-week high"
                    value={
                      fundamentals.fiftyTwoWeekHigh === null
                        ? '--'
                        : formatMoney(fundamentals.fiftyTwoWeekHigh, quote.currency)
                    }
                  />
                  <Stat
                    label="52-week low"
                    value={
                      fundamentals.fiftyTwoWeekLow === null
                        ? '--'
                        : formatMoney(fundamentals.fiftyTwoWeekLow, quote.currency)
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ------------------------------------------------------ sidebar */}
        <div className="space-y-6">
          {holding ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your position</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Quantity" value={String(holding.quantity)} />
                {holding.blockedQuantity > 0 ? (
                  <Row label="Reserved" value={`${holding.blockedQuantity} (open sell orders)`} />
                ) : null}
                <Row
                  label="Average cost"
                  value={formatMoney(holding.averageCost, holding.currency)}
                />
                <Row
                  label="Invested"
                  value={formatMoney(holding.investedAmount, holding.currency)}
                />
                <Row
                  label="Market value"
                  value={
                    holding.marketValue === null
                      ? 'Stale'
                      : formatMoney(holding.marketValue, holding.currency)
                  }
                />
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Unrealised P&amp;L</span>
                  <PnL
                    value={holding.unrealisedPnl}
                    currency={holding.currency}
                    percent={holding.unrealisedPnlPercent}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {canTrade ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Place an order</CardTitle>
              </CardHeader>
              <CardContent>
                <OrderTicket
                  symbol={instrument.symbol}
                  exchange={instrument.exchange}
                  quote={quote}
                  marketOpen={marketOpen}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Trading</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This is a view-only account, so there is no order ticket here. Everything on this
                  page is information only.
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/register">Create a Trader account</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <CreateAlertDialog
        open={alertOpen}
        onOpenChange={setAlertOpen}
        symbol={instrument.symbol}
        exchange={instrument.exchange}
        currentPrice={toMajor(quote.ltp)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular font-medium">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

function AddToWatchlistButton({ symbol, exchange }: { symbol: string; exchange: Exchange }) {
  const { data } = useWatchlists();
  const addMutation = useAddToWatchlist();

  const defaultList = data?.watchlists[0];
  const alreadyAdded = defaultList?.items?.some(
    (item) => item.symbol === symbol && item.exchange === exchange,
  );

  const add = async (): Promise<void> => {
    if (!defaultList) return;
    try {
      await addMutation.mutateAsync({ id: defaultList.id, symbol, exchange });
      toast.success(`${symbol} added to ${defaultList.name}`);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not add to watchlist.');
    }
  };

  return (
    <Button
      variant={alreadyAdded ? 'secondary' : 'outline'}
      size="sm"
      onClick={() => void add()}
      disabled={!defaultList || alreadyAdded || addMutation.isPending}
    >
      <Star className={alreadyAdded ? 'size-4 fill-current' : 'size-4'} />
      {alreadyAdded ? 'On watchlist' : 'Add to watchlist'}
    </Button>
  );
}

function CreateAlertDialog({
  open,
  onOpenChange,
  symbol,
  exchange,
  currentPrice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol: string;
  exchange: Exchange;
  currentPrice: number;
}) {
  const [condition, setCondition] = useState('PRICE_ABOVE');
  const [threshold, setThreshold] = useState(currentPrice.toFixed(2));
  const [repeat, setRepeat] = useState(false);
  const createMutation = useCreateAlert();

  const isPercent = condition.startsWith('PCT_');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    try {
      await createMutation.mutateAsync({
        symbol,
        exchange,
        condition,
        threshold: Number.parseFloat(threshold),
        repeat,
      });
      toast.success(`Alert set for ${symbol}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not create alert.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set a price alert</DialogTitle>
          <DialogDescription>
            We&apos;ll notify you in-app when {symbol} meets your condition.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="alert-condition">Condition</Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger id="alert-condition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRICE_ABOVE">Price rises above</SelectItem>
                <SelectItem value="PRICE_BELOW">Price falls below</SelectItem>
                <SelectItem value="PCT_CHANGE_UP">Day change rises above (%)</SelectItem>
                <SelectItem value="PCT_CHANGE_DOWN">Day change falls below (%)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="alert-threshold">{isPercent ? 'Percentage' : 'Price'}</Label>
            <Input
              id="alert-threshold"
              type="number"
              step={isPercent ? 0.5 : 0.05}
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              className="tabular"
            />
            {!isPercent ? (
              <p className="text-xs text-muted-foreground">
                Currently trading at {currentPrice.toFixed(2)}.
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <Label htmlFor="alert-repeat" className="text-sm font-normal">
              Keep alerting (re-arms after an hour)
            </Label>
            <Switch id="alert-repeat" checked={repeat} onCheckedChange={setRepeat} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Create alert
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
