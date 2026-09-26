import { useState } from 'react';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  Cpu,
  Database,
  Plus,
  ScrollText,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  ALL_PERMISSIONS,
  ROLE_LABELS,
  toMajor,
  type Permission,
  type Role,
  type SystemConfigView,
} from '@smd/shared';
import { api, ApiClientError } from '@/lib/apiClient';
import {
  useAdmins,
  useAuditLogs,
  useRoles,
  useSystemConfig,
  useSystemHealth,
  useUpdateRolePermissions,
  useUpdateSystemConfig,
} from '@/lib/queries';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
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
  Switch,
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
  StatCard,
} from '@/components/common';

// -------------------------------------------------- super admin dashboard

export function SuperAdminDashboardPage() {
  const { data: health, isLoading } = useSystemHealth();
  const { data: config } = useSystemConfig();
  const { data: roles } = useRoles();

  if (isLoading) return <LoadingState rows={6} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Super Admin"
        description="Platform control: system health, permissions and runtime configuration."
      />

      {config?.maintenanceMode ? (
        <Alert variant="warning" className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <AlertDescription>
            <strong>Maintenance mode is on.</strong>{' '}
            {config.maintenanceMessage || 'No message set.'}
          </AlertDescription>
        </Alert>
      ) : null}

      {!config?.tradingEnabled ? (
        <Alert variant="destructive">
          <AlertDescription>
            Trading is currently disabled platform-wide. No user can place an order.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="System status"
          value={
            <Badge variant={health?.status === 'ready' ? 'profit' : 'destructive'}>
              {health?.status ?? 'unknown'}
            </Badge>
          }
          sublabel={`Up ${Math.floor((health?.uptimeSeconds ?? 0) / 60)} min`}
          icon={Server}
        />
        <StatCard label="Users" value={health?.counts.users ?? 0} icon={Users} />
        <StatCard label="Orders" value={health?.counts.orders ?? 0} icon={Activity} />
        <StatCard label="Instruments" value={health?.counts.instruments ?? 0} icon={Database} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dependencies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DependencyRow name="MongoDB" status={health?.dependencies.mongo} />
            <DependencyRow name="Redis cache" status={health?.dependencies.redis} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Market data providers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(health?.marketDataProviders ?? []).map((provider) => (
              <div key={provider.name} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium capitalize">{provider.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {provider.lastSuccessAt
                      ? `Last success ${new Date(provider.lastSuccessAt).toLocaleTimeString()}`
                      : 'No successful call yet'}
                  </p>
                </div>
                <Badge
                  variant={
                    provider.state === 'up'
                      ? 'profit'
                      : provider.state === 'circuit-open'
                        ? 'destructive'
                        : 'stale'
                  }
                >
                  {provider.state}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Background workers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(health?.workers ?? []).map((worker) => (
              <div key={worker.name} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{worker.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {worker.lastRunAt
                      ? `Last run ${new Date(worker.lastRunAt).toLocaleTimeString()}`
                      : 'Never run'}
                  </p>
                </div>
                <Badge variant={worker.lastRunStatus === 'ok' ? 'profit' : 'secondary'}>
                  {worker.lastRunStatus}
                </Badge>
              </div>
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              On a free-tier host the process sleeps when idle, so scheduled runs pause. Order
              matching and alert checks also fire opportunistically on incoming requests.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Runtime</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Environment" value={health?.environment ?? '--'} />
            <Row label="Node version" value={health?.nodeVersion ?? '--'} />
            <Row label="Memory (RSS)" value={`${health?.memory.rssMb ?? 0} MB`} />
            <Row
              label="Heap"
              value={`${health?.memory.heapUsedMb ?? 0} / ${health?.memory.heapTotalMb ?? 0} MB`}
            />
            <Separator />
            <Row label="Roles configured" value={String(roles?.roles?.length ?? 0)} />
            <Row label="Trading" value={config?.tradingEnabled ? 'Enabled' : 'Disabled'} />
            <Row label="Registration" value={config?.registrationEnabled ? 'Open' : 'Closed'} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DependencyRow({
  name,
  status,
}: {
  name: string;
  status: { state: string; latencyMs?: number; message?: string } | undefined;
}) {
  const variant =
    status?.state === 'up' ? 'profit' : status?.state === 'down' ? 'destructive' : 'stale';

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{name}</p>
        {status?.message ? (
          <p className="text-xs text-muted-foreground">{status.message}</p>
        ) : status?.latencyMs !== undefined ? (
          <p className="tabular text-xs text-muted-foreground">{status.latencyMs} ms</p>
        ) : null}
      </div>
      <Badge variant={variant}>{status?.state ?? 'unknown'}</Badge>
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

// ------------------------------------------------------------- admins

export function SuperAdminAdminsPage() {
  const { data, isLoading, isError, refetch } = useAdmins();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin accounts"
        description="Accounts with elevated access. The last Super Admin cannot be demoted."
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            New admin
          </Button>
        }
      />

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="p-5">
              <LoadingState rows={4} />
            </div>
          ) : isError ? (
            <ErrorState message="Could not load admin accounts." onRetry={() => void refetch()} />
          ) : !data?.admins?.length ? (
            <EmptyState icon={ShieldCheck} title="No admins" description="Create the first one." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
                  <TableHead className="hidden lg:table-cell">Last sign-in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell>
                      <div className="font-medium">{admin.fullName}</div>
                      <div className="text-xs text-muted-foreground">{admin.email}</div>
                      {admin.isDemo ? (
                        <Badge variant="stale" className="mt-1">
                          Demo
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={admin.role === 'super_admin' ? 'default' : 'secondary'}>
                        {ROLE_LABELS[admin.role as Role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={admin.status === 'active' ? 'profit' : 'secondary'}>
                        {admin.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {new Date(admin.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : 'Never'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateAdminDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => void refetch()}
      />
    </div>
  );
}

function CreateAdminDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'admin',
  });
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    try {
      await api.post('/super-admin/admins', form);
      toast.success(`${form.email} created`);
      onOpenChange(false);
      setForm({ firstName: '', lastName: '', email: '', password: '', role: 'admin' });
      onCreated();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not create the account.',
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create an admin account</DialogTitle>
          <DialogDescription>
            The account is created pre-verified, since a Super Admin is vouching for the address.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="admin-first">First name</Label>
              <Input
                id="admin-first"
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-last">Last name</Label>
              <Input
                id="admin-last"
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-password">Temporary password</Label>
            <Input
              id="admin-password"
              type="text"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              minLength={8}
              required
            />
            <p className="text-xs text-muted-foreground">
              At least 8 characters. Share it securely and ask them to change it.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-role">Role</Label>
            <Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value })}>
              <SelectTrigger id="admin-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Create account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------- permissions

export function SuperAdminPermissionsPage() {
  const { data, isLoading, isError, refetch } = useRoles();
  const [selected, setSelected] = useState<Role>('trader');

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Could not load roles." onRetry={() => void refetch()} />;

  const roles = data?.roles ?? [];
  const available = data?.availablePermissions ?? ALL_PERMISSIONS;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Role permissions"
        description="Routes require permissions, never roles. Editing a bundle signs out everyone holding that role."
      />

      <Alert variant="info">
        <AlertDescription>
          Changing a bundle bumps its permission version, which immediately invalidates every access
          token issued under the old bundle. Affected users must sign in again.
        </AlertDescription>
      </Alert>

      <Tabs value={selected} onValueChange={(value) => setSelected(value as Role)}>
        <TabsList>
          {roles.map((role) => (
            <TabsTrigger key={role.role} value={role.role}>
              {role.label}
              <span className="ml-1.5 text-xs opacity-60">{role.userCount}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {roles.map((role) => (
          <TabsContent key={role.role} value={role.role}>
            {/*
              Keyed on the role plus its current bundle, so the editor REMOUNTS
              whenever the server data changes. That lets its state initialise
              from props instead of being synced back in an effect.
            */}
            <RolePermissionEditor
              key={`${role.role}:${role.permissions.join(',')}`}
              role={role.role}
              initialPermissions={role.permissions}
              availablePermissions={available}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function RolePermissionEditor({
  role,
  initialPermissions,
  availablePermissions,
}: {
  role: Role;
  initialPermissions: Permission[];
  availablePermissions: string[];
}) {
  const mutation = useUpdateRolePermissions();
  const [draft, setDraft] = useState<Set<Permission>>(() => new Set(initialPermissions));

  const toggle = (permission: Permission): void => {
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  };

  const save = async (): Promise<void> => {
    try {
      await mutation.mutateAsync({ role, permissions: [...draft] });
      toast.success(
        `${ROLE_LABELS[role]} permissions updated. Existing sessions for that role were signed out.`,
      );
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not update permissions.',
      );
    }
  };

  const grouped = groupPermissions(availablePermissions);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => void save()} loading={mutation.isPending}>
          Save {ROLE_LABELS[role]} permissions
        </Button>
      </div>

      {Object.entries(grouped).map(([group, permissions]) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="text-base capitalize">{group}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {permissions.map((permission) => (
              <div
                key={permission}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <Label
                  htmlFor={`perm-${role}-${permission}`}
                  className="font-mono text-xs font-normal"
                >
                  {permission}
                </Label>
                <Switch
                  id={`perm-${role}-${permission}`}
                  checked={draft.has(permission)}
                  onCheckedChange={() => toggle(permission)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function groupPermissions(permissions: string[]): Record<string, Permission[]> {
  const groups: Record<string, Permission[]> = {};
  for (const permission of permissions) {
    const [group = 'other'] = permission.split(':');
    groups[group] ??= [];
    groups[group].push(permission as Permission);
  }
  return groups;
}

// -------------------------------------------------------------- config

export function SuperAdminConfigPage() {
  const { data, isLoading, isError, refetch } = useSystemConfig();

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !data) {
    return <ErrorState message="Could not load configuration." onRetry={() => void refetch()} />;
  }

  /*
    Keyed on the last-updated timestamp so the form REMOUNTS when the server
    data changes, letting its state initialise from props rather than being
    synced back in an effect.
  */
  return <SystemConfigForm key={data.updatedAt} config={data} />;
}

function SystemConfigForm({ config: data }: { config: SystemConfigView }) {
  const mutation = useUpdateSystemConfig();

  const [form, setForm] = useState(() => ({
    tradingEnabled: data.tradingEnabled,
    registrationEnabled: data.registrationEnabled,
    maintenanceMode: data.maintenanceMode,
    maintenanceMessage: data.maintenanceMessage,
    initialCapitalInr: String(toMajor(data.initialCapitalInr)),
    initialCapitalUsd: String(toMajor(data.initialCapitalUsd)),
  }));

  const save = async (): Promise<void> => {
    try {
      await mutation.mutateAsync({
        tradingEnabled: form.tradingEnabled,
        registrationEnabled: form.registrationEnabled,
        maintenanceMode: form.maintenanceMode,
        maintenanceMessage: form.maintenanceMessage,
        initialCapitalInr: Number.parseFloat(form.initialCapitalInr),
        initialCapitalUsd: Number.parseFloat(form.initialCapitalUsd),
      });
      toast.success('Configuration saved');
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not save configuration.',
      );
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Platform configuration"
        description="Runtime switches that take effect without a redeploy."
        actions={
          <Button onClick={() => void save()} loading={mutation.isPending}>
            Save configuration
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feature switches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow
            id="trading-enabled"
            label="Trading enabled"
            description="When off, every order placement is rejected platform-wide."
            checked={form.tradingEnabled}
            onChange={(checked) => setForm({ ...form, tradingEnabled: checked })}
          />
          <ToggleRow
            id="registration-enabled"
            label="Registration open"
            description="When off, new sign-ups are refused. Existing users are unaffected."
            checked={form.registrationEnabled}
            onChange={(checked) => setForm({ ...form, registrationEnabled: checked })}
          />
          <ToggleRow
            id="maintenance-mode"
            label="Maintenance mode"
            description="Displays a platform-wide banner to every user."
            checked={form.maintenanceMode}
            onChange={(checked) => setForm({ ...form, maintenanceMode: checked })}
          />

          {form.maintenanceMode ? (
            <div className="space-y-1.5">
              <Label htmlFor="maintenance-message">Maintenance message</Label>
              <Textarea
                id="maintenance-message"
                value={form.maintenanceMessage}
                onChange={(event) => setForm({ ...form, maintenanceMessage: event.target.value })}
                maxLength={300}
                placeholder="We're performing scheduled maintenance and will be back shortly."
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Opening capital</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Applies to newly created wallets. Existing accounts keep their current balances.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="capital-inr">India wallet (INR)</Label>
              <Input
                id="capital-inr"
                type="number"
                value={form.initialCapitalInr}
                onChange={(event) => setForm({ ...form, initialCapitalInr: event.target.value })}
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="capital-usd">US wallet (USD)</Label>
              <Input
                id="capital-usd"
                type="number"
                value={form.initialCapitalUsd}
                onChange={(event) => setForm({ ...form, initialCapitalUsd: event.target.value })}
                className="tabular"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {data?.updatedByEmail ? (
        <p className="text-xs text-muted-foreground">
          Last changed by {data.updatedByEmail} on {new Date(data.updatedAt).toLocaleString()}.
        </p>
      ) : null}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
      <div className="min-w-0">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-1" />
    </div>
  );
}

// --------------------------------------------------------- system monitor

export function SuperAdminSystemPage() {
  const { data, isLoading, isError, refetch } = useSystemHealth();

  if (isLoading) return <LoadingState rows={6} />;
  if (isError || !data) {
    return <ErrorState message="Could not load system health." onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="System monitor"
        description="Live process, dependency and provider state. Refreshes every 30 seconds."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Status"
          value={
            <Badge variant={data.status === 'ready' ? 'profit' : 'destructive'}>
              {data.status}
            </Badge>
          }
          icon={Server}
        />
        <StatCard
          label="Uptime"
          value={`${Math.floor(data.uptimeSeconds / 3600)}h ${Math.floor((data.uptimeSeconds % 3600) / 60)}m`}
        />
        <StatCard label="Memory (RSS)" value={`${data.memory.rssMb} MB`} icon={Cpu} />
        <StatCard
          label="Heap used"
          value={`${data.memory.heapUsedMb} / ${data.memory.heapTotalMb} MB`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dependencies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DependencyRow name="MongoDB" status={data.dependencies.mongo} />
            <DependencyRow name="Redis cache" status={data.dependencies.redis} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Market data chain</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.marketDataProviders.map((provider) => (
              <div key={provider.name} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium capitalize">{provider.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {provider.failureCount > 0
                      ? `${provider.failureCount} consecutive failure(s)`
                      : 'Healthy'}
                  </p>
                </div>
                <Badge
                  variant={
                    provider.state === 'up'
                      ? 'profit'
                      : provider.state === 'circuit-open'
                        ? 'destructive'
                        : 'stale'
                  }
                >
                  {provider.state}
                </Badge>
              </div>
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              After three consecutive failures a provider is skipped for five minutes, then retried.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workers</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.workers.map((worker) => (
                <TableRow key={worker.name}>
                  <TableCell className="font-medium">{worker.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {worker.lastRunAt ? new Date(worker.lastRunAt).toLocaleString() : 'Never'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={worker.lastRunStatus === 'ok' ? 'profit' : 'secondary'}>
                      {worker.lastRunStatus}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------ audit log

export function SuperAdminAuditPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useAuditLogs({ page, limit: 25 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Append-only record of every privileged action. Nothing in the codebase edits or deletes these."
      />

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="p-5">
              <LoadingState rows={6} />
            </div>
          ) : isError ? (
            <ErrorState message="Could not load the audit log." onRetry={() => void refetch()} />
          ) : !data?.data?.length ? (
            <EmptyState
              icon={ScrollText}
              title="No entries"
              description="Privileged actions will be recorded here."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead className="hidden lg:table-cell">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{entry.actorEmail ?? 'system'}</div>
                        {entry.actorRole ? (
                          <Badge variant="secondary" className="mt-1">
                            {ROLE_LABELS[entry.actorRole]}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[360px] text-sm">{entry.summary}</TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                        {entry.ip ?? '--'}
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
