import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequirePermission } from '@/components/shared/require-permission';
import { PERMISSIONS } from '@/lib/permissions';

/**
 * REQ-CB-14 escenario 2 — la ruta `/conciliacion` se bloquea fail-closed sin
 * `contabilidad.conciliacion.read`.
 *
 * Acá NO aplica la excepción de "modo consulta" (§14.7 sí manda ocultar/bloquear
 * en navegación y rutas): el modo consulta es para las ACCIONES de la pantalla,
 * una vez que el usuario ya pudo entrar con `.read`.
 *
 * El ítem del sidebar está cubierto por `src/components/nav-list.test.tsx`
 * (REQ-SB-10, tareas 0.20-0.21).
 */

const { hasMock, isLoadingMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fija la firma para los tests que la sobreescriben.
  hasMock: vi.fn((_p: string) => true),
  isLoadingMock: { value: false },
}));

vi.mock('@/lib/use-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-permissions')>()),
  usePermissions: () => ({
    has: hasMock,
    hasAll: (perms: string[]) => perms.every((p) => hasMock(p)),
    isOwner: false,
    permissions: [],
    isLoading: isLoadingMock.value,
  }),
}));

function renderRutaConciliacion() {
  render(
    <MemoryRouter>
      <RequirePermission permission={PERMISSIONS.contabilidad.conciliacion.read}>
        <p>Contenido del workspace de conciliación</p>
      </RequirePermission>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  hasMock.mockReset();
  hasMock.mockReturnValue(true);
  isLoadingMock.value = false;
});

describe('Ruta /conciliacion — gating fail-closed (REQ-CB-14 escenario 2)', () => {
  it('con contabilidad.conciliacion.read la pantalla se renderiza', () => {
    renderRutaConciliacion();

    expect(screen.getByText(/contenido del workspace/i)).toBeInTheDocument();
  });

  it('sin contabilidad.conciliacion.read la pantalla NO se renderiza', () => {
    hasMock.mockReturnValue(false);

    renderRutaConciliacion();

    expect(screen.queryByText(/contenido del workspace/i)).not.toBeInTheDocument();
  });

  it('el permiso que gatea la ruta es exactamente contabilidad.conciliacion.read', () => {
    renderRutaConciliacion();

    expect(hasMock).toHaveBeenCalledWith('contabilidad.conciliacion.read');
  });
});

describe('router — la ruta /conciliacion existe y está gateada', () => {
  // Timeout explícito: importar el router arrastra TODAS las páginas de la app
  // (incluido `@react-pdf/renderer`), y con la suite completa en paralelo eso
  // supera los 5s por defecto. Es costo de import, no de lógica.
  it('el router declara /conciliacion envuelta en RequirePermission con .read', async () => {
    const { router } = await import('@/routes/router');

    // El árbol de rutas del shell autenticado es el primer nivel con children.
    const rutas = router.routes.flatMap((r) => r.children ?? []).flatMap((r) => r.children ?? []);
    const ruta = rutas.find((r) => r.path === '/conciliacion');

    expect(ruta).toBeDefined();

    const element = ruta?.element as React.ReactElement<{ permission: string }> | undefined;
    expect(element?.props.permission).toBe('contabilidad.conciliacion.read');
  }, 60_000);
});
