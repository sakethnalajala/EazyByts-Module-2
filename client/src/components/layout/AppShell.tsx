import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronLeft,
  LogOut,
  Menu,
  Search,
  TrendingUp,
  User as UserIcon,
} from 'lucide-react';
import { ROLE_HOME_PATH, ROLE_LABELS } from '@smd/shared';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useMarketStatus, useUnreadCount } from '@/lib/queries';
import { Badge, Button, Separator } from '@/components/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
} from '@/components/ui/overlays';
import { buildNavigation } from './navigation';
import { GlobalSearch } from './GlobalSearch';
import { AmbientBackground } from '@/components/common/AmbientBackground';
import { ThemeToggle } from '@/components/common/ThemeToggle';

/**
 * Authenticated application shell.
 *
 * Responsive strategy: a persistent sidebar from 1024px, collapsible to icons,
 * and a slide-over drawer below that. The drawer closes on navigation, because
 * leaving it open over the page the user just chose is a classic mobile bug.
 */
export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useUiStore();
  const [searchOpen, setSearchOpen] = useState(false);

  const sections = useMemo(
    () => buildNavigation(user?.permissions ?? [], user?.role),
    [user?.permissions, user?.role],
  );
  const { data: unread } = useUnreadCount(Boolean(user));

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, setMobileNavOpen]);

  // Cmd/Ctrl+K opens search, the convention users already expect.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleLogout = async (): Promise<void> => {
    await logout();
    void navigate('/login', { replace: true });
  };

  return (
    <div className="relative min-h-dvh text-foreground">
      {/*
        Subtle ambient wash. Lower intensity than the marketing pages so it
        never competes with dense data.

        The tier shows through the options rather than the colours alone:
        traders get the plain wash, admins gain the terminal grid, and Super
        Admin adds the rotating beam and the gold halo on top.
      */}
      <AmbientBackground
        variant="app"
        grid={user?.role === 'admin' || user?.role === 'super_admin'}
        beam={user?.role === 'super_admin'}
        gold={user?.role === 'super_admin'}
      />

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden border-r border-border/60 bg-card/70 backdrop-blur-xl',
          'transition-[width] duration-300 lg:flex lg:flex-col',
          sidebarCollapsed ? 'w-16' : 'w-60',
        )}
      >
        <SidebarContent sections={sections} collapsed={sidebarCollapsed} />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" aria-label="Navigation" className="bg-card/95 backdrop-blur-xl">
          <SidebarContent sections={sections} collapsed={false} />
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          'flex min-h-dvh flex-col transition-[padding]',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60',
        )}
      >
        <Topbar
          onMenuClick={() => setMobileNavOpen(true)}
          onSearchClick={() => setSearchOpen(true)}
          onCollapseClick={toggleSidebar}
          collapsed={sidebarCollapsed}
          unreadCount={unread?.count ?? 0}
          onLogout={handleLogout}
        />

        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {/* Keyed on the path so each navigation replays the entrance
              animation - a cheap, GPU-friendly page transition. */}
          <div key={location.pathname} className="animate-fade-up mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-border/60 px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
          Stock Market Dashboard &middot; Simulated paper-trading platform &middot; Prices are
          delayed or simulated &middot; Not investment advice
        </footer>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

function SidebarContent({
  sections,
  collapsed,
}: {
  sections: ReturnType<typeof buildNavigation>;
  collapsed: boolean;
}) {
  const { user } = useAuthStore();
  // Each role's brand mark returns them to their OWN home, not the trader's.
  const home = user ? ROLE_HOME_PATH[user.role] : '/';

  return (
    <>
      <div
        className={cn(
          'flex h-14 items-center gap-2 border-b border-border px-4',
          collapsed && 'justify-center px-2',
        )}
      >
        <Link to={home} className="group flex items-center gap-2 font-semibold">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-lg text-white shadow-lg transition-transform duration-300 group-hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, var(--role-accent), var(--role-accent-2))',
              boxShadow: '0 6px 20px -8px var(--role-glow)',
            }}
          >
            <TrendingUp className="size-4" aria-hidden="true" />
          </span>
          {!collapsed && <span className="truncate text-sm">Market Dashboard</span>}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
        {sections.map((section) => (
          <div key={section.heading} className="mb-4">
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.heading}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={!item.matchPrefix}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                        collapsed && 'justify-center px-2',
                        // Active state uses the role accent plus a left bar,
                        // so it reads without relying on colour alone.
                        isActive
                          ? 'bg-primary/12 font-medium text-primary shadow-[inset_2px_0_0_0_var(--role-accent)]'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden="true" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {collapsed && <span className="sr-only">{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {!collapsed && user ? (
        <div className="border-t border-border p-3">
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Topbar({
  onMenuClick,
  onSearchClick,
  onCollapseClick,
  collapsed,
  unreadCount,
  onLogout,
}: {
  onMenuClick: () => void;
  onSearchClick: () => void;
  onCollapseClick: () => void;
  collapsed: boolean;
  unreadCount: number;
  onLogout: () => void | Promise<void>;
}) {
  const { user } = useAuthStore();
  const { data: status } = useMarketStatus();

  const indiaOpen = status?.markets?.find((market) => market.market === 'IN')?.isOpen ?? false;
  const usOpen = status?.markets?.find((market) => market.market === 'US')?.isOpen ?? false;

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        onClick={onCollapseClick}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <ChevronLeft className={cn('size-4 transition-transform', collapsed && 'rotate-180')} />
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onSearchClick}
        className="hidden w-56 justify-start gap-2 text-muted-foreground sm:inline-flex"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search stocks</span>
        <kbd className="rounded border border-border px-1 text-[10px]">Ctrl K</kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onSearchClick}
        className="sm:hidden"
        aria-label="Search"
      >
        <Search className="size-5" />
      </Button>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Market session pills - status is text, not colour alone. */}
        <div className="hidden items-center gap-1.5 md:flex">
          <MarketPill label="NSE/BSE" open={indiaOpen} />
          <MarketPill label="US" open={usOpen} />
        </div>

        <Button
          variant="ghost"
          size="icon"
          asChild
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        >
          <Link to="/app/notifications" className="relative">
            <Bell className="size-5" />
            {unreadCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </Link>
        </Button>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Account menu">
              <span
                className="grid size-7 place-items-center rounded-full text-xs font-semibold text-white shadow"
                style={{
                  background: 'linear-gradient(135deg, var(--role-accent), var(--role-accent-2))',
                }}
              >
                {user?.firstName.charAt(0).toUpperCase() ?? <UserIcon className="size-4" />}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block truncate font-medium text-foreground">{user?.fullName}</span>
              <span className="block truncate">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {user?.isDemo ? (
              <>
                <div className="px-2 py-1.5">
                  <Badge variant="stale" className="w-full justify-center">
                    Demo account
                  </Badge>
                </div>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem asChild>
              <Link to="/app/profile">Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/app/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void onLogout()} className="text-destructive">
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function MarketPill({ label, open }: { label: string; open: boolean }) {
  return (
    <Badge variant={open ? 'profit' : 'secondary'} className="gap-1.5">
      <span
        className={cn(
          'inline-block size-1.5 rounded-full',
          open ? 'bg-profit' : 'bg-muted-foreground',
        )}
        aria-hidden="true"
      />
      {label} {open ? 'open' : 'closed'}
    </Badge>
  );
}

export { Separator };
