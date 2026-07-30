import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { Item } from '@/types/api';

import { useItems } from '../hooks/use-items';
import {
  useCreateItem,
  useDesactivarItem,
  useReactivarItem,
  useUpdateItem,
} from '../hooks/use-item-mutations';
import { ItemsPage } from './items-page';

const { hasMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fija la firma (p: string) => boolean.
  hasMock: vi.fn((_p: string) => true),
}));

vi.mock('../hooks/use-items', () => ({ useItems: vi.fn() }));
vi.mock('../hooks/use-item-mutations', () => ({
  useCreateItem: vi.fn(),
  useUpdateItem: vi.fn(),
  useDesactivarItem: vi.fn(),
  useReactivarItem: vi.fn(),
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

const ITEM: Item = {
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

const MUTATION_IDLE = {
  mutate: vi.fn(),
  isPending: false,
  variables: undefined,
} as unknown;

function renderPage() {
  return render(
    <TooltipProvider>
      <ItemsPage />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  hasMock.mockReset();
  hasMock.mockReturnValue(true);
  vi.mocked(useItems).mockReturnValue({
    data: { items: [ITEM], total: 1, page: 1, pageSize: 50 },
    isLoading: false,
  } as unknown as ReturnType<typeof useItems>);
  vi.mocked(useCreateItem).mockReturnValue(
    MUTATION_IDLE as ReturnType<typeof useCreateItem>,
  );
  vi.mocked(useUpdateItem).mockReturnValue(
    MUTATION_IDLE as ReturnType<typeof useUpdateItem>,
  );
  vi.mocked(useDesactivarItem).mockReturnValue(
    MUTATION_IDLE as ReturnType<typeof useDesactivarItem>,
  );
  vi.mocked(useReactivarItem).mockReturnValue(
    MUTATION_IDLE as ReturnType<typeof useReactivarItem>,
  );
});

describe('ItemsPage', () => {
  it('renderiza el header canónico con título y la lista', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Ítems' })).toBeInTheDocument();
    expect(screen.getByText('Pollo entero')).toBeInTheDocument();
  });

  it('con contabilidad.items.create → botón "Nuevo ítem" habilitado', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /nuevo ítem/i })).toBeEnabled();
  });

  it('sin contabilidad.items.create → botón "Nuevo ítem" deshabilitado (§14.7)', () => {
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.items.create');
    renderPage();
    expect(screen.getByRole('button', { name: /nuevo ítem/i })).toBeDisabled();
  });
});
