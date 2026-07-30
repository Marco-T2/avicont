import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { Cobro } from '@/types/api';

const { hasMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fija la firma (p: string) => boolean.
  hasMock: vi.fn((_p: string) => true),
}));

vi.mock('@/lib/use-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-permissions')>()),
  usePermissions: () => ({
    has: hasMock,
    hasAll: (perms: string[]) => perms.every((p) => hasMock(p)),
    isOwner: false,
    permissions: [],
  }),
}));

vi.mock('../api/contabilizar-cobro', () => ({ contabilizarCobro: vi.fn() }));

import { contabilizarCobro } from '../api/contabilizar-cobro';
import { CobroAccionesBar } from './cobro-acciones-bar';

const mockContabilizar = vi.mocked(contabilizarCobro);

function cobro(overrides: Partial<Cobro> = {}): Cobro {
  return {
    id: 'cobro-1',
    contactoId: 'cli-1',
    fechaContable: '2026-07-15',
    monto: '600.00',
    cuentaDestinoId: 'cta-1',
    glosa: 'Cobro de prueba',
    comprobanteId: 'comp-1',
    estado: 'BORRADOR',
    numero: null,
    anulado: false,
    createdAt: '2026-07-15T12:00:00Z',
    updatedAt: '2026-07-15T12:00:00Z',
    aplicaciones: [],
    ...overrides,
  };
}

function renderBar(c: Cobro) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <CobroAccionesBar cobro={c} onAnular={vi.fn()} onEliminar={vi.fn()} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  hasMock.mockReset();
  hasMock.mockReturnValue(true);
  mockContabilizar.mockReset();
});

describe('CobroAccionesBar — acciones por estado', () => {
  it('BORRADOR: muestra Contabilizar y Eliminar borrador, sin Anular', () => {
    renderBar(cobro());
    expect(screen.getByRole('button', { name: /contabilizar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /eliminar borrador/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /anular/i })).not.toBeInTheDocument();
  });

  it('CONTABILIZADO: muestra solo Anular', () => {
    renderBar(cobro({ estado: 'CONTABILIZADO', numero: 'I2607-000001' }));
    expect(screen.getByRole('button', { name: /anular/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /contabilizar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument();
  });

  it('BLOQUEADO: también permite anular (el period lock del cobro no bloquea la UI del botón)', () => {
    renderBar(cobro({ estado: 'BLOQUEADO', numero: 'I2607-000001' }));
    expect(screen.getByRole('button', { name: /anular/i })).toBeInTheDocument();
  });

  it('anulado: no renderiza ninguna acción (terminal, §4.7)', () => {
    renderBar(cobro({ estado: 'CONTABILIZADO', anulado: true }));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('contabilizar dispara la mutation SIN diálogo de confirmación (D-14)', async () => {
    const user = userEvent.setup();
    mockContabilizar.mockResolvedValue({ comprobanteId: 'comp-1', numero: 'I2607-000001' });
    renderBar(cobro());

    await user.click(screen.getByRole('button', { name: /contabilizar/i }));
    expect(mockContabilizar).toHaveBeenCalledWith('cobro-1');
  });
});

describe('CobroAccionesBar — gating §14.7 (fail-closed)', () => {
  it('sin permisos: los botones quedan deshabilitados, no ocultos', () => {
    hasMock.mockReturnValue(false);
    renderBar(cobro());
    expect(screen.getByRole('button', { name: /contabilizar/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /eliminar borrador/i })).toBeDisabled();
  });

  it('sin cobros.void: Anular deshabilitado', () => {
    hasMock.mockReturnValue(false);
    renderBar(cobro({ estado: 'CONTABILIZADO' }));
    expect(screen.getByRole('button', { name: /anular/i })).toBeDisabled();
  });
});
