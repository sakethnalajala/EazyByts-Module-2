import { useNavigate } from 'react-router-dom';
import { ArrowRight, Crown, Eye, LineChart, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { Role } from '@smd/shared';
import { cn } from '@/lib/utils';

/**
 * Role entry points.
 *
 * These are navigation shortcuts into the EXISTING sign-in flow, not a bypass
 * of it. Each one opens `/login?role=<role>`, which renders that role's
 * console with the ordinary credential form plus its demo account. No token is
 * issued here and no authorization decision is made here: the server
 * authenticates the sign-in and authorises every subsequent request, so
 * choosing "Super Admin" and then signing in as a trader yields a trader's
 * permissions.
 */

interface RoleConfig {
  role: Role;
  label: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  /** Per-role gradient, independent of the global role theme. */
  gradient: string;
  ring: string;
  iconBg: string;
}

export const ROLE_CONFIGS: RoleConfig[] = [
  {
    role: 'user',
    label: 'User',
    tagline: 'Explore, view only',
    description:
      'Browse stocks, follow a watchlist, read market news and work through the education library. No trading.',
    icon: Eye,
    gradient: 'from-emerald-500/22 via-teal-400/12 to-transparent',
    ring: 'hover:border-emerald-400/60 focus-visible:border-emerald-400/60',
    iconBg: 'from-emerald-500 to-teal-400',
  },
  {
    role: 'trader',
    label: 'Trader',
    tagline: 'Trade & invest',
    description:
      'Place orders across NSE, BSE, NASDAQ and NYSE, manage a portfolio and track P&L.',
    icon: LineChart,
    gradient: 'from-sky-500/22 via-cyan-400/12 to-transparent',
    ring: 'hover:border-sky-400/60 focus-visible:border-sky-400/60',
    iconBg: 'from-sky-500 to-cyan-400',
  },
  {
    role: 'admin',
    label: 'Admin',
    tagline: 'Manage the platform',
    description:
      'Oversee users, monitor trading activity, manage instruments and publish learning content.',
    icon: ShieldCheck,
    gradient: 'from-violet-500/22 via-purple-400/12 to-transparent',
    ring: 'hover:border-violet-400/60 focus-visible:border-violet-400/60',
    iconBg: 'from-violet-500 to-purple-400',
  },
  {
    role: 'super_admin',
    label: 'Super Admin',
    tagline: 'Full control',
    description:
      'Platform health, admin accounts, role permissions, runtime configuration and audit logs.',
    icon: Crown,
    gradient: 'from-indigo-500/22 via-violet-500/14 to-amber-300/10',
    ring: 'hover:border-amber-300/50 focus-visible:border-amber-300/50',
    iconBg: 'from-indigo-500 via-violet-500 to-amber-400',
  },
];

export function useRoleEntry() {
  const navigate = useNavigate();

  /**
   * Opens the sign-in experience for a role rather than logging in silently.
   *
   * The destination is the ordinary login page with `?role=`, which renders
   * that role's console and offers both real credentials and the demo account.
   * Nothing here grants access: the server still authenticates and authorises
   * every request, so picking "Super Admin" and signing in as a trader gets
   * you a trader's permissions.
   */
  const enterAs = (role: Role): void => {
    void navigate(`/login?role=${role}`);
  };

  return { enterAs };
}

/** Compact role buttons for the header. */
export function RoleSwitcherCompact({ className }: { className?: string }) {
  const { enterAs } = useRoleEntry();

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {ROLE_CONFIGS.map((config) => (
        <button
          key={config.role}
          type="button"
          onClick={() => enterAs(config.role)}
          title={`${config.label} — ${config.description}`}
          className={cn(
            'group relative inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5',
            'text-xs font-medium transition-all duration-300',
            'hover:-translate-y-0.5 hover:shadow-lg',
            config.ring,
          )}
        >
          <span
            className={cn(
              'absolute inset-0 rounded-full bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100',
              config.gradient,
            )}
            aria-hidden="true"
          />
          <config.icon
            className="relative size-3.5 transition-transform duration-300 group-hover:scale-110"
            aria-hidden="true"
          />
          <span className="relative">{config.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Full role cards for the hero / a dedicated section. */
export function RoleSelector({ className }: { className?: string }) {
  const { enterAs } = useRoleEntry();

  return (
    <div className={cn('grid gap-3', className)}>
      {ROLE_CONFIGS.map((config, index) => (
        <button
          key={config.role}
          type="button"
          onClick={() => enterAs(config.role)}
          className={cn(
            'group border-sweep lift sheen animate-fade-up panel relative w-full overflow-hidden rounded-xl p-4 text-left',
            // Super Admin carries the gold hairline, marking the top tier.
            config.role === 'super_admin' && 'edge-gold',
            'transition-colors duration-300',
            config.ring,
            `delay-${String(index + 1)}`,
          )}
        >
          <span
            className={cn(
              'absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-100',
              config.gradient,
            )}
            aria-hidden="true"
          />

          <span className="relative flex items-center gap-3.5">
            <span
              className={cn(
                'grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg',
                'transition-transform duration-300 group-hover:scale-105',
                config.iconBg,
              )}
            >
              <config.icon className="size-5" aria-hidden="true" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="font-semibold">{config.label}</span>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {config.tagline}
                </span>
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {config.description}
              </span>
            </span>

            <ArrowRight
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-foreground"
              aria-hidden="true"
            />
          </span>
        </button>
      ))}
    </div>
  );
}
