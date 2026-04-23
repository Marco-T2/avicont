import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';

import { useCuentaTree } from './use-cuenta-tree';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}));

const mockedGet = api.get as unknown as ReturnType<typeof vi.fn>;

function wrapper(): (props: { children: React.ReactNode }) => React.JSX.Element {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useCuentaTree', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve el árbol cuando la request es exitosa', async () => {
    const tree = [
      {
        id: 'r1',
        codigoInterno: '1',
        nombre: 'ACTIVO',
        hijas: [
          { id: 'h1', codigoInterno: '1.1', nombre: 'ACTIVO CORRIENTE', hijas: [] },
        ],
      },
    ];
    mockedGet.mockResolvedValueOnce({ data: tree });

    const { result } = renderHook(() => useCuentaTree(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(tree);
    expect(mockedGet).toHaveBeenCalledWith('/api/cuentas/tree');
  });

  it('expone isError cuando la request falla', async () => {
    mockedGet.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useCuentaTree(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('arranca con isLoading=true antes de resolver', () => {
    mockedGet.mockImplementationOnce(() => new Promise(() => {}));
    const { result } = renderHook(() => useCuentaTree(), { wrapper: wrapper() });
    expect(result.current.isLoading).toBe(true);
  });
});
