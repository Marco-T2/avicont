import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (c: boolean) => void;
  /**
   * Plegado explícito de cada subgrupo del menú, por `NavGroup.id`.
   *
   * Solo guarda los grupos que el usuario tocó a mano. Una clave AUSENTE no
   * significa "cerrado": significa "sin preferencia", y ahí manda el default
   * de NavList (abierto si contiene la ruta activa). Por eso el valor es
   * booleano y no un simple Set de abiertos — hay que poder guardar el "cerré
   * a propósito el grupo donde estoy parado".
   */
  openGroups: Record<string, boolean>;
  toggleGroup: (id: string, fallbackOpen: boolean) => void;
}

// Estado persistido de la sidebar de desktop. El mobile drawer NO se ve
// afectado por `collapsed` — siempre abre fullscreen vía MobileSidebar.
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      collapsed: false,
      toggle: () => set({ collapsed: !get().collapsed }),
      setCollapsed: (collapsed) => set({ collapsed }),
      openGroups: {},
      // `fallbackOpen` = si el grupo está abierto AHORA por default (ruta
      // activa) sin que haya preferencia guardada. Sin esto, el primer click
      // sobre un grupo abierto-por-default escribiría `true` y no haría nada
      // visible — el usuario tendría que clickear dos veces para cerrarlo.
      toggleGroup: (id, fallbackOpen) =>
        set({
          openGroups: {
            ...get().openGroups,
            [id]: !(get().openGroups[id] ?? fallbackOpen),
          },
        }),
    }),
    {
      name: 'avicont-sidebar',
      version: 2,
      // v1 no tenía `openGroups`. Migración aditiva: arrancan sin preferencia.
      migrate: (persisted) => ({
        ...(persisted as SidebarState),
        openGroups: {},
      }),
    },
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
