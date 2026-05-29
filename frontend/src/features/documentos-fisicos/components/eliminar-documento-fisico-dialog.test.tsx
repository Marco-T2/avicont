import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DocumentoFisico } from '@/types/api';

vi.mock('../hooks/use-documento-fisico-mutations', () => ({
  useEliminarDocumentoFisico: vi.fn(),
}));

import { useEliminarDocumentoFisico } from '../hooks/use-documento-fisico-mutations';

import { EliminarDocumentoFisicoDialog } from './eliminar-documento-fisico-dialog';

const mockUseEliminarDocumentoFisico = vi.mocked(useEliminarDocumentoFisico);

afterEach(() => vi.clearAllMocks());

const DOCUMENTO: DocumentoFisico = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  numero: 'F-001',
  fechaEmision: '2026-05-01',
  monto: '1250.50',
  moneda: 'BOB',
  glosa: null,
  tipoDocumentoFisico: {
    id: 'tipo-1',
    nombre: 'Factura recibida',
    codigo: 'factura-recibida',
    esTributario: true,
  },
  contacto: null,
  organizationId: 'org-1',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function wrapper(): (props: { children: React.ReactNode }) => React.JSX.Element {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function setupMutate(overrides: { isPending?: boolean; mutate?: ReturnType<typeof vi.fn> } = {}) {
  const mutate = overrides.mutate ?? vi.fn();
  mockUseEliminarDocumentoFisico.mockReturnValue({
    mutate,
    isPending: overrides.isPending ?? false,
  } as unknown as ReturnType<typeof useEliminarDocumentoFisico>);
  return { mutate };
}

describe('EliminarDocumentoFisicoDialog', () => {
  it('renderiza texto de confirmación que incluye el número del documento', () => {
    setupMutate();
    render(
      <EliminarDocumentoFisicoDialog
        documento={DOCUMENTO}
        open={true}
        onOpenChange={vi.fn()}
      />,
      { wrapper: wrapper() },
    );

    // El texto debe incluir el numero "F-001"
    expect(screen.getByText(/F-001/)).toBeInTheDocument();
    expect(screen.getByText(/permanente/i)).toBeInTheDocument();
  });

  it('click en Eliminar — e.preventDefault() ejecutado (dialog no se cierra automáticamente)', async () => {
    const { mutate } = setupMutate();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <EliminarDocumentoFisicoDialog
        documento={DOCUMENTO}
        open={true}
        onOpenChange={onOpenChange}
      />,
      { wrapper: wrapper() },
    );

    const eliminarBtn = screen.getByRole('button', { name: /eliminar/i });
    await user.click(eliminarBtn);

    // mutate fue llamado con el id del documento
    expect(mutate).toHaveBeenCalledOnce();
    const callArgs = mutate.mock.calls[0];
    expect(callArgs?.[0]).toBe(DOCUMENTO.id);

    // onOpenChange no se llama automáticamente (preventDefault lo evita)
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('isPending=true — botón Eliminar deshabilitado y muestra "Eliminando…"', () => {
    setupMutate({ isPending: true });
    render(
      <EliminarDocumentoFisicoDialog
        documento={DOCUMENTO}
        open={true}
        onOpenChange={vi.fn()}
      />,
      { wrapper: wrapper() },
    );

    const btn = screen.getByRole('button', { name: /eliminando/i });
    expect(btn).toBeDisabled();
  });
});
