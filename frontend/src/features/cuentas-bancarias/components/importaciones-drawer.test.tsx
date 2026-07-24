import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { CuentaBancaria, ImportacionExtracto } from '@/types/api';

vi.mock('../hooks/use-importaciones', () => ({ useImportaciones: vi.fn() }));
vi.mock('../hooks/use-importar-extracto', () => ({ useImportarExtracto: vi.fn() }));

const { hasMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fija la firma para los tests que la sobreescriben.
  hasMock: vi.fn((_p: string) => true),
}));

vi.mock('@/lib/use-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-permissions')>()),
  usePermissions: () => ({
    has: hasMock,
    hasAll: (perms: string[]) => perms.every((p) => hasMock(p)),
    isOwner: false,
    permissions: [],
  }),
}));

import { useImportaciones } from '../hooks/use-importaciones';
import { useImportarExtracto } from '../hooks/use-importar-extracto';

import { ImportacionesDrawer } from './importaciones-drawer';

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

function importacion(overrides: Partial<ImportacionExtracto> = {}): ImportacionExtracto {
  return {
    id: 'imp-1',
    nombreArchivo: 'extracto-junio.xlsx',
    sha256Archivo: 'abc123',
    tamanioBytes: 20480,
    perfilExtracto: 'BANCOSOL_XLSX',
    fechaDesde: '2026-06-01T00:00:00.000Z',
    fechaHasta: '2026-06-30T00:00:00.000Z',
    coberturaDeclarada: true,
    saldoInicial: '1000.00',
    saldoFinal: '2500.00',
    estadoVerificacion: 'VERIFICADO',
    diferencia: null,
    filasLeidas: 42,
    movimientosNuevos: 40,
    movimientosDuplicados: 2,
    importadoPorUserId: 'user-1',
    createdAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

function mockImportaciones(items: ImportacionExtracto[]): void {
  vi.mocked(useImportaciones).mockReturnValue({
    data: { items, total: items.length, page: 1, pageSize: 20 },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useImportaciones>);
}

function renderDrawer(cuentaBancaria: CuentaBancaria | null = CUENTA) {
  render(
    <TooltipProvider>
      <ImportacionesDrawer
        cuentaBancaria={cuentaBancaria}
        open={cuentaBancaria !== null}
        onOpenChange={vi.fn()}
      />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  hasMock.mockReset();
  hasMock.mockReturnValue(true);
  mockImportaciones([importacion()]);
  vi.mocked(useImportarExtracto).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    data: undefined,
    reset: vi.fn(),
  } as unknown as ReturnType<typeof useImportarExtracto>);
});

describe('ImportacionesDrawer — historial (GET /:id/importaciones)', () => {
  it('muestra el alias de la cuenta en el encabezado', () => {
    renderDrawer();

    expect(screen.getByText(/cuenta corriente bancosol/i)).toBeInTheDocument();
  });

  it('lista el archivo importado con su rango de fechas', () => {
    mockImportaciones([importacion({ nombreArchivo: 'extracto-mayo.xlsx' })]);

    renderDrawer();

    expect(screen.getByText('extracto-mayo.xlsx')).toBeInTheDocument();
    expect(screen.getByText(/01\/06\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/30\/06\/2026/)).toBeInTheDocument();
  });

  it('muestra los contadores de la importación (nuevos y duplicados)', () => {
    mockImportaciones([importacion({ movimientosNuevos: 40, movimientosDuplicados: 2 })]);

    renderDrawer();

    expect(screen.getByText(/40 nuevos/i)).toBeInTheDocument();
    expect(screen.getByText(/2 ya existían/i)).toBeInTheDocument();
  });

  it('muestra el estado de verificación del checksum', () => {
    mockImportaciones([importacion({ estadoVerificacion: 'DESCUADRE', diferencia: '15.00' })]);

    renderDrawer();

    expect(screen.getByText(/descuadre/i)).toBeInTheDocument();
  });

  it('sin importaciones muestra un empty state', () => {
    mockImportaciones([]);

    renderDrawer();

    expect(screen.getByText(/todavía no importaste/i)).toBeInTheDocument();
  });
});

describe('ImportacionesDrawer — gating de la acción de importar (REQ-CB-14)', () => {
  // Se elige archivo en ambos casos para que el permiso sea la ÚNICA variable:
  // sin archivo el botón está deshabilitado igual y el test no probaría nada.
  async function elegirArchivo(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.upload(
      screen.getByLabelText(/archivo del extracto/i),
      new File(['contenido'], 'extracto.xlsx'),
    );
  }

  it('con permiso de importar y archivo elegido, el botón está habilitado', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await elegirArchivo(user);

    expect(screen.getByRole('button', { name: /importar extracto/i })).toBeEnabled();
  });

  it('sin permiso de importar el botón queda deshabilitado aunque haya archivo', async () => {
    const user = userEvent.setup();
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.conciliacion.importar');

    renderDrawer();

    await elegirArchivo(user);

    expect(screen.getByRole('button', { name: /importar extracto/i })).toBeDisabled();
  });
});

describe('ImportacionesDrawer — subida del archivo', () => {
  it('elegir un archivo y confirmar dispara la importación con la cuenta correcta', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    vi.mocked(useImportarExtracto).mockReturnValue({
      mutate,
      isPending: false,
      data: undefined,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useImportarExtracto>);

    renderDrawer();

    const archivo = new File(['contenido'], 'extracto.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await user.upload(screen.getByLabelText(/archivo del extracto/i), archivo);
    await user.click(screen.getByRole('button', { name: /importar extracto/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ cuentaBancariaId: 'cb-1', file: archivo }),
      expect.anything(),
    );
  });

  it('sin archivo elegido el botón de importar está deshabilitado', () => {
    renderDrawer();

    expect(screen.getByRole('button', { name: /importar extracto/i })).toBeDisabled();
  });

  it('mientras importa, el botón queda deshabilitado (Anti-F-07)', () => {
    vi.mocked(useImportarExtracto).mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
      data: undefined,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useImportarExtracto>);

    renderDrawer();

    expect(screen.getByRole('button', { name: /importando/i })).toBeDisabled();
  });
});

describe('ImportacionesDrawer — confirmación del número de cuenta (REQ-CB-16)', () => {
  it('cuando el backend pide confirmar, muestra el número detectado y NO importó nada todavía', () => {
    vi.mocked(useImportarExtracto).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      data: { requiereConfirmacionCuenta: true, numeroDetectado: '1191959-000-007' },
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useImportarExtracto>);

    renderDrawer();

    expect(screen.getByText(/1191959-000-007/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sí, es esta cuenta/i })).toBeInTheDocument();
  });

  it('confirmar re-envía la importación con confirmarNumeroCuenta', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    vi.mocked(useImportarExtracto).mockReturnValue({
      mutate,
      isPending: false,
      data: { requiereConfirmacionCuenta: true, numeroDetectado: '1191959-000-007' },
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useImportarExtracto>);

    renderDrawer();

    const archivo = new File(['contenido'], 'extracto.xlsx');
    await user.upload(screen.getByLabelText(/archivo del extracto/i), archivo);
    await user.click(screen.getByRole('button', { name: /sí, es esta cuenta/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ cuentaBancariaId: 'cb-1', confirmarNumeroCuenta: true }),
      expect.anything(),
    );
  });

  it('un resultado importado muestra el resumen de la operación', () => {
    vi.mocked(useImportarExtracto).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      data: {
        requiereConfirmacionCuenta: false,
        importacionId: 'imp-2',
        movimientosNuevos: 12,
        movimientosDuplicados: 3,
        filasLeidas: 15,
        estadoVerificacion: 'VERIFICADO',
        diferencia: null,
        advertencias: [],
      },
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useImportarExtracto>);

    renderDrawer();

    expect(screen.getByText(/12 movimientos nuevos/i)).toBeInTheDocument();
    expect(screen.getByText(/3 ya existían/i)).toBeInTheDocument();
  });

  it('las advertencias de la importación se muestran, no se tragan', () => {
    vi.mocked(useImportarExtracto).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      data: {
        requiereConfirmacionCuenta: false,
        importacionId: 'imp-2',
        movimientosNuevos: 12,
        movimientosDuplicados: 0,
        filasLeidas: 12,
        estadoVerificacion: 'SIN_VERIFICAR',
        diferencia: null,
        advertencias: [
          { codigo: 'NUMERO_CUENTA_NO_EXPUESTO', mensaje: 'El archivo no declara número de cuenta' },
        ],
      },
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useImportarExtracto>);

    renderDrawer();

    expect(screen.getByText('El archivo no declara número de cuenta')).toBeInTheDocument();
  });
});
