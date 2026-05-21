import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import type { Cuenta } from '@/types/api';

import { CuentaForm } from './cuenta-form';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}));

const mockedGet = api.get as unknown as ReturnType<typeof vi.fn>;

function wrapper(): (props: { children: React.ReactNode }) => React.JSX.Element {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const SAMPLE: Cuenta = {
  id: 'c1',
  organizationId: 't1',
  codigoInterno: '1.1.1.001',
  nombre: 'CAJA',
  descripcion: 'Caja chica oficina',
  claseCuenta: 'ACTIVO',
  subClaseCuenta: 'ACTIVO_CORRIENTE',
  naturaleza: 'DEUDORA',
  parentId: null,
  nivel: 4,
  esDetalle: true,
  requiereContacto: false,
  esContraria: false,
  activa: true,
  monedaFuncional: 'BOB',
  permiteMultiMoneda: true,
  esSystemSeed: false,
  esRequeridaSistema: false,
  createdAt: '2026-04-23T00:00:00.000Z',
  updatedAt: '2026-04-23T00:00:00.000Z',
};

describe('CuentaForm', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedGet.mockResolvedValue({ data: [] }); // useCuentaTree vacío por default
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('en modo create renderiza todos los campos habilitados', () => {
    render(
      <CuentaForm
        mode="create"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
      { wrapper: wrapper() },
    );
    const codigo = screen.getByPlaceholderText('1.1.1.001');
    expect(codigo).not.toBeDisabled();
  });

  it('en modo edit deshabilita los campos estructurales', () => {
    render(
      <CuentaForm
        mode="edit"
        initialData={SAMPLE}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
      { wrapper: wrapper() },
    );
    // codigoInterno disabled (inmutable post-creación)
    const codigo = screen.getByPlaceholderText('1.1.1.001');
    expect(codigo).toBeDisabled();
    // El hint de inmutabilidad debe estar visible.
    expect(
      screen.getByText(/inmutable post-creación.*identificador único/i),
    ).toBeInTheDocument();
  });

  it('el botón de submit muestra "Crear cuenta" en create y "Guardar cambios" en edit', () => {
    const { rerender } = render(
      <CuentaForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />,
      { wrapper: wrapper() },
    );
    expect(
      screen.getByRole('button', { name: /crear cuenta/i }),
    ).toBeInTheDocument();

    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <CuentaForm
          mode="edit"
          initialData={SAMPLE}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole('button', { name: /guardar cambios/i }),
    ).toBeInTheDocument();
  });
});
