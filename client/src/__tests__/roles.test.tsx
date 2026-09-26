import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_ROLE_PERMISSIONS, type PublicUser, type Role } from '@smd/shared';

/**
 * Role dashboards, themes and client-side guards.
 *
 * The server is the real authority on access - that matrix is covered by the
 * API suite. What this file protects is the SPA half: that each role lands on
 * its own dashboard, wears its own theme, and is refused the areas above it.
 *
 * The guards here are a usability layer, not the security boundary. A trader
 * who edits their way past them still gets a 403 from the API.
 */

import type * as ApiClientModule from '@/lib/apiClient';

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    api: {
      get: mockGet,
      getPaginated: vi.fn().mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      }),
      post: mockPost,
      patch: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      download: vi.fn().mockResolvedValue(undefined),
    },
    setAccessToken: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue('test-token'),
    setSessionExpiredHandler: vi.fn(),
  };
});

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
  }),
}));

import App from '@/App';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { apiFixtures } from './fixtures';

/**
 * Serves the recorded payload for a URL, matching on the path prefix so that
 * query strings and ids do not have to be enumerated.
 */
function fixtureFor(url: string): unknown {
  const path = url.split('?')[0] ?? url;
  if (apiFixtures[path] !== undefined) return apiFixtures[path];
  const match = Object.keys(apiFixtures)
    .filter((key) => path.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return match ? apiFixtures[match] : {};
}

function makeUser(role: Role): PublicUser {
  return {
    id: `id-${role}`,
    email: `demo.${role}@smd.local`,
    firstName: 'Demo',
    lastName: role,
    fullName: `Demo ${role}`,
    role,
    status: 'active',
    isDemo: true,
    emailVerified: true,
    permissions: [...DEFAULT_ROLE_PERMISSIONS[role]],
    preferences: {
      theme: 'system',
      defaultMarket: 'IN',
      widgets: [],
      emailNotifications: true,
    },
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  } as unknown as PublicUser;
}

/**
 * Signs a role in the way the app really boots: the store is seeded, and the
 * refresh call that <AuthBootstrap> fires on mount returns the same session.
 *
 * Seeding the store alone is not enough - bootstrap would resolve a moment
 * later and overwrite it.
 */
let currentUser: PublicUser | null = null;

function signIn(role: Role): void {
  currentUser = makeUser(role);
  useAuthStore.setState({ status: 'authed', user: currentUser });
}

function visit(path: string): void {
  window.history.pushState({}, '', path);
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = null;
  useUiStore.setState({ theme: 'dark' });
  mockGet.mockImplementation((url: string) => Promise.resolve(fixtureFor(url)));
  mockPost.mockImplementation((url: string) => {
    if (url.includes('/auth/refresh')) {
      return currentUser
        ? Promise.resolve({ accessToken: 'test-token', user: currentUser })
        : Promise.reject(new Error('no session'));
    }
    return Promise.resolve({});
  });
  document.documentElement.removeAttribute('data-role');
  useAuthStore.setState({ status: 'anon', user: null });
});

describe('role dashboards', () => {
  it('renders the trader dashboard for a trader', async () => {
    signIn('trader');
    visit('/app/dashboard');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome back, demo/i })).toBeInTheDocument();
    });
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('renders the admin dashboard for an admin', async () => {
    signIn('admin');
    visit('/admin/dashboard');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Admin dashboard' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('renders the super admin dashboard for a super admin', async () => {
    signIn('super_admin');
    visit('/super-admin/dashboard');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Super Admin' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});

describe('role themes', () => {
  const cases: Role[] = ['trader', 'admin', 'super_admin'];

  it.each(cases)('dresses the shell in the %s identity', async (role) => {
    signIn(role);
    visit(
      role === 'trader'
        ? '/app/dashboard'
        : role === 'admin'
          ? '/admin/dashboard'
          : '/super-admin/dashboard',
    );
    render(<App />);

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-role')).toBe(role);
    });
  });

  it('drops the role tint once the session ends', async () => {
    signIn('admin');
    visit('/admin/dashboard');
    render(<App />);

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-role')).toBe('admin');
    });

    useAuthStore.setState({ status: 'anon', user: null });

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-role')).toBeNull();
    });
  });
});

describe('client-side role boundaries', () => {
  it('refuses a trader the admin area', async () => {
    signIn('trader');
    visit('/admin/dashboard');
    render(<App />);

    // /admin/dashboard is permission-gated rather than role-gated, so the
    // refusal names the missing permission instead of the role.
    await waitFor(() => {
      expect(screen.getByText(/you do not have access to this page/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/analytics:read/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin dashboard' })).not.toBeInTheDocument();
  });

  it('refuses a trader the super admin area', async () => {
    signIn('trader');
    visit('/super-admin/dashboard');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/restricted to a different account role/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Super Admin' })).not.toBeInTheDocument();
  });

  it('refuses an admin the super admin area', async () => {
    signIn('admin');
    visit('/super-admin/dashboard');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/restricted to a different account role/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Super Admin' })).not.toBeInTheDocument();
  });

  it('keeps the super admin at the top of the hierarchy', async () => {
    signIn('super_admin');
    visit('/admin/dashboard');
    render(<App />);

    // Super Admin inherits the admin surface rather than being locked out of it.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Admin dashboard' })).toBeInTheDocument();
    });
  });

  it('sends an anonymous visitor to sign in rather than showing a shell', async () => {
    visit('/super-admin/dashboard');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    });
  });
});

describe('theme preference inside the app', () => {
  it('honours a light preference on a signed-in dashboard', async () => {
    useUiStore.setState({ theme: 'light' });
    signIn('trader');
    visit('/app/dashboard');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome back, demo/i })).toBeInTheDocument();
    });

    // The always-dark rule covers the public pages only; the toggle still
    // governs everything behind the sign-in.
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('keeps the dashboard dark when the preference is dark', async () => {
    useUiStore.setState({ theme: 'dark' });
    signIn('admin');
    visit('/admin/dashboard');
    render(<App />);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });
});

describe('visual hierarchy between roles', () => {
  it('reserves the gold title treatment for Super Admin', async () => {
    signIn('super_admin');
    visit('/super-admin/dashboard');
    render(<App />);

    const heading = await screen.findByRole('heading', { name: 'Super Admin' });
    expect(heading).toHaveClass('text-gold');
  });

  it('does not give Admin the gold treatment', async () => {
    signIn('admin');
    visit('/admin/dashboard');
    render(<App />);

    const heading = await screen.findByRole('heading', { name: 'Admin dashboard' });
    expect(heading).not.toHaveClass('text-gold');
  });

  it('does not give Trader the gold treatment', async () => {
    signIn('trader');
    visit('/app/dashboard');
    render(<App />);

    const heading = await screen.findByRole('heading', { name: /welcome back, demo/i });
    expect(heading).not.toHaveClass('text-gold');
  });
});

describe('view-only User role', () => {
  it('lands on its own dashboard', async () => {
    signIn('user');
    visit('/u/dashboard');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome, demo/i })).toBeInTheDocument();
    });
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('shows exactly the six User portals in the sidebar', async () => {
    signIn('user');
    visit('/u/dashboard');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome, demo/i })).toBeInTheDocument();
    });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    const labels = Array.from(nav.querySelectorAll('a')).map((a) => a.textContent?.trim());

    expect(labels).toEqual([
      'Dashboard',
      'Market',
      'Watchlist',
      'Market news',
      'Education',
      'Profile',
    ]);
  });

  it('offers no trading entry point anywhere in its navigation', async () => {
    signIn('user');
    visit('/u/dashboard');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome, demo/i })).toBeInTheDocument();
    });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    const text = nav.textContent ?? '';
    for (const forbidden of ['Portfolio', 'Orders', 'Holdings', 'Transactions', 'Alerts']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('says plainly that the account cannot trade', async () => {
    signIn('user');
    visit('/u/dashboard');
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText(/view-only account/i).length).toBeGreaterThan(0);
    });
  });

  it.each([
    ['/admin/dashboard', 'admin'],
    ['/super-admin/dashboard', 'super admin'],
  ])('is refused %s', async (path) => {
    signIn('user');
    visit(path);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/you do not have access to this page/i)).toBeInTheDocument();
    });
  });

  it.each(['/app/portfolio', '/app/orders', '/app/holdings'])(
    'is refused the permission-gated trader route %s',
    async (path) => {
      signIn('user');
      visit(path);
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/you do not have access to this page/i)).toBeInTheDocument();
      });
    },
  );

  it.each(['/app/dashboard', '/app/market', '/app/stocks'])(
    'is sent home from the unguarded trader landing route %s',
    async (path) => {
      signIn('user');
      visit(path);
      render(<App />);

      // These carry no permission of their own, so the User is redirected to
      // their own dashboard rather than shown a refusal.
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /welcome, demo/i })).toBeInTheDocument();
      });
      expect(window.location.pathname).toBe('/u/dashboard');
    },
  );

  it('keeps the User out of trader routes while the Trader keeps them', async () => {
    signIn('trader');
    visit('/app/portfolio');
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText(/you do not have access to this page/i)).not.toBeInTheDocument();
    });
  });
});

describe('User market portal', () => {
  async function openMarket() {
    signIn('user');
    visit('/u/market');
    render(<App />);
    // Wait for a real row, not just the heading: the heading paints before the
    // instrument query resolves, so asserting on it races the data.
    await waitFor(
      () => {
        expect(screen.getByRole('link', { name: 'RELIANCE' })).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
  }

  it('shows stocks immediately, without needing a search first', async () => {
    await openMarket();

    // The regression this guards: the page used to open on "No matching
    // stocks" because the list only loaded once a query was typed.
    expect(screen.queryByText('No matching stocks')).not.toBeInTheDocument();
    for (const symbol of ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'AXISBANK']) {
      expect(screen.getByRole('link', { name: symbol })).toBeInTheDocument();
    }
  });

  it('renders price, change and percent change for each row', async () => {
    await openMarket();

    expect(screen.getByText('₹1,225.20')).toBeInTheDocument();
    expect(screen.getByText(/\+0\.49%/)).toBeInTheDocument();
    expect(screen.getByText(/-0\.62%/)).toBeInTheDocument();
  });

  it('offers every market filter', async () => {
    await openMarket();

    for (const label of ['All markets', 'NSE', 'BSE', 'NASDAQ', 'NYSE']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('sorts by a column when its header is clicked', async () => {
    const user = userEvent.setup();
    await openMarket();

    const symbolsInOrder = (): string[] =>
      Array.from(document.querySelectorAll('tbody tr td:first-child')).map(
        (cell) => cell.textContent?.trim() ?? '',
      );

    const initial = symbolsInOrder();
    await user.click(screen.getByRole('button', { name: /^Price/ }));

    await waitFor(() => {
      expect(symbolsInOrder()).not.toEqual(initial);
    });
  });

  it('shows the market status and the view-only notice', async () => {
    await openMarket();

    expect(screen.getAllByText(/NSE\/BSE (open|closed)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/view-only account/i).length).toBeGreaterThan(0);
  });

  it('exposes no trading control anywhere on the page', async () => {
    await openMarket();

    for (const label of [/^buy$/i, /^sell$/i, /place order/i, /place an order/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });
});
