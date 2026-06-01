import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import type { Membership } from '@/types/api';

import { MembersList } from './members-list';

// Hooks de mutación y el dialog de impersonación mockeados para aislar la tabla.
vi.mock('../hooks/use-memberships', () => ({
  useChangeMembershipRole: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveMembership: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/impersonation/components/impersonate-dialog', () => ({
  ImpersonateDialog: () => null,
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
  // Usuario actual distinto del miembro listado → isSelf = false.
  useAuthStore.setState({ user: { id: 'me', email: 'me@avicont.bo', roles: ['ADMIN'] } });
});

afterEach(() => {
  useAuthStore.setState({ user: null });
});

const member: Membership = {
  id: 'm-1',
  organizationId: 'org-1',
  userId: 'other',
  systemRole: null,
  customRoleId: 'cr-1',
  deactivatedAt: null,
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  user: { id: 'other', email: 'otro@avicont.bo', displayName: null },
  customRole: null,
};

async function abrirMenu(): Promise<void> {
  render(<MembersList members={[member]} />);
  await userEvent.click(screen.getByRole('button', { name: /acciones para otro@avicont.bo/i }));
}

describe('MembersList — gating de menu-items', () => {
  it('CON permisos update/remove → Cambiar a Admin y Remover habilitados', async () => {
    hasMock.mockReturnValue(true);
    await abrirMenu();
    expect(screen.getByRole('menuitem', { name: /cambiar a admin/i })).not.toHaveAttribute(
      'data-disabled',
    );
    expect(
      screen.getByRole('menuitem', { name: /remover de la organización/i }),
    ).not.toHaveAttribute('data-disabled');
  });

  it('SIN permisos → Cambiar a Admin y Remover deshabilitados', async () => {
    hasMock.mockReturnValue(false);
    await abrirMenu();
    expect(screen.getByRole('menuitem', { name: /cambiar a admin/i })).toHaveAttribute(
      'data-disabled',
    );
    expect(
      screen.getByRole('menuitem', { name: /remover de la organización/i }),
    ).toHaveAttribute('data-disabled');
  });
});
