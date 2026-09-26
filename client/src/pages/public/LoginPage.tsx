import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  Crown,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  LineChart as TraderIcon,
  type LucideIcon,
} from 'lucide-react';
import {
  ERROR_CODES,
  ROLE_HOME_PATH,
  ROLES,
  loginSchema,
  type LoginInput,
  type Role,
} from '@smd/shared';
import { useAuthStore } from '@/stores/authStore';
import { useDemoAccounts, useDemoLogin, useLogin } from '@/lib/queries';
import { ApiClientError } from '@/lib/apiClient';
import { useRoleTheme } from '@/hooks/useRoleTheme';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, Badge, Button, Input, Label, Spinner } from '@/components/ui';
import { AuthLayout } from './AuthLayout';

/**
 * Sign-in screen.
 *
 * A `?role=` query parameter switches the card into a role-specific console
 * (Trader / Admin / Super Admin) with its own colour identity, matching the
 * role buttons on the landing page. That is presentation only: the form posts
 * to the same endpoint, and the SERVER decides what the account actually is.
 */

interface RoleSkin {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconClass: string;
  emailLabel: string;
  submitLabel: string;
  note: string;
}

const ROLE_SKINS: Record<Role, RoleSkin> = {
  user: {
    title: 'User Demo',
    subtitle: 'View-only account — explore the markets without trading.',
    icon: Eye,
    iconClass: 'from-emerald-500 to-teal-400',
    emailLabel: 'Email',
    submitLabel: 'Sign in to explore',
    note: 'A view-only account: browse stocks, follow a watchlist, read news and work through the education library. Placing orders requires a Trader account.',
  },
  trader: {
    title: 'Trader sign in',
    subtitle: 'Access your simulated portfolio and place paper trades.',
    icon: TraderIcon,
    iconClass: 'from-sky-500 to-cyan-400',
    emailLabel: 'Email',
    submitLabel: 'Sign in to trade',
    note: 'Trading accounts are free to create and start with virtual capital.',
  },
  admin: {
    title: 'Admin console',
    subtitle: 'Restricted to platform administrators.',
    icon: ShieldCheck,
    iconClass: 'from-violet-500 to-purple-400',
    emailLabel: 'Admin email',
    submitLabel: 'Sign in to console',
    note: 'Administrator accounts cannot be created here. Access is provisioned by the platform owner only.',
  },
  super_admin: {
    title: 'Super Admin',
    subtitle: 'Highest-level platform control.',
    icon: Crown,
    iconClass: 'from-indigo-500 via-violet-500 to-amber-400',
    emailLabel: 'Super Admin email',
    submitLabel: 'Sign in to control panel',
    note: 'Super Admin access governs permissions, configuration and audit logs for the whole platform.',
  },
};

function isRole(value: string | null): value is Role {
  return value !== null && (ROLES as readonly string[]).includes(value);
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const setSession = useAuthStore((state) => state.setSession);

  const roleParam = params.get('role');
  const activeRole: Role | null = isRole(roleParam) ? roleParam : null;

  // Recolours the whole page - background orbs included - to match the role.
  useRoleTheme(activeRole);

  const login = useLogin();
  const demoLogin = useDemoLogin();
  const { data: demo } = useDemoAccounts();

  const [formError, setFormError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showDemoPassword, setShowDemoPassword] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const skin = activeRole ? ROLE_SKINS[activeRole] : null;
  const demoAccount = activeRole
    ? demo?.accounts?.find((account) => account.role === activeRole)
    : undefined;

  const redirectAfterLogin = (role: Role): void => {
    const intended = (location.state as { from?: string } | null)?.from;
    void navigate(intended ?? ROLE_HOME_PATH[role], { replace: true });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    setNeedsVerification(false);

    try {
      const session = await login.mutateAsync(values);
      setSession(session);
      toast.success(`Welcome back, ${session.user.firstName}`);
      redirectAfterLogin(session.user.role);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError(error.message);
        setNeedsVerification(error.code === ERROR_CODES.EMAIL_NOT_VERIFIED);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    }
  });

  const onDemoLogin = async (role: Role): Promise<void> => {
    setFormError(null);
    try {
      const session = await demoLogin.mutateAsync(role);
      setSession(session);
      toast.success(`Signed in as ${session.user.fullName}`);
      redirectAfterLogin(session.user.role);
    } catch (error) {
      setFormError(
        error instanceof ApiClientError ? error.message : 'Demo sign-in failed. Please try again.',
      );
    }
  };

  /** Populates the real form with the documented demo credentials. */
  const fillCredentials = (email: string, password: string): void => {
    form.setValue('email', email, { shouldValidate: true });
    form.setValue('password', password, { shouldValidate: true });
    setShowPassword(true);
    toast.info('Demo credentials filled. Press sign in to continue.');
  };

  return (
    <AuthLayout
      title={skin?.title ?? 'Sign in'}
      subtitle={skin?.subtitle ?? 'Continue to your simulated trading dashboard.'}
      wide
      icon={
        skin ? (
          <span
            className={cn(
              'grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg',
              skin.iconClass,
            )}
          >
            <skin.icon className="size-6" aria-hidden="true" />
          </span>
        ) : undefined
      }
      footer={
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </p>
      }
    >
      {formError ? (
        <Alert variant="destructive" className="animate-fade-in mb-5 flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <AlertDescription>
            {formError}
            {needsVerification ? (
              <>
                {' '}
                <Link to="/resend-verification" className="font-medium underline">
                  Resend verification email
                </Link>
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* ------------------------------------------------- credential form */}
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">{skin?.emailLabel ?? 'Email'}</Label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="h-11 pl-9"
              aria-invalid={Boolean(form.formState.errors.email)}
              {...form.register('email')}
            />
          </div>
          {form.formState.errors.email ? (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="h-11 pl-9 pr-10"
              aria-invalid={Boolean(form.formState.errors.password)}
              {...form.register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {form.formState.errors.password ? (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          ) : null}
        </div>

        <Button
          type="submit"
          className="h-11 w-full shadow-lg"
          loading={login.isPending}
          style={{ boxShadow: '0 12px 32px -14px var(--role-glow)' }}
        >
          {!login.isPending ? <LogIn className="size-4" /> : null}
          {skin?.submitLabel ?? 'Sign in'}
        </Button>
      </form>

      {/* ------------------------------------------------------ demo access */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/70" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-transparent px-3 text-xs uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
            or
          </span>
        </div>
      </div>

      {activeRole && demoAccount ? (
        /* Role-specific demo panel, mirroring the reference design. */
        <div className="glass border-sweep animate-fade-up rounded-xl p-4">
          <div className="mb-3 flex items-start gap-3">
            <span
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow',
                ROLE_SKINS[activeRole].iconClass,
              )}
            >
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{demoAccount.label} demo</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Try the platform instantly &mdash; no signup needed. For evaluation only.
              </p>
            </div>
          </div>

          <dl className="mb-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-3">
              <dt className="w-20 shrink-0 text-muted-foreground">Email</dt>
              <dd className="tabular truncate">{demoAccount.email}</dd>
            </div>
            <div className="flex items-center gap-3">
              <dt className="w-20 shrink-0 text-muted-foreground">Password</dt>
              <dd className="tabular flex min-w-0 items-center gap-2">
                <span className="truncate">
                  {showDemoPassword ? demoAccount.password : '•'.repeat(demoAccount.password.length)}
                </span>
                <button
                  type="button"
                  onClick={() => setShowDemoPassword(!showDemoPassword)}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showDemoPassword ? 'Hide demo password' : 'Show demo password'}
                >
                  {showDemoPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => fillCredentials(demoAccount.email, demoAccount.password)}
            >
              <KeyRound className="size-4" />
              Fill credentials
            </Button>
            <Button
              type="button"
              className="flex-1"
              loading={demoLogin.isPending}
              onClick={() => void onDemoLogin(activeRole)}
            >
              {!demoLogin.isPending ? <ArrowRight className="size-4" /> : null}
              Use demo account
            </Button>
          </div>
        </div>
      ) : (
        /* No role chosen: offer all three. */
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Try it instantly</h2>
            <Badge variant="stale">No password needed</Badge>
          </div>

          <div className="grid gap-2">
            {(demo?.accounts ?? []).map((account) => {
              const config = ROLE_SKINS[account.role];
              return (
                <button
                  key={account.role}
                  type="button"
                  onClick={() => void onDemoLogin(account.role)}
                  disabled={demoLogin.isPending}
                  className="group border-sweep glass flex items-start gap-3 rounded-xl p-3 text-left transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60"
                >
                  <span
                    className={cn(
                      'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow transition-transform duration-300 group-hover:scale-105',
                      config.iconClass,
                    )}
                  >
                    {demoLogin.isPending ? (
                      <Spinner className="size-4" />
                    ) : (
                      <config.icon className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{account.label}</span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">
                      {account.description}
                    </span>
                  </span>
                  <ArrowRight
                    className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>

          {demo?.accounts?.length ? (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Credentials are documented: {demo.accounts[0]?.email} /{' '}
              {demo.accounts[0]?.password}
            </p>
          ) : null}
        </div>
      )}

      {skin ? (
        <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
          {skin.note}
        </p>
      ) : null}
    </AuthLayout>
  );
}
