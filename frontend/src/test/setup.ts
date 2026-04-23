import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// ---- Polyfills para Radix UI + JSDOM ----
// Radix usa ResizeObserver / PointerEvent APIs que JSDOM no implementa.
// Sin estos shims, Select/Dialog/Sheet tiran ReferenceError al renderizar.

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver =
    ResizeObserverMock;
}

// hasPointerCapture / scrollIntoView son métodos que Radix llama en los
// triggers de Select y Dropdown. En JSDOM son undefined.
if (
  typeof Element !== 'undefined' &&
  typeof Element.prototype.hasPointerCapture === 'undefined'
) {
  Element.prototype.hasPointerCapture = (): boolean => false;
}
if (
  typeof Element !== 'undefined' &&
  typeof Element.prototype.scrollIntoView === 'undefined'
) {
  Element.prototype.scrollIntoView = (): void => {};
}
