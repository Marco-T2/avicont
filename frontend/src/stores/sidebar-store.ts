import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (c: boolean) => void;
}

// Estado persistido de la sidebar de desktop. El mobile drawer NO se ve
// afectado por `collapsed` — siempre abre fullscreen vía MobileSidebar.
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      collapsed: false,
      toggle: () => set({ collapsed: !get().collapsed }),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    { name: 'avicont-sidebar', version: 1 },
  ),
);

/**
 * Registra el atajo Cmd+B (Mac) / Ctrl+B (Win/Linux) para toggle del
 * sidebar. Se ignora cuando el foco está en un input/textarea/editable
 * para no secuestrar el atajo nativo de "bold" en editores de texto.
 *
 * Montar una sola vez en el árbol (p. ej. dentro de AppSidebar).
 */
export function useSidebarShortcut(): void {
  const toggle = useSidebarStore((s) => s.toggle);
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'b') return;
      const target = e.target as HTMLElement | null;
      if (
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);
}
