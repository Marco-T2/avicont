import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import * as exportExcelModule from '@/lib/export-excel';
import type { ConstruirReportePdfParams } from '@/lib/export-pdf';
import * as usePermissionsModule from '@/lib/use-permissions';
import type { BalanceComprobacionResponse } from '@/types/api';

import { BotonExportarBalanceComprobacionPdf } from './boton-exportar-balance-comprobacion-pdf';

const construirReportePdfMock = vi.fn<(params: ConstruirReportePdfParams) => Promise<Blob>>();
vi.mock('@/lib/export-pdf', () => ({
  construirReportePdf: (params: ConstruirReportePdfParams) => construirReportePdfMock(params),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

function mockPermissions(tiene: boolean) {
  const has = vi.fn(() => tiene);
  vi.spyOn(usePermissionsModule, 'usePermissions').mockReturnValue({
    isOwner: false,
    isLoading: false,
    permissions: tiene ? ['contabilidad.eeff.read'] : [],
    has,
    hasAll: (perms: string[]) => perms.every(has),
  } as unknown as ReturnType<typeof usePermissionsModule.usePermissions>);
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

function crearData(
  overrides?: Partial<BalanceComprobacionResponse>,
): BalanceComprobacionResponse {
  return {
    fechaDesde: '2026-04-01',
    fechaHasta: '2026-04-30',
    lineas: [
      {
        cuentaId: 'c1',
        codigoInterno: '1101',
        nombre: 'Caja',
        naturaleza: 'DEUDORA',
        sumasDebito: '1000.00',
        sumasCredito: '300.00',
        saldoDeudor: '700.00',
        saldoAcreedor: '0.00',
      },
    ],
    totalSumasDebito: '1000.00',
    totalSumasCredito: '1000.00',
    totalSaldoDeudor: '700.00',
    totalSaldoAcreedor: '700.00',
    cuadra: true,
    diferenciaSumas: '0.00',
    diferenciaSaldos: '0.00',
    cuentasNaturalezaOpuesta: [],
    ...overrides,
  };
}

describe('BotonExportarBalanceComprobacionPdf', () => {
  beforeEach(() => {
    construirReportePdfMock.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    construirReportePdfMock.mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('muestra "Exportar a PDF" como texto del botón', () => {
    mockPermissions(true);
    render(
      <Wrapper>
        <BotonExportarBalanceComprobacionPdf data={crearData()} perfil={null} rango="2026-04" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a pdf/i })).toBeInTheDocument();
  });

  it('el botón está deshabilitado cuando data es undefined (Anti-F-07)', () => {
    mockPermissions(true);
    render(
      <Wrapper>
        <BotonExportarBalanceComprobacionPdf data={undefined} perfil={null} rango="2026-04" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a pdf/i })).toBeDisabled();
  });

  it('está gateado por contabilidad.eeff.read (deshabilitado con tooltip sin permiso)', async () => {
    mockPermissions(false);
    const user = userEvent.setup();
    render(
      <Wrapper>
        <BotonExportarBalanceComprobacionPdf data={crearData()} perfil={null} rango="2026-04" />
      </Wrapper>,
    );
    const btn = screen.getByRole('button', { name: /exportar a pdf/i });
    expect(btn).toBeDisabled();
    await user.hover(btn.parentElement!);
    const tooltipContent = await screen.findAllByText(/permiso/i);
    expect(tooltipContent.length).toBeGreaterThanOrEqual(1);
  });

  it('construye el PDF portrait con totales + cuadre y descarga .pdf', async () => {
    mockPermissions(true);
    const user = userEvent.setup();
    const descargarSpy = vi
      .spyOn(exportExcelModule, 'descargarBlob')
      .mockImplementation(() => undefined);

    render(
      <Wrapper>
        <BotonExportarBalanceComprobacionPdf data={crearData()} perfil={null} rango="2026-04" />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: /exportar a pdf/i }));

    await waitFor(() => {
      expect(construirReportePdfMock).toHaveBeenCalledOnce();
      expect(descargarSpy).toHaveBeenCalledOnce();
    });

    const params = construirReportePdfMock.mock.calls[0]?.[0];
    expect(params?.titulo).toBe('Balance de Comprobación');
    expect(params?.orientacion).toBe('portrait');
    expect(params?.filas[0]?.[0]).toMatchObject({ type: 'texto', value: 'Código' });
    const valores = params!.filas.flatMap((f) => f).map((c) => c.value);
    expect(valores).toContain('TOTALES');
    expect(valores.some((v) => typeof v === 'string' && v.includes('Cuadra'))).toBe(true);

    const [, nombreArg] = descargarSpy.mock.calls[0] as [Blob, string];
    expect(nombreArg).toMatch(/\.pdf$/);
    expect(nombreArg).toContain('balance-comprobacion');
  });

  it('incluye la sección de naturaleza opuesta solo cuando hay cuentas a revisar', async () => {
    mockPermissions(true);
    const user = userEvent.setup();
    vi.spyOn(exportExcelModule, 'descargarBlob').mockImplementation(() => undefined);

    render(
      <Wrapper>
        <BotonExportarBalanceComprobacionPdf
          data={crearData({
            cuentasNaturalezaOpuesta: [
              {
                cuentaId: 'c9',
                codigoInterno: '1105',
                nombre: 'Anticipo a proveedores',
                naturaleza: 'DEUDORA',
                saldoOpuesto: '150.00',
              },
            ],
          })}
          perfil={null}
          rango="2026-04"
        />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: /exportar a pdf/i }));

    await waitFor(() => expect(construirReportePdfMock).toHaveBeenCalledOnce());
    const params = construirReportePdfMock.mock.calls[0]?.[0];
    const valores = params!.filas.flatMap((f) => f).map((c) => c.value);
    expect(valores.some((v) => typeof v === 'string' && v.includes('NATURALEZA OPUESTA'))).toBe(
      true,
    );
  });

  it('si el builder PDF falla, dispara toast.error y no rompe (Anti-F-13)', async () => {
    mockPermissions(true);
    const user = userEvent.setup();
    construirReportePdfMock.mockRejectedValueOnce(new Error('boom'));
    const descargarSpy = vi
      .spyOn(exportExcelModule, 'descargarBlob')
      .mockImplementation(() => undefined);

    render(
      <Wrapper>
        <BotonExportarBalanceComprobacionPdf data={crearData()} perfil={null} rango="2026-04" />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: /exportar a pdf/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledOnce();
    });
    expect(descargarSpy).not.toHaveBeenCalled();
    // El botón vuelve a su estado normal (finally resetea generando).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /exportar a pdf/i })).not.toBeDisabled();
    });
  });

  it('muestra "Generando…" y deshabilita el botón mientras procesa, luego vuelve a "Exportar a PDF"', async () => {
    mockPermissions(true);
    const user = userEvent.setup();
    vi.spyOn(exportExcelModule, 'descargarBlob').mockImplementation(() => undefined);

    let resolverPdf: (blob: Blob) => void = () => undefined;
    construirReportePdfMock.mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          resolverPdf = resolve;
        }),
    );

    render(
      <Wrapper>
        <BotonExportarBalanceComprobacionPdf data={crearData()} perfil={null} rango="2026-04" />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: /exportar a pdf/i }));

    const generando = await screen.findByRole('button', { name: /generando…/i });
    expect(generando).toBeDisabled();

    resolverPdf(new Blob(['pdf'], { type: 'application/pdf' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /exportar a pdf/i })).not.toBeDisabled();
    });
  });
});
