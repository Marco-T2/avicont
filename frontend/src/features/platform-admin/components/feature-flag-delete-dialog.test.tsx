import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeatureFlag } from '@/types/api';

import { FeatureFlagDeleteDialog } from './feature-flag-delete-dialog';

vi.mock('../hooks/use-delete-feature-flag', () => ({
  useDeleteFeatureFlag: vi.fn(),
}));

import { useDeleteFeatureFlag } from '../hooks/use-delete-feature-flag';

type MutationStub = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
};

function stubDelete(stub: Partial<MutationStub> = {}): MutationStub {
  const value = { mutate: vi.fn(), isPending: false, ...stub } satisfies MutationStub;
  vi.mocked(useDeleteFeatureFlag).mockReturnValue(
    value as unknown as ReturnType<typeof useDeleteFeatureFlag>,
  );
  return value;
}

const FLAG: FeatureFlag = {
  id: 'ff-1',
  key: 'new_dashboard',
  name: 'New Dashboard',
  description: null,
  enabled: false,
  organizationId: null,
  metadata: null,
  createdAt: '2026-06-02T10:00:00Z',
  updatedAt: '2026-06-02T10:00:00Z',
};

describe('FeatureFlagDeleteDialog', () => {
  beforeEach(() => {
    vi.mocked(useDeleteFeatureFlag).mockReset();
  });

  it('al confirmar llama a delete con la key del flag', async () => {
    const del = stubDelete();
    const user = userEvent.setup();
    render(<FeatureFlagDeleteDialog flag={FLAG} open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /eliminar/i }));

    expect(del.mutate).toHaveBeenCalledTimes(1);
    const [key] = del.mutate.mock.calls[0] ?? [];
    expect(key).toBe('new_dashboard');
  });

  it('al cancelar NO llama a delete', async () => {
    const del = stubDelete();
    const user = userEvent.setup();
    render(<FeatureFlagDeleteDialog flag={FLAG} open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(del.mutate).not.toHaveBeenCalled();
  });

  it('al eliminar con éxito cierra el dialog', async () => {
    const onOpenChange = vi.fn();
    const del = stubDelete();
    del.mutate.mockImplementation((_key, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    const user = userEvent.setup();
    render(<FeatureFlagDeleteDialog flag={FLAG} open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: /eliminar/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
