import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { CuentaTreeNode } from '@/types/api';

import { CuentaTreeView } from './cuenta-tree-view';

// El botón "+" (crear sub-cuenta) se gatea con usePermissions. hasMock es
// controlable por test (hoisted para poder referenciarlo dentro de vi.mock).
const { hasMock } = vi.hoisted(() => ({ hasMock: vi.fn(() => true) }));
vi.mock('@/lib/use-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-permissions')>()),
  usePermissions: () => ({
    has: hasMock,
    hasAll: (ps: string[]) => ps.every(() => hasMock()),
    isOwner: false,
    permissions: [],
  }),
}));

beforeEach(() => {
  hasMock.mockReturnValue(true);
});

function makeNode(overrides: Partial<CuentaTreeNode> = {}): CuentaTreeNode {
  return {
    id: 'n1',
    organizationId: 't1',
    codigoInterno: '1',
    nombre: 'ACTIVO',
    descripcion: null,
    claseCuenta: 'ACTIVO',
    subClaseCuenta: null,
    naturaleza: 'DEUDORA',
    parentId: null,
    nivel: 1,
    esDetalle: false,
    requiereContacto: false,
    esContraria: false,
    activa: true,
    monedaFuncional: 'BOB',
    permiteMultiMoneda: true,
    esSystemSeed: true,
    esRequeridaSistema: false,
    actividadFlujo: null,
    createdAt: '2026-04-23T00:00:00.000Z',
    updatedAt: '2026-04-23T00:00:00.000Z',
    hijas: [],
    ...overrides,
  };
}

describe('CuentaTreeView', () => {
  it('renderiza la jerarquía: padre + hijas expandidas por default', () => {
    const tree: CuentaTreeNode[] = [
      makeNode({
        id: 'r1',
        nombre: 'ACTIVO',
        codigoInterno: '1',
        hijas: [
          makeNode({
            id: 'h1',
            parentId: 'r1',
            nombre: 'ACTIVO CORRIENTE',
            codigoInterno: '1.1',
            nivel: 2,
          }),
        ],
      }),
    ];
    render(<CuentaTreeView nodes={tree} onSelect={vi.fn()} />);
    expect(screen.getByText('ACTIVO')).toBeInTheDocument();
    expect(screen.getByText('ACTIVO CORRIENTE')).toBeInTheDocument();
  });

  it('colapsar un padre oculta sus hijas', async () => {
    const user = userEvent.setup();
    const tree: CuentaTreeNode[] = [
      makeNode({
        id: 'r1',
        nombre: 'ACTIVO',
        hijas: [
          makeNode({ id: 'h1', parentId: 'r1', nombre: 'CAJA', codigoInterno: '1.1.1.001' }),
        ],
      }),
    ];
    render(<CuentaTreeView nodes={tree} onSelect={vi.fn()} />);
    expect(screen.getByText('CAJA')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /colapsar rama/i }));
    expect(screen.queryByText('CAJA')).not.toBeInTheDocument();
  });

  it('click en una cuenta dispara onSelect con ese nodo', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const tree: CuentaTreeNode[] = [
      makeNode({ id: 'r1', nombre: 'ACTIVO' }),
    ];
    render(<CuentaTreeView nodes={tree} onSelect={onSelect} />);
    await user.click(screen.getByText('ACTIVO'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('muestra empty state cuando nodes está vacío', () => {
    render(<CuentaTreeView nodes={[]} onSelect={vi.fn()} />);
    expect(screen.getByText(/no hay cuentas sembradas/i)).toBeInTheDocument();
  });

  describe('gating del botón "+" (crear sub-cuenta)', () => {
    const agrupador = (): CuentaTreeNode[] => [
      makeNode({ id: 'r1', nombre: 'ACTIVO', esDetalle: false, activa: true }),
    ];

    it('CON permiso create → botón "+" habilitado', () => {
      hasMock.mockReturnValue(true);
      render(
        <TooltipProvider delayDuration={0}>
          <CuentaTreeView nodes={agrupador()} onSelect={vi.fn()} onCreateChild={vi.fn()} />
        </TooltipProvider>,
      );
      expect(screen.getByRole('button', { name: /crear sub-cuenta bajo/i })).toBeEnabled();
    });

    it('SIN permiso create → botón "+" deshabilitado, no invoca onCreateChild', async () => {
      hasMock.mockReturnValue(false);
      const onCreateChild = vi.fn();
      const user = userEvent.setup();
      render(
        <TooltipProvider delayDuration={0}>
          <CuentaTreeView nodes={agrupador()} onSelect={vi.fn()} onCreateChild={onCreateChild} />
        </TooltipProvider>,
      );
      const btn = screen.getByRole('button', { name: /crear sub-cuenta bajo/i });
      expect(btn).toBeDisabled();
      await user.click(btn);
      expect(onCreateChild).not.toHaveBeenCalled();
    });
  });
});
