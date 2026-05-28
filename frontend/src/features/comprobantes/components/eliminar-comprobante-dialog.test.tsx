import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { EliminarComprobanteDialog } from './eliminar-comprobante-dialog';

const mockMutate = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../hooks/use-eliminar-comprobante', () => ({
  useEliminarComprobante: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderDialog(props: Partial<Parameters<typeof EliminarComprobanteDialog>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <EliminarComprobanteDialog
          open={true}
          onOpenChange={vi.fn()}
          comprobanteId="comp-1"
          glosa="Pago de servicios"
          {...props}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('EliminarComprobanteDialog', () => {
  it('renderiza el diálogo con la glosa', () => {
    renderDialog();
    expect(screen.getByText('¿Eliminar este borrador?')).toBeInTheDocument();
    expect(screen.getByText('Pago de servicios')).toBeInTheDocument();
  });

  it('tiene botón "Eliminar borrador" y "Cancelar"', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Eliminar borrador' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('llama a mutate al confirmar', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Eliminar borrador' }));
    expect(mockMutate).toHaveBeenCalled();
  });

  it('mensaje de irreversibilidad visible', () => {
    renderDialog();
    expect(screen.getByText(/irreversible/i)).toBeInTheDocument();
  });
});
