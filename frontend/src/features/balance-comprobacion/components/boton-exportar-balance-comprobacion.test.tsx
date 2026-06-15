import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import * as exportExcelModule from '@/lib/export-excel';
import * as usePermissionsModule from '@/lib/use-permissions';
import type { BalanceComprobacionResponse } from '@/types/api';

import { BotonExportarBalanceComprobacion } from './boton-exportar-balance-comprobacion';

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

const dataValida: BalanceComprobacionResponse = {
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
};

describe('BotonExportarBalanceComprobacion', () => {
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
        <BotonExportarBalanceComprobacion data={dataValida} perfil={null} rango="2026-04-30" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a excel/i })).toBeInTheDocument();
  });

  it('el botón está deshabilitado cuando data es undefined', () => {
    mockPermissions(true);
    render(
      <Wrapper>
        <BotonExportarBalanceComprobacion data={undefined} perfil={null} rango="2026-04-30" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a excel/i })).toBeDisabled();
  });

  it('el botón está habilitado cuando hay data (con permiso contabilidad.eeff.read)', () => {
    mockPermissions(true);
    render(
      <Wrapper>
        <BotonExportarBalanceComprobacion data={dataValida} perfil={null} rango="2026-04-30" />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar a excel/i })).toBeEnabled();
  });

  it('el botón está deshabilitado con tooltip cuando falta el permiso', async () => {
    mockPermissions(false);
    const user = userEvent.setup();
    render(
      <Wrapper>
        <BotonExportarBalanceComprobacion data={dataValida} perfil={null} rango="2026-04-30" />
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
        <BotonExportarBalanceComprobacion data={dataValida} perfil={null} rango="2026-04-30" />
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
    expect(nombreArg).toContain('balance-comprobacion');
    expect(nombreArg).toContain('2026-04-30');
  });
});
