import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeatureFlag } from '@/types/api';

import { FeatureFlagSheet } from './feature-flag-sheet';

vi.mock('../hooks/use-create-feature-flag', () => ({
  useCreateFeatureFlag: vi.fn(),
}));

vi.mock('../hooks/use-update-feature-flag', () => ({
  useUpdateFeatureFlag: vi.fn(),
}));

import { useCreateFeatureFlag } from '../hooks/use-create-feature-flag';
import { useUpdateFeatureFlag } from '../hooks/use-update-feature-flag';

type MutationStub = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
};

function stubCreate(stub: Partial<MutationStub> = {}): MutationStub {
  const value = { mutate: vi.fn(), isPending: false, ...stub } satisfies MutationStub;
  vi.mocked(useCreateFeatureFlag).mockReturnValue(
    value as unknown as ReturnType<typeof useCreateFeatureFlag>,
  );
  return value;
}

function stubUpdate(stub: Partial<MutationStub> = {}): MutationStub {
  const value = { mutate: vi.fn(), isPending: false, ...stub } satisfies MutationStub;
  vi.mocked(useUpdateFeatureFlag).mockReturnValue(
    value as unknown as ReturnType<typeof useUpdateFeatureFlag>,
  );
  return value;
}

const FLAG: FeatureFlag = {
  id: 'ff-1',
  key: 'new_dashboard',
  name: 'New Dashboard',
  description: 'Experiencia nueva',
  enabled: true,
  organizationId: null,
  metadata: null,
  createdAt: '2026-06-02T10:00:00Z',
  updatedAt: '2026-06-02T10:00:00Z',
};

describe('FeatureFlagSheet', () => {
  beforeEach(() => {
    vi.mocked(useCreateFeatureFlag).mockReset();
    vi.mocked(useUpdateFeatureFlag).mockReset();
  });

  describe('modo crear (flag null)', () => {
    it('con clave inválida no llama al backend (validación zod)', async () => {
      const create = stubCreate();
      stubUpdate();
      const user = userEvent.setup();
      render(<FeatureFlagSheet flag={null} open onOpenChange={vi.fn()} />);

      await user.type(screen.getByLabelText(/clave/i), 'Bad-Key');
      await user.type(screen.getByLabelText(/nombre/i), 'Mal');
      await user.click(screen.getByRole('button', { name: /crear feature flag/i }));

      await waitFor(() =>
        expect(
          screen.getByText(/solo minúsculas, debe empezar con letra/i),
        ).toBeInTheDocument(),
      );
      expect(create.mutate).not.toHaveBeenCalled();
    });

    it('con datos válidos llama a create con el payload del form', async () => {
      const create = stubCreate();
      stubUpdate();
      const user = userEvent.setup();
      render(<FeatureFlagSheet flag={null} open onOpenChange={vi.fn()} />);

      await user.type(screen.getByLabelText(/clave/i), 'new_dashboard');
      await user.type(screen.getByLabelText(/nombre/i), 'New Dashboard');
      await user.click(screen.getByRole('button', { name: /crear feature flag/i }));

      await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
      const [payload] = create.mutate.mock.calls[0] ?? [];
      expect(payload).toEqual({
        key: 'new_dashboard',
        name: 'New Dashboard',
        enabled: false,
      });
    });

    it('al crear con éxito cierra el sheet', async () => {
      const onOpenChange = vi.fn();
      const create = stubCreate();
      create.mutate.mockImplementation((_p, opts?: { onSuccess?: () => void }) => {
        opts?.onSuccess?.();
      });
      stubUpdate();
      const user = userEvent.setup();
      render(<FeatureFlagSheet flag={null} open onOpenChange={onOpenChange} />);

      await user.type(screen.getByLabelText(/clave/i), 'new_dashboard');
      await user.type(screen.getByLabelText(/nombre/i), 'New Dashboard');
      await user.click(screen.getByRole('button', { name: /crear feature flag/i }));

      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it('ante un 409 NO cierra el sheet (form sigue abierto)', async () => {
      const onOpenChange = vi.fn();
      const create = stubCreate();
      create.mutate.mockImplementation((_p, opts?: { onError?: (e: unknown) => void }) => {
        opts?.onError?.({ response: { status: 409 } });
      });
      stubUpdate();
      const user = userEvent.setup();
      render(<FeatureFlagSheet flag={null} open onOpenChange={onOpenChange} />);

      await user.type(screen.getByLabelText(/clave/i), 'new_dashboard');
      await user.type(screen.getByLabelText(/nombre/i), 'New Dashboard');
      await user.click(screen.getByRole('button', { name: /crear feature flag/i }));

      await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe('modo editar (flag presente)', () => {
    it('precarga el nombre y deshabilita la clave (inmutable)', () => {
      stubCreate();
      stubUpdate();
      render(<FeatureFlagSheet flag={FLAG} open onOpenChange={vi.fn()} />);

      expect(screen.getByLabelText(/nombre/i)).toHaveValue('New Dashboard');
      expect(screen.getByLabelText(/clave/i)).toBeDisabled();
    });

    it('al guardar llama a update con la key del flag y el patch del form', async () => {
      stubCreate();
      const update = stubUpdate();
      const user = userEvent.setup();
      render(<FeatureFlagSheet flag={FLAG} open onOpenChange={vi.fn()} />);

      const nombre = screen.getByLabelText(/nombre/i);
      await user.clear(nombre);
      await user.type(nombre, 'New Dashboard V2');
      await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

      await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
      const [vars] = update.mutate.mock.calls[0] ?? [];
      expect(vars).toMatchObject({
        key: 'new_dashboard',
        body: { name: 'New Dashboard V2' },
      });
    });
  });
});
