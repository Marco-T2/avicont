import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CustomRole } from '@/types/api';

import { RolesList } from './roles-list';

// Hook de borrado y el dialog de form mockeados para aislar la tabla.
vi.mock('../hooks/use-roles', () => ({
  useDeleteRole: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('./role-form-dialog', () => ({
  RoleFormDialog: () => null,
}));

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

const role: CustomRole = {
  id: 'r-1',
  organizationId: 'org-1',
  slug: 'contador-junior',
  name: 'Contador Junior',
  description: null,
  permissions: ['contabilidad.asientos.read'],
  isSystemDefault: false,
  isEditable: true,
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  createdById: 'u-1',
};

async function abrirMenu(): Promise<void> {
  render(<RolesList roles={[role]} />);
  await userEvent.click(screen.getByRole('button', { name: /acciones para contador junior/i }));
}

describe('RolesList — gating de menu-items', () => {
  it('CON permisos update/delete → Editar y Eliminar habilitados', async () => {
    hasMock.mockReturnValue(true);
    await abrirMenu();
    expect(screen.getByRole('menuitem', { name: /editar/i })).not.toHaveAttribute(
      'data-disabled',
    );
    expect(screen.getByRole('menuitem', { name: /eliminar/i })).not.toHaveAttribute(
      'data-disabled',
    );
  });

  it('SIN permisos → Editar y Eliminar deshabilitados (aunque el rol sea editable)', async () => {
    hasMock.mockReturnValue(false);
    await abrirMenu();
    expect(screen.getByRole('menuitem', { name: /editar/i })).toHaveAttribute('data-disabled');
    expect(screen.getByRole('menuitem', { name: /eliminar/i })).toHaveAttribute(
      'data-disabled',
    );
  });
});
