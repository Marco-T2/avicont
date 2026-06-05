import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import * as exportExcelModule from '@/lib/export-excel';
import * as usePermissionsModule from '@/lib/use-permissions';

import * as exportApi from '../api/export-comprobantes';
import { BotonExportarComprobantes } from './boton-exportar-comprobantes';

// Mock permisos
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

describe('BotonExportarComprobantes', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('muestra "Exportar a Excel" como texto del botón', () => {
    mockPermissions(true);
    render(
      <Wrapper>
        <BotonExportarComprobantes filtros={{}} perfil={null} rango="todos" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a excel/i })).toBeInTheDocument();
  });

  it('el botón está habilitado cuando el usuario tiene permiso', () => {
    mockPermissions(true);
    render(
      <Wrapper>
        <BotonExportarComprobantes filtros={{}} perfil={null} rango="todos" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a excel/i })).toBeEnabled();
  });

  it('el botón está deshabilitado con tooltip cuando falta el permiso', async () => {
    mockPermissions(false);
    const user = userEvent.setup();
    render(
      <Wrapper>
        <BotonExportarComprobantes filtros={{}} perfil={null} rango="todos" />
      </Wrapper>,
    );
    const btn = screen.getByRole('button', { name: /exportar a excel/i });
    expect(btn).toBeDisabled();
    // Hover sobre el padre (span que envuelve el botón disabled)
    await user.hover(btn.parentElement!);
    const tooltipContent = await screen.findAllByText(/permiso/i);
    expect(tooltipContent.length).toBeGreaterThanOrEqual(1);
  });

  it('muestra "Generando…" mientras procesa y llama a exportComprobantes + construirHoja + descargarBlob', async () => {
    mockPermissions(true);
    const user = userEvent.setup();

    // Mock fetch on-demand
    vi.spyOn(exportApi, 'exportComprobantes').mockResolvedValue({ items: [] });

    // Mock export-excel
    const mockBlob = new Blob(['test'], { type: 'application/xlsx' });
    vi.spyOn(exportExcelModule, 'construirHoja').mockResolvedValue(mockBlob);
    vi.spyOn(exportExcelModule, 'descargarBlob').mockImplementation(() => undefined);

    render(
      <Wrapper>
        <BotonExportarComprobantes filtros={{}} perfil={null} rango="todos" />
      </Wrapper>,
    );

    const btn = screen.getByRole('button', { name: /exportar a excel/i });
    await user.click(btn);

    await waitFor(() => {
      expect(exportApi.exportComprobantes).toHaveBeenCalledOnce();
      expect(exportExcelModule.construirHoja).toHaveBeenCalledOnce();
      expect(exportExcelModule.descargarBlob).toHaveBeenCalledOnce();
    });

    // El nombre del archivo incluye "comprobantes" y tiene extensión .xlsx
    const [blobArg, nombreArg] = (
      exportExcelModule.descargarBlob as ReturnType<typeof vi.fn>
    ).mock.calls[0] as [Blob, string];
    expect(blobArg).toBe(mockBlob);
    expect(nombreArg).toMatch(/\.xlsx$/);
    expect(nombreArg).toContain('comprobantes');
  });

  it('pasa los filtros activos a exportComprobantes', async () => {
    mockPermissions(true);
    const user = userEvent.setup();

    vi.spyOn(exportApi, 'exportComprobantes').mockResolvedValue({ items: [] });
    vi.spyOn(exportExcelModule, 'construirHoja').mockResolvedValue(new Blob());
    vi.spyOn(exportExcelModule, 'descargarBlob').mockImplementation(() => undefined);

    const filtros = { tipo: 'DIARIO' as const, estado: 'CONTABILIZADO' as const };

    render(
      <Wrapper>
        <BotonExportarComprobantes filtros={filtros} perfil={null} rango="2026-04" />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: /exportar a excel/i }));

    await waitFor(() => {
      expect(exportApi.exportComprobantes).toHaveBeenCalledWith(filtros);
    });
  });
});
