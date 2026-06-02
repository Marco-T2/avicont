import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ----------------------------------------------------------------
// Mocks al tope
// ----------------------------------------------------------------

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('./platform-impersonate-dialog', () => ({
  PlatformImpersonateDialog: vi.fn(() => null),
}));

vi.mock('../../../features/impersonation/hooks/use-impersonation', () => ({
  useStartImpersonation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import { useAuthStore } from '@/stores/auth-store';
import type { PlatformOrgMember } from '@/types/api';
import { PlatformMembersTable } from './platform-members-table';
import { PlatformImpersonateDialog } from './platform-impersonate-dialog';

const CURRENT_SA_ID = 'sa-user-id';

function mockAuthStore(sub = CURRENT_SA_ID) {
  // useAuthStore con selector: devolver el valor que esperaría el selector (s.user?.id)
  vi.mocked(useAuthStore).mockReturnValue(sub as unknown as ReturnType<typeof useAuthStore>);
}

const ORG_ID = 'org-123';

const MEMBER_REGULAR: PlatformOrgMember = {
  id: 'memb-1',
  userId: 'user-regular',
  systemRole: null,
  customRoleId: 'role-1',
  customRole: { id: 'role-1', slug: 'contador', name: 'Contador' },
  deactivatedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  user: { id: 'user-regular', email: 'regular@example.com', displayName: 'Juan Regular' },
};

const MEMBER_OWNER: PlatformOrgMember = {
  id: 'memb-2',
  userId: 'user-owner',
  systemRole: 'OWNER',
  customRoleId: null,
  customRole: null,
  deactivatedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  user: { id: 'user-owner', email: 'owner@example.com', displayName: 'Ana Owner' },
};

const MEMBER_SELF: PlatformOrgMember = {
  id: 'memb-3',
  userId: CURRENT_SA_ID,
  systemRole: null,
  customRoleId: 'role-1',
  customRole: { id: 'role-1', slug: 'contador', name: 'Contador' },
  deactivatedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  user: {
    id: CURRENT_SA_ID,
    email: 'sa@example.com',
    displayName: 'SA User',
  },
};

function renderTable(members: PlatformOrgMember[] = [MEMBER_REGULAR, MEMBER_OWNER]) {
  return render(
    <MemoryRouter>
      <PlatformMembersTable members={members} orgId={ORG_ID} />
    </MemoryRouter>,
  );
}

describe('PlatformMembersTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthStore();
  });

  it('miembro regular → botón "Impersonar" habilitado', () => {
    renderTable([MEMBER_REGULAR]);

    const btns = screen.getAllByRole('button', { name: /impersonar/i });
    expect(btns.length).toBeGreaterThanOrEqual(1);
    expect(btns[0]).not.toBeDisabled();
  });

  it('OWNER → botón "Impersonar" ausente o deshabilitado (gating)', () => {
    renderTable([MEMBER_OWNER]);

    // El OWNER no debe tener botón impersonar habilitado
    const btn = screen.queryByRole('button', { name: /impersonar/i });
    if (btn !== null) {
      expect(btn).toBeDisabled();
    }
    // Si no hay botón, el test pasa igualmente
  });

  it('self (el SA mismo) → botón "Impersonar" ausente o deshabilitado', () => {
    renderTable([MEMBER_SELF]);

    const btn = screen.queryByRole('button', { name: /impersonar/i });
    if (btn !== null) {
      expect(btn).toBeDisabled();
    }
  });

  it('click en botón Impersonar de miembro regular → abre PlatformImpersonateDialog', async () => {
    renderTable([MEMBER_REGULAR]);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /impersonar/i }));

    await waitFor(() => {
      // El componente se re-renderiza con open:true después del click
      const calls = vi.mocked(PlatformImpersonateDialog).mock.calls;
      const openCall = calls.find(
        ([props]) =>
          (props as { open?: boolean; orgId?: string; targetUser?: { id?: string } }).open === true &&
          (props as { open?: boolean; orgId?: string; targetUser?: { id?: string } }).orgId === ORG_ID &&
          (props as { open?: boolean; orgId?: string; targetUser?: { id?: string } }).targetUser?.id === 'user-regular',
      );
      expect(openCall).toBeDefined();
    });
  });

  it('renderiza el email de cada miembro', () => {
    renderTable([MEMBER_REGULAR, MEMBER_OWNER]);

    expect(screen.getByText('regular@example.com')).toBeInTheDocument();
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();
  });
});
