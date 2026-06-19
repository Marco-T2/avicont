import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import * as exportExcelModule from '@/lib/export-excel';
import type { ConstruirReportePdfParams } from '@/lib/export-pdf';
import * as usePermissionsModule from '@/lib/use-permissions';
import type { LibroMayorResponse } from '@/types/api';

import { BotonExportarLibroMayorPdf } from './boton-exportar-libro-mayor-pdf';

// Mock del builder PDF genérico: evita cargar @react-pdf en jsdom y permite asertar la llamada.
// Se mockea el módulo COMPLETO (sin importActual) para que @react-pdf/renderer nunca entre a jsdom.
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
    permissions: tiene ? ['contabilidad.libro-mayor.read'] : [],
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

const dataValida: LibroMayorResponse = {
  rango: { fechaDesde: '2026-06-01', fechaHasta: '2026-06-30' },
  totalDebeBob: '1000.00',
  totalHaberBob: '1000.00',
  cuentas: [
    {
      cuentaId: 'c1',
      codigoInterno: '1101',
      nombreCuenta: 'Caja',
      naturaleza: 'DEUDORA',
      saldoInicialBob: '0.00',
      saldoFinalBob: '1000.00',
      totalDebeBob: '1000.00',
      totalHaberBob: '0.00',
      movimientos: [
        {
          comprobanteId: 'cp1',
          numeroComprobante: 'I2606-000001',
          fechaContable: '2026-06-10',
          glosa: 'Venta',
          glosaLinea: null,
          estado: 'CONTABILIZADO',
          anulado: false,
          orden: 1,
          debeBob: '1000.00',
          haberBob: '0.00',
          saldoCorrienteBob: '1000.00',
        },
      ],
    },
  ],
};

describe('BotonExportarLibroMayorPdf', () => {
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
        <BotonExportarLibroMayorPdf data={dataValida} perfil={null} rango="2026-06" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a pdf/i })).toBeInTheDocument();
  });

  it('el botón está deshabilitado cuando data es undefined (Anti-F-07)', () => {
    mockPermissions(true);
    render(
      <Wrapper>
        <BotonExportarLibroMayorPdf data={undefined} perfil={null} rango="2026-06" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a pdf/i })).toBeDisabled();
  });

  it('está gateado por contabilidad.libro-mayor.read (deshabilitado con tooltip sin permiso)', async () => {
    mockPermissions(false);
    const user = userEvent.setup();
    render(
      <Wrapper>
        <BotonExportarLibroMayorPdf data={dataValida} perfil={null} rango="2026-06" />
      </Wrapper>,
    );
    const btn = screen.getByRole('button', { name: /exportar a pdf/i });
    expect(btn).toBeDisabled();
    await user.hover(btn.parentElement!);
    const tooltipContent = await screen.findAllByText(/permiso/i);
    expect(tooltipContent.length).toBeGreaterThanOrEqual(1);
  });

  it('construye el PDF portrait y dispara la descarga .pdf al hacer clic', async () => {
    mockPermissions(true);
    const user = userEvent.setup();
    const descargarSpy = vi
      .spyOn(exportExcelModule, 'descargarBlob')
      .mockImplementation(() => undefined);

    render(
      <Wrapper>
        <BotonExportarLibroMayorPdf data={dataValida} perfil={null} rango="2026-06" />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: /exportar a pdf/i }));

    await waitFor(() => {
      expect(construirReportePdfMock).toHaveBeenCalledOnce();
      expect(descargarSpy).toHaveBeenCalledOnce();
    });

    const params = construirReportePdfMock.mock.calls[0]?.[0];
    expect(params?.titulo).toBe('Libro Mayor');
    expect(params?.subtitulo).toBe('Del 01/06/2026 al 30/06/2026');
    expect(params?.orientacion).toBe('portrait');
    // La cabecera fiscal va por perfil, no en las filas: fila 0 son los encabezados de columna.
    expect(params?.perfil).toBeDefined();
    expect(params?.filas[0]?.[0]).toMatchObject({ type: 'texto', value: 'Fecha' });

    const [, nombreArg] = descargarSpy.mock.calls[0] as [Blob, string];
    expect(nombreArg).toMatch(/\.pdf$/);
    expect(nombreArg).toContain('libro-mayor');
    expect(nombreArg).toContain('2026-06');
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
        <BotonExportarLibroMayorPdf data={dataValida} perfil={null} rango="2026-06" />
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
        <BotonExportarLibroMayorPdf data={dataValida} perfil={null} rango="2026-06" />
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
