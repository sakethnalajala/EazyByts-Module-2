import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Whole-application mount test.
 *
 * This is the test that would have caught the blank page. It renders the real
 * <App /> - the actual router, providers, guards and landing page - rather than
 * an isolated component, and asserts that something is on screen.
 *
 * The API layer is stubbed so the test exercises RENDERING, not the network.
 */

// `vi.mock` is hoisted above ordinary declarations, so the spies it closes
// over have to be created with `vi.hoisted` or they are not yet initialised.
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
    getAccessToken: vi.fn().mockReturnValue(null),
    setSessionExpiredHandler: vi.fn(),
  };
});

// Socket.IO has no place in a jsdom render test.
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
import { useUiStore } from '@/stores/uiStore';

function stubEndpoints(): void {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('/market/indices')) {
      return Promise.resolve({
        indices: [
          {
            symbol: 'NIFTY50',
            name: 'NIFTY 50',
            market: 'IN',
            value: 2_344_100,
            change: 12_000,
            changePercent: 0.51,
            sourceMeta: {
              source: 'yahoo',
              asOf: new Date().toISOString(),
              isDelayed: true,
              isSimulated: false,
            },
          },
        ],
      });
    }
    if (url.includes('/market/status')) {
      return Promise.resolve({
        markets: [
          {
            market: 'IN',
            isOpen: true,
            reason: 'open',
            session: { open: '09:15', close: '15:30', timezone: 'Asia/Kolkata' },
            nextOpen: null,
            nextClose: null,
          },
          {
            market: 'US',
            isOpen: false,
            reason: 'after-close',
            session: { open: '09:30', close: '16:00', timezone: 'America/New_York' },
            nextOpen: null,
            nextClose: null,
          },
        ],
        serverTime: new Date().toISOString(),
        notice: 'All prices are delayed or simulated.',
      });
    }
    if (url.includes('/auth/demo-accounts')) {
      return Promise.resolve({
        accounts: [
          {
            role: 'trader',
            label: 'Trader',
            email: 'demo.trader@smd.local',
            password: 'Demo@12345',
            description: 'Full trading experience.',
          },
          {
            role: 'admin',
            label: 'Admin',
            email: 'demo.admin@smd.local',
            password: 'Demo@12345',
            description: 'User management and trade monitoring.',
          },
          {
            role: 'super_admin',
            label: 'Super Admin',
            email: 'demo.superadmin@smd.local',
            password: 'Demo@12345',
            description: 'Full platform control.',
          },
        ],
        notice: 'Shared public demo accounts.',
      });
    }
    return Promise.resolve({});
  });

  // No refresh cookie: the app settles into the anonymous state.
  mockPost.mockRejectedValue(new Error('no session'));
}

beforeEach(() => {
  vi.clearAllMocks();
  stubEndpoints();
  useUiStore.setState({ theme: 'dark' });
  window.history.pushState({}, '', '/');
});

describe('application mount', () => {
  it('renders the landing page without crashing', async () => {
    render(<App />);

    // The decisive assertion: real content on screen, not a blank document.
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /learn to trade indian and us markets/i }),
      ).toBeInTheDocument();
    });

    // The error boundary must NOT have caught anything.
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('renders the call-to-action links that previously crashed the tree', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /create a free account/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /try a demo account/i })).toBeInTheDocument();
  });

  it('states plainly that trading is simulated', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/simulated trading/i)).toBeInTheDocument();
    });
  });

  it('shows live market data with its provenance', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('NIFTY 50')).toBeInTheDocument();
    });
    // Delayed, never presented as live.
    expect(screen.getAllByText('Delayed').length).toBeGreaterThan(0);
  });

  it('renders the login page with all demo role cards', async () => {
    window.history.pushState({}, '', '/login');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Trader')).toBeInTheDocument();
    });
  });

  it('offers both account types before any form', async () => {
    window.history.pushState({}, '', '/register');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: /user account/i })).toHaveAttribute(
      'href',
      '/register/user',
    );
    expect(screen.getByRole('link', { name: /trader account/i })).toHaveAttribute(
      'href',
      '/register/trader',
    );

    // Elevated roles are never self-served.
    expect(screen.getByText(/cannot be requested here/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /admin account/i })).not.toBeInTheDocument();
  });

  it('renders the Trader form at /register/trader', async () => {
    window.history.pushState({}, '', '/register/trader');
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /create your trader account/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText('First name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create trader account/i })).toBeInTheDocument();
  });

  it('renders the User form at /register/user', async () => {
    window.history.pushState({}, '', '/register/user');
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /create your user account/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /create user account/i })).toBeInTheDocument();
    expect(screen.getByText(/view-only access/i)).toBeInTheDocument();
  });

  it('lets the visitor switch between account types without going back', async () => {
    window.history.pushState({}, '', '/register/user');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /create trader account/i })).toHaveAttribute(
        'href',
        '/register/trader',
      );
    });
  });

  it('redirects an anonymous visitor away from a protected route', async () => {
    window.history.pushState({}, '', '/app/dashboard');
    render(<App />);

    // The guard sends them to /login rather than rendering an empty shell.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    });
  });

  it('renders the 404 page for an unknown route', async () => {
    window.history.pushState({}, '', '/no-such-page');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('404')).toBeInTheDocument();
    });
  });

  it('renders the forgot-password page', async () => {
    window.history.pushState({}, '', '/forgot-password');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /reset your password/i })).toBeInTheDocument();
    });
  });
});

describe('role selection', () => {
  it('shows all three role entry points on the landing page', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /trader/i }).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByRole('button', { name: /^admin/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /super admin/i }).length).toBeGreaterThan(0);
  });

  it('opens the role sign-in experience rather than logging in silently', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /super admin/i }).length).toBeGreaterThan(0);
    });

    const [superAdminButton] = screen.getAllByRole('button', { name: /super admin/i });
    await user.click(superAdminButton!);

    // Lands on the sign-in console, NOT straight into the dashboard - the
    // server still has to authenticate before anything is granted.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Super Admin' })).toBeInTheDocument();
    });
    expect(window.location.search).toContain('role=super_admin');

    // No session was established by the click alone.
    expect(mockPost).not.toHaveBeenCalledWith('/auth/demo-login', expect.anything());
  });

  it('renders the Admin console skin for ?role=admin', async () => {
    window.history.pushState({}, '', '/login?role=admin');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Admin console' })).toBeInTheDocument();
    });

    expect(screen.getByText(/restricted to platform administrators/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Admin email')).toBeInTheDocument();
    // Administrator accounts are provisioned, not self-served.
    expect(screen.getByText(/cannot be created here/i)).toBeInTheDocument();
  });

  it('offers both fill-credentials and use-demo on a role console', async () => {
    window.history.pushState({}, '', '/login?role=admin');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /fill credentials/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /use demo account/i })).toBeInTheDocument();
    expect(screen.getByText('demo.admin@smd.local')).toBeInTheDocument();
  });

  it('fills the real form from the documented demo credentials', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/login?role=trader');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /fill credentials/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /fill credentials/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toHaveValue('demo.trader@smd.local');
    });
    expect(screen.getByLabelText('Password')).toHaveValue('Demo@12345');
  });

  it('ignores an unknown role and falls back to the plain sign-in', async () => {
    window.history.pushState({}, '', '/login?role=wizard');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    });
  });

  it('applies the role theme attribute for a role console', async () => {
    window.history.pushState({}, '', '/login?role=admin');
    render(<App />);

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-role')).toBe('admin');
    });
  });
});

describe('trader registration', () => {
  it('scores the password against the same rules the schema enforces', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/register/trader');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });

    const password = screen.getByLabelText('Password');

    await user.type(password, 'abc');
    expect(screen.getByText(/weak/i)).toBeInTheDocument();

    await user.clear(password);
    await user.type(password, 'Abcdefg1');
    await waitFor(() => {
      expect(screen.getByText(/strong/i)).toBeInTheDocument();
    });
  });

  it('lets the applicant reveal what they typed', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/register/user');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });

  it('is reachable from the homepage call to action', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /create a free account/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: /create a free account/i })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});

describe('theme toggle on the homepage', () => {
  it('is visible in the header with both options reachable', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /light theme/i }).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByRole('button', { name: /dark theme/i }).length).toBeGreaterThan(0);
  });

  it('switches to light and back without a reload', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    const [lightButton] = screen.getAllByRole('button', { name: /light theme/i });
    await user.click(lightButton!);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
    // The page is still mounted: switching themes must not remount the app.
    expect(
      screen.getByRole('heading', { name: /learn to trade indian and us markets/i }),
    ).toBeInTheDocument();

    const [darkButton] = screen.getAllByRole('button', { name: /dark theme/i });
    await user.click(darkButton!);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('marks the active option for assistive tech', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /light theme/i }).length).toBeGreaterThan(0);
    });

    const [lightButton] = screen.getAllByRole('button', { name: /light theme/i });
    await user.click(lightButton!);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /light theme/i })[0]).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
    expect(screen.getAllByRole('button', { name: /dark theme/i })[0]).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('honours a light preference on every public page', async () => {
    for (const path of ['/', '/login', '/register', '/forgot-password']) {
      useUiStore.setState({ theme: 'light' });
      window.history.pushState({}, '', path);
      const view = render(<App />);

      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(false);
      });

      view.unmount();
    }
  });
});

describe('theme persistence', () => {
  it('writes the choice to localStorage so it survives a refresh', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /light theme/i }).length).toBeGreaterThan(0);
    });

    const [lightButton] = screen.getAllByRole('button', { name: /light theme/i });
    await user.click(lightButton!);

    await waitFor(() => {
      const stored = window.localStorage.getItem('smd.ui');
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored ?? '{}').state.theme).toBe('light');
    });
  });

  it('restores a stored preference on boot', async () => {
    // Exactly what a reload does: hydrate the store, then mount.
    useUiStore.setState({ theme: 'light' });
    render(<App />);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });
});

describe('homepage header', () => {
  it('keeps every header control', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /stock market dashboard/i }).length).toBeGreaterThan(
        0,
      );
    });

    // Role entry points.
    expect(screen.getAllByRole('button', { name: /trader/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^admin/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /super admin/i }).length).toBeGreaterThan(0);

    // Theme toggle.
    expect(screen.getAllByRole('button', { name: /light theme/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /dark theme/i }).length).toBeGreaterThan(0);

    // Session actions.
    expect(screen.getAllByRole('link', { name: /sign in/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /get started/i }).length).toBeGreaterThan(0);
  });

  it('separates the header from the page with a divider', async () => {
    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector('header')).toBeInTheDocument();
    });

    const header = container.querySelector('header');
    // Decorative, so it must be hidden from assistive tech rather than
    // announced as a stray element.
    const divider = header?.querySelector('span[aria-hidden="true"].absolute');

    expect(divider).toBeTruthy();
    expect(divider).toHaveClass('h-px');
  });
});

describe('account type registration', () => {
  it('asks the User to confirm their password, and catches a mismatch', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/register/user');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('First name'), 'Ada');
    await user.type(screen.getByLabelText('Last name'), 'Lovelace');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'Abcdefg1');
    await user.type(screen.getByLabelText('Confirm password'), 'Different1');
    await user.click(screen.getByRole('button', { name: /create user account/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
    // Nothing was sent: the mismatch is caught before the request.
    expect(mockPost).not.toHaveBeenCalledWith('/auth/register', expect.anything());
  });

  it('keeps the Trader form exactly as it was, with no confirm field', async () => {
    window.history.pushState({}, '', '/register/trader');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument();
  });

  it('posts the chosen role so the server can enforce it', async () => {
    const user = userEvent.setup();
    // Scoped by URL: a blanket resolve would also answer /auth/refresh, which
    // signs the visitor in and redirects them off the registration page.
    mockPost.mockImplementation((url: string) =>
      url === '/auth/register'
        ? Promise.resolve({ user: { role: 'user' }, emailDelivered: true, message: 'ok' })
        : Promise.reject(new Error('no session')),
    );

    window.history.pushState({}, '', '/register/user');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('First name'), 'Ada');
    await user.type(screen.getByLabelText('Last name'), 'Lovelace');
    await user.type(screen.getByLabelText('Email'), 'ada2@example.com');
    await user.type(screen.getByLabelText('Password'), 'Abcdefg1');
    await user.type(screen.getByLabelText('Confirm password'), 'Abcdefg1');
    await user.click(screen.getByRole('button', { name: /create user account/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/auth/register',
        expect.objectContaining({ role: 'user', email: 'ada2@example.com' }),
      );
    });
    // The confirmation is a typo guard, not part of the API contract.
    const [, payload] = mockPost.mock.calls.find(([url]) => url === '/auth/register') ?? [];
    expect(payload).not.toHaveProperty('confirmPassword');
  });
});
