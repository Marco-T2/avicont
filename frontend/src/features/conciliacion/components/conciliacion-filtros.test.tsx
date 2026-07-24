import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RangoFechas } from '@/components/shared/periodo-gestion-filtro';
import type { CuentaBancaria, WorkspaceConciliacionParams } from '@/types/api';

// El componente compartido de período se reemplaza por un botón que emite un
// rango determinista — así el test no depende de gestiones ni de la fecha real.
vi.mock('@/components/shared/periodo-gestion-filtro', () => ({
  PeriodoGestionFiltro: (props: { onChange: (r: RangoFechas) => void; error?: string }) => (
    <div>
      <button
        type="button"
        onClick={() => props.onChange({ fechaDesde: '2026-06-01', fechaHasta: '2026-06-30' })}
      >
        Emitir rango
      </button>
      {props.error !== undefined && <p>{props.error}</p>}
    </div>
  ),
}));

vi.mock('@/features/cuentas-bancarias/hooks/use-cuentas-bancarias', () => ({
  useCuentasBancarias: vi.fn(),
}));

import { useCuentasBancarias } from '@/features/cuentas-bancarias/hooks/use-cuentas-bancarias';

import { ConciliacionFiltros } from './conciliacion-filtros';

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

function renderFiltros(onBuscar = vi.fn<(p: WorkspaceConciliacionParams) => void>()) {
  render(<ConciliacionFiltros onBuscar={onBuscar} isFetching={false} />);
  return onBuscar;
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

describe('ConciliacionFiltros', () => {
  it('lista las cuentas bancarias disponibles para elegir', async () => {
    const user = userEvent.setup();
    renderFiltros();

    await user.click(screen.getByRole('combobox', { name: /cuenta bancaria/i }));

    expect(
      await screen.findByRole('option', { name: /cuenta corriente bancosol/i }),
    ).toBeInTheDocument();
  });

  it('con cuenta y rango elegidos emite los 3 parámetros que exige el backend', async () => {
    const user = userEvent.setup();
    const onBuscar = renderFiltros();

    await elegirCuenta(user);
    await user.click(screen.getByRole('button', { name: /emitir rango/i }));
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    expect(onBuscar).toHaveBeenCalledWith({
      cuentaBancariaId: 'cb-1',
      desde: '2026-06-01',
      hasta: '2026-06-30',
    });
  });

  it('sin cuenta seleccionada NO consulta y avisa', async () => {
    const user = userEvent.setup();
    const onBuscar = renderFiltros();

    await user.click(screen.getByRole('button', { name: /emitir rango/i }));
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    expect(onBuscar).not.toHaveBeenCalled();
    expect(screen.getByText(/seleccioná una cuenta bancaria/i)).toBeInTheDocument();
  });

  it('sin rango seleccionado NO consulta y avisa', async () => {
    const user = userEvent.setup();
    const onBuscar = renderFiltros();

    await elegirCuenta(user);
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    expect(onBuscar).not.toHaveBeenCalled();
    expect(screen.getByText(/seleccioná un período o rango/i)).toBeInTheDocument();
  });

  it('sin cuentas bancarias cargadas explica qué hacer antes de conciliar', () => {
    vi.mocked(useCuentasBancarias).mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 50 },
      isLoading: false,
    } as unknown as ReturnType<typeof useCuentasBancarias>);

    renderFiltros();

    expect(screen.getByText(/no hay cuentas bancarias configuradas/i)).toBeInTheDocument();
  });
});
