import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { Item } from '@/types/api';

import { ItemListTable } from './item-list-table';

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

const base: Item = {
  id: 'item-1',
  codigo: 'P-01',
  nombre: 'Pollo entero',
  tipo: 'PRODUCTO',
  unidadMedida: 'kg',
  precioUnitarioSugerido: '6.305000',
  cantidadPorDefecto: '1.000000',
  cuentaIngresoId: null,
  activo: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

interface Overrides {
  items?: Item[];
  isLoading?: boolean;
  hayFiltros?: boolean;
  onCrear?: () => void;
  onEditar?: (item: Item) => void;
  onDesactivar?: (item: Item) => void;
  onReactivar?: (id: string) => void;
  reactivarPendingId?: string | null;
}

function renderTable(overrides: Overrides = {}) {
  return render(
    <TooltipProvider>
      <ItemListTable
        items={overrides.items ?? [base]}
        isLoading={overrides.isLoading ?? false}
        hayFiltros={overrides.hayFiltros ?? false}
        onCrear={overrides.onCrear ?? vi.fn()}
        onEditar={overrides.onEditar ?? vi.fn()}
        onDesactivar={overrides.onDesactivar ?? vi.fn()}
        onReactivar={overrides.onReactivar ?? vi.fn()}
        reactivarPendingId={overrides.reactivarPendingId ?? null}
      />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  hasMock.mockReset();
  hasMock.mockReturnValue(true);
});

describe('ItemListTable — estados de carga y vacío', () => {
  it('muestra skeleton cuando está cargando y no hay datos', () => {
    renderTable({ items: [], isLoading: true });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('No se encontraron resultados.')).not.toBeInTheDocument();
  });

  it('vacío CON filtros activos → empty state de tabla sin CTA (§13.4)', () => {
    renderTable({ items: [], hayFiltros: true });
    expect(screen.getByText('No se encontraron resultados.')).toBeInTheDocument();
    expect(screen.queryByText('No hay ítems todavía')).not.toBeInTheDocument();
  });

  it('vacío SIN filtros → empty state de página con CTA (§13.4)', async () => {
    const onCrear = vi.fn();
    const user = userEvent.setup();
    renderTable({ items: [], onCrear });

    expect(screen.getByText('No hay ítems todavía')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /nuevo ítem/i }));
    expect(onCrear).toHaveBeenCalledOnce();
  });
});

describe('ItemListTable — filas', () => {
  it('muestra los datos del ítem; el precio se muestra como viene (§4.5)', () => {
    renderTable();
    expect(screen.getByText('Pollo entero')).toBeInTheDocument();
    expect(screen.getByText('P-01')).toBeInTheDocument();
    expect(screen.getByText('Producto')).toBeInTheDocument();
    expect(screen.getByText('kg')).toBeInTheDocument();
    expect(screen.getByText('6.305000')).toBeInTheDocument();
  });

  it('muestra guion cuando codigo, unidadMedida y precio son null — nunca "undefined"', () => {
    renderTable({
      items: [
        {
          ...base,
          codigo: null,
          unidadMedida: null,
          precioUnitarioSugerido: null,
        },
      ],
    });
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it('llama onEditar con el ítem correcto', async () => {
    const onEditar = vi.fn();
    const user = userEvent.setup();
    renderTable({ onEditar });

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    expect(onEditar).toHaveBeenCalledWith(base);
  });

  it('ítem activo → botón Desactivar; llama onDesactivar', async () => {
    const onDesactivar = vi.fn();
    const user = userEvent.setup();
    renderTable({ onDesactivar });

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    expect(onDesactivar).toHaveBeenCalledWith(base);
    expect(screen.queryByRole('button', { name: 'Reactivar' })).not.toBeInTheDocument();
  });

  it('ítem inactivo → botón Reactivar; llama onReactivar con el id', async () => {
    const onReactivar = vi.fn();
    const user = userEvent.setup();
    renderTable({ items: [{ ...base, activo: false }], onReactivar });

    await user.click(screen.getByRole('button', { name: 'Reactivar' }));
    expect(onReactivar).toHaveBeenCalledWith('item-1');
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
  });

  it('deshabilita Reactivar mientras la mutación de ese ítem está en curso (Anti-F-07)', () => {
    renderTable({
      items: [{ ...base, activo: false }],
      reactivarPendingId: 'item-1',
    });
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeDisabled();
  });
});

describe('ItemListTable — gating fail-closed por permiso (§14.7)', () => {
  it('sin contabilidad.items.update → Editar deshabilitado', () => {
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.items.update');
    renderTable();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeDisabled();
  });

  it('sin contabilidad.items.delete → Desactivar deshabilitado', () => {
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.items.delete');
    renderTable();
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeDisabled();
    // Editar usa .update, sigue habilitado.
    expect(screen.getByRole('button', { name: 'Editar' })).toBeEnabled();
  });

  it('sin contabilidad.items.update → Reactivar deshabilitado', () => {
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.items.update');
    renderTable({ items: [{ ...base, activo: false }] });
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeDisabled();
  });
});
