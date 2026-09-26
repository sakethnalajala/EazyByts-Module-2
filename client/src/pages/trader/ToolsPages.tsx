import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  GitCompare,
  Newspaper,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  ALERT_CONDITION_LABELS,
  HISTORY_RANGES,
  formatMoney,
  toMajor,
  type Exchange,
  type HistoryRange,
  type PriceAlert,
} from '@smd/shared';
import { ApiClientError } from '@/lib/apiClient';
import {
  useAddToWatchlist,
  useAlerts,
  useCancelAlert,
  useComparison,
  useCreateWatchlist,
  useDeleteAlert,
  useDeleteWatchlist,
  useMarkAllRead,
  useMarkNotificationRead,
  useNews,
  useNotifications,
  useRemoveFromWatchlist,
  useSearch,
  useWatchlists,
} from '@/lib/queries';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/overlays';
import {
  DataSourceBadge,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  PercentChange,
} from '@/components/common';
import { ComparisonChart } from '@/components/charts';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------- watchlist

export function WatchlistPage() {
  const { data, isLoading, isError, refetch } = useWatchlists();
  const createMutation = useCreateWatchlist();
  const deleteMutation = useDeleteWatchlist();
  const removeMutation = useRemoveFromWatchlist();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');

  const lists = data?.watchlists ?? [];
  const active = lists.find((list) => list.id === activeId) ?? lists[0];

  const createList = async (): Promise<void> => {
    try {
      const created = await createMutation.mutateAsync(newListName.trim());
      setActiveId(created.id);
      setNewListName('');
      setNewListOpen(false);
      toast.success(`Watchlist "${created.name}" created`);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not create the list.');
    }
  };

  const removeItem = async (symbol: string, exchange: Exchange): Promise<void> => {
    if (!active) return;
    try {
      await removeMutation.mutateAsync({ id: active.id, symbol, exchange });
      toast.success(`${symbol} removed`);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not remove the symbol.');
    }
  };

  const deleteList = async (): Promise<void> => {
    if (!active) return;
    try {
      await deleteMutation.mutateAsync(active.id);
      setActiveId(null);
      toast.success('Watchlist deleted');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not delete the list.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Watchlist"
        description="Track symbols across both markets without holding them."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setNewListOpen(true)}>
              <Plus className="size-4" />
              New list
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)} disabled={!active}>
              <Plus className="size-4" />
              Add symbol
            </Button>
          </>
        }
      />

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Could not load your watchlists." onRetry={() => void refetch()} />
      ) : (
        <>
          {lists.length > 1 ? (
            <Tabs value={active?.id} onValueChange={setActiveId}>
              <TabsList className="flex-wrap">
                {lists.map((list) => (
                  <TabsTrigger key={list.id} value={list.id}>
                    {list.name}
                    <span className="ml-1.5 text-xs opacity-60">{list.items.length}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{active?.name ?? 'Watchlist'}</CardTitle>
              {active && lists.length > 1 ? (
                <Button variant="ghost" size="sm" onClick={() => void deleteList()}>
                  <Trash2 className="size-4" />
                  Delete list
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="px-0">
              {!active?.items?.length ? (
                <EmptyState
                  icon={Star}
                  title="Nothing on this list"
                  description="Add symbols you want to follow. Prices refresh automatically."
                  action={
                    <Button size="sm" onClick={() => setAddOpen(true)}>
                      Add a symbol
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead className="hidden sm:table-cell">Company</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {active.items.map((item) => (
                      <TableRow key={`${item.exchange}-${item.symbol}`}>
                        <TableCell>
                          <Link
                            to={`/app/stocks/${item.symbol}?exchange=${item.exchange}`}
                            className="font-medium hover:underline"
                          >
                            {item.symbol}
                          </Link>
                          <div className="text-xs text-muted-foreground">{item.exchange}</div>
                        </TableCell>
                        <TableCell className="hidden max-w-[240px] truncate sm:table-cell">
                          {item.name}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {item.ltp === null ? (
                            <Badge variant="stale">Stale</Badge>
                          ) : (
                            formatMoney(item.ltp, item.currency)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <PercentChange value={item.changePercent} size="sm" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void removeItem(item.symbol, item.exchange)}
                            aria-label={`Remove ${item.symbol}`}
                          >
                            <X className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {active ? (
        <AddSymbolDialog open={addOpen} onOpenChange={setAddOpen} listId={active.id} />
      ) : null}

      <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New watchlist</DialogTitle>
            <DialogDescription>Group symbols by theme, sector or intent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="list-name">Name</Label>
            <Input
              id="list-name"
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              placeholder="e.g. Earnings this week"
              maxLength={40}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewListOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void createList()}
              disabled={newListName.trim().length === 0}
              loading={createMutation.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddSymbolDialog({
  open,
  onOpenChange,
  listId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
}) {
  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term);
  const { data } = useSearch(debounced, open);
  const addMutation = useAddToWatchlist();

  const add = async (symbol: string, exchange: Exchange): Promise<void> => {
    try {
      await addMutation.mutateAsync({ id: listId, symbol, exchange });
      toast.success(`${symbol} added`);
      onOpenChange(false);
      setTerm('');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not add the symbol.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a symbol</DialogTitle>
          <DialogDescription>Search the tradable universe by symbol or company.</DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search..."
        />

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {(data?.results ?? []).map((instrument) => (
            <button
              key={instrument.id}
              type="button"
              onClick={() => void add(instrument.symbol, instrument.exchange)}
              className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">{instrument.symbol}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {instrument.name}
                </span>
              </span>
              <Badge variant="outline">{instrument.exchange}</Badge>
            </button>
          ))}
          {debounced.length >= 2 && data?.results?.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- alerts

export function AlertsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');

  const { data, isLoading, isError, refetch } = useAlerts({
    page,
    limit: 20,
    ...(status !== 'all' ? { status } : {}),
  });
  const cancelMutation = useCancelAlert();
  const deleteMutation = useDeleteAlert();

  const cancel = async (alert: PriceAlert): Promise<void> => {
    try {
      await cancelMutation.mutateAsync(alert.id);
      toast.success('Alert cancelled');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not cancel the alert.');
    }
  };

  const remove = async (alert: PriceAlert): Promise<void> => {
    try {
      await deleteMutation.mutateAsync(alert.id);
      toast.success('Alert deleted');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not delete the alert.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Price alerts"
        description="Get notified when a stock crosses a level you care about. Set alerts from any stock page."
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
              <SelectItem value="all">All alerts</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="TRIGGERED">Triggered</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="p-5">
              <LoadingState rows={4} />
            </div>
          ) : isError ? (
            <ErrorState message="Could not load alerts." onRetry={() => void refetch()} />
          ) : !data?.data?.length ? (
            <EmptyState
              icon={BellRing}
              title="No alerts"
              description="Open any stock and use 'Set alert' to be notified when it hits your price."
              action={
                <Button asChild size="sm">
                  <Link to="/app/stocks">Browse stocks</Link>
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead className="text-right">Threshold</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell>
                        <Link
                          to={`/app/stocks/${alert.symbol}?exchange=${alert.exchange}`}
                          className="font-medium hover:underline"
                        >
                          {alert.symbol}
                        </Link>
                        <div className="text-xs text-muted-foreground">{alert.exchange}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {ALERT_CONDITION_LABELS[alert.condition]}
                        {alert.repeat ? (
                          <Badge variant="secondary" className="ml-2">
                            Repeating
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {alert.condition.startsWith('PRICE_')
                          ? formatMoney(alert.threshold, alert.currency)
                          : `${alert.threshold}%`}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            alert.status === 'ACTIVE'
                              ? 'default'
                              : alert.status === 'TRIGGERED'
                                ? 'profit'
                                : 'secondary'
                          }
                        >
                          {alert.status}
                        </Badge>
                        {alert.triggeredPrice !== null ? (
                          <div className="tabular mt-1 text-xs text-muted-foreground">
                            at {formatMoney(alert.triggeredPrice, alert.currency)}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                        {new Date(alert.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {alert.status === 'ACTIVE' ? (
                          <Button variant="ghost" size="sm" onClick={() => void cancel(alert)}>
                            Cancel
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void remove(alert)}
                            aria-label="Delete alert"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
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

// --------------------------------------------------------- notifications

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading, isError, refetch } = useNotifications({
    page,
    limit: 20,
    ...(unreadOnly ? { unreadOnly: true } : {}),
  });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllRead();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Order fills, expiries and triggered alerts."
        actions={
          <>
            <Button
              variant={unreadOnly ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => {
                setUnreadOnly(!unreadOnly);
                setPage(1);
              }}
            >
              {unreadOnly ? 'Showing unread' : 'Show unread only'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void markAll.mutateAsync()}
              loading={markAll.isPending}
            >
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          </>
        }
      />

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Could not load notifications." onRetry={() => void refetch()} />
      ) : !data?.data?.length ? (
        <Card>
          <CardContent className="px-0">
            <EmptyState
              icon={Bell}
              title={unreadOnly ? 'Nothing unread' : 'No notifications'}
              description="Order fills and triggered alerts will appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {data.data.map((notification) => (
              <Card
                key={notification.id}
                className={cn(!notification.read && 'border-primary/40 bg-primary/5')}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      notification.read ? 'bg-muted-foreground/40' : 'bg-primary',
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{notification.title}</p>
                      <Badge variant="secondary" className="text-[10px]">
                        {notification.type.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{notification.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!notification.read ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void markRead.mutateAsync(notification.id)}
                      aria-label="Mark as read"
                    >
                      <Check className="size-4" />
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination page={page} totalPages={data.meta.totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ news

export function NewsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useNews({ page, limit: 12 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Market news"
        description="Headlines relevant to the instruments on this platform."
      />

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Could not load news." onRetry={() => void refetch()} />
      ) : !data?.data?.length ? (
        <EmptyState icon={Newspaper} title="No articles" description="Check back shortly." />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.data.map((article) => {
              const isSimulated = article.sourceMeta.isSimulated;
              const body = (
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardContent className="p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{article.source}</Badge>
                      <DataSourceBadge meta={article.sourceMeta} />
                    </div>
                    <p className="mb-1.5 font-medium leading-snug">{article.title}</p>
                    {article.summary ? (
                      <p className="line-clamp-3 text-sm text-muted-foreground">
                        {article.summary}
                      </p>
                    ) : null}
                    <p className="mt-3 text-xs text-muted-foreground">
                      {new Date(article.publishedAt).toLocaleString()}
                    </p>
                    {article.symbols.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {article.symbols.slice(0, 4).map((symbol) => (
                          <Badge key={symbol} variant="secondary" className="text-[10px]">
                            {symbol}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );

              // Simulated articles have no real URL, so they are not links.
              return isSimulated ? (
                <div key={article.id}>{body}</div>
              ) : (
                <a
                  key={article.id}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  {body}
                </a>
              );
            })}
          </div>
          <Pagination page={page} totalPages={data.meta.totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------- compare

export function ComparePage() {
  const [params, setParams] = useSearchParams();
  const initial = (params.get('symbols') ?? '').split(',').filter(Boolean);

  const [symbols, setSymbols] = useState<string[]>(initial);
  const [range, setRange] = useState<HistoryRange>('3M');
  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term);

  const { data: searchResults } = useSearch(debounced, term.length >= 2);
  const { data, isLoading, isError, error } = useComparison(symbols, range);

  const series = useMemo(
    () =>
      (data?.entries ?? []).map((entry) => ({
        symbol: entry.instrument.symbol,
        points: entry.normalisedSeries,
      })),
    [data?.entries],
  );

  const addSymbol = (symbol: string): void => {
    if (symbols.includes(symbol) || symbols.length >= 4) return;
    const next = [...symbols, symbol];
    setSymbols(next);
    setParams({ symbols: next.join(',') });
    setTerm('');
  };

  const removeSymbol = (symbol: string): void => {
    const next = symbols.filter((entry) => entry !== symbol);
    setSymbols(next);
    setParams(next.length ? { symbols: next.join(',') } : {});
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compare stocks"
        description="Put two to four instruments side by side, rebased to 100 so different price levels are comparable."
        actions={
          <Select value={range} onValueChange={(value) => setRange(value as HistoryRange)}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HISTORY_RANGES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            {symbols.map((symbol) => (
              <Badge key={symbol} variant="default" className="gap-1.5 py-1">
                {symbol}
                <button
                  type="button"
                  onClick={() => removeSymbol(symbol)}
                  aria-label={`Remove ${symbol}`}
                  className="hover:opacity-70"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            {symbols.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add at least two symbols to compare.</p>
            ) : null}
          </div>

          {symbols.length < 4 ? (
            <div className="relative">
              <Input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search to add a symbol..."
              />
              {term.length >= 2 && searchResults?.results?.length ? (
                <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
                  {searchResults.results.slice(0, 8).map((instrument) => (
                    <button
                      key={instrument.id}
                      type="button"
                      onClick={() => addSymbol(instrument.symbol)}
                      className="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="truncate">
                        <span className="font-medium">{instrument.symbol}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {instrument.name}
                        </span>
                      </span>
                      <Badge variant="outline">{instrument.exchange}</Badge>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {symbols.length < 2 ? (
        <EmptyState
          icon={GitCompare}
          title="Add two symbols"
          description="Pick at least two instruments to see them charted together."
        />
      ) : isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState
          message={
            error instanceof ApiClientError
              ? error.message
              : 'Could not compare the selected symbols.'
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Relative performance (rebased to 100)</CardTitle>
            </CardHeader>
            <CardContent>
              <ComparisonChart series={series} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Side by side</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Day change</TableHead>
                    <TableHead className="text-right">P/E</TableHead>
                    <TableHead className="text-right">Market cap</TableHead>
                    <TableHead className="text-right">52w range</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.entries ?? []).map((entry) => (
                    <TableRow key={entry.instrument.id}>
                      <TableCell>
                        <Link
                          to={`/app/stocks/${entry.instrument.symbol}?exchange=${entry.instrument.exchange}`}
                          className="font-medium hover:underline"
                        >
                          {entry.instrument.symbol}
                        </Link>
                        <div className="text-xs text-muted-foreground">{entry.instrument.name}</div>
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(entry.quote.ltp, entry.quote.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <PercentChange value={entry.quote.changePercent} size="sm" />
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {entry.fundamentals?.peRatio?.toFixed(2) ?? '--'}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {entry.fundamentals?.marketCap
                          ? formatMoney(entry.fundamentals.marketCap, entry.quote.currency, {
                              compact: true,
                            })
                          : '--'}
                      </TableCell>
                      <TableCell className="tabular text-right text-xs">
                        {entry.fundamentals?.fiftyTwoWeekLow && entry.fundamentals.fiftyTwoWeekHigh
                          ? `${toMajor(entry.fundamentals.fiftyTwoWeekLow).toFixed(0)} - ${toMajor(
                              entry.fundamentals.fiftyTwoWeekHigh,
                            ).toFixed(0)}`
                          : '--'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
