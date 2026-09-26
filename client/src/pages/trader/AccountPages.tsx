import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { ArrowLeft, BookOpen, Clock, GraduationCap, RotateCcw } from 'lucide-react';
import { EDUCATION_CATEGORY_LABELS, ROLE_LABELS, type EducationLevel } from '@smd/shared';
import { ApiClientError } from '@/lib/apiClient';
import { useAuthStore } from '@/stores/authStore';
import { DASHBOARD_WIDGETS, useUiStore, type Theme } from '@/stores/uiStore';
import {
  useChangePassword,
  useEducation,
  useEducationArticle,
  useUpdatePreferences,
  useUpdateProfile,
} from '@/lib/queries';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
} from '@/components/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui/overlays';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from '@/components/common';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------- education

export function EducationPage() {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<string>('all');
  const [level, setLevel] = useState<string>('all');

  const { data, isLoading, isError, refetch } = useEducation({
    page,
    limit: 12,
    ...(category !== 'all' ? { category } : {}),
    ...(level !== 'all' ? { level } : {}),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Learning library"
        description="Written guides on order types, valuation, risk and the behaviour that costs people money."
        actions={
          <>
            <Select
              value={category}
              onValueChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All topics</SelectItem>
                {Object.entries(EDUCATION_CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={level}
              onValueChange={(value) => {
                setLevel(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Could not load articles." onRetry={() => void refetch()} />
      ) : !data?.data?.length ? (
        <EmptyState
          icon={GraduationCap}
          title="No articles"
          description="Nothing matches those filters yet."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.data.map((article) => (
              <Link key={article.id} to={`/app/education/${article.slug}`}>
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardContent className="p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {EDUCATION_CATEGORY_LABELS[article.category]}
                      </Badge>
                      <LevelBadge level={article.level} />
                      {article.status === 'draft' ? <Badge variant="stale">Draft</Badge> : null}
                    </div>
                    <h3 className="mb-1.5 font-medium leading-snug">{article.title}</h3>
                    <p className="line-clamp-3 text-sm text-muted-foreground">{article.summary}</p>
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {article.readMinutes} min read
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          <Pagination page={page} totalPages={data.meta.totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

function LevelBadge({ level }: { level: EducationLevel }) {
  const variant = level === 'beginner' ? 'profit' : level === 'advanced' ? 'loss' : 'default';
  return <Badge variant={variant}>{level}</Badge>;
}

export function EducationArticlePage() {
  const { slug = '' } = useParams();
  const { data, isLoading, isError, error, refetch } = useEducationArticle(slug);

  if (isLoading) return <LoadingState rows={8} />;

  if (isError || !data) {
    return (
      <ErrorState
        title="Article not found"
        message={error instanceof ApiClientError ? error.message : 'This article does not exist.'}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/app/education">
          <ArrowLeft className="size-4" />
          Back to library
        </Link>
      </Button>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{EDUCATION_CATEGORY_LABELS[data.category]}</Badge>
          <LevelBadge level={data.level} />
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" aria-hidden="true" />
            {data.readMinutes} min read
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{data.title}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{data.summary}</p>
      </div>

      <Separator />

      {/*
       * Markdown is rendered with GFM for tables. Content is authored by
       * platform admins through the CMS, not by end users, so the surface for
       * injected markup is limited to trusted authors.
       */}
      <article
        className={cn(
          'prose-smd max-w-none text-[15px] leading-relaxed',
          '[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold',
          '[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold',
          '[&_p]:mb-4 [&_p]:text-foreground/90',
          '[&_ul]:mb-4 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:mb-4 [&_ol]:ml-5 [&_ol]:list-decimal',
          '[&_li]:mb-1.5',
          '[&_strong]:font-semibold [&_strong]:text-foreground',
          '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm',
          '[&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4',
          '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
          '[&_blockquote]:mb-4 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
          '[&_table]:mb-4 [&_table]:w-full [&_table]:text-sm',
          '[&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium',
          '[&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2',
          '[&_a]:text-primary [&_a]:underline',
          '[&_hr]:my-6 [&_hr]:border-border',
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content ?? ''}</ReactMarkdown>
      </article>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Educational content only. Nothing here is investment, tax or legal advice.
      </p>
    </div>
  );
}

// --------------------------------------------------------------- profile

export function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const saveProfile = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    try {
      const result = await updateProfile.mutateAsync({ firstName, lastName });
      setUser(result.user);
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not update profile.');
    }
  };

  const savePassword = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      toast.success('Password changed. You have been signed out of other devices.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not change password.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Profile" description="Your account details." />

      {user?.isDemo ? (
        <Alert variant="warning">
          <AlertDescription>
            This is a shared public demo account. Profile and password changes are disabled so the
            demo keeps working for everyone. Register a free account to edit these.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" value={user?.email ?? ''} />
            <Field label="Role" value={user ? ROLE_LABELS[user.role] : ''} />
            <Field label="Status" value={user?.status ?? ''} />
            <Field label="Email verified" value={user?.emailVerified ? 'Yes' : 'No'} />
            <Field
              label="Member since"
              value={user ? new Date(user.createdAt).toLocaleDateString() : ''}
            />
            <Field
              label="Last sign-in"
              value={
                user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'First visit'
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Name</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void saveProfile(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  disabled={user?.isDemo}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  disabled={user?.isDemo}
                />
              </div>
            </div>
            <Button type="submit" disabled={user?.isDemo} loading={updateProfile.isPending}>
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void savePassword(event)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                disabled={user?.isDemo}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={user?.isDemo}
              />
              <p className="text-xs text-muted-foreground">
                At least 8 characters, with an uppercase letter, a lowercase letter and a number.
              </p>
            </div>
            <Button
              type="submit"
              disabled={user?.isDemo || !currentPassword || !newPassword}
              loading={changePassword.isPending}
            >
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium capitalize">{value}</p>
    </div>
  );
}

// -------------------------------------------------------------- settings

export function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const {
    theme,
    setTheme,
    widgets,
    toggleWidget,
    moveWidget,
    resetWidgets,
    activeMarket,
    setActiveMarket,
  } = useUiStore();
  const updatePreferences = useUpdatePreferences();

  const sorted = [...widgets].sort((a, b) => a.order - b.order);

  /** Persists widget layout and theme to the account, not just this browser. */
  const persist = async (): Promise<void> => {
    try {
      const result = await updatePreferences.mutateAsync({
        theme,
        defaultMarket: activeMarket,
        widgets: sorted.map((widget, index) => ({
          id: widget.id,
          visible: widget.visible,
          order: index,
        })),
      });
      setUser(result.user);
      toast.success('Preferences saved to your account');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save preferences.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Settings"
        description="Appearance and dashboard layout."
        actions={
          <Button onClick={() => void persist()} loading={updatePreferences.isPending}>
            Save to account
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="theme">Theme</Label>
            <Select value={theme} onValueChange={(value) => setTheme(value as Theme)}>
              <SelectTrigger id="theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">Match system</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="default-market">Default market</Label>
            <Select
              value={activeMarket}
              onValueChange={(value) => setActiveMarket(value as 'IN' | 'US')}
            >
              <SelectTrigger id="default-market">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN">India (NSE/BSE)</SelectItem>
                <SelectItem value="US">United States (NASDAQ/NYSE)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Which market the dashboard opens on. Wallets stay segregated regardless.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Dashboard widgets</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose what appears on your dashboard and in what order.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={resetWidgets}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {sorted.map((widget, index) => {
            const meta = DASHBOARD_WIDGETS.find((entry) => entry.id === widget.id);
            return (
              <div
                key={widget.id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => moveWidget(widget.id, -1)}
                    disabled={index === 0}
                    className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label={`Move ${meta?.label ?? widget.id} up`}
                  >
                    &#9650;
                  </button>
                  <button
                    type="button"
                    onClick={() => moveWidget(widget.id, 1)}
                    disabled={index === sorted.length - 1}
                    className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label={`Move ${meta?.label ?? widget.id} down`}
                  >
                    &#9660;
                  </button>
                </div>
                <Label htmlFor={`widget-${widget.id}`} className="flex-1 font-normal">
                  {meta?.label ?? widget.id}
                </Label>
                <Switch
                  id={`widget-${widget.id}`}
                  checked={widget.visible}
                  onCheckedChange={() => toggleWidget(widget.id)}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About this platform</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            This is a simulated paper-trading platform. All trading uses virtual money; no real
            orders are placed and no real brokerage account exists.
          </p>
          <p>
            Market prices are delayed by roughly fifteen minutes, or generated by a deterministic
            simulator when no provider is reachable. Every price carries a badge showing which.
          </p>
          <p>
            Brokerage, STT, stamp duty, GST, SEC and FINRA charges are educational approximations,
            not tax advice.
          </p>
          {user ? (
            <p className="pt-2">
              Signed in as {user.email} ({ROLE_LABELS[user.role]}).
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export { BookOpen };
