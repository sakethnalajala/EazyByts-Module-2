import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LineChart,
  Mail,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import {
  forgotPasswordSchema,
  registerSchema,
  type SelfServiceRole,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from '@smd/shared';
import { api, ApiClientError } from '@/lib/apiClient';
import { useRegister } from '@/lib/queries';
import { Alert, AlertDescription, Button, Input, Label, Spinner } from '@/components/ui';
import { useRoleTheme } from '@/hooks/useRoleTheme';
import { cn } from '@/lib/utils';
import { AuthLayout } from './AuthLayout';

/**
 * Registration, verification and password-reset screens.
 *
 * When SMTP is not configured the server returns the verification or reset link
 * in the response body, and these screens surface it. That keeps local
 * development and a graded demo fully working without a mail provider, and the
 * UI is explicit that it is a development convenience.
 */

// ------------------------------------------------------------- registration

/**
 * Account-type chooser.
 *
 * Registration creates two genuinely different accounts, so the visitor picks
 * before filling anything in. Which one they chose is sent to the server and
 * validated there against SELF_SERVICE_ROLES - admin and super_admin are not
 * in that list and cannot be self-registered.
 */

/** registerSchema without the role, which the route supplies. */
const registerFormSchema = registerSchema.omit({ role: true });

/**
 * One schema for both forms, with the confirmation check applied only where
 * the field is shown. A single shape keeps the resolver type stable; two
 * schemas would give the two branches incompatible form types.
 *
 * `confirmPassword` is client-side only - the API contract is unchanged, and
 * the Trader form keeps exactly the fields and validation it already had.
 */
const registerFormWithConfirm = registerFormSchema.extend({ confirmPassword: z.string() });
type RegisterFormValues = z.infer<typeof registerFormWithConfirm>;

function formSchemaFor(needsConfirm: boolean) {
  return registerFormWithConfirm.superRefine((values, ctx) => {
    if (!needsConfirm) return;
    if (values.confirmPassword.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Please re-enter your password.',
        path: ['confirmPassword'],
      });
    } else if (values.confirmPassword !== values.password) {
      ctx.addIssue({ code: 'custom', message: 'Passwords do not match.', path: ['confirmPassword'] });
    }
  });
}

interface AccountTypeConfig {
  role: SelfServiceRole;
  label: string;
  title: string;
  tagline: string;
  description: string;
  bullets: string[];
  icon: LucideIcon;
  iconBg: string;
  ring: string;
}

const ACCOUNT_TYPES: AccountTypeConfig[] = [
  {
    role: 'user',
    label: 'User Account',
    title: 'Create Your User Account',
    tagline: 'Explore, view only',
    description:
      'View-only access to explore markets, stocks, news, education and your watchlist.',
    bullets: ['Browse every listed stock', 'Market news and education', 'Watchlist', 'No trading'],
    icon: Eye,
    iconBg: 'from-emerald-500 to-teal-400',
    ring: 'hover:border-emerald-400/60 focus-visible:border-emerald-400/60',
  },
  {
    role: 'trader',
    label: 'Trader Account',
    title: 'Create Your Trader Account',
    tagline: 'Full paper trading',
    description:
      'Full paper-trading access including portfolio, holdings, orders, transactions, analytics, watchlist and price alerts.',
    bullets: ['Place market and limit orders', 'Portfolio and P&L', 'Analytics', 'Price alerts'],
    icon: LineChart,
    iconBg: 'from-sky-500 to-cyan-400',
    ring: 'hover:border-sky-400/60 focus-visible:border-sky-400/60',
  },
];

export function RegisterChoicePage() {
  useRoleTheme(null);

  return (
    <AuthLayout
      wide
      title="Create Your Account"
      subtitle="Choose the type of account you want to create."
      footer={
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {ACCOUNT_TYPES.map((type, index) => (
          <Link
            key={type.role}
            to={`/register/${type.role}`}
            className={cn(
              'group panel lift sheen border-sweep animate-fade-up relative overflow-hidden rounded-xl p-5',
              type.ring,
              index === 1 && 'delay-1',
            )}
          >
            <span
              className={cn(
                'mb-3.5 grid size-11 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg',
                'transition-transform duration-300 group-hover:scale-105',
                type.iconBg,
              )}
            >
              <type.icon className="size-5" aria-hidden="true" />
            </span>

            {/* Stacked, not inline: side by side the label wrapped mid-phrase
                ("User / Account") in the two-column layout. */}
            <span className="block font-semibold">{type.label}</span>
            <span className="mt-0.5 block text-[11px] uppercase tracking-wider text-muted-foreground">
              {type.tagline}
            </span>

            <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
              {type.description}
            </span>

            <ul className="mt-3 space-y-1">
              {type.bullets.map((bullet) => (
                <li
                  key={bullet}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <CheckCircle2 className="size-3 shrink-0 text-role" aria-hidden="true" />
                  {bullet}
                </li>
              ))}
            </ul>

            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              Continue
              <ArrowRight
                className="size-4 transition-transform duration-300 group-hover:translate-x-1"
                aria-hidden="true"
              />
            </span>
          </Link>
        ))}
      </div>

      <p className="animate-fade-up delay-2 mt-5 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-role" aria-hidden="true" />
        <span>
          Admin and Super Admin access is granted by the platform and cannot be requested here.
        </span>
      </p>
    </AuthLayout>
  );
}

/**
 * Registration form, shared by both account types.
 *
 * One component rather than two near-identical ones: the role changes the
 * copy, the theme and the value posted to the API, nothing structural.
 */
export function RegisterPage({ role = 'trader' }: { role?: SelfServiceRole }) {
  const config = ACCOUNT_TYPES.find((type) => type.role === role) ?? ACCOUNT_TYPES[1]!;
  const other = ACCOUNT_TYPES.find((type) => type.role !== role)!;

  const register = useRegister();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; url?: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // The page wears the identity of the account being created.
  useRoleTheme(role);

  /*
   * The form collects only the fields the visitor types. `role` comes from the
   * route and is attached at submit, which also keeps the resolver types clean
   * (registerSchema gives `role` a default, so its input and output differ).
   */
  const needsConfirm = role === 'user';

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(formSchemaFor(needsConfirm)),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', confirmPassword: '' },
  });

  const password = useWatch({ control: form.control, name: 'password' }) ?? '';

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      // The role is sent explicitly and re-validated server-side.
      // confirmPassword never leaves the browser; it is a typo guard, not data.
      const { confirmPassword: _confirm, ...payload } = values;
      const result = await register.mutateAsync({ ...payload, role });
      setDone({
        email: values.email,
        ...(result.verificationUrl ? { url: result.verificationUrl } : {}),
      });
    } catch (submitError) {
      setError(
        submitError instanceof ApiClientError
          ? submitError.message
          : 'Registration failed. Please try again.',
      );
    }
  });

  if (done) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={`We sent a verification link to ${done.email}.`}
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-profit-muted">
            <Mail className="size-6 text-profit" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground">
            Your {config.label.toLowerCase()} has been created. Verify your email to activate it,
            then sign in.
          </p>

          {done.url ? (
            <Alert variant="warning" className="text-left">
              <AlertDescription>
                <p className="mb-2 font-medium">Email delivery is not configured on this server.</p>
                <p className="mb-2 text-xs">
                  Use this verification link directly (shown only because SMTP is unset):
                </p>
                <Link
                  to={done.url.replace(window.location.origin, '')}
                  className="break-all text-xs font-medium underline"
                >
                  {done.url}
                </Link>
              </AlertDescription>
            </Alert>
          ) : null}

          <Button asChild className="w-full">
            <Link to="/login">Go to sign in</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      wide
      title={config.title}
      subtitle={config.description}
      icon={
        <span
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br shadow-lg',
            config.iconBg,
          )}
        >
          <config.icon className="size-5 text-white" aria-hidden="true" />
        </span>
      }
      footer={
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
          {/* Never a dead end: the other account type is always one click away. */}
          <p className="text-sm text-muted-foreground">
            Want a {other.label.replace(' Account', '')} account instead?{' '}
            <Link
              to={`/register/${other.role}`}
              className="font-medium text-primary hover:underline"
            >
              Create {other.label}
            </Link>
          </p>
        </div>
      }
    >
      <ul className="animate-fade-up mb-5 flex flex-wrap gap-1.5">
        {config.bullets.map((bullet) => (
          <li
            key={bullet}
            className="glass flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground"
          >
            <CheckCircle2 className="size-3.5 text-role" aria-hidden="true" />
            {bullet}
          </li>
        ))}
      </ul>

      {error ? (
        <Alert variant="destructive" className="mb-4 flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <form
        onSubmit={(event) => void onSubmit(event)}
        className="animate-fade-up delay-1 space-y-4"
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="firstName"
            label="First name"
            autoComplete="given-name"
            error={form.formState.errors.firstName?.message}
            {...form.register('firstName')}
          />
          <Field
            id="lastName"
            label="Last name"
            autoComplete="family-name"
            error={form.formState.errors.lastName?.message}
            {...form.register('lastName')}
          />
        </div>

        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />

        <div className="space-y-1.5">
          <div className="relative">
            <Field
              id="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              error={form.formState.errors.password?.message}
              {...form.register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-2 top-[1.85rem] rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
          <PasswordStrength value={password} />
        </div>

        {needsConfirm ? (
          <Field
            id="confirmPassword"
            label="Confirm password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            error={form.formState.errors.confirmPassword?.message}
            {...form.register('confirmPassword')}
          />
        ) : null}

        <Button type="submit" className="w-full" loading={register.isPending}>
          Create {config.label}
        </Button>
      </form>

      <p className="animate-fade-up delay-2 mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-role" aria-hidden="true" />
        <span>
          Admin and Super Admin access is granted by the platform and cannot be requested here.
        </span>
      </p>
    </AuthLayout>
  );
}

export function RegisterUserPage() {
  return <RegisterPage role="user" />;
}

export function RegisterTraderPage() {
  return <RegisterPage role="trader" />;
}

/**
 * Password strength meter.
 *
 * Scores against the SAME rules the shared `passwordSchema` enforces, so the
 * bar and the validation message can never disagree. It is feedback, not a
 * gate - the schema remains the only thing that decides acceptance.
 */
function PasswordStrength({ value }: { value: string }) {
  const checks = [
    { label: '8+ characters', passed: value.length >= 8 },
    { label: 'Lowercase', passed: /[a-z]/.test(value) },
    { label: 'Uppercase', passed: /[A-Z]/.test(value) },
    { label: 'Number', passed: /[0-9]/.test(value) },
  ];

  const score = checks.filter((check) => check.passed).length;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const tones = ['bg-border', 'bg-loss', 'bg-stale', 'bg-role-2', 'bg-profit'];

  if (!value) {
    return (
      <p className="text-xs text-muted-foreground">
        At least 8 characters, with an uppercase letter, a lowercase letter and a number.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-300',
                index < score ? tones[score] : 'bg-border',
              )}
            />
          ))}
        </div>
        <span className="w-12 text-right text-xs font-medium text-muted-foreground">
          {labels[score]}
        </span>
      </div>

      {/* The meter is decorative; this list is what a screen reader gets. */}
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
        {checks.map((check) => (
          <li
            key={check.label}
            className={cn(
              'text-[11px] transition-colors',
              check.passed ? 'text-profit' : 'text-muted-foreground',
            )}
          >
            {check.passed ? '✓' : '○'} {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ verification

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');

  // A missing token is knowable at first render, so it becomes the INITIAL
  // state rather than something an effect corrects a moment later.
  const [state, setState] = useState<'verifying' | 'success' | 'error'>(
    token ? 'verifying' : 'error',
  );
  const [message, setMessage] = useState(
    token ? '' : 'This verification link is missing its token.',
  );

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    void (async () => {
      try {
        await api.post('/auth/verify-email', { token });
        if (cancelled) return;
        setState('success');
        setMessage('Your email address has been verified. You can now sign in.');
      } catch (error) {
        if (cancelled) return;
        setState('error');
        setMessage(
          error instanceof ApiClientError
            ? error.message
            : 'This verification link is invalid or has expired.',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthLayout title="Email verification">
      <div className="space-y-4 text-center">
        {state === 'verifying' ? (
          <>
            <Spinner className="mx-auto size-8 text-primary" />
            <p className="text-sm text-muted-foreground">Verifying your email address...</p>
          </>
        ) : state === 'success' ? (
          <>
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-profit-muted">
              <CheckCircle2 className="size-6 text-profit" aria-hidden="true" />
            </div>
            <p className="text-sm">{message}</p>
            <Button asChild className="w-full">
              <Link to="/login">Sign in</Link>
            </Button>
          </>
        ) : (
          <>
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
            </div>
            <p className="text-sm">{message}</p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/resend-verification">Request a new link</Link>
            </Button>
          </>
        )}
      </div>
    </AuthLayout>
  );
}

export function ResendVerificationPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    try {
      const result = await api.post<{ sent: boolean; url?: string }>('/auth/resend-verification', {
        email,
      });
      setSent(true);
      setUrl(result.url ?? null);
    } catch {
      // The endpoint never reveals whether an account exists, so a failure here
      // is still reported as sent.
      setSent(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title="Resend verification"
      subtitle="We'll send a fresh link if that address still needs verifying."
    >
      {sent ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-profit-muted">
            <Mail className="size-6 text-profit" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground">
            If that address needs verification, a new link is on its way.
          </p>
          {url ? (
            <Alert variant="warning" className="text-left">
              <AlertDescription>
                <p className="mb-2 text-xs">SMTP is not configured; use this link directly:</p>
                <Link
                  to={url.replace(window.location.origin, '')}
                  className="break-all text-xs underline"
                >
                  {url}
                </Link>
              </AlertDescription>
            </Alert>
          ) : null}
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="resend-email">Email</Label>
            <Input
              id="resend-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button type="submit" className="w-full" loading={pending}>
            Send verification link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

// ---------------------------------------------------------- password reset

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setPending(true);
    try {
      const result = await api.post<{ url?: string }>('/auth/forgot-password', values);
      setUrl(result.url ?? null);
    } catch {
      // Deliberately indistinguishable from success: this endpoint must not
      // reveal which addresses have accounts.
    } finally {
      setSent(true);
      setPending(false);
    }
  });

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <Link to="/login" className="text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-profit-muted">
            <Mail className="size-6 text-profit" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground">
            If an account exists for that address, a reset link has been sent. The link expires in
            one hour.
          </p>
          {url ? (
            <Alert variant="warning" className="text-left">
              <AlertDescription>
                <p className="mb-2 text-xs">SMTP is not configured; use this link directly:</p>
                <Link
                  to={url.replace(window.location.origin, '')}
                  className="break-all text-xs underline"
                >
                  {url}
                </Link>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={form.formState.errors.email?.message}
            {...form.register('email')}
          />
          <Button type="submit" className="w-full" loading={pending}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setPending(true);
    try {
      await api.post('/auth/reset-password', values);
      toast.success('Password updated. Sign in with your new password.');
      void navigate('/login', { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof ApiClientError
          ? submitError.message
          : 'This reset link is invalid or has expired.',
      );
    } finally {
      setPending(false);
    }
  });

  if (!token) {
    return (
      <AuthLayout title="Reset your password">
        <Alert variant="destructive">
          <AlertDescription>
            This reset link is missing its token. Request a new one from the forgot-password page.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4 w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="This will sign you out of all devices.">
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
        <Field
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          error={form.formState.errors.password?.message}
          hint="At least 8 characters, with an uppercase letter, a lowercase letter and a number."
          {...form.register('password')}
        />
        <Button type="submit" className="w-full" loading={pending}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}

// ------------------------------------------------------------------- shared

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string;
}

const Field = ({ id, label, error, hint, ...props }: FieldProps) => (
  <div className="space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} aria-invalid={Boolean(error)} {...props} />
    {error ? (
      <p className="text-xs text-destructive">{error}</p>
    ) : hint ? (
      <p className="text-xs text-muted-foreground">{hint}</p>
    ) : null}
  </div>
);
