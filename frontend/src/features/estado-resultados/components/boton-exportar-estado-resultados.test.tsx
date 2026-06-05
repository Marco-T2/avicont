import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import * as exportExcelModule from '@/lib/export-excel';
import * as usePermissionsModule from '@/lib/use-permissions';
import type { EstadoResultadosResponse } from '@/types/api';

import { BotonExportarEstadoResultados } from './boton-exportar-estado-resultados';

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

const dataValida: EstadoResultadosResponse = {
  fechaDesde: '2026-06-01',
  fechaHasta: '2026-06-30',
  ingreso: {
    claseCuenta: 'INGRESO',
    titulo: 'Ingresos',
    totalBob: '15000.00',
    subsecciones: [],
  },
  egreso: {
    claseCuenta: 'EGRESO',
    titulo: 'Egresos',
    totalBob: '8000.00',
    subsecciones: [],
  },
  totalIngresoBob: '15000.00',
  totalEgresoBob: '8000.00',
  resultadoEjercicioBob: '7000.00',
  esGanancia: true,
};

describe('BotonExportarEstadoResultados', () => {
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
        <BotonExportarEstadoResultados data={dataValida} perfil={null} rango="2026-06" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a excel/i })).toBeInTheDocument();
  });

  it('el botón está deshabilitado cuando data es undefined', () => {
    mockPermissions(true);
    render(
      <Wrapper>
        <BotonExportarEstadoResultados data={undefined} perfil={null} rango="2026-06" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a excel/i })).toBeDisabled();
  });

  it('el botón está habilitado cuando hay data (con permiso contabilidad.eeff.read)', () => {
    mockPermissions(true);
    render(
      <Wrapper>
        <BotonExportarEstadoResultados data={dataValida} perfil={null} rango="2026-06" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a excel/i })).toBeEnabled();
  });

  it('el botón está deshabilitado con tooltip cuando falta el permiso', async () => {
    mockPermissions(false);
    const user = userEvent.setup();
    render(
      <Wrapper>
        <BotonExportarEstadoResultados data={dataValida} perfil={null} rango="2026-06" />
      </Wrapper>,
    );
    const btn = screen.getByRole('button', { name: /exportar a excel/i });
    expect(btn).toBeDisabled();
    await user.hover(btn.parentElement!);
    const tooltipContent = await screen.findAllByText(/permiso/i);
    expect(tooltipContent.length).toBeGreaterThanOrEqual(1);
  });

  it('llama a construirHoja y descargarBlob al hacer clic (con datos y permiso)', async () => {
    mockPermissions(true);
    const user = userEvent.setup();

    const mockBlob = new Blob(['test'], { type: 'application/xlsx' });
    vi.spyOn(exportExcelModule, 'construirHoja').mockResolvedValue(mockBlob);
    vi.spyOn(exportExcelModule, 'descargarBlob').mockImplementation(() => undefined);

    render(
      <Wrapper>
        <BotonExportarEstadoResultados data={dataValida} perfil={null} rango="2026-06" />
      </Wrapper>,
    );

    const btn = screen.getByRole('button', { name: /exportar a excel/i });
    await user.click(btn);

    await waitFor(() => {
      expect(exportExcelModule.construirHoja).toHaveBeenCalledOnce();
      expect(exportExcelModule.descargarBlob).toHaveBeenCalledOnce();
    });

    const [blobArg, nombreArg] = (
      exportExcelModule.descargarBlob as ReturnType<typeof vi.fn>
    ).mock.calls[0] as [Blob, string];
    expect(blobArg).toBe(mockBlob);
    expect(nombreArg).toMatch(/\.xlsx$/);
    expect(nombreArg).toContain('estado-resultados');
    expect(nombreArg).toContain('2026-06');
  });
});
