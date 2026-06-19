import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import * as exportExcelModule from '@/lib/export-excel';
import * as usePermissionsModule from '@/lib/use-permissions';
import type { LibroDiarioResponse } from '@/types/api';

import { BotonExportarLibroDiario } from './boton-exportar-libro-diario';

// Helper para mockear permisos
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
      totalDebeBob: '0.00',
      totalHaberBob: '0.00',
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

describe('BotonExportarLibroDiario', () => {
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
    // §1: UI en español
    mockPermissions(true);
    render(
      <Wrapper>
        <BotonExportarLibroDiario data={dataValida} perfil={null} rango="2026-06" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a excel/i })).toBeInTheDocument();
  });

  it('el botón está deshabilitado cuando data es undefined', () => {
    mockPermissions(true);
    render(
      <Wrapper>
        <BotonExportarLibroDiario data={undefined} perfil={null} rango="2026-06" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a excel/i })).toBeDisabled();
  });

  it('el botón está habilitado cuando hay data (con permiso)', () => {
    mockPermissions(true);
    render(
      <Wrapper>
        <BotonExportarLibroDiario data={dataValida} perfil={null} rango="2026-06" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a excel/i })).toBeEnabled();
  });

  it('el botón está deshabilitado con tooltip cuando falta el permiso', async () => {
    mockPermissions(false);
    const user = userEvent.setup();
    render(
      <Wrapper>
        <BotonExportarLibroDiario data={dataValida} perfil={null} rango="2026-06" />
      </Wrapper>,
    );
    const btn = screen.getByRole('button', { name: /exportar a excel/i });
    expect(btn).toBeDisabled();
    // Hover sobre el padre (span que envuelve el botón disabled)
    await user.hover(btn.parentElement!);
    const tooltipContent = await screen.findAllByText(/permiso/i);
    expect(tooltipContent.length).toBeGreaterThanOrEqual(1);
  });

  it('llama a construirHoja y descargarBlob al hacer clic (con datos y permiso)', async () => {
    mockPermissions(true);
    const user = userEvent.setup();

    // Mock construirHoja y descargarBlob
    const mockBlob = new Blob(['test'], { type: 'application/xlsx' });
    vi.spyOn(exportExcelModule, 'construirHoja').mockResolvedValue(mockBlob);
    vi.spyOn(exportExcelModule, 'descargarBlob').mockImplementation(() => undefined);

    render(
      <Wrapper>
        <BotonExportarLibroDiario data={dataValida} perfil={null} rango="2026-06" />
      </Wrapper>,
    );

    const btn = screen.getByRole('button', { name: /exportar a excel/i });
    await user.click(btn);

    await waitFor(() => {
      expect(exportExcelModule.construirHoja).toHaveBeenCalledOnce();
      expect(exportExcelModule.descargarBlob).toHaveBeenCalledOnce();
    });

    // Verifica que descargarBlob se llamó con el blob y un nombre .xlsx
    const [blobArg, nombreArg] = (exportExcelModule.descargarBlob as ReturnType<typeof vi.fn>).mock.calls[0] as [Blob, string];
    expect(blobArg).toBe(mockBlob);
    expect(nombreArg).toMatch(/\.xlsx$/);
    expect(nombreArg).toContain('libro-diario');
    expect(nombreArg).toContain('2026-06');
  });
});
