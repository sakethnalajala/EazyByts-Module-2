import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { PERMISSIONS } from '@smd/shared';
import { setSessionExpiredHandler, ApiClientError } from '@/lib/apiClient';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore, resolveTheme } from '@/stores/uiStore';
import { useRealtime } from '@/hooks/useRealtime';
import { useRoleTheme } from '@/hooks/useRoleTheme';
import { TooltipProvider } from '@/components/ui/overlays';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import {
  RedirectIfAuthenticated,
  RedirectRoles,
  RequireAuth,
  RequirePermission,
  RequireRole,
} from '@/components/layout/guards';

// public
import { LandingPage } from '@/pages/public/LandingPage';
import { LoginPage } from '@/pages/public/LoginPage';
import {
  ForgotPasswordPage,
  RegisterChoicePage,
  RegisterTraderPage,
  RegisterUserPage,
  ResendVerificationPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '@/pages/public/AuthFlowPages';

// trader
import { DashboardPage } from '@/pages/trader/DashboardPage';
import { MarketOverviewPage, StockExplorerPage } from '@/pages/trader/MarketPages';
import { StockDetailPage } from '@/pages/trader/StockDetailPage';
import {
  AnalyticsPage,
  HoldingsPage,
  OrdersPage,
  PortfolioPage,
  TransactionsPage,
} from '@/pages/trader/PortfolioPages';
import {
  AlertsPage,
  ComparePage,
  NewsPage,
  NotificationsPage,
  WatchlistPage,
} from '@/pages/trader/ToolsPages';
import {
  EducationArticlePage,
  EducationPage,
  ProfilePage,
  SettingsPage,
} from '@/pages/trader/AccountPages';

// user (view-only)
import {
  UserDashboardPage,
  UserEducationPage,
  UserMarketPage,
  UserNewsPage,
  UserProfilePage,
  UserWatchlistPage,
} from '@/pages/user/UserPages';

// admin
import {
  AdminDashboardPage,
  AdminEducationPage,
  AdminInstrumentsPage,
  AdminTradesPage,
  AdminUsersPage,
} from '@/pages/admin/AdminPages';

// super admin
import {
  SuperAdminAdminsPage,
  SuperAdminAuditPage,
  SuperAdminConfigPage,
  SuperAdminDashboardPage,
  SuperAdminPermissionsPage,
  SuperAdminSystemPage,
} from '@/pages/superadmin/SuperAdminPages';

import { Button } from '@/components/ui';

/**
 * Query client defaults.
 *
 * Auth failures are never retried: a 401 means the session is gone, and
 * hammering the endpoint three more times only delays the redirect to login.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiClientError && (error.isAuthError || error.status === 403)) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

/**
 * Applies the resolved theme to <html> and follows the OS when set to system.
 *
 * Every surface honours the preference, including the marketing and sign-in
 * pages - the theme toggle in the header would otherwise be inert there.
 * The default is dark (see the ui store), so a first-time visitor still lands
 * on the dark identity the product is designed around.
 *
 * `colorScheme` is set alongside the class so native controls - scrollbars,
 * form widgets, the caret - follow the theme too.
 */
function ThemeEffect() {
  const theme = useUiStore((state) => state.theme);

  useEffect(() => {
    const apply = (): void => {
      const resolved = resolveTheme(theme);
      document.documentElement.classList.toggle('dark', resolved === 'dark');
      document.documentElement.style.colorScheme = resolved;
    };

    apply();

    if (theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return null;
}

/** Restores the session from the refresh cookie once, on boot. */
function AuthBootstrap() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const clearSession = useAuthStore((state) => state.clearSession);
  const navigate = useNavigate();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    // Called by the axios interceptor when a refresh finally fails.
    setSessionExpiredHandler(() => {
      clearSession();
      if (!window.location.pathname.startsWith('/login')) {
        void navigate('/login', { replace: true });
      }
    });
  }, [clearSession, navigate]);

  useRealtime();
  // Recolours every surface to match the signed-in role. Presentation only.
  useRoleTheme();

  return null;
}

function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4 text-center">
      <div>
        <p className="mb-2 text-6xl font-semibold tracking-tight text-muted-foreground">404</p>
        <h1 className="mb-2 text-xl font-semibold">Page not found</h1>
        <p className="mb-6 text-muted-foreground">
          That page does not exist, or you followed a stale link.
        </p>
        <Button asChild>
          <a href="/app/dashboard">Back to dashboard</a>
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TooltipProvider delayDuration={200}>
            <ThemeEffect />
            <AuthBootstrap />

            <Routes>
              {/* ------------------------------------------------- public */}
              <Route path="/" element={<LandingPage />} />
              <Route
                path="/login"
                element={
                  <RedirectIfAuthenticated>
                    <LoginPage />
                  </RedirectIfAuthenticated>
                }
              />
              {/*
                Registration is a two-step flow: choose an account type, then
                fill in that type's form. The chosen role is posted to the API
                and re-validated there against SELF_SERVICE_ROLES.
              */}
              <Route
                path="/register"
                element={
                  <RedirectIfAuthenticated>
                    <RegisterChoicePage />
                  </RedirectIfAuthenticated>
                }
              />
              <Route
                path="/register/user"
                element={
                  <RedirectIfAuthenticated>
                    <RegisterUserPage />
                  </RedirectIfAuthenticated>
                }
              />
              <Route
                path="/register/trader"
                element={
                  <RedirectIfAuthenticated>
                    <RegisterTraderPage />
                  </RedirectIfAuthenticated>
                }
              />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/resend-verification" element={<ResendVerificationPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* ------------------------------------------------- trader */}
              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route
                  path="/app"
                  element={
                    <RedirectRoles roles={['user']}>
                      <Navigate to="/app/dashboard" replace />
                    </RedirectRoles>
                  }
                />
                <Route
                  path="/app/dashboard"
                  element={
                    <RedirectRoles roles={['user']}>
                      <DashboardPage />
                    </RedirectRoles>
                  }
                />
                <Route
                  path="/app/market"
                  element={
                    <RedirectRoles roles={['user']}>
                      <MarketOverviewPage />
                    </RedirectRoles>
                  }
                />
                <Route
                  path="/app/stocks"
                  element={
                    <RedirectRoles roles={['user']}>
                      <StockExplorerPage />
                    </RedirectRoles>
                  }
                />
                <Route
                  path="/app/stocks/:symbol"
                  element={
                    <RedirectRoles roles={['user']}>
                      <StockDetailPage />
                    </RedirectRoles>
                  }
                />

                <Route
                  path="/app/portfolio"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.PORTFOLIO_READ]}>
                      <PortfolioPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/holdings"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.PORTFOLIO_READ]}>
                      <HoldingsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/orders"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.ORDER_READ]}>
                      <OrdersPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/transactions"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.PORTFOLIO_READ]}>
                      <TransactionsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/analytics"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.PORTFOLIO_READ]}>
                      <AnalyticsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/watchlist"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.WATCHLIST_MANAGE]}>
                      <WatchlistPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/alerts"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.ALERT_MANAGE]}>
                      <AlertsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/notifications"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.NOTIFICATION_READ]}>
                      <NotificationsPage />
                    </RequirePermission>
                  }
                />
                <Route path="/app/compare" element={<ComparePage />} />
                <Route
                  path="/app/news"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.NEWS_READ]}>
                      <NewsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/education"
                  element={
                    <RedirectRoles roles={['user']}>
                      <EducationPage />
                    </RedirectRoles>
                  }
                />
                <Route
                  path="/app/education/:slug"
                  element={
                    <RedirectRoles roles={['user']}>
                      <EducationArticlePage />
                    </RedirectRoles>
                  }
                />
                <Route
                  path="/app/profile"
                  element={
                    <RedirectRoles roles={['user']}>
                      <ProfilePage />
                    </RedirectRoles>
                  }
                />
                <Route
                  path="/app/settings"
                  element={
                    <RedirectRoles roles={['user']}>
                      <SettingsPage />
                    </RedirectRoles>
                  }
                />

                {/* ---------------------------------- user (view-only) */}
                <Route path="/u" element={<Navigate to="/u/dashboard" replace />} />
                <Route
                  path="/u/dashboard"
                  element={
                    <RequireRole roles={['user']}>
                      <UserDashboardPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/u/market"
                  element={
                    <RequireRole roles={['user']}>
                      <UserMarketPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/u/market/:symbol"
                  element={
                    <RequireRole roles={['user']}>
                      <StockDetailPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/u/watchlist"
                  element={
                    <RequireRole roles={['user']}>
                      <UserWatchlistPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/u/news"
                  element={
                    <RequireRole roles={['user']}>
                      <UserNewsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/u/education"
                  element={
                    <RequireRole roles={['user']}>
                      <UserEducationPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/u/education/:slug"
                  element={
                    <RequireRole roles={['user']}>
                      <EducationArticlePage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/u/profile"
                  element={
                    <RequireRole roles={['user']}>
                      <UserProfilePage />
                    </RequireRole>
                  }
                />

                {/* -------------------------------------------- admin */}
                <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                <Route
                  path="/admin/dashboard"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.ANALYTICS_READ]}>
                      <AdminDashboardPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/admin/users"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.USER_READ]}>
                      <AdminUsersPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/admin/trades"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.TRADE_MONITOR]}>
                      <AdminTradesPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/admin/analytics"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.ANALYTICS_READ]}>
                      <AdminDashboardPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/admin/instruments"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.INSTRUMENT_MANAGE]}>
                      <AdminInstrumentsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/admin/education"
                  element={
                    <RequirePermission permissions={[PERMISSIONS.EDUCATION_MANAGE]}>
                      <AdminEducationPage />
                    </RequirePermission>
                  }
                />

                {/* -------------------------------------- super admin */}
                <Route
                  path="/super-admin"
                  element={<Navigate to="/super-admin/dashboard" replace />}
                />
                <Route
                  path="/super-admin/dashboard"
                  element={
                    <RequireRole roles={['super_admin']}>
                      <SuperAdminDashboardPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/admins"
                  element={
                    <RequireRole roles={['super_admin']}>
                      <SuperAdminAdminsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/permissions"
                  element={
                    <RequireRole roles={['super_admin']}>
                      <SuperAdminPermissionsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/config"
                  element={
                    <RequireRole roles={['super_admin']}>
                      <SuperAdminConfigPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/system"
                  element={
                    <RequireRole roles={['super_admin']}>
                      <SuperAdminSystemPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/audit"
                  element={
                    <RequireRole roles={['super_admin']}>
                      <SuperAdminAuditPage />
                    </RequireRole>
                  }
                />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>

            <Toaster
              position="bottom-right"
              richColors
              closeButton
              toastOptions={{ duration: 5000 }}
            />
          </TooltipProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
