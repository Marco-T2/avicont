import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Cuenta } from '@/types/api';

import { DeactivateCuentaDialog } from './deactivate-cuenta-dialog';
import { useDeactivateCuenta } from '../hooks/use-cuenta-mutations';

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}));

vi.mock('../hooks/use-cuenta-mutations', () => ({
  useDeactivateCuenta: vi.fn(),
}));

const CUENTA = {
  id: 'cuenta-1',
  codigoInterno: '4.1.1.002',
  nombre: 'VENTAS DE SERVICIOS',
} as unknown as Cuenta;

// Shape REAL de axios + GlobalExceptionFilter (todo bajo `error`).
function errorReferenciadaPorItems(details?: Record<string, unknown>): unknown {
  return {
    response: {
      data: {
        error: {
          code: 'CUENTA_REFERENCIADA_POR_ITEMS',
          message:
            'La cuenta está asignada como cuenta de ingreso de ítems activos; re-mapealos antes de desactivar',
          ...(details !== undefined ? { details } : {}),
        },
      },
    },
  };
}

function mockMutationQueFalla(err: unknown): void {
  vi.mocked(useDeactivateCuenta).mockReturnValue({
    isPending: false,
    mutate: (_id: string, opciones?: { onError?: (e: unknown) => void }) => {
      opciones?.onError?.(err);
    },
  } as unknown as ReturnType<typeof useDeactivateCuenta>);
}

async function confirmar(): Promise<void> {
  const user = userEvent.setup();
  render(<DeactivateCuentaDialog cuenta={CUENTA} open onOpenChange={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: /desactivar/i }));
}

beforeEach(() => {
  toastErrorMock.mockReset();
});

// REQ-ITM-05 / Anti-41: el backend manda la lista de ítems PRECISAMENTE para
// que el admin no salga a buscarlos a mano. Antes de este test el frontend la
// descartaba y mostraba solo "re-mapealos", sin decir cuáles.
describe('DeactivateCuentaDialog — CUENTA_REFERENCIADA_POR_ITEMS', () => {
  it('nombra los ítems que bloquean, con su código cuando lo tienen', async () => {
    mockMutationQueFalla(
      errorReferenciadaPorItems({
        cuentaId: 'cuenta-1',
        items: [
          { id: 'i1', nombre: 'Pollo entero', codigo: 'PE-001' },
          { id: 'i2', nombre: 'Servicio de faenado', codigo: null },
        ],
      }),
    );

    await confirmar();

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    const [titulo, opciones] = toastErrorMock.mock.calls[0] as [
      string,
      { description: string },
    ];
    expect(titulo).toContain('No se puede desactivar');
    expect(opciones.description).toContain('PE-001 — Pollo entero');
    expect(opciones.description).toContain('Servicio de faenado');
  });

  it('cae al mensaje del backend si el error viene sin la lista', async () => {
    mockMutationQueFalla(errorReferenciadaPorItems());

    await confirmar();

    const [, opciones] = toastErrorMock.mock.calls[0] as [string, { description: string }];
    expect(opciones.description).toContain('re-mapealos antes de desactivar');
  });
});
