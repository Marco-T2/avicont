import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import type { Contacto } from '@/types/api';

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn() },
}));

// sonner no es crítico en los tests de interacción — solo verificamos que la
// mutación se invoca con el id correcto. Mockeamos para silenciar side effects.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockedPost = api.post as unknown as ReturnType<typeof vi.fn>;

function wrapper(): (props: { children: React.ReactNode }) => React.JSX.Element {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const CONTACTO: Contacto = {
  id: 'ct-42',
  razonSocial: 'Granja Los Pollos S.R.L.',
  nombreComercial: null,
  documento: '12345678',
  esCliente: true,
  esProveedor: false,
  email: null,
  telefono: null,
  direccion: null,
  activo: true,
  createdByUserId: 'u1',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

// Importación diferida para que vi.mock esté activo antes de que el módulo
// resuelva sus dependencias (patrón consistente con el resto de la feature).
const { DesactivarContactoDialog } = await import('./desactivar-contacto-dialog');

describe('DesactivarContactoDialog', () => {
  // E-DIAL-01: al confirmar se invoca desactivarContacto con el id correcto.
  it('confirmar invoca la API de desactivación con el id del contacto', async () => {
    mockedPost.mockResolvedValue({ data: { ...CONTACTO, activo: false } });
    const user = userEvent.setup();

    render(
      <DesactivarContactoDialog
        contacto={CONTACTO}
        open={true}
        onOpenChange={vi.fn()}
      />,
      { wrapper: wrapper() },
    );

    const confirmar = screen.getByRole('button', { name: /desactivar/i });
    await user.click(confirmar);

    expect(mockedPost).toHaveBeenCalledOnce();
    expect(mockedPost).toHaveBeenCalledWith(`/api/contactos/${CONTACTO.id}/desactivar`);
  });

  // E-DIAL-02: al cancelar NO se invoca la mutación.
  it('cancelar no invoca la API de desactivación', async () => {
    mockedPost.mockReset();
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <DesactivarContactoDialog
        contacto={CONTACTO}
        open={true}
        onOpenChange={onOpenChange}
      />,
      { wrapper: wrapper() },
    );

    const cancelar = screen.getByRole('button', { name: /cancelar/i });
    await user.click(cancelar);

    expect(mockedPost).not.toHaveBeenCalled();
  });
});
