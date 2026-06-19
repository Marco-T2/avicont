import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import * as exportExcelModule from '@/lib/export-excel';
import type { ConstruirReportePdfParams } from '@/lib/export-pdf';
import * as usePermissionsModule from '@/lib/use-permissions';

import * as exportApi from '../api/export-comprobantes';
import { BotonExportarComprobantesPdf } from './boton-exportar-comprobantes-pdf';

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
    permissions: tiene ? ['contabilidad.asientos.read'] : [],
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

describe('BotonExportarComprobantesPdf', () => {
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
        <BotonExportarComprobantesPdf filtros={{}} perfil={null} rango="todos" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a pdf/i })).toBeInTheDocument();
  });

  it('está gateado por contabilidad.asientos.read (deshabilitado con tooltip sin permiso)', async () => {
    mockPermissions(false);
    const user = userEvent.setup();
    render(
      <Wrapper>
        <BotonExportarComprobantesPdf filtros={{}} perfil={null} rango="todos" />
      </Wrapper>,
    );
    const btn = screen.getByRole('button', { name: /exportar a pdf/i });
    expect(btn).toBeDisabled();
    await user.hover(btn.parentElement!);
    const tooltipContent = await screen.findAllByText(/permiso/i);
    expect(tooltipContent.length).toBeGreaterThanOrEqual(1);
  });

  it('fetchea on-demand, construye PDF landscape y descarga .pdf', async () => {
    mockPermissions(true);
    const user = userEvent.setup();
    vi.spyOn(exportApi, 'exportComprobantes').mockResolvedValue({ items: [] });
    const descargarSpy = vi
      .spyOn(exportExcelModule, 'descargarBlob')
      .mockImplementation(() => undefined);

    render(
      <Wrapper>
        <BotonExportarComprobantesPdf filtros={{}} perfil={null} rango="2026-04" />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: /exportar a pdf/i }));

    await waitFor(() => {
      expect(exportApi.exportComprobantes).toHaveBeenCalledOnce();
      expect(construirReportePdfMock).toHaveBeenCalledOnce();
      expect(descargarSpy).toHaveBeenCalledOnce();
    });

    const params = construirReportePdfMock.mock.calls[0]?.[0];
    expect(params?.titulo).toBe('Comprobantes');
    expect(params?.orientacion).toBe('landscape');
    expect(params?.filas[0]?.[0]).toMatchObject({ type: 'texto', value: 'Fecha' });

    const [, nombreArg] = descargarSpy.mock.calls[0] as [Blob, string];
    expect(nombreArg).toMatch(/\.pdf$/);
    expect(nombreArg).toContain('comprobantes');
  });

  it('pasa los filtros activos a exportComprobantes', async () => {
    mockPermissions(true);
    const user = userEvent.setup();
    vi.spyOn(exportApi, 'exportComprobantes').mockResolvedValue({ items: [] });
    vi.spyOn(exportExcelModule, 'descargarBlob').mockImplementation(() => undefined);

    const filtros = { tipo: 'DIARIO' as const, estado: 'CONTABILIZADO' as const };

    render(
      <Wrapper>
        <BotonExportarComprobantesPdf filtros={filtros} perfil={null} rango="2026-04" />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: /exportar a pdf/i }));
    await waitFor(() => {
      expect(exportApi.exportComprobantes).toHaveBeenCalledWith(filtros);
    });
  });

  it('un fallo del fetch dispara toast.error y no rompe (Anti-F-13)', async () => {
    mockPermissions(true);
    const user = userEvent.setup();
    vi.spyOn(exportApi, 'exportComprobantes').mockRejectedValue(new Error('boom'));

    render(
      <Wrapper>
        <BotonExportarComprobantesPdf filtros={{}} perfil={null} rango="todos" />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: /exportar a pdf/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledOnce();
    });
    expect(construirReportePdfMock).not.toHaveBeenCalled();
  });

  it('muestra "Generando…" y deshabilita el botón mientras procesa, luego vuelve a "Exportar a PDF"', async () => {
    mockPermissions(true);
    const user = userEvent.setup();
    vi.spyOn(exportApi, 'exportComprobantes').mockResolvedValue({ items: [] });
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
        <BotonExportarComprobantesPdf filtros={{}} perfil={null} rango="todos" />
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
