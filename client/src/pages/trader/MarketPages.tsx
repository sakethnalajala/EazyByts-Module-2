import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, TrendingDown, TrendingUp } from 'lucide-react';
import {
  formatMoney,
  type Exchange,
  type InstrumentWithQuote,
  type Market,
  type MarketStatus,
} from '@smd/shared';
import { useIndices, useInstrumentList, useMarketStatus, useMovers } from '@/lib/queries';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
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
  DataSourceBadge,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PercentChange,
} from '@/components/common';

/**
 * Market overview - indices, session state and movers for both markets.
 */
export function MarketOverviewPage() {
  const [market, setMarket] = useState<Market>('IN');
  const { data: status } = useMarketStatus();
  const { data: indices, isLoading: indicesLoading } = useIndices();
  const { data: movers, isLoading: moversLoading } = useMovers(market, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Market overview"
        description="Indices, session status, and the day's biggest moves across both markets."
        actions={<DataSourceBadge meta={indices?.indices[0]?.sourceMeta} />}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {(status?.markets ?? []).map((marketStatus) => (
          <SessionCard key={marketStatus.market} status={marketStatus} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Indices</CardTitle>
        </CardHeader>
        <CardContent>
          {indicesLoading ? (
            <LoadingState rows={3} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(indices?.indices ?? []).map((index) => (
                <div
                  key={index.symbol}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{index.name}</p>
                    <p className="tabular text-lg font-semibold">
                      {formatMoney(index.value, index.market === 'IN' ? 'INR' : 'USD', {
                        symbol: false,
                      })}
                    </p>
                  </div>
                  <PercentChange value={index.changePercent} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Top movers</CardTitle>
          <Select value={market} onValueChange={(value) => setMarket(value as Market)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="IN">India</SelectItem>
              <SelectItem value="US">United States</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {moversLoading ? (
            <LoadingState rows={4} />
          ) : (
            <Tabs defaultValue="gainers">
              <TabsList>
                <TabsTrigger value="gainers">
                  <TrendingUp className="size-3.5" /> Gainers
                </TabsTrigger>
                <TabsTrigger value="losers">
                  <TrendingDown className="size-3.5" /> Losers
                </TabsTrigger>
              </TabsList>
              <TabsContent value="gainers">
                <MoversTable entries={movers?.gainers ?? []} />
              </TabsContent>
              <TabsContent value="losers">
                <MoversTable entries={movers?.losers ?? []} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SessionCard({ status }: { status: MarketStatus }) {
  const label = status.market === 'IN' ? 'NSE / BSE (India)' : 'NASDAQ / NYSE (United States)';

  const reasonText: Record<MarketStatus['reason'], string> = {
    open: 'Trading now',
    weekend: 'Closed for the weekend',
    holiday: status.holidayName ? `Closed: ${status.holidayName}` : 'Exchange holiday',
    'before-open': 'Pre-market',
    'after-close': 'Closed for the day',
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{label}</p>
          <Badge variant={status.isOpen ? 'profit' : 'secondary'}>
            {status.isOpen ? 'Open' : 'Closed'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{reasonText[status.reason]}</p>
        <p className="mt-2 tabular text-xs text-muted-foreground">
          {status.session.open}&ndash;{status.session.close} {status.session.timezone}
        </p>
        {status.nextOpen ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Next open: {new Date(status.nextOpen).toLocaleString()}
          </p>
        ) : null}
        {status.nextClose ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Closes: {new Date(status.nextClose).toLocaleTimeString()}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MoversTable({
  entries,
}: {
  entries: {
    symbol: string;
    exchange: Exchange;
    name: string;
    currency: 'INR' | 'USD';
    ltp: number;
    changePercent: number;
  }[];
}) {
  if (entries.length === 0) {
    return <EmptyState title="No movers" description="No price movement data is available." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead className="hidden sm:table-cell">Company</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={`${entry.exchange}-${entry.symbol}`}>
            <TableCell>
              <Link
                to={`/app/stocks/${entry.symbol}?exchange=${entry.exchange}`}
                className="font-medium hover:underline"
              >
                {entry.symbol}
              </Link>
              <span className="ml-2 text-xs text-muted-foreground">{entry.exchange}</span>
            </TableCell>
            <TableCell className="hidden max-w-[220px] truncate sm:table-cell">
              {entry.name}
            </TableCell>
            <TableCell className="tabular text-right">
              {formatMoney(entry.ltp, entry.currency)}
            </TableCell>
            <TableCell className="text-right">
              <PercentChange value={entry.changePercent} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Stock explorer - browse and filter the tradable universe.
 */
export function StockExplorerPage() {
  const [params, setParams] = useSearchParams();
  const term = params.get('q') ?? '';
  const exchangeFilter = params.get('exchange') ?? 'all';

  const [input, setInput] = useState(term);

  const [sortKey, setSortKey] = useState<'symbol' | 'name' | 'price' | 'change'>('symbol');

  /*
   * The browse listing, not the search endpoint.
   *
   * `useSearch` requires a term, so this page used to pass a placeholder 'a' -
   * which matched only symbols containing an "a" and showed "No stocks found"
   * for everything else. It also fired one quote request PER CARD; this
   * endpoint returns every instrument with its price already attached, in one
   * batched round trip.
   */
  const { data, isLoading, isError, error, refetch } = useInstrumentList({
    limit: 300,
    ...(term.trim() ? { q: term.trim() } : {}),
    ...(exchangeFilter !== 'all' ? { exchange: exchangeFilter } : {}),
  });

  const results = useMemo(() => {
    const all = [...(data?.results ?? [])];
    all.sort((a, b) => {
      switch (sortKey) {
        case 'price':
          if (a.ltp === null) return 1;
          if (b.ltp === null) return -1;
          return b.ltp - a.ltp;
        case 'change':
          if (a.changePercent === null) return 1;
          if (b.changePercent === null) return -1;
          return b.changePercent - a.changePercent;
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return a.symbol.localeCompare(b.symbol);
      }
    });
    return all;
  }, [data?.results, sortKey]);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const next = new URLSearchParams(params);
    if (input.trim()) next.set('q', input.trim());
    else next.delete('q');
    setParams(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Explore stocks"
        description="A curated universe of large-cap symbols across NSE, BSE, NASDAQ and NYSE."
      />

      <Card>
        <CardContent className="p-4">
          <form onSubmit={submit} className="flex flex-wrap gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Search by symbol or company name"
                className="pl-9"
                aria-label="Search stocks"
              />
            </div>

            <Select
              value={exchangeFilter}
              onValueChange={(value) => {
                const next = new URLSearchParams(params);
                if (value === 'all') next.delete('exchange');
                else next.set('exchange', value);
                setParams(next);
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All exchanges</SelectItem>
                <SelectItem value="NSE">NSE</SelectItem>
                <SelectItem value="BSE">BSE</SelectItem>
                <SelectItem value="NASDAQ">NASDAQ</SelectItem>
                <SelectItem value="NYSE">NYSE</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortKey} onValueChange={(value) => setSortKey(value as typeof sortKey)}>
              <SelectTrigger className="w-40" aria-label="Sort stocks">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="symbol">Sort: Symbol</SelectItem>
                <SelectItem value="name">Sort: Company</SelectItem>
                <SelectItem value="price">Sort: Price</SelectItem>
                <SelectItem value="change">Sort: % Change</SelectItem>
              </SelectContent>
            </Select>

            <Button type="submit">Search</Button>
          </form>

          <p className="mt-3 text-xs text-muted-foreground">
            Showing {results.length} of {data?.total ?? 0} instruments across NSE, BSE, NASDAQ and
            NYSE.
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Could not load stocks.'}
          onRetry={() => void refetch()}
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No stocks found"
          description={
            term
              ? `Nothing matches "${term}". This platform covers a curated set of large-cap symbols.`
              : 'No instruments match the current filter.'
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((instrument) => (
            <StockCard key={instrument.id} instrument={instrument} />
          ))}
        </div>
      )}
    </div>
  );
}

function StockCard({ instrument }: { instrument: InstrumentWithQuote }) {
  // The price arrives with the row, so there is no per-card request and no
  // loading flicker across a grid of 165 cards.
  const hasQuote = instrument.ltp !== null;

  return (
    <Link to={`/app/stocks/${instrument.symbol}?exchange=${instrument.exchange}`}>
      <Card interactive className="h-full">
        <CardContent className="p-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">{instrument.symbol}</p>
              <p className="truncate text-xs text-muted-foreground">{instrument.name}</p>
            </div>
            <Badge variant="outline" className="shrink-0">
              {instrument.exchange}
            </Badge>
          </div>

          {hasQuote ? (
            <div className="flex items-end justify-between gap-2">
              <p className="tabular text-lg font-semibold">
                {formatMoney(instrument.ltp ?? 0, instrument.currency)}
              </p>
              <PercentChange value={instrument.changePercent ?? 0} size="sm" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Price unavailable</p>
          )}

          {instrument.sector ? (
            <p className="mt-2 text-xs text-muted-foreground">{instrument.sector}</p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}
