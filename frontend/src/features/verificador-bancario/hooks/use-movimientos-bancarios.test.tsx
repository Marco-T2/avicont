import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListadoMovimientosBancarios } from '@/types/api';

import { useMovimientosBancarios } from './use-movimientos-bancarios';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('../api/get-movimientos-bancarios', () => ({
  getMovimientosBancarios: getMock,
}));

const RESPUESTA: ListadoMovimientosBancarios = {
  desde: '2026-06-01',
  hasta: '2026-06-30',
  page: 1,
  limit: 50,
  total: 1,
  movimientos: [],
  totales: [],
  saldos: [],
  saldosPorMoneda: [],
  auditoriaVinculos: { aplicada: false, total: 0, rotos: [] },
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  getMock.mockReset();
  getMock.mockResolvedValue(RESPUESTA);
});

describe('useMovimientosBancarios', () => {
  it('sin params (null) NO dispara el request — el rango es obligatorio (REQ-VMB-01)', () => {
    const { result } = renderHook(() => useMovimientosBancarios(null), { wrapper });

    expect(getMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('con params dispara el request con esos params y expone la respuesta', async () => {
    const params = { desde: '2026-06-01', hasta: '2026-06-30', page: 1, limit: 50 };
    const { result } = renderHook(() => useMovimientosBancarios(params), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledWith(params);
    expect(result.current.data?.total).toBe(1);
    expect(result.current.data?.auditoriaVinculos.aplicada).toBe(false);
  });
});
