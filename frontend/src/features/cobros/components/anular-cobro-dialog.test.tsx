import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/anular-cobro', () => ({ anularCobro: vi.fn() }));

import { anularCobro } from '../api/anular-cobro';
import { AnularCobroDialog } from './anular-cobro-dialog';

const mockAnular = vi.mocked(anularCobro);

function renderDialog(cantidadAplicaciones = 2) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AnularCobroDialog
        open
        onOpenChange={vi.fn()}
        cobroId="cobro-1"
        cantidadAplicaciones={cantidadAplicaciones}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockAnular.mockReset();
});

describe('AnularCobroDialog', () => {
  it('advierte que anular ELIMINA las aplicaciones y las ventas vuelven a quedar pendientes (REQ-CXC-06)', () => {
    renderDialog(2);
    expect(
      screen.getByText(/elimina las 2 aplicaciones vivas/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/vuelven a quedar pendientes/i)).toBeInTheDocument();
    expect(screen.getByText(/irreversible/i)).toBeInTheDocument();
  });

  it('motivo corto: muestra el error de validación y NO llama al backend', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/motivo/i), 'corto');
    await user.click(screen.getByRole('button', { name: /confirmar anulación/i }));

    expect(
      await screen.findByText(/al menos 10 caracteres significativos/i),
    ).toBeInTheDocument();
    expect(mockAnular).not.toHaveBeenCalled();
  });

  it('motivo de solo espacios no pasa la validación', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/motivo/i), '            ');
    await user.click(screen.getByRole('button', { name: /confirmar anulación/i }));

    expect(
      await screen.findByText(/al menos 10 caracteres significativos/i),
    ).toBeInTheDocument();
    expect(mockAnular).not.toHaveBeenCalled();
  });

  it('motivo válido: llama al backend con el id y el motivo trimmeado', async () => {
    const user = userEvent.setup();
    mockAnular.mockResolvedValue(undefined);
    renderDialog();

    await user.type(screen.getByLabelText(/motivo/i), '  Cobro registrado dos veces  ');
    await user.click(screen.getByRole('button', { name: /confirmar anulación/i }));

    expect(mockAnular).toHaveBeenCalledWith('cobro-1', 'Cobro registrado dos veces');
  });
});
