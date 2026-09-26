import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ROLE_HOME_PATH, type Permission, type Role } from '@smd/shared';
import { useAuthStore } from '@/stores/authStore';
import { Spinner } from '@/components/ui';
import { UnauthorizedState } from '@/components/common';

/**
 * Route guards.
 *
 * These are a USER EXPERIENCE measure, not a security boundary. They stop the
 * app rendering a page the user cannot use. Every protected endpoint re-checks
 * permissions server-side, so bypassing a guard in devtools reveals an empty
 * shell and a string of 403s, not data.
 */

function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background" aria-busy="true">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="size-6 text-primary" />
        <p className="text-sm text-muted-foreground">Restoring your session...</p>
      </div>
    </div>
  );
}

/** Requires a signed-in user; remembers where they were heading. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuthStore();
  const location = useLocation();

  // 'loading' is distinct from 'anon': without this, a page refresh would
  // bounce a signed-in user to /login before the boot refresh resolves.
  if (status === 'loading') return <FullPageSpinner />;

  if (status === 'anon') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}

/**
 * Sends a role to its own home instead of showing it a refusal.
 *
 * Used for the trader area, whose landing pages carry no specific permission
 * and so would otherwise render for the view-only User role. A redirect reads
 * better than "access denied" here, because the User is not being refused
 * something they asked for - they simply have a different home.
 */
export function RedirectRoles({
  roles,
  children,
}: {
  roles: Role[];
  children: ReactNode;
}) {
  const { status, user } = useAuthStore();

  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anon') return <Navigate to="/login" replace />;

  if (user && roles.includes(user.role)) {
    return <Navigate to={ROLE_HOME_PATH[user.role]} replace />;
  }

  return <>{children}</>;
}

/** Requires one or more permissions. */
export function RequirePermission({
  permissions,
  children,
}: {
  permissions: Permission[];
  children: ReactNode;
}) {
  const { status, user } = useAuthStore();

  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anon') return <Navigate to="/login" replace />;

  const granted = user?.permissions ?? [];
  const missing = permissions.filter((permission) => !granted.includes(permission));

  if (missing.length > 0) {
    return (
      <UnauthorizedState
        message={`This page requires the ${missing.join(', ')} permission, which your role does not include.`}
      />
    );
  }

  return <>{children}</>;
}

/** Requires a specific role. Used for the Super Admin area. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { status, user } = useAuthStore();

  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anon') return <Navigate to="/login" replace />;

  if (!user || !roles.includes(user.role)) {
    return <UnauthorizedState message="This area is restricted to a different account role." />;
  }

  return <>{children}</>;
}

/** Bounces an already-signed-in user away from login/register. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status, user } = useAuthStore();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner />;

  if (status === 'authed' && user) {
    const intended = (location.state as { from?: string } | null)?.from;
    return <Navigate to={intended ?? ROLE_HOME_PATH[user.role]} replace />;
  }

  return <>{children}</>;
}
