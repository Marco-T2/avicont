import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EstadoCuenta } from '@/types/api';

import { EstadoCuentaPage } from './estado-cuenta-page';

// El hook se mockea entero: la página es un contenedor (Anti-F-11) y acá se
// testea la orquestación (URL state → hook → sub-vistas), no la query real.
const { useEstadoCuentaMock } = vi.hoisted(() => ({
  useEstadoCuentaMock: vi.fn(),
}));

vi.mock('../hooks/use-estado-cuenta', () => ({
  useEstadoCuenta: useEstadoCuentaMock,
}));

// El combobox real dispara useContactos (fetch); acá solo interesa que la
// página le pase value/onSelect. Se reemplaza por un botón que emite un id.
vi.mock('@/components/shared/contacto-combobox', () => ({
  ContactoCombobox: ({
    value,
    onSelect,
  }: {
    value: string | null;
    onSelect: (id: string | null) => void;
  }) => (
    <button type="button" onClick={() => onSelect('contacto-2')}>
      combobox:{value ?? 'ninguno'}
    </button>
  ),
}));

const estadoCuenta: EstadoCuenta = {
  contactoId: 'contacto-1',
  razonSocial: 'Avícola Sur S.R.L.',
  fechaCorte: '2026-07-28',
  ventas: [
    {
      ventaId: 'v-1',
      fechaContable: '2026-06-01',
      fechaVencimiento: '2026-07-01',
      montoTotal: '1000.00',
      cobrado: '400.00',
      saldoPendiente: '600.00',
      estadoComercial: 'PARCIAL',
      vencida: true,
      diasAtraso: 27,
    },
  ],
  totalSaldoPendiente: '600.00',
  saldoAFavor: '0.00',
};

function mockQuery(
  overrides: Partial<{ data: EstadoCuenta; isLoading: boolean; isError: boolean }> = {},
) {
  useEstadoCuentaMock.mockReturnValue({
    data: overrides.data,
    isLoading: overrides.isLoading ?? false,
    isError: overrides.isError ?? false,
  });
}

function renderPage(url = '/estado-cuenta') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <EstadoCuentaPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useEstadoCuentaMock.mockReset();
});

describe('EstadoCuentaPage — sin cliente elegido', () => {
  it('muestra el empty state de página y NO consulta (contactoId undefined)', () => {
    mockQuery();
    renderPage('/estado-cuenta');
    expect(screen.getByText('Elegí un cliente')).toBeInTheDocument();
    expect(useEstadoCuentaMock).toHaveBeenCalledWith(undefined);
  });
});

describe('EstadoCuentaPage — cliente en la URL (URL state, §4)', () => {
  it('lee ?contactoId de la URL y se lo pasa al hook', () => {
    mockQuery({ data: estadoCuenta });
    renderPage('/estado-cuenta?contactoId=contacto-1');
    expect(useEstadoCuentaMock).toHaveBeenCalledWith('contacto-1');
    expect(screen.getByText('Avícola Sur S.R.L.')).toBeInTheDocument();
    expect(screen.getByText(/Vencida · 27 días/)).toBeInTheDocument();
  });

  it('elegir un cliente en el combobox actualiza la URL y re-consulta', async () => {
    mockQuery();
    const user = userEvent.setup();
    renderPage('/estado-cuenta');
    await user.click(screen.getByRole('button', { name: /combobox/ }));
    expect(useEstadoCuentaMock).toHaveBeenLastCalledWith('contacto-2');
    expect(screen.getByText('combobox:contacto-2')).toBeInTheDocument();
  });

  it('mientras carga muestra skeleton, no la tabla', () => {
    mockQuery({ isLoading: true });
    const { container } = renderPage('/estado-cuenta?contactoId=contacto-1');
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('si la query falla muestra banner inline, no toast (Anti-F-13)', () => {
    mockQuery({ isError: true });
    renderPage('/estado-cuenta?contactoId=contacto-1');
    expect(
      screen.getByText(/No se pudo cargar el estado de cuenta/i),
    ).toBeInTheDocument();
  });
});
