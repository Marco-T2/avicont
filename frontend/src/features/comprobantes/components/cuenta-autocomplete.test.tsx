import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Cuenta, CuentaListResponse } from '@/types/api';

// Mock del hook cross-feature — legítimo: importamos de hooks/ (fachada pública),
// no de api/ (CLAUDE.md design obs 247 — cross-feature de hooks es permitido).
vi.mock('@/features/plan-cuentas/hooks/use-cuentas', () => ({
  useCuentas: vi.fn(),
}));

import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';
import { CuentaAutocomplete } from './cuenta-autocomplete';

const makeCuenta = (overrides: Partial<Cuenta>): Cuenta => ({
  id: 'uuid-1',
  organizationId: 'org-1',
  codigoInterno: '1.1.01',
  nombre: 'Caja Chica',
  descripcion: null,
  claseCuenta: 'ACTIVO',
  subClaseCuenta: 'ACTIVO_CORRIENTE',
  naturaleza: 'DEUDORA',
  parentId: null,
  nivel: 3,
  esDetalle: true,
  requiereContacto: false,
  esContraria: false,
  activa: true,
  monedaFuncional: 'BOB',
  permiteMultiMoneda: false,
  esSystemSeed: false,
  esRequeridaSistema: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const CUENTAS: Cuenta[] = [
  makeCuenta({ id: 'uuid-1', codigoInterno: '1.1.01', nombre: 'Caja Chica' }),
  makeCuenta({ id: 'uuid-2', codigoInterno: '1.1.02', nombre: 'Banco BNB' }),
  makeCuenta({ id: 'uuid-3', codigoInterno: '4.1.01', nombre: 'Ventas nacionales' }),
];

const mockResponse: CuentaListResponse = {
  items: CUENTAS,
  total: 3,
  page: 1,
  pageSize: 100,
};

function setupMock(cuentas = mockResponse) {
  (useCuentas as ReturnType<typeof vi.fn>).mockReturnValue({
    data: cuentas,
    isLoading: false,
    isError: false,
  });
}

describe('CuentaAutocomplete', () => {
  it('renderiza el trigger con placeholder cuando no hay valor', () => {
    setupMock();
    render(<CuentaAutocomplete value="" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Seleccionar cuenta…')).toBeInTheDocument();
  });

  it('muestra la lista de cuentas al abrir el popover', async () => {
    setupMock();
    const user = userEvent.setup();
    render(<CuentaAutocomplete value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));

    expect(await screen.findByText('Caja Chica')).toBeInTheDocument();
    expect(screen.getByText('Banco BNB')).toBeInTheDocument();
    expect(screen.getByText('Ventas nacionales')).toBeInTheDocument();
  });

  it('filtra cuentas por texto de búsqueda', async () => {
    setupMock();
    const user = userEvent.setup();
    render(<CuentaAutocomplete value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText('Buscar por código o nombre…');
    await user.type(input, 'BNB');

    await waitFor(() => {
      expect(screen.getByText('Banco BNB')).toBeInTheDocument();
      expect(screen.queryByText('Caja Chica')).not.toBeInTheDocument();
    });
  });

  it('selección llama onChange con el id de la cuenta y cierra el popover', async () => {
    setupMock();
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CuentaAutocomplete value="" onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('Banco BNB'));

    expect(onChange).toHaveBeenCalledWith('uuid-2');
    // El popover debería cerrarse tras la selección
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Buscar por código o nombre…')).not.toBeInTheDocument();
    });
  });

  it('muestra nombre de la cuenta seleccionada en el trigger', () => {
    setupMock();
    render(<CuentaAutocomplete value="uuid-1" onChange={vi.fn()} />);
    expect(screen.getByText('Caja Chica')).toBeInTheDocument();
  });

  it('muestra el nombre antes que el código en el trigger (el nombre es prioritario)', () => {
    setupMock();
    render(<CuentaAutocomplete value="uuid-1" onChange={vi.fn()} />);
    const trigger = screen.getByRole('combobox');
    const texto = trigger.textContent ?? '';
    // El dominio habla el idioma del negocio: el contador lee "Caja Chica",
    // no "1.1.01". El nombre va primero; el código pasa a sufijo atenuado.
    expect(texto.indexOf('Caja Chica')).toBeLessThan(texto.indexOf('1.1.01'));
  });

  it('también muestra el código de la cuenta seleccionada en el trigger', () => {
    setupMock();
    render(<CuentaAutocomplete value="uuid-1" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('1.1.01');
  });

  it('expone código y nombre completos en el title del trigger (tooltip al hover)', () => {
    setupMock();
    render(<CuentaAutocomplete value="uuid-1" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('title', '1.1.01 · Caja Chica');
  });

  it('no pone title en el trigger cuando no hay cuenta seleccionada', () => {
    setupMock();
    render(<CuentaAutocomplete value="" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).not.toHaveAttribute('title');
  });

  it('muestra "Cargando…" cuando isLoading=true', () => {
    (useCuentas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    render(<CuentaAutocomplete value="" onChange={vi.fn()} />);
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });
});
