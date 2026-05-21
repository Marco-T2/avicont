import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CuentaTreeNode } from '@/types/api';

import { CuentaTreeView } from './cuenta-tree-view';

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
});
