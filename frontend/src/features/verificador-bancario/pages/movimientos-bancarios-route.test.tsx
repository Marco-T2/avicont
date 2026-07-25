import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequirePermission } from '@/components/shared/require-permission';
import { PERMISSIONS } from '@/lib/permissions';

/**
 * REQ-VMB-14 — la ruta `/movimientos-bancarios` se bloquea fail-closed sin
 * `contabilidad.conciliacion.read` (§14.7: nav/rutas se ocultan/bloquean).
 *
 * El eje "sin pack" está cubierto por la misma cascada: el catálogo de
 * permisos de `/me/permissions` viene FILTRADO por packs activos, así que sin
 * el pack `contabilidad.conciliacion` el usuario nunca tiene `.read` y este
 * mismo gate bloquea. El ítem del sidebar (permiso ∧ pack) se prueba en
 * `src/components/nav-list.test.tsx`.
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

function renderRutaVerificador() {
  render(
    <MemoryRouter>
      <RequirePermission permission={PERMISSIONS.contabilidad.conciliacion.read}>
        <p>Contenido del verificador de movimientos</p>
      </RequirePermission>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  hasMock.mockReset();
  hasMock.mockReturnValue(true);
  isLoadingMock.value = false;
});

describe('Ruta /movimientos-bancarios — gating fail-closed (REQ-VMB-14)', () => {
  it('con contabilidad.conciliacion.read la pantalla se renderiza', () => {
    renderRutaVerificador();

    expect(screen.getByText(/contenido del verificador/i)).toBeInTheDocument();
  });

  it('sin contabilidad.conciliacion.read la pantalla NO se renderiza', () => {
    hasMock.mockReturnValue(false);

    renderRutaVerificador();

    expect(screen.queryByText(/contenido del verificador/i)).not.toBeInTheDocument();
  });
});

describe('router — la ruta /movimientos-bancarios existe y está gateada', () => {
  // Timeout explícito: importar el router arrastra TODAS las páginas de la app
  // (incluido `@react-pdf/renderer`) — es costo de import, no de lógica.
  it('el router declara /movimientos-bancarios envuelta en RequirePermission con .read', async () => {
    const { router } = await import('@/routes/router');

    const rutas = router.routes.flatMap((r) => r.children ?? []).flatMap((r) => r.children ?? []);
    const ruta = rutas.find((r) => r.path === '/movimientos-bancarios');

    expect(ruta).toBeDefined();

    const element = ruta?.element as React.ReactElement<{ permission: string }> | undefined;
    expect(element?.props.permission).toBe('contabilidad.conciliacion.read');
  }, 60_000);
});
