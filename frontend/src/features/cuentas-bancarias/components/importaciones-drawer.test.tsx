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

function mockImportaciones(items: ImportacionExtracto[], total = items.length): void {
  vi.mocked(useImportaciones).mockReturnValue({
    data: { items, total, page: 1, pageSize: 5 },
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

  it('muestra cuándo se subió el archivo, con hora de La Paz', () => {
    // createdAt es un instante real (UTC): 10:00Z son las 06:00 en Bolivia.
    mockImportaciones([importacion({ createdAt: '2026-07-01T10:00:00.000Z' })]);

    renderDrawer();

    expect(screen.getByText(/subido el 01\/07\/2026, 06:00/i)).toBeInTheDocument();
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

  it('pide la primera página con un tamaño chico, no el default de 50 del backend', () => {
    renderDrawer();

    expect(vi.mocked(useImportaciones)).toHaveBeenCalledWith('cb-1', {
      page: 1,
      pageSize: 5,
    });
  });

  it('con más de una página muestra la paginación y avanza', async () => {
    const user = userEvent.setup();
    mockImportaciones([importacion()], 25);

    renderDrawer();

    await user.click(screen.getByRole('button', { name: /página siguiente/i }));

    expect(vi.mocked(useImportaciones)).toHaveBeenLastCalledWith('cb-1', {
      page: 2,
      pageSize: 5,
    });
  });

  it('cambiar de cuenta vuelve a la página 1', async () => {
    // El drawer NO se desmonta al cerrarse: sin reseteo, quedar en la página 2 y
    // abrir otra cuenta con una sola página devolvía lista vacía y el empty state
    // afirmaba que nunca se importó nada.
    const user = userEvent.setup();
    mockImportaciones([importacion()], 25);

    const { rerender } = render(
      <TooltipProvider>
        <ImportacionesDrawer cuentaBancaria={CUENTA} open onOpenChange={vi.fn()} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: /página siguiente/i }));
    expect(vi.mocked(useImportaciones)).toHaveBeenLastCalledWith('cb-1', {
      page: 2,
      pageSize: 5,
    });

    rerender(
      <TooltipProvider>
        <ImportacionesDrawer
          cuentaBancaria={{ ...CUENTA, id: 'cb-2', alias: 'Caja de ahorro Unión' }}
          open
          onOpenChange={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(vi.mocked(useImportaciones)).toHaveBeenLastCalledWith('cb-2', {
      page: 1,
      pageSize: 5,
    });
  });

  it('con una sola página no renderiza la paginación', () => {
    mockImportaciones([importacion()], 1);

    renderDrawer();

    expect(screen.queryByRole('button', { name: /página siguiente/i })).not.toBeInTheDocument();
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

  it('cerrar y reabrir el drawer no deja el archivo anterior cargado por dentro', async () => {
    // Reportado en el smoke: el input volvía a decir "ningún archivo seleccionado"
    // (Radix desmonta el contenido) pero el File seguía en el estado del
    // componente, que NO se desmonta. El botón quedaba habilitado y al tocarlo se
    // volvía a subir el archivo de la sesión anterior.
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <TooltipProvider>
        <ImportacionesDrawer cuentaBancaria={CUENTA} open onOpenChange={onOpenChange} />
      </TooltipProvider>,
    );

    await user.upload(
      screen.getByLabelText(/archivo del extracto/i),
      new File(['contenido'], 'extracto.xlsx'),
    );
    expect(screen.getByRole('button', { name: /importar extracto/i })).toBeEnabled();

    // Cerrar por la vía real de Radix (overlay, X o Esc): todas llaman onOpenChange.
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(
      <TooltipProvider>
        <ImportacionesDrawer cuentaBancaria={CUENTA} open={false} onOpenChange={onOpenChange} />
      </TooltipProvider>,
    );
    rerender(
      <TooltipProvider>
        <ImportacionesDrawer cuentaBancaria={CUENTA} open onOpenChange={onOpenChange} />
      </TooltipProvider>,
    );

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

describe('ImportacionesDrawer — errores de importación', () => {
  it('el error se muestra en un panel fijo, no en un toast que se va solo', () => {
    vi.mocked(useImportarExtracto).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: true,
      error: {
        response: { data: { error: { code: 'CONCILIACION_ARCHIVO_XLS_LEGACY' } } },
      },
      data: undefined,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useImportarExtracto>);

    renderDrawer();

    // El mensaje es accionable: dice QUÉ hacer, no solo que falló.
    expect(screen.getByRole('alert')).toHaveTextContent(/guardalo como \.xlsx/i);
  });

  it('el input acepta .xls para que el backend pueda explicar por qué no sirve', () => {
    renderDrawer();

    // Filtrarlo en el picker dejaba el archivo en gris y sin explicación; se deja
    // pasar a propósito para que el backend lo detecte por magic bytes.
    //
    // Se asserta contra el MIME del .xls y NO contra la cadena ".xls": ".xlsx"
    // la contiene como substring, así que un `stringContaining('.xls')` pasaría
    // igual con el accept viejo y no probaría nada.
    const accept = screen.getByLabelText(/archivo del extracto/i).getAttribute('accept') ?? '';

    expect(accept.split(',')).toContain('.xls');
    expect(accept.split(',')).toContain('application/vnd.ms-excel');
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

  it('cambiar el archivo invalida el pedido de confirmación del archivo anterior', async () => {
    // El caso peligroso: el cartel pregunta por el número detectado en el archivo
    // A y el usuario cambia a B. Si el resultado sobrevive, "Sí, es esta cuenta"
    // manda B con confirmarNumeroCuenta y el backend graba en la cuenta el número
    // declarado por B, cuando en pantalla se confirmó el de A.
    const user = userEvent.setup();
    const reset = vi.fn();
    vi.mocked(useImportarExtracto).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      data: { requiereConfirmacionCuenta: true, numeroDetectado: '1191959-000-007' },
      reset,
    } as unknown as ReturnType<typeof useImportarExtracto>);

    renderDrawer();

    const input = screen.getByLabelText(/archivo del extracto/i);
    await user.upload(input, new File(['a'], 'extracto-A.xlsx'));
    expect(reset).toHaveBeenCalledTimes(1);

    await user.upload(input, new File(['b'], 'extracto-B.xlsx'));

    expect(reset).toHaveBeenCalledTimes(2);
  });

  it('mientras importa, el input de archivo queda bloqueado', () => {
    vi.mocked(useImportarExtracto).mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
      data: undefined,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useImportarExtracto>);

    renderDrawer();

    expect(screen.getByLabelText(/archivo del extracto/i)).toBeDisabled();
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
