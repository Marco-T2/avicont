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

function applyClass(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  root.classList.toggle('dark', isDark);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (t) => {
        set({ theme: t });
        applyClass(t);
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
        applyClass('system');
      }
    });
}
