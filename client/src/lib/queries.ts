import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type {
  AdminTradeRow,
  AdminUserRow,
  AllocationSlice,
  AuditLogRow,
  AuthSession,
  ComparisonEntry,
  DemoAccountInfo,
  EducationResource,
  Exchange,
  Holding,
  HistoryRange,
  HistorySeries,
  Instrument,
  InstrumentWithQuote,
  Market,
  MarketIndex,
  MarketStatus,
  MoversPayload,
  NewsArticle,
  Notification,
  Order,
  OrderPreview,
  PlaceOrderInput,
  PlatformAnalytics,
  PortfolioOverview,
  PortfolioSnapshotPoint,
  PriceAlert,
  PublicUser,
  SelfServiceRole,
  Quote,
  RolePermissionsView,
  StockDetail,
  SystemConfigView,
  SystemHealthView,
  TradeStatistics,
  TransactionRecord,
  Watchlist,
} from '@smd/shared';
import { api } from './apiClient';

/**
 * Typed data-access hooks.
 *
 * Query keys are centralised so an invalidation cannot silently miss a cache
 * entry because two files spelled the key differently.
 *
 * Refetch intervals are the "live" feel of the app. They poll the SERVER's
 * cached quote, not the upstream provider, so tightening them costs nothing
 * upstream - the provider is protected by the server-side cache TTL.
 */

export const queryKeys = {
  me: ['me'] as const,
  demoAccounts: ['demo-accounts'] as const,

  marketStatus: ['market', 'status'] as const,
  indices: (market?: Market) => ['market', 'indices', market ?? 'all'] as const,
  movers: (market: Market) => ['market', 'movers', market] as const,
  search: (q: string) => ['market', 'search', q] as const,
  quote: (symbol: string, exchange?: string) =>
    ['market', 'quote', symbol, exchange ?? 'auto'] as const,
  stockDetail: (symbol: string, exchange?: string) =>
    ['market', 'detail', symbol, exchange ?? 'auto'] as const,
  history: (symbol: string, range: string, exchange?: string) =>
    ['market', 'history', symbol, range, exchange ?? 'auto'] as const,
  compare: (symbols: string[], range: string) =>
    ['market', 'compare', symbols.join(','), range] as const,
  news: (params: Record<string, unknown>) => ['news', params] as const,

  portfolio: (market?: Market) => ['portfolio', market ?? 'all'] as const,
  holdings: (market?: Market) => ['portfolio', 'holdings', market ?? 'all'] as const,
  allocation: (market?: Market) => ['portfolio', 'allocation', market ?? 'all'] as const,
  performance: (market: Market | undefined, range: string) =>
    ['portfolio', 'performance', market ?? 'all', range] as const,
  tradeStats: (market?: Market) => ['portfolio', 'trades', market ?? 'all'] as const,
  transactions: (params: Record<string, unknown>) => ['portfolio', 'transactions', params] as const,

  orders: (params: Record<string, unknown>) => ['orders', params] as const,
  order: (id: string) => ['orders', id] as const,

  watchlists: ['watchlists'] as const,
  alerts: (params: Record<string, unknown>) => ['alerts', params] as const,
  notifications: (params: Record<string, unknown>) => ['notifications', params] as const,
  unreadCount: ['notifications', 'unread-count'] as const,

  education: (params: Record<string, unknown>) => ['education', params] as const,
  educationArticle: (slug: string) => ['education', slug] as const,

  adminUsers: (params: Record<string, unknown>) => ['admin', 'users', params] as const,
  adminOrders: (params: Record<string, unknown>) => ['admin', 'orders', params] as const,
  adminAnalytics: ['admin', 'analytics'] as const,
  adminInstruments: (params: Record<string, unknown>) => ['admin', 'instruments', params] as const,

  superAdmins: ['super-admin', 'admins'] as const,
  roles: ['super-admin', 'roles'] as const,
  config: ['super-admin', 'config'] as const,
  systemHealth: ['super-admin', 'health'] as const,
  auditLogs: (params: Record<string, unknown>) => ['super-admin', 'audit', params] as const,
};

/** Quotes refresh roughly as often as the server cache turns over. */
const QUOTE_REFETCH_MS = 30_000;
const SLOW_REFETCH_MS = 60_000;

// ----------------------------------------------------------------- market

export function useMarketStatus() {
  return useQuery({
    queryKey: queryKeys.marketStatus,
    queryFn: () =>
      api.get<{ markets: MarketStatus[]; serverTime: string; notice: string }>('/market/status'),
    refetchInterval: SLOW_REFETCH_MS,
    staleTime: 30_000,
  });
}

export function useIndices(market?: Market) {
  return useQuery({
    queryKey: queryKeys.indices(market),
    queryFn: () => api.get<{ indices: MarketIndex[] }>('/market/indices', market ? { market } : {}),
    refetchInterval: QUOTE_REFETCH_MS,
  });
}

export function useMovers(market: Market, limit = 5) {
  return useQuery({
    queryKey: queryKeys.movers(market),
    queryFn: () => api.get<MoversPayload>('/market/movers', { market, limit }),
    refetchInterval: SLOW_REFETCH_MS,
  });
}

/**
 * Instrument listing for the browse experience.
 *
 * Unlike `useSearch`, this runs with no query term, so the Explore page shows
 * the universe on first paint instead of an empty state.
 */
export function useInstrumentList(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['instruments', params] as const,
    queryFn: () =>
      api.get<{ results: InstrumentWithQuote[]; total: number; sectors: string[] }>(
        '/market/instruments',
        params,
      ),
    staleTime: 30_000,
  });
}

export function useSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.search(q),
    queryFn: () => api.get<{ results: Instrument[]; query: string }>('/market/search', { q }),
    // Single characters match nearly everything and waste a round trip.
    enabled: enabled && q.trim().length >= 2,
    staleTime: 60_000,
  });
}

export function useQuote(symbol: string, exchange?: Exchange, enabled = true) {
  return useQuery({
    queryKey: queryKeys.quote(symbol, exchange),
    queryFn: () => api.get<Quote>(`/market/quote/${symbol}`, exchange ? { exchange } : {}),
    enabled: enabled && symbol.length > 0,
    refetchInterval: QUOTE_REFETCH_MS,
  });
}

export function useStockDetail(symbol: string, exchange?: Exchange) {
  return useQuery({
    queryKey: queryKeys.stockDetail(symbol, exchange),
    queryFn: () => api.get<StockDetail>(`/market/${symbol}`, exchange ? { exchange } : {}),
    enabled: symbol.length > 0,
    refetchInterval: QUOTE_REFETCH_MS,
  });
}

export function useHistory(symbol: string, range: HistoryRange, exchange?: Exchange) {
  return useQuery({
    queryKey: queryKeys.history(symbol, range, exchange),
    queryFn: () =>
      api.get<HistorySeries>(`/market/history/${symbol}`, {
        range,
        interval: range === '5Y' ? '1wk' : '1d',
        ...(exchange ? { exchange } : {}),
      }),
    enabled: symbol.length > 0,
    staleTime: 5 * 60_000,
  });
}

export function useComparison(symbols: string[], range: HistoryRange) {
  return useQuery({
    queryKey: queryKeys.compare(symbols, range),
    queryFn: () =>
      api.get<{ entries: ComparisonEntry[]; range: string }>('/market/compare', {
        symbols: symbols.join(','),
        range,
      }),
    enabled: symbols.length >= 2,
    staleTime: 60_000,
  });
}

export function useNews(params: { page?: number; limit?: number; symbol?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.news(params),
    queryFn: () => api.getPaginated<NewsArticle[]>('/market/news', params),
    staleTime: 5 * 60_000,
  });
}

// -------------------------------------------------------------- portfolio

export function usePortfolio(market?: Market) {
  return useQuery({
    queryKey: queryKeys.portfolio(market),
    queryFn: () => api.get<PortfolioOverview>('/portfolio', market ? { market } : {}),
    refetchInterval: QUOTE_REFETCH_MS,
  });
}

export function useHoldings(market?: Market) {
  return useQuery({
    queryKey: queryKeys.holdings(market),
    queryFn: () =>
      api.get<{ holdings: Holding[] }>('/portfolio/holdings', market ? { market } : {}),
    refetchInterval: QUOTE_REFETCH_MS,
  });
}

export function useAllocation(market?: Market) {
  return useQuery({
    queryKey: queryKeys.allocation(market),
    queryFn: () =>
      api.get<{
        bySector: AllocationSlice[];
        byHolding: AllocationSlice[];
        byMarket: AllocationSlice[];
        cashVsInvested: AllocationSlice[];
      }>('/portfolio/analytics/allocation', market ? { market } : {}),
    refetchInterval: SLOW_REFETCH_MS,
  });
}

export function usePerformance(range: string, market?: Market) {
  return useQuery({
    queryKey: queryKeys.performance(market, range),
    queryFn: () =>
      api.get<{ series: PortfolioSnapshotPoint[]; range: string; note: string }>(
        '/portfolio/analytics/performance',
        { range, ...(market ? { market } : {}) },
      ),
    staleTime: 60_000,
  });
}

export function useTradeStats(market?: Market) {
  return useQuery({
    queryKey: queryKeys.tradeStats(market),
    queryFn: () =>
      api.get<TradeStatistics>('/portfolio/analytics/trades', market ? { market } : {}),
    staleTime: 30_000,
  });
}

export function useTransactions(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.transactions(params),
    queryFn: () => api.getPaginated<TransactionRecord[]>('/portfolio/transactions', params),
  });
}

// ----------------------------------------------------------------- orders

export function useOrders(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.orders(params),
    queryFn: () => api.getPaginated<Order[]>('/orders', params),
    refetchInterval: SLOW_REFETCH_MS,
  });
}

export function useOrderPreview() {
  return useMutation({
    mutationFn: (input: PlaceOrderInput) => api.post<OrderPreview>('/orders/preview', input),
  });
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: PlaceOrderInput; idempotencyKey: string }) =>
      api.post<{ order: Order; duplicate: boolean }>('/orders', input, {
        // Protects against a double-click or a retry creating two positions.
        'Idempotency-Key': idempotencyKey,
      }),
    onSuccess: () => {
      // A fill changes cash, holdings and order history all at once.
      void queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post<Order>(`/orders/${id}/cancel`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

// ------------------------------------------------------------- watchlists

export function useWatchlists() {
  return useQuery({
    queryKey: queryKeys.watchlists,
    queryFn: () => api.get<{ watchlists: Watchlist[] }>('/watchlists'),
    refetchInterval: QUOTE_REFETCH_MS,
  });
}

export function useCreateWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Watchlist>('/watchlists', { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.watchlists }),
  });
}

export function useDeleteWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/watchlists/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.watchlists }),
  });
}

export function useAddToWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      symbol,
      exchange,
      note,
    }: {
      id: string;
      symbol: string;
      exchange: Exchange;
      note?: string;
    }) => api.post<Watchlist>(`/watchlists/${id}/items`, { symbol, exchange, note }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.watchlists }),
  });
}

export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, symbol, exchange }: { id: string; symbol: string; exchange: Exchange }) =>
      api.delete<Watchlist>(`/watchlists/${id}/items/${exchange}/${symbol}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.watchlists }),
  });
}

// ----------------------------------------------------------------- alerts

export function useAlerts(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: queryKeys.alerts(params),
    queryFn: () => api.getPaginated<PriceAlert[]>('/alerts', params),
    refetchInterval: SLOW_REFETCH_MS,
  });
}

export function useCreateAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      symbol: string;
      exchange: Exchange;
      condition: string;
      threshold: number;
      repeat: boolean;
      note?: string;
    }) => api.post<PriceAlert>('/alerts', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useCancelAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<PriceAlert>(`/alerts/${id}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useDeleteAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/alerts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

// ---------------------------------------------------------- notifications

export function useNotifications(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: queryKeys.notifications(params),
    queryFn: () => api.getPaginated<Notification[]>('/notifications', params),
  });
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    enabled,
    // A socket push also invalidates this; the interval is the fallback for a
    // dropped connection on a free-tier host.
    refetchInterval: SLOW_REFETCH_MS,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<Notification>(`/notifications/${id}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch<{ marked: number }>('/notifications/read-all'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// -------------------------------------------------------------- education

export function useEducation(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: queryKeys.education(params),
    queryFn: () => api.getPaginated<EducationResource[]>('/education', params),
    staleTime: 5 * 60_000,
  });
}

export function useEducationArticle(slug: string) {
  return useQuery({
    queryKey: queryKeys.educationArticle(slug),
    queryFn: () => api.get<EducationResource>(`/education/${slug}`),
    enabled: slug.length > 0,
    staleTime: 5 * 60_000,
  });
}

// ------------------------------------------------------------------ admin

export function useAdminUsers(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.adminUsers(params),
    queryFn: () => api.getPaginated<AdminUserRow[]>('/admin/users', params),
  });
}

export function useUpdateUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      api.patch(`/admin/users/${id}/status`, { status, reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useAdminOrders(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.adminOrders(params),
    queryFn: () => api.getPaginated<AdminTradeRow[]>('/admin/orders', params),
  });
}

export function useAdminAnalytics() {
  return useQuery({
    queryKey: queryKeys.adminAnalytics,
    queryFn: () => api.get<PlatformAnalytics>('/admin/analytics'),
    refetchInterval: SLOW_REFETCH_MS,
  });
}

export function useAdminInstruments(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.adminInstruments(params),
    queryFn: () => api.getPaginated<Instrument[]>('/admin/instruments', params),
  });
}

// ------------------------------------------------------------ super admin

export function useAdmins() {
  return useQuery({
    queryKey: queryKeys.superAdmins,
    queryFn: () =>
      api.get<{
        admins: {
          id: string;
          email: string;
          fullName: string;
          role: string;
          status: string;
          isDemo: boolean;
          createdAt: string;
          lastLoginAt: string | null;
        }[];
      }>('/super-admin/admins'),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: queryKeys.roles,
    queryFn: () =>
      api.get<{ roles: RolePermissionsView[]; availablePermissions: string[] }>(
        '/super-admin/roles',
      ),
  });
}

export function useUpdateRolePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ role, permissions }: { role: string; permissions: string[] }) =>
      api.put(`/super-admin/roles/${role}/permissions`, { permissions }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.roles }),
  });
}

export function useSystemConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: () => api.get<SystemConfigView>('/super-admin/config'),
  });
}

export function useUpdateSystemConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api.put<SystemConfigView>('/super-admin/config', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.config }),
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: queryKeys.systemHealth,
    queryFn: () => api.get<SystemHealthView>('/super-admin/system/health'),
    refetchInterval: 30_000,
  });
}

export function useAuditLogs(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.auditLogs(params),
    queryFn: () => api.getPaginated<AuditLogRow[]>('/super-admin/audit-logs', params),
  });
}

// ------------------------------------------------------------------- auth

export function useDemoAccounts(
  options?: Partial<UseQueryOptions<{ accounts: DemoAccountInfo[]; notice: string }>>,
) {
  return useQuery({
    queryKey: queryKeys.demoAccounts,
    queryFn: () => api.get<{ accounts: DemoAccountInfo[]; notice: string }>('/auth/demo-accounts'),
    staleTime: Infinity,
    ...options,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api.patch<{ user: PublicUser }>('/users/preferences', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { firstName?: string; lastName?: string }) =>
      api.patch<{ user: PublicUser }>('/users/profile', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api.post<{ message: string }>('/auth/change-password', input),
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<AuthSession>('/auth/login', input),
  });
}

export function useDemoLogin() {
  return useMutation({
    mutationFn: (role: string) => api.post<AuthSession>('/auth/demo-login', { role }),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (input: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      role: SelfServiceRole;
    }) =>
      api.post<{
        user: PublicUser;
        emailDelivered: boolean;
        verificationUrl?: string;
        message: string;
      }>('/auth/register', input),
  });
}
