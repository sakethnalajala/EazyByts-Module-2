import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Market } from '@smd/shared';

export type Theme = 'light' | 'dark' | 'system';

/** Dashboard widgets the user can show, hide and reorder. */
export const DASHBOARD_WIDGETS = [
  { id: 'portfolio-summary', label: 'Portfolio summary' },
  { id: 'market-indices', label: 'Market indices' },
  { id: 'performance-chart', label: 'Performance chart' },
  { id: 'holdings', label: 'Top holdings' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'movers', label: 'Gainers & losers' },
  { id: 'recent-orders', label: 'Recent orders' },
  { id: 'allocation', label: 'Asset allocation' },
  { id: 'news', label: 'Market news' },
] as const;

export type WidgetId = (typeof DASHBOARD_WIDGETS)[number]['id'];

export interface WidgetState {
  id: string;
  visible: boolean;
  order: number;
}

function defaultWidgets(): WidgetState[] {
  return DASHBOARD_WIDGETS.map((widget, index) => ({
    id: widget.id,
    visible: true,
    order: index,
  }));
}

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  activeMarket: Market;
  widgets: WidgetState[];
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  setActiveMarket: (market: Market) => void;
  setWidgets: (widgets: WidgetState[]) => void;
  toggleWidget: (id: string) => void;
  moveWidget: (id: string, direction: -1 | 1) => void;
  resetWidgets: () => void;
}

/** Exactly the slice `partialize` writes to storage. */
type PersistedUiState = Pick<
  UiState,
  'theme' | 'sidebarCollapsed' | 'activeMarket' | 'widgets'
>;

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      /*
       * Dark by default rather than 'system'. The product's visual identity is
       * the dark fintech treatment - following a light-mode OS dropped first-
       * time visitors onto white screens the design was never drawn for.
       * Light remains fully supported via the toggle.
       */
      theme: 'dark',
      sidebarCollapsed: false,
      mobileNavOpen: false,
      activeMarket: 'IN',
      widgets: defaultWidgets(),

      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setActiveMarket: (activeMarket) => set({ activeMarket }),
      setWidgets: (widgets) => set({ widgets }),

      toggleWidget: (id) =>
        set({
          widgets: get().widgets.map((widget) =>
            widget.id === id ? { ...widget, visible: !widget.visible } : widget,
          ),
        }),

      moveWidget: (id, direction) => {
        const widgets = [...get().widgets].sort((a, b) => a.order - b.order);
        const index = widgets.findIndex((widget) => widget.id === id);
        const target = index + direction;
        if (index === -1 || target < 0 || target >= widgets.length) return;

        const current = widgets[index];
        const swap = widgets[target];
        if (!current || !swap) return;

        widgets[index] = swap;
        widgets[target] = current;

        set({ widgets: widgets.map((widget, order) => ({ ...widget, order })) });
      },

      resetWidgets: () => set({ widgets: defaultWidgets() }),
    }),
    {
      name: 'smd.ui',
      // Transient state must not persist: a reopened tab should not restore a
      // half-open mobile drawer.
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        activeMarket: state.activeMarket,
        widgets: state.widgets,
      }),
      version: 2,

      /*
       * v1 stored 'system' as the default. Anyone still holding that value
       * never made a deliberate choice, so move them to the dark identity;
       * an explicit 'light' or 'dark' is left alone.
       */
      migrate: (persisted, version) => {
        const state = persisted as PersistedUiState;
        if (version < 2 && state.theme === 'system') {
          return { ...state, theme: 'dark' };
        }
        return state;
      },
    },
  ),
);

/** Resolves 'system' against the OS preference. */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
