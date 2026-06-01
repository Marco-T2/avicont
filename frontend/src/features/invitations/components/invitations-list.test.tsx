import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { Invitation } from '@/types/api';

import { InvitationsList } from './invitations-list';

// Hook de revocación mockeado (no tocamos red).
vi.mock('../hooks/use-invitations', () => ({
  useRevokeInvitation: () => ({ mutate: vi.fn(), isPending: false }),
}));

// usePermissions controlable por test (hoisted para referenciarlo en vi.mock).
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

const invitacion: Invitation = {
  id: 'inv-1',
  organizationId: 'org-1',
  email: 'nuevo@avicont.bo',
  invitedById: 'u-1',
  systemRole: null,
  customRoleId: 'cr-1',
  status: 'PENDING',
  expiresAt: '2026-06-30T00:00:00Z',
  acceptedAt: null,
  acceptedByUserId: null,
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
};

function renderList(): void {
  render(
    <TooltipProvider delayDuration={0}>
      <InvitationsList invitations={[invitacion]} />
    </TooltipProvider>,
  );
}

describe('InvitationsList — gating de revocar', () => {
  it('CON permiso miembros.invite → botón Revocar habilitado', () => {
    hasMock.mockReturnValue(true);
    renderList();
    expect(
      screen.getByRole('button', { name: /revocar invitación a nuevo@avicont.bo/i }),
    ).toBeEnabled();
  });

  it('SIN permiso miembros.invite → botón Revocar deshabilitado', () => {
    hasMock.mockReturnValue(false);
    renderList();
    expect(
      screen.getByRole('button', { name: /revocar invitación a nuevo@avicont.bo/i }),
    ).toBeDisabled();
  });
});
