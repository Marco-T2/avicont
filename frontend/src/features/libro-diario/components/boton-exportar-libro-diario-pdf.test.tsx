import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import * as exportExcelModule from '@/lib/export-excel';
import type { ConstruirReportePdfParams } from '@/lib/export-pdf';
import * as usePermissionsModule from '@/lib/use-permissions';
import type { LibroDiarioResponse } from '@/types/api';

import { BotonExportarLibroDiarioPdf } from './boton-exportar-libro-diario-pdf';

// Mock de la infra react-pdf: evita cargar el motor pesado en jsdom y permite asertar la llamada.
const construirReportePdfMock = vi.fn<(params: ConstruirReportePdfParams) => Promise<Blob>>();
vi.mock('@/lib/export-pdf', () => ({
  construirReportePdf: (params: ConstruirReportePdfParams) => construirReportePdfMock(params),
}));

function mockPermissions(tiene: boolean) {
  const has = vi.fn(() => tiene);
  vi.spyOn(usePermissionsModule, 'usePermissions').mockReturnValue({
    isOwner: false,
    isLoading: false,
    permissions: tiene ? ['contabilidad.libro-diario.read'] : [],
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

const dataValida: LibroDiarioResponse = {
  rango: { fechaDesde: '2026-06-01', fechaHasta: '2026-06-30' },
  asientos: [
    {
      id: 'a1',
      fechaContable: '2026-06-10',
      numero: 'I2606-000001',
      tipo: 'INGRESO',
      estado: 'CONTABILIZADO',
      glosa: 'Venta',
      anulado: false,
      lineas: [
        {
          codigoCuenta: '1101',
          nombreCuenta: 'Caja',
          glosa: 'Ingreso',
          debeBob: '1000.00',
          haberBob: '0.00',
        },
      ],
    },
  ],
  totalDebeBob: '1000.00',
  totalHaberBob: '1000.00',
};

describe('BotonExportarLibroDiarioPdf', () => {
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
  });

  it('muestra "Exportar a PDF" como texto del botón', () => {
    mockPermissions(true);
    render(
      <Wrapper>
        <BotonExportarLibroDiarioPdf data={dataValida} perfil={null} rango="2026-06" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a pdf/i })).toBeInTheDocument();
  });

  it('el botón está deshabilitado cuando data es undefined', () => {
    mockPermissions(true);
    render(
      <Wrapper>
        <BotonExportarLibroDiarioPdf data={undefined} perfil={null} rango="2026-06" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a pdf/i })).toBeDisabled();
  });

  it('el botón está deshabilitado con tooltip cuando falta el permiso', async () => {
    mockPermissions(false);
    const user = userEvent.setup();
    render(
      <Wrapper>
        <BotonExportarLibroDiarioPdf data={dataValida} perfil={null} rango="2026-06" />
      </Wrapper>,
    );
    const btn = screen.getByRole('button', { name: /exportar a pdf/i });
    expect(btn).toBeDisabled();
    await user.hover(btn.parentElement!);
    const tooltipContent = await screen.findAllByText(/permiso/i);
    expect(tooltipContent.length).toBeGreaterThanOrEqual(1);
  });

  it('construye el PDF y dispara la descarga .pdf al hacer clic (con datos y permiso)', async () => {
    mockPermissions(true);
    const user = userEvent.setup();
    const descargarSpy = vi
      .spyOn(exportExcelModule, 'descargarBlob')
      .mockImplementation(() => undefined);

    render(
      <Wrapper>
        <BotonExportarLibroDiarioPdf data={dataValida} perfil={null} rango="2026-06" />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: /exportar a pdf/i }));

    await waitFor(() => {
      expect(construirReportePdfMock).toHaveBeenCalledOnce();
      expect(descargarSpy).toHaveBeenCalledOnce();
    });

    // construirReportePdf recibe el informe en landscape con el título correcto
    const params = construirReportePdfMock.mock.calls[0]?.[0];
    expect(params?.titulo).toBe('Libro Diario');
    expect(params?.orientacion).toBe('landscape');

    // descargarBlob recibe el blob y un nombre .pdf con el rango
    const [, nombreArg] = descargarSpy.mock.calls[0] as [Blob, string];
    expect(nombreArg).toMatch(/\.pdf$/);
    expect(nombreArg).toContain('libro-diario');
    expect(nombreArg).toContain('2026-06');
  });
});
