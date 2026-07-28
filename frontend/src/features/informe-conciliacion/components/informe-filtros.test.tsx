import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hoyEnLaPazISO } from '@/lib/fecha-actual';
import type { CuentaBancaria, InformeConciliacionParams } from '@/types/api';

vi.mock('@/features/cuentas-bancarias/hooks/use-cuentas-bancarias', () => ({
  useCuentasBancarias: vi.fn(),
}));

import { useCuentasBancarias } from '@/features/cuentas-bancarias/hooks/use-cuentas-bancarias';

import { InformeFiltros } from './informe-filtros';

const CUENTA: CuentaBancaria = {
  id: 'cb-1',
  organizationId: 'org-1',
  cuentaId: 'cuenta-1',
  alias: 'Cuenta corriente BancoSol',
  perfilExtracto: 'BANCOSOL_XLSX',
  numeroCuenta: '1191959-000-001',
  moneda: 'BOB',
  activa: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderFiltros(onEmitir = vi.fn<(p: InformeConciliacionParams) => void>()) {
  render(<InformeFiltros onEmitir={onEmitir} isFetching={false} />);
  return onEmitir;
}

beforeEach(() => {
  vi.mocked(useCuentasBancarias).mockReturnValue({
    data: { items: [CUENTA], total: 1, page: 1, pageSize: 50 },
    isLoading: false,
  } as unknown as ReturnType<typeof useCuentasBancarias>);
});

async function elegirCuenta(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('combobox', { name: /cuenta bancaria/i }));
  await user.click(await screen.findByRole('option', { name: /cuenta corriente bancosol/i }));
}

describe('InformeFiltros', () => {
  it('lista las cuentas bancarias disponibles para elegir', async () => {
    const user = userEvent.setup();
    renderFiltros();

    await user.click(screen.getByRole('combobox', { name: /cuenta bancaria/i }));

    expect(
      await screen.findByRole('option', { name: /cuenta corriente bancosol/i }),
    ).toBeInTheDocument();
  });

  it('la fecha de corte arranca en el hoy contable (La Paz)', () => {
    renderFiltros();

    expect(screen.getByLabelText(/fecha de corte/i)).toHaveValue(hoyEnLaPazISO());
  });

  it('con cuenta y corte emite los 2 parámetros que exige el backend', async () => {
    const user = userEvent.setup();
    const onEmitir = renderFiltros();

    await elegirCuenta(user);
    fireEvent.change(screen.getByLabelText(/fecha de corte/i), {
      target: { value: '2026-07-31' },
    });
    await user.click(screen.getByRole('button', { name: /emitir informe/i }));

    expect(onEmitir).toHaveBeenCalledWith({
      cuentaBancariaId: 'cb-1',
      corte: '2026-07-31',
    });
  });

  it('sin cuenta seleccionada NO emite y avisa', async () => {
    const user = userEvent.setup();
    const onEmitir = renderFiltros();

    await user.click(screen.getByRole('button', { name: /emitir informe/i }));

    expect(onEmitir).not.toHaveBeenCalled();
    expect(screen.getByText(/seleccioná una cuenta bancaria/i)).toBeInTheDocument();
  });

  it('sin fecha de corte NO emite y avisa', async () => {
    const user = userEvent.setup();
    const onEmitir = renderFiltros();

    await elegirCuenta(user);
    fireEvent.change(screen.getByLabelText(/fecha de corte/i), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: /emitir informe/i }));

    expect(onEmitir).not.toHaveBeenCalled();
    expect(screen.getByText(/seleccioná una fecha de corte/i)).toBeInTheDocument();
  });

  it('sin cuentas bancarias cargadas explica qué hacer antes de emitir', () => {
    vi.mocked(useCuentasBancarias).mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 50 },
      isLoading: false,
    } as unknown as ReturnType<typeof useCuentasBancarias>);

    renderFiltros();

    expect(screen.getByText(/no hay cuentas bancarias configuradas/i)).toBeInTheDocument();
  });

  // El trigger del Select es `w-fit` en el primitivo: se estira al contenido
  // e ignora el `sm:w-72` del div de arriba. Con la etiqueta larga
  // `alias · numeroCuenta` crecía a 368px y se comía 64px del campo de fecha
  // (medido en navegador a 768 y 1440). El `w-full` lo acota a su columna.
  it('acota el selector de cuenta a su columna, para que no pise el campo de fecha', () => {
    renderFiltros();

    expect(screen.getByLabelText('Cuenta bancaria')).toHaveClass('w-full');
  });

  // §7: el piso táctil de 44px lo aplica button.tsx por `pointer: coarse`
  // (propiedad del dispositivo). El CTA no debe reintroducir la convención
  // vieja por breakpoint (`h-11 sm:h-8`), que le daba 44px a un mouse en
  // ventana angosta y nada extra a una tablet táctil.
  it('no fija el alto del CTA por breakpoint: el piso táctil viene del primitivo', () => {
    renderFiltros();

    const boton = screen.getByRole('button', { name: /emitir informe/i });
    // Armado para que el escáner de Tailwind no levante el literal del test.
    expect(boton).toHaveClass(['pointer-coarse', 'min-h-11'].join(':'));
    expect(boton.className).not.toMatch(/\bsm:h-\d/);
  });
});
