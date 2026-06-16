import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EstadoResultadosFiltros } from './estado-resultados-filtros';

describe('EstadoResultadosFiltros', () => {
  it('renderiza los inputs de fecha desde/hasta y el botón consultar', () => {
    render(<EstadoResultadosFiltros onBuscar={vi.fn()} />);
    expect(screen.getByLabelText(/desde/i)).toBeDefined();
    expect(screen.getByLabelText(/hasta/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /consultar/i })).toBeDefined();
  });

  it('precarga el rango con el año en curso (desde 01/01, hasta hoy)', () => {
    render(<EstadoResultadosFiltros onBuscar={vi.fn()} />);
    const desde = screen.getByLabelText(/desde/i) as HTMLInputElement;
    const hasta = screen.getByLabelText(/hasta/i) as HTMLInputElement;
    // desde = 1 de enero del año en curso; hasta = hoy (formato YYYY-MM-DD).
    expect(desde.value).toMatch(/^\d{4}-01-01$/);
    expect(hasta.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(desde.value <= hasta.value).toBe(true);
  });

  it('llama onBuscar con el rango y el flag de anulados al enviar', async () => {
    const user = userEvent.setup();
    const onBuscar = vi.fn();
    render(<EstadoResultadosFiltros onBuscar={onBuscar} />);

    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2026-05-31' } });

    await user.click(screen.getByRole('button', { name: /consultar/i }));

    expect(onBuscar).toHaveBeenCalledWith({
      fechaDesde: '2026-05-01',
      fechaHasta: '2026-05-31',
      incluirAnulados: false,
    });
  });

  it('incluye anulados cuando el toggle está activo', async () => {
    const user = userEvent.setup();
    const onBuscar = vi.fn();
    render(<EstadoResultadosFiltros onBuscar={onBuscar} />);

    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2026-05-31' } });
    await user.click(screen.getByLabelText(/incluir anulados/i));
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    expect(onBuscar).toHaveBeenCalledWith({
      fechaDesde: '2026-05-01',
      fechaHasta: '2026-05-31',
      incluirAnulados: true,
    });
  });

  it('no llama onBuscar si una fecha del rango está vacía', async () => {
    const user = userEvent.setup();
    const onBuscar = vi.fn();
    render(<EstadoResultadosFiltros onBuscar={onBuscar} />);

    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2026-05-31' } });
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    expect(onBuscar).not.toHaveBeenCalled();
  });

  it('no llama onBuscar si el rango está invertido', async () => {
    const user = userEvent.setup();
    const onBuscar = vi.fn();
    render(<EstadoResultadosFiltros onBuscar={onBuscar} />);

    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2026-05-31' } });
    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2026-05-01' } });
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    expect(onBuscar).not.toHaveBeenCalled();
  });

  it('deshabilita el botón y muestra el estado cuando isFetching es true', () => {
    render(<EstadoResultadosFiltros onBuscar={vi.fn()} isFetching />);
    const boton = screen.getByRole('button', { name: /consultando/i });
    expect(boton).toBeDefined();
    expect((boton as HTMLButtonElement).disabled).toBe(true);
  });
});
