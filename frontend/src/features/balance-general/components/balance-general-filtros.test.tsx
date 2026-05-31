import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BalanceGeneralFiltros } from './balance-general-filtros';

describe('BalanceGeneralFiltros', () => {
  it('renderiza el input de fecha de corte y el botón consultar', () => {
    render(<BalanceGeneralFiltros onBuscar={vi.fn()} />);
    expect(screen.getByLabelText(/fecha de corte/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /consultar/i })).toBeDefined();
  });

  it('llama onBuscar con la fecha y el flag de anulados al enviar', async () => {
    const user = userEvent.setup();
    const onBuscar = vi.fn();
    render(<BalanceGeneralFiltros onBuscar={onBuscar} />);

    const fecha = screen.getByLabelText(/fecha de corte/i);
    fireEvent.change(fecha, { target: { value: '2026-05-31' } });

    await user.click(screen.getByRole('button', { name: /consultar/i }));

    expect(onBuscar).toHaveBeenCalledWith({
      fecha: '2026-05-31',
      incluirAnulados: false,
    });
  });

  it('incluye anulados cuando el toggle está activo', async () => {
    const user = userEvent.setup();
    const onBuscar = vi.fn();
    render(<BalanceGeneralFiltros onBuscar={onBuscar} />);

    fireEvent.change(screen.getByLabelText(/fecha de corte/i), {
      target: { value: '2026-05-31' },
    });
    await user.click(screen.getByLabelText(/incluir anulados/i));
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    expect(onBuscar).toHaveBeenCalledWith({
      fecha: '2026-05-31',
      incluirAnulados: true,
    });
  });

  it('no llama onBuscar si la fecha está vacía', async () => {
    const user = userEvent.setup();
    const onBuscar = vi.fn();
    render(<BalanceGeneralFiltros onBuscar={onBuscar} />);

    fireEvent.change(screen.getByLabelText(/fecha de corte/i), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    expect(onBuscar).not.toHaveBeenCalled();
  });

  it('deshabilita el botón y muestra el estado cuando isFetching es true', () => {
    render(<BalanceGeneralFiltros onBuscar={vi.fn()} isFetching />);
    const boton = screen.getByRole('button', { name: /consultando/i });
    expect(boton).toBeDefined();
    expect((boton as HTMLButtonElement).disabled).toBe(true);
  });
});
