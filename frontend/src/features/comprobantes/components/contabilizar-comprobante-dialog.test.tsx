import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ContabilizarComprobanteDialog } from './contabilizar-comprobante-dialog';

const mockMutate = vi.fn();

vi.mock('../hooks/use-contabilizar-comprobante', () => ({
  useContabilizarComprobante: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

function renderDialog(props: Partial<Parameters<typeof ContabilizarComprobanteDialog>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContabilizarComprobanteDialog
        open={true}
        onOpenChange={vi.fn()}
        comprobanteId="comp-1"
        glosa="Pago de servicios"
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('ContabilizarComprobanteDialog', () => {
  it('renderiza el diálogo con la glosa', () => {
    renderDialog();
    expect(screen.getByText('¿Contabilizar este comprobante?')).toBeInTheDocument();
    expect(screen.getByText('Pago de servicios')).toBeInTheDocument();
  });

  it('tiene botón "Contabilizar" y "Cancelar"', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Contabilizar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('llama a mutate al confirmar', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Contabilizar' }));
    expect(mockMutate).toHaveBeenCalled();
  });

  it('no muestra glosa cuando es undefined', () => {
    renderDialog({ glosa: undefined });
    expect(screen.queryByText('Pago de servicios')).not.toBeInTheDocument();
  });
});
