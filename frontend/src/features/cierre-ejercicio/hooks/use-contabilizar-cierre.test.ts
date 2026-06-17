import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock cross-feature API (antes de importar el hook)
vi.mock('@/features/comprobantes/api/contabilizar-comprobante', () => ({
  contabilizarComprobante: vi.fn(),
}));

// Mock error-messages para mensajeComprobantes
vi.mock('@/lib/error-messages', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/error-messages')>();
  return {
    ...real,
    mensajeComprobantes: vi.fn((err: unknown) => {
      if (err instanceof Error) return err.message;
      return 'Error desconocido';
    }),
  };
});

import { contabilizarComprobante } from '@/features/comprobantes/api/contabilizar-comprobante';
import { useContabilizarCierre } from './use-contabilizar-cierre';

const mockContabilizar = contabilizarComprobante as ReturnType<typeof vi.fn>;

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useContabilizarCierre', () => {
  beforeEach(() => {
    mockContabilizar.mockReset();
  });

  it('todos BORRADOR + todos éxito → progreso termina en contabilizado para todos', async () => {
    mockContabilizar.mockResolvedValue({});

    const cierres = [
      { id: 'id-1', estado: 'BORRADOR' as const },
      { id: 'id-2', estado: 'BORRADOR' as const },
      { id: 'id-3', estado: 'BORRADOR' as const },
    ];

    const { result } = renderHook(() => useContabilizarCierre('gestion-1'), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.contabilizar(cierres);
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.progreso).toHaveLength(3);
    expect(result.current.progreso.every((p) => p.estado === 'contabilizado')).toBe(true);
    expect(mockContabilizar).toHaveBeenCalledTimes(3);
  });

  it('BORRADOR + falla en el 2do → progreso muestra error, el 3ro no se postea (parada temprana)', async () => {
    mockContabilizar
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Fallo en id-2'));

    const cierres = [
      { id: 'id-1', estado: 'BORRADOR' as const },
      { id: 'id-2', estado: 'BORRADOR' as const },
      { id: 'id-3', estado: 'BORRADOR' as const },
    ];

    const { result } = renderHook(() => useContabilizarCierre('gestion-1'), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.contabilizar(cierres);
    });

    expect(result.current.isPending).toBe(false);
    const [paso1, paso2, paso3] = result.current.progreso;
    expect(paso1?.estado).toBe('contabilizado');
    expect(paso2?.estado).toBe('error');
    // El 3ro permanece en pendiente (no se llegó a postear)
    expect(paso3?.estado).toBe('pendiente');
    // Solo se llamó 2 veces (parada temprana en el 2do)
    expect(mockContabilizar).toHaveBeenCalledTimes(2);
  });

  it('resumable: salta los CONTABILIZADO y postea solo los BORRADOR', async () => {
    mockContabilizar.mockResolvedValue({});

    const cierres = [
      { id: 'id-1', estado: 'CONTABILIZADO' as const },
      { id: 'id-2', estado: 'BORRADOR' as const },
    ];

    const { result } = renderHook(() => useContabilizarCierre('gestion-1'), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.contabilizar(cierres);
    });

    expect(result.current.isPending).toBe(false);
    // El 1ro ya arranca en 'contabilizado' (se salta la llamada al API)
    expect(result.current.progreso[0]?.estado).toBe('contabilizado');
    expect(result.current.progreso[1]?.estado).toBe('contabilizado');
    // Solo se llama para el BORRADOR
    expect(mockContabilizar).toHaveBeenCalledTimes(1);
    expect(mockContabilizar).toHaveBeenCalledWith('id-2');
  });

  it('isPending vuelve false tanto en éxito total como en error (Anti-F-07)', async () => {
    mockContabilizar.mockRejectedValue(new Error('Error de red'));

    const cierres = [{ id: 'id-1', estado: 'BORRADOR' as const }];

    const { result } = renderHook(() => useContabilizarCierre('gestion-1'), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.contabilizar(cierres);
    });

    expect(result.current.isPending).toBe(false);
  });
});
