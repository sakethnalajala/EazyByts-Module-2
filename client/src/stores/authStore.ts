import { create } from 'zustand';
import type { AuthSession, Permission, PublicUser, Role } from '@smd/shared';
import { api, setAccessToken } from '@/lib/apiClient';

/**
 * Session state.
 *
 * `status` distinguishes three genuinely different situations that a plain
 * `user | null` would conflate:
 *   - 'loading'  : the boot refresh has not finished; render nothing yet
 *   - 'authed'   : signed in
 *   - 'anon'     : definitively signed out
 *
 * Without that distinction, a guard would bounce a signed-in user to /login on
 * every page refresh, in the moment before the refresh call resolves.
 */

export type AuthStatus = 'loading' | 'authed' | 'anon';

interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  setSession: (session: AuthSession) => void;
  clearSession: () => void;
  setUser: (user: PublicUser) => void;
  /** Restores the session from the httpOnly refresh cookie on app boot. */
  bootstrap: () => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  hasRole: (...roles: Role[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,

  setSession: (session) => {
    setAccessToken(session.accessToken);
    set({ status: 'authed', user: session.user });
  },

  clearSession: () => {
    setAccessToken(null);
    set({ status: 'anon', user: null });
  },

  setUser: (user) => set({ user }),

  bootstrap: async () => {
    try {
      const session = await api.post<AuthSession>('/auth/refresh');
      setAccessToken(session.accessToken);
      set({ status: 'authed', user: session.user });
    } catch {
      // No cookie, or it was rejected. A normal anonymous visit - not an error
      // worth surfacing to the user.
      setAccessToken(null);
      set({ status: 'anon', user: null });
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Even if the server call fails, drop local state: the user asked to
      // leave and must not be left looking signed in.
    }
    setAccessToken(null);
    set({ status: 'anon', user: null });
  },

  hasPermission: (permission) => get().user?.permissions.includes(permission) ?? false,

  hasRole: (...roles) => {
    const role = get().user?.role;
    return role !== undefined && roles.includes(role);
  },
}));
