import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { PERMISSIONS } from '@/lib/permissions';

// Mock de permisos — patrón §14.7
const hasMock = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn: ReturnType<typeof vi.fn> & ((p: string) => boolean) = vi.fn(() => true) as any;
  return fn;
});

vi.mock('@/lib/use-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-permissions')>()),
  usePermissions: () => ({
    has: (p: string) => hasMock(p),
    hasAll: () => true,
    isOwner: false,
    permissions: [],
  }),
}));

import type { ProgresoPaso } from '../hooks/use-contabilizar-cierre';
import { ContabilizarCierreBar } from './contabilizar-cierre-bar';

const cierresBorrador = [
  { id: 'id-1', estado: 'BORRADOR' as const },
  { id: 'id-2', estado: 'BORRADOR' as const },
];

const progresoInicial: ProgresoPaso[] = [
  { comprobanteId: 'id-1', estado: 'pendiente' },
  { comprobanteId: 'id-2', estado: 'pendiente' },
];

describe('ContabilizarCierreBar', () => {
  it('botón habilitado cuando el usuario tiene contabilidad.asientos.post', () => {
    hasMock.mockReturnValue(true);

    render(
      <TooltipProvider>
        <ContabilizarCierreBar
          cierres={cierresBorrador}
          progreso={progresoInicial}
          isPending={false}
          onContabilizar={vi.fn()}
        />
      </TooltipProvider>,
    );

    const btn = screen.getByRole('button', { name: /contabilizar cierre/i });
    expect(btn).not.toBeDisabled();
  });

  it('botón disabled con tooltip cuando el usuario no tiene el permiso', async () => {
    hasMock.mockImplementation((p: string) => p !== PERMISSIONS.contabilidad.asientos.post);

    render(
      <TooltipProvider>
        <ContabilizarCierreBar
          cierres={cierresBorrador}
          progreso={progresoInicial}
          isPending={false}
          onContabilizar={vi.fn()}
        />
      </TooltipProvider>,
    );

    const btn = screen.getByRole('button', { name: /contabilizar cierre/i });
    expect(btn).toBeDisabled();
  });

  it('botón disabled cuando isPending es true (Anti-F-07)', () => {
    hasMock.mockReturnValue(true);

    render(
      <TooltipProvider>
        <ContabilizarCierreBar
          cierres={cierresBorrador}
          progreso={progresoInicial}
          isPending={true}
          onContabilizar={vi.fn()}
        />
      </TooltipProvider>,
    );

    const btn = screen.getByRole('button', { name: /contabilizar cierre/i });
    expect(btn).toBeDisabled();
  });

  it('render de progreso: contabilizando → muestra texto de proceso', () => {
    hasMock.mockReturnValue(true);

    const progreso: ProgresoPaso[] = [
      { comprobanteId: 'id-1', estado: 'contabilizando' },
      { comprobanteId: 'id-2', estado: 'pendiente' },
    ];

    render(
      <TooltipProvider>
        <ContabilizarCierreBar
          cierres={cierresBorrador}
          progreso={progreso}
          isPending={true}
          onContabilizar={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText(/contabilizando/i)).toBeInTheDocument();
  });

  it('render de progreso: contabilizado → muestra indicador de éxito', () => {
    hasMock.mockReturnValue(true);

    const progreso: ProgresoPaso[] = [
      { comprobanteId: 'id-1', estado: 'contabilizado' },
      { comprobanteId: 'id-2', estado: 'pendiente' },
    ];

    render(
      <TooltipProvider>
        <ContabilizarCierreBar
          cierres={cierresBorrador}
          progreso={progreso}
          isPending={false}
          onContabilizar={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('render de progreso: error → muestra mensaje de error', () => {
    hasMock.mockReturnValue(true);

    const progreso: ProgresoPaso[] = [
      { comprobanteId: 'id-1', estado: 'contabilizado' },
      { comprobanteId: 'id-2', estado: 'error', error: 'Error del servidor' },
    ];

    render(
      <TooltipProvider>
        <ContabilizarCierreBar
          cierres={cierresBorrador}
          progreso={progreso}
          isPending={false}
          onContabilizar={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText(/error del servidor/i)).toBeInTheDocument();
  });

  it('llama onContabilizar al hacer click', async () => {
    hasMock.mockReturnValue(true);
    const onContabilizar = vi.fn();

    render(
      <TooltipProvider>
        <ContabilizarCierreBar
          cierres={cierresBorrador}
          progreso={progresoInicial}
          isPending={false}
          onContabilizar={onContabilizar}
        />
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /contabilizar cierre/i }));
    expect(onContabilizar).toHaveBeenCalledOnce();
  });
});
