import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui';
import { AmbientBackground } from '@/components/common/AmbientBackground';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { cn } from '@/lib/utils';

/**
 * Shared chrome for every public auth screen.
 *
 * The ambient background and glass card are what give these pages their
 * premium feel; the layout itself stays deliberately narrow and centred so the
 * form remains the focus.
 */
export function AuthLayout({
  title,
  subtitle,
  icon,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  /** Optional badge rendered beside the title, used by the role consoles. */
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col text-foreground">
      <AmbientBackground variant="auth" particles beam />

      <header className="relative z-10 flex h-16 items-center px-4 sm:px-6">
        <Link to="/" className="group flex items-center gap-2.5 font-semibold">
          <span
            className="grid size-9 place-items-center rounded-xl text-white shadow-lg transition-transform duration-300 group-hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, var(--role-accent), var(--role-accent-2))',
              boxShadow: '0 8px 24px -8px var(--role-glow)',
            }}
          >
            <TrendingUp className="size-4.5" aria-hidden="true" />
          </span>
          <span className="hidden text-sm sm:block">Stock Market Dashboard</span>
        </Link>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">Back to home</span>
            </Link>
          </Button>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <div className={cn('w-full', wide ? 'max-w-lg' : 'max-w-md')}>
          <div className="animate-scale-in glass-strong glow-role overflow-hidden rounded-2xl">
            <div className="p-6 sm:p-8">
              <div className="mb-6 flex items-start gap-4">
                {icon}
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
                  {subtitle ? (
                    <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
                  ) : null}
                </div>
              </div>

              {children}
            </div>
          </div>

          {footer ? <div className="animate-fade-up delay-2 mt-5 text-center">{footer}</div> : null}

          <p className="animate-fade-in delay-3 mt-6 text-center text-xs text-muted-foreground">
            Simulated trading platform. Virtual money only &mdash; no real orders are placed.
          </p>
        </div>
      </main>
    </div>
  );
}
