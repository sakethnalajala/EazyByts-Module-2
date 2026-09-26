import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * jsdom environment setup.
 *
 * jsdom implements neither matchMedia nor ResizeObserver, and both are used by
 * code that runs on mount: the theme resolver reads the colour-scheme media
 * query, and Recharts' ResponsiveContainer observes its box. Without these
 * stubs every component test fails for reasons unrelated to the component.
 */

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

class ResizeObserverStub {
  observe(): void {
    /* no layout in jsdom */
  }
  unobserve(): void {
    /* no layout in jsdom */
  }
  disconnect(): void {
    /* no layout in jsdom */
  }
}

globalThis.ResizeObserver = ResizeObserverStub;

// Radix overlays call these; jsdom does not implement them.
Element.prototype.scrollIntoView = vi.fn();
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = vi.fn();
}

afterEach(() => {
  cleanup();
});
