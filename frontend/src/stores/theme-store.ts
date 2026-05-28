import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  applyTheme: () => void;
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function toggleClass(theme: Theme): void {
  const root = document.documentElement;
  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  root.classList.toggle('dark', isDark);
}

interface ApplyOptions {
  animate?: boolean;
}

// El bootstrap (applyTheme) llama sin animate para evitar un wipe gratuito al
// entrar a la app. El user-initiated (setTheme) y el cambio de preferencia del
// SO sí animan. Feature-detect: si el browser no soporta View Transitions o el
// usuario pidió reduced-motion, se hace el toggle directo sin animación.
function applyClass(theme: Theme, options: ApplyOptions = {}): void {
  if (typeof document === 'undefined') return;

  const canAnimate =
    options.animate === true &&
    typeof document.startViewTransition === 'function' &&
    !prefersReducedMotion();

  if (!canAnimate) {
    toggleClass(theme);
    return;
  }

  const transition = document.startViewTransition(() => toggleClass(theme));
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: ['inset(0 0 100% 0)', 'inset(0)'] },
        { pseudoElement: '::view-transition-new(root)', duration: 600 },
      );
    })
    .catch(() => {
      // Si el browser aborta la transición (ej. otro setTheme la interrumpe),
      // el toggle ya ocurrió dentro del callback de startViewTransition.
    });
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (t) => {
        set({ theme: t });
        applyClass(t, { animate: true });
      },
      applyTheme: () => applyClass(get().theme),
    }),
    { name: 'avicont-theme' },
  ),
);

// Listener para cambios de preferencia del sistema cuando el theme es "system".
if (typeof window !== 'undefined') {
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (useThemeStore.getState().theme === 'system') {
        applyClass('system', { animate: true });
      }
    });
}
