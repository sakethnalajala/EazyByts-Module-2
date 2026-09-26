import { Moon, Sun } from 'lucide-react';
import { useUiStore, resolveTheme, type Theme } from '@/stores/uiStore';
import { cn } from '@/lib/utils';

/**
 * Light / dark theme switch.
 *
 * A segmented control rather than a single icon button: the two options are
 * both visible, so the current theme and the alternative are readable at a
 * glance instead of having to be inferred from one icon.
 *
 * The choice is written to the persisted ui store, so it survives a refresh
 * (localStorage, via zustand's persist middleware) and applies instantly -
 * `<ThemeEffect>` toggles the class on <html>, nothing reloads.
 *
 * A stored 'system' preference is resolved against the OS for display, so the
 * highlight always sits under the theme actually on screen.
 */

const OPTIONS: ReadonlyArray<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

export function ThemeToggle({
  className,
  showLabels = false,
}: {
  className?: string;
  /** Renders the words beside the icons. Used where there is room for them. */
  showLabels?: boolean;
}) {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const active = resolveTheme(theme);

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cn(
        'glass relative inline-flex items-center gap-0.5 rounded-full p-0.5',
        'shadow-[0_1px_0_0_var(--glass-highlight)_inset]',
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const selected = active === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={selected}
            aria-label={`${option.label} theme`}
            title={`${option.label} theme`}
            className={cn(
              'relative z-10 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium',
              'transition-[color,background,box-shadow] duration-300',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'text-white shadow-[0_6px_18px_-8px_var(--role-glow)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
            style={
              selected
                ? {
                    background:
                      'linear-gradient(135deg, var(--role-accent), var(--role-accent-2))',
                  }
                : undefined
            }
          >
            <option.icon className="size-4" aria-hidden="true" />
            {showLabels ? <span>{option.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
