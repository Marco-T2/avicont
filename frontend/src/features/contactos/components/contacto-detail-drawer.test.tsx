import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import type { Contacto } from '@/types/api';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

// sonner se mockea para silenciar los side effects de toast en el flujo de
// reactivar (no usamos MSW). Solo verificamos la invocación de la mutación.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Los botones Editar/Desactivar/Reactivar usan PermissionButton → usePermissions.
// Concedemos todos los permisos (estos tests cubren el flujo, no el gating).
vi.mock('@/lib/use-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-permissions')>()),
  usePermissions: () => ({ has: () => true, hasAll: () => true, isOwner: true, permissions: [] }),
}));

const mockedGet = api.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = api.post as unknown as ReturnType<typeof vi.fn>;

function wrapper(): (props: { children: React.ReactNode }) => React.JSX.Element {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const CONTACTO_ACTIVO: Contacto = {
  id: 'ct-1',
  razonSocial: 'Granja Los Pollos S.R.L.',
  nombreComercial: 'Los Pollos',
  documento: '12345678',
  esCliente: true,
  esProveedor: false,
  email: 'ventas@lospollos.bo',
  telefono: '70011223',
  direccion: 'Av. Avícola 123',
  activo: true,
  createdByUserId: 'u1',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

const CONTACTO_INACTIVO: Contacto = {
  ...CONTACTO_ACTIVO,
  id: 'ct-2',
  razonSocial: 'Proveedora del Sur Ltda.',
  activo: false,
};

// Importación diferida para que vi.mock esté activo antes de que el módulo
// resuelva sus dependencias (patrón consistente con el resto de la feature).
const { ContactoDetailDrawer } = await import('./contacto-detail-drawer');

describe('ContactoDetailDrawer', () => {
  // E-DRAW-01: contacto activo → se ven Editar y Desactivar, NO Reactivar.
  it('contacto activo muestra Editar y Desactivar, no Reactivar', async () => {
    mockedGet.mockResolvedValue({ data: CONTACTO_ACTIVO });

    render(
      <ContactoDetailDrawer
        contactoId={CONTACTO_ACTIVO.id}
        open={true}
        onOpenChange={vi.fn()}
      />,
      { wrapper: wrapper() },
    );

    expect(
      await screen.findByRole('button', { name: /editar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /desactivar/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /reactivar/i }),
    ).not.toBeInTheDocument();
  });

  // E-DRAW-02: contacto inactivo → se ve Reactivar, NO Editar ni Desactivar.
  it('contacto inactivo muestra Reactivar, no Editar ni Desactivar', async () => {
    mockedGet.mockResolvedValue({ data: CONTACTO_INACTIVO });

    render(
      <ContactoDetailDrawer
        contactoId={CONTACTO_INACTIVO.id}
        open={true}
        onOpenChange={vi.fn()}
      />,
      { wrapper: wrapper() },
    );

    expect(
      await screen.findByRole('button', { name: /reactivar/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /editar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /desactivar/i }),
    ).not.toBeInTheDocument();
  });

  // E-DRAW-03: click en Reactivar invoca la mutación DIRECTO, sin AlertDialog.
  it('click en Reactivar invoca la API de reactivación sin abrir un dialog de confirmación', async () => {
    mockedGet.mockResolvedValue({ data: CONTACTO_INACTIVO });
    mockedPost.mockResolvedValue({ data: { ...CONTACTO_INACTIVO, activo: true } });
    const user = userEvent.setup();

    render(
      <ContactoDetailDrawer
        contactoId={CONTACTO_INACTIVO.id}
        open={true}
        onOpenChange={vi.fn()}
      />,
      { wrapper: wrapper() },
    );

    const reactivar = await screen.findByRole('button', { name: /reactivar/i });
    await user.click(reactivar);

    // No debe aparecer un AlertDialog de confirmación: la mutación es directa.
    expect(
      screen.queryByRole('alertdialog'),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        `/api/contactos/${CONTACTO_INACTIVO.id}/reactivar`,
      );
    });
    expect(mockedPost).toHaveBeenCalledOnce();
  });

  // Render del detalle: campos visibles con placeholders para nulls.
  it('renderiza los campos del contacto y placeholders para nulls', async () => {
    mockedGet.mockResolvedValue({
      data: {
        ...CONTACTO_ACTIVO,
        nombreComercial: null,
        email: null,
        telefono: null,
        direccion: null,
      },
    });

    render(
      <ContactoDetailDrawer
        contactoId={CONTACTO_ACTIVO.id}
        open={true}
        onOpenChange={vi.fn()}
      />,
      { wrapper: wrapper() },
    );

    expect(
      await screen.findByText('Granja Los Pollos S.R.L.'),
    ).toBeInTheDocument();
    expect(screen.getByText('12345678')).toBeInTheDocument();
    // nombreComercial, email, telefono, direccion en null → placeholders "—".
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });
});
