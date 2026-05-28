import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AnularComprobanteSheet } from './anular-comprobante-sheet';

const mockMutate = vi.fn();

vi.mock('../hooks/use-anular-comprobante', () => ({
  useAnularComprobante: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

function renderSheet(props: Partial<Parameters<typeof AnularComprobanteSheet>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AnularComprobanteSheet
        open={true}
        onOpenChange={vi.fn()}
        comprobanteId="comp-1"
        glosa="Pago de servicios"
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('AnularComprobanteSheet', () => {
  it('renderiza el sheet con el campo de motivo', () => {
    renderSheet();
    expect(screen.getByLabelText('Motivo de anulación')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar anulación' })).toBeInTheDocument();
  });

  it('motivo corto → muestra error inline ANTES del submit', async () => {
    const user = userEvent.setup();
    renderSheet();
    const textarea = screen.getByLabelText('Motivo de anulación');
    await user.type(textarea, 'corto');
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    expect(
      await screen.findByText('El motivo debe tener al menos 10 caracteres significativos'),
    ).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('10 espacios → falla (trim reduce a longitud 0)', async () => {
    const user = userEvent.setup();
    renderSheet();
    const textarea = screen.getByLabelText('Motivo de anulación');
    await user.type(textarea, '          '); // 10 espacios
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    expect(
      await screen.findByText('El motivo debe tener al menos 10 caracteres significativos'),
    ).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('motivo válido → llama a mutate', async () => {
    const user = userEvent.setup();
    renderSheet();
    const textarea = screen.getByLabelText('Motivo de anulación');
    await user.type(textarea, 'Corrección de asiento por error contable');
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    expect(mockMutate).toHaveBeenCalledWith(
      'Corrección de asiento por error contable',
      expect.anything(),
    );
  });

  it('muestra la glosa en la descripción del sheet', () => {
    renderSheet({ glosa: 'Venta al contado' });
    expect(screen.getByText('"Venta al contado"')).toBeInTheDocument();
  });
});
