import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformOrg } from '@/types/api';

import { OrgStatusDialog } from './org-status-dialog';

vi.mock('../hooks/use-update-org-status', () => ({
  useUpdateOrgStatus: vi.fn(),
}));

import { useUpdateOrgStatus } from '../hooks/use-update-org-status';

type MutationStub = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
};

function mockMutation(stub: Partial<MutationStub>): MutationStub {
  const value = { mutate: vi.fn(), isPending: false, ...stub } satisfies MutationStub;
  vi.mocked(useUpdateOrgStatus).mockReturnValue(
    value as unknown as ReturnType<typeof useUpdateOrgStatus>,
  );
  return value;
}

const ORG_ACTIVE: PlatformOrg = {
  id: 'org-1',
  name: 'Avícola Test',
  slug: 'avicola-test',
  status: 'ACTIVE',
  plan: 'FREE',
  contabilidadEnabled: true,
  granjaEnabled: false,
  createdAt: '2026-06-02T10:00:00Z',
};

describe('OrgStatusDialog', () => {
  beforeEach(() => {
    vi.mocked(useUpdateOrgStatus).mockReset();
  });

  it('al confirmar la suspensión llama a mutate con el status destino', async () => {
    const mutation = mockMutation({});
    const user = userEvent.setup();
    render(
      <OrgStatusDialog org={ORG_ACTIVE} targetStatus="SUSPENDED" open onOpenChange={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /suspender/i }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    const [vars] = mutation.mutate.mock.calls[0] ?? [];
    expect(vars).toEqual({ id: 'org-1', status: 'SUSPENDED' });
  });

  it('al confirmar con éxito cierra el dialog (onOpenChange false)', async () => {
    const onOpenChange = vi.fn();
    const mutation = mockMutation({});
    mutation.mutate.mockImplementation((_vars, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    const user = userEvent.setup();
    render(
      <OrgStatusDialog
        org={ORG_ACTIVE}
        targetStatus="SUSPENDED"
        open
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /suspender/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('al cancelar NO llama a mutate', async () => {
    const mutation = mockMutation({});
    const user = userEvent.setup();
    render(
      <OrgStatusDialog org={ORG_ACTIVE} targetStatus="ARCHIVED" open onOpenChange={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('con org null no rompe y no llama a mutate al confirmar', async () => {
    const mutation = mockMutation({});
    const user = userEvent.setup();
    render(
      <OrgStatusDialog org={null} targetStatus="ACTIVE" open onOpenChange={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /reactivar/i }));

    expect(mutation.mutate).not.toHaveBeenCalled();
  });
});
