import { useEffect } from 'react';
import type { Role } from '@smd/shared';
import { useAuthStore } from '@/stores/authStore';

/**
 * Applies the signed-in user's role as `data-role` on <html>.
 *
 * The CSS in index.css keys its accent tokens off that attribute, so every
 * surface - buttons, glows, ambient orbs, focus rings - picks up the right
 * identity without a single component branching on role.
 *
 * This is presentation ONLY. Authorization is enforced server-side on every
 * request; changing this attribute in devtools recolours the page and grants
 * nothing.
 */
export function useRoleTheme(override?: Role | null): void {
  const user = useAuthStore((state) => state.user);
  const role = override ?? user?.role ?? null;

  useEffect(() => {
    const root = document.documentElement;

    if (role) {
      root.setAttribute('data-role', role);
    } else {
      root.removeAttribute('data-role');
    }
  }, [role]);
}
