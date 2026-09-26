import { useState } from 'react';
import { toast } from 'sonner';
import {
  Activity,
  Ban,
  BookOpen,
  Building2,
  CheckCircle2,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import {
  EDUCATION_CATEGORY_LABELS,
  ROLE_LABELS,
  formatMoney,
  type AdminUserRow,
  type Role,
  type UserStatus,
} from '@smd/shared';
import { api, ApiClientError } from '@/lib/apiClient';
import {
  useAdminAnalytics,
  useAdminInstruments,
  useAdminOrders,
  useAdminUsers,
  useEducation,
  useUpdateUserStatus,
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
  Textarea,
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
} from '@/components/ui/overlays';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  StatCard,
} from '@/components/common';
import { ActivityChart, AllocationChart } from '@/components/charts';
import { OrderStatusBadge } from '../trader/DashboardPage';

// ------------------------------------------------------- admin dashboard

export function AdminDashboardPage() {
  const { data, isLoading, isError, refetch } = useAdminAnalytics();

  if (isLoading) return <LoadingState rows={6} />;
  if (isError || !data) {
    return (
      <ErrorState message="Could not load platform analytics." onRetry={() => void refetch()} />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin dashboard"
        description="Platform health at a glance: users, trading activity and content."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total users"
          value={data.users.total}
          sublabel={`${data.users.newLast7Days} new in 7 days`}
          icon={Users}
        />
        <StatCard
          label="Active users"
          value={data.users.active}
          sublabel={`${data.users.pending} pending, ${data.users.suspended} suspended`}
        />
        <StatCard
          label="Total orders"
          value={data.trading.totalOrders}
          sublabel={`${data.trading.ordersLast24h} in the last 24h`}
          icon={Activity}
        />
        <StatCard
          label="Filled orders"
          value={data.trading.filledOrders}
          sublabel={`${data.trading.pendingOrders} pending, ${data.trading.rejectedOrders} rejected`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Order activity (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityChart data={data.ordersTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Users by role</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationChart
              data={(Object.entries(data.users.byRole) as [Role, number][]).map(
                ([role, count]) => ({
                  label: ROLE_LABELS[role],
                  value: count,
                  percent: data.users.total === 0 ? 0 : (count / data.users.total) * 100,
                }),
              )}
              currency="INR"
              height={220}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Simulated trading volume</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="India volume" value={formatMoney(data.trading.totalVolumeInr, 'INR')} />
            <Row
              label="India charges collected"
              value={formatMoney(data.trading.totalFeesInr, 'INR')}
            />
            <Row label="US volume" value={formatMoney(data.trading.totalVolumeUsd, 'USD')} />
            <Row
              label="US charges collected"
              value={formatMoney(data.trading.totalFeesUsd, 'USD')}
            />
            <p className="pt-2 text-xs text-muted-foreground">
              Simulated figures. No real money moved.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most traded symbols</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {data.topTradedSymbols.length === 0 ? (
              <EmptyState title="No trades yet" description="Activity will appear here." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Exchange</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topTradedSymbols.map((entry) => (
                    <TableRow key={`${entry.exchange}-${entry.symbol}`}>
                      <TableCell className="font-medium">{entry.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{entry.exchange}</Badge>
                      </TableCell>
                      <TableCell className="tabular text-right">{entry.orders}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Instruments"
          value={data.content.instruments}
          sublabel={`${data.content.activeInstruments} active`}
          icon={Building2}
        />
        <StatCard
          label="Published articles"
          value={data.content.educationPublished}
          sublabel={`${data.content.educationDrafts} drafts`}
          icon={BookOpen}
        />
        <StatCard label="Watchlist items" value={data.engagement.watchlistItems} />
        <StatCard
          label="Active alerts"
          value={data.engagement.activeAlerts}
          sublabel={`${data.engagement.unreadNotifications} unread notifications`}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular font-medium">{value}</span>
    </div>
  );
}

// ------------------------------------------------------- user management

export function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<AdminUserRow | null>(null);

  const { data, isLoading, isError, refetch } = useAdminUsers({
    page,
    limit: 20,
    ...(role !== 'all' ? { role } : {}),
    ...(status !== 'all' ? { status } : {}),
    ...(query ? { q: query } : {}),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="User management"
        description="Every registered account, with its trading activity."
      />

      <Card>
        <CardContent className="flex flex-wrap gap-3 p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(search.trim());
              setPage(1);
            }}
            className="relative min-w-[200px] flex-1"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or email"
              className="pl-9"
              aria-label="Search users"
            />
          </form>

          <Select
            value={role}
            onValueChange={(value) => {
              setRole(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="trader">Trader</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="super_admin">Super Admin</SelectItem>
            </SelectContent>
          </Select>

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
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="p-5">
              <LoadingState rows={6} />
            </div>
          ) : isError ? (
            <ErrorState message="Could not load users." onRetry={() => void refetch()} />
          ) : !data?.data?.length ? (
            <EmptyState
              icon={Users}
              title="No users"
              description="No accounts match those filters."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">INR wallet</TableHead>
                    <TableHead className="text-right">USD wallet</TableHead>
                    <TableHead className="hidden lg:table-cell">Last sign-in</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.fullName}</div>
                        <div className="text-xs text-muted-foreground">{row.email}</div>
                        {row.isDemo ? (
                          <Badge variant="stale" className="mt-1">
                            Demo
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{ROLE_LABELS[row.role]}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                        {!row.emailVerified ? (
                          <div className="mt-1 text-xs text-muted-foreground">Unverified</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular text-right">{row.orderCount}</TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(row.portfolioValueInr, 'INR', { compact: true })}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(row.portfolioValueUsd, 'USD', { compact: true })}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                        {row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleDateString() : 'Never'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTarget(row)}
                          disabled={row.isDemo}
                        >
                          Manage
                        </Button>
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

      <ManageUserDialog user={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function StatusBadge({ status }: { status: UserStatus }) {
  const variant = status === 'active' ? 'profit' : status === 'suspended' ? 'destructive' : 'stale';
  return <Badge variant={variant}>{status}</Badge>;
}

function ManageUserDialog({ user, onClose }: { user: AdminUserRow | null; onClose: () => void }) {
  const [status, setStatus] = useState<UserStatus>('active');
  const [reason, setReason] = useState('');
  const mutation = useUpdateUserStatus();

  const submit = async (): Promise<void> => {
    if (!user) return;
    try {
      await mutation.mutateAsync({ id: user.id, status, reason: reason.trim() || undefined });
      toast.success(`${user.email} is now ${status}`);
      onClose();
      setReason('');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not update the user.');
    }
  };

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage {user?.fullName}</DialogTitle>
          <DialogDescription>
            Suspending an account signs it out everywhere immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="user-status">Account status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as UserStatus)}>
              <SelectTrigger id="user-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status-reason">Reason (recorded in the audit log)</Label>
            <Textarea
              id="status-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Optional note explaining this change"
              maxLength={200}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={mutation.isPending}>
            {status === 'suspended' ? (
              <Ban className="size-4" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------- trade monitoring

export function AdminTradesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [market, setMarket] = useState('all');

  const { data, isLoading, isError, refetch } = useAdminOrders({
    page,
    limit: 25,
    ...(status !== 'all' ? { status } : {}),
    ...(market !== 'all' ? { market } : {}),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trade monitoring"
        description="Every simulated order placed on the platform, across all users."
        actions={
          <>
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
            <Select
              value={market}
              onValueChange={(value) => {
                setMarket(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Both markets</SelectItem>
                <SelectItem value="IN">India</SelectItem>
                <SelectItem value="US">United States</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="p-5">
              <LoadingState rows={6} />
            </div>
          ) : isError ? (
            <ErrorState message="Could not load orders." onRetry={() => void refetch()} />
          ) : !data?.data?.length ? (
            <EmptyState
              icon={Activity}
              title="No orders"
              description="No trading activity matches those filters."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Placed</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(row.placedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{row.userName}</div>
                        <div className="text-xs text-muted-foreground">{row.userEmail}</div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{row.symbol}</span>
                        <div className="text-xs text-muted-foreground">{row.exchange}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.side === 'BUY' ? 'profit' : 'loss'}>{row.side}</Badge>
                      </TableCell>
                      <TableCell className="tabular text-right">{row.quantity}</TableCell>
                      <TableCell className="tabular text-right">
                        {row.price === null
                          ? 'Market'
                          : formatMoney(row.price, row.currency as 'INR' | 'USD')}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {row.netAmount === null
                          ? '--'
                          : formatMoney(row.netAmount, row.currency as 'INR' | 'USD')}
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={row.status} />
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

// --------------------------------------------------------- instruments

export function AdminInstrumentsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useAdminInstruments({
    page,
    limit: 25,
    ...(query ? { q: query } : {}),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instruments"
        description="The tradable universe. Instruments are deactivated rather than deleted so trade history stays intact."
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Add instrument
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(search.trim());
              setPage(1);
            }}
            className="relative"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search symbol or name"
              className="pl-9"
              aria-label="Search instruments"
            />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="p-5">
              <LoadingState rows={6} />
            </div>
          ) : isError ? (
            <ErrorState message="Could not load instruments." onRetry={() => void refetch()} />
          ) : !data?.data?.length ? (
            <EmptyState icon={Building2} title="No instruments" description="Nothing matches." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Exchange</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Provider symbol</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((instrument) => (
                    <TableRow key={instrument.id}>
                      <TableCell className="font-medium">{instrument.symbol}</TableCell>
                      <TableCell className="max-w-[240px] truncate">{instrument.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{instrument.exchange}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {instrument.sector ?? '--'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {instrument.providerSymbol}
                      </TableCell>
                      <TableCell>
                        <Badge variant={instrument.isActive ? 'profit' : 'secondary'}>
                          {instrument.isActive ? 'Active' : 'Inactive'}
                        </Badge>
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

      <AddInstrumentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => void refetch()}
      />
    </div>
  );
}

function AddInstrumentDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [form, setForm] = useState({
    symbol: '',
    name: '',
    exchange: 'NSE',
    sector: '',
    referencePrice: '100',
  });
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    try {
      await api.post('/admin/instruments', {
        symbol: form.symbol.toUpperCase(),
        name: form.name,
        exchange: form.exchange,
        sector: form.sector || undefined,
        referencePrice: Number.parseFloat(form.referencePrice),
        isActive: true,
      });
      toast.success(`${form.symbol.toUpperCase()} added`);
      onOpenChange(false);
      setForm({ symbol: '', name: '', exchange: 'NSE', sector: '', referencePrice: '100' });
      onAdded();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not add the instrument.',
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an instrument</DialogTitle>
          <DialogDescription>
            The provider symbol is derived automatically (.NS for NSE, .BO for BSE).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inst-symbol">Symbol</Label>
              <Input
                id="inst-symbol"
                value={form.symbol}
                onChange={(event) => setForm({ ...form, symbol: event.target.value })}
                placeholder="RELIANCE"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-exchange">Exchange</Label>
              <Select
                value={form.exchange}
                onValueChange={(value) => setForm({ ...form, exchange: value })}
              >
                <SelectTrigger id="inst-exchange">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NSE">NSE</SelectItem>
                  <SelectItem value="BSE">BSE</SelectItem>
                  <SelectItem value="NASDAQ">NASDAQ</SelectItem>
                  <SelectItem value="NYSE">NYSE</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inst-name">Company name</Label>
            <Input
              id="inst-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inst-sector">Sector</Label>
              <Input
                id="inst-sector"
                value={form.sector}
                onChange={(event) => setForm({ ...form, sector: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-price">Reference price</Label>
              <Input
                id="inst-price"
                type="number"
                step="0.01"
                value={form.referencePrice}
                onChange={(event) => setForm({ ...form, referencePrice: event.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">Baseline used by the simulator.</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Add instrument
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------ education CMS

export function AdminEducationPage() {
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useEducation({ page, limit: 20 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Education CMS"
        description="Write and publish the learning library. Drafts are visible only to editors."
        actions={
          <Button size="sm" onClick={() => setEditorOpen(true)}>
            <Plus className="size-4" />
            New article
          </Button>
        }
      />

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="p-5">
              <LoadingState rows={5} />
            </div>
          ) : isError ? (
            <ErrorState message="Could not load articles." onRetry={() => void refetch()} />
          ) : !data?.data?.length ? (
            <EmptyState icon={BookOpen} title="No articles" description="Write the first one." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Read time</TableHead>
                    <TableHead className="hidden lg:table-cell">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((article) => (
                    <TableRow key={article.id}>
                      <TableCell className="max-w-[280px]">
                        <div className="truncate font-medium">{article.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{article.slug}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {EDUCATION_CATEGORY_LABELS[article.category]}
                      </TableCell>
                      <TableCell className="text-sm capitalize">{article.level}</TableCell>
                      <TableCell>
                        <Badge variant={article.status === 'published' ? 'profit' : 'stale'}>
                          {article.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {article.readMinutes} min
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                        {new Date(article.updatedAt).toLocaleDateString()}
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

      <ArticleEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={() => void refetch()}
      />
    </div>
  );
}

function ArticleEditorDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: '',
    summary: '',
    category: 'basics',
    level: 'beginner',
    content: '',
    status: 'draft',
  });
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    try {
      await api.post('/education', { ...form, tags: [] });
      toast.success('Article saved');
      onOpenChange(false);
      setForm({
        title: '',
        summary: '',
        category: 'basics',
        level: 'beginner',
        content: '',
        status: 'draft',
      });
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save the article.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New article</DialogTitle>
          <DialogDescription>Content is Markdown, rendered for readers.</DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="art-title">Title</Label>
            <Input
              id="art-title"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
              minLength={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="art-summary">Summary</Label>
            <Textarea
              id="art-summary"
              value={form.summary}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
              required
              minLength={10}
              maxLength={400}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="art-category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(value) => setForm({ ...form, category: value })}
              >
                <SelectTrigger id="art-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EDUCATION_CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="art-level">Level</Label>
              <Select
                value={form.level}
                onValueChange={(value) => setForm({ ...form, level: value })}
              >
                <SelectTrigger id="art-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="art-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm({ ...form, status: value })}
              >
                <SelectTrigger id="art-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="art-content">Content (Markdown)</Label>
            <Textarea
              id="art-content"
              value={form.content}
              onChange={(event) => setForm({ ...form, content: event.target.value })}
              required
              minLength={20}
              className="min-h-[220px] font-mono text-sm"
              placeholder={'## Heading\n\nYour article body...'}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save article
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
