import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformOrg } from '@/types/api';

import { EntitlementSheet } from './entitlement-sheet';

vi.mock('../hooks/use-update-entitlement', () => ({
  useUpdateEntitlement: vi.fn(),
}));

import { useUpdateEntitlement } from '../hooks/use-update-entitlement';

type MutationStub = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
};

function mockMutation(stub: Partial<MutationStub>): MutationStub {
  const value = { mutate: vi.fn(), isPending: false, ...stub } satisfies MutationStub;
  vi.mocked(useUpdateEntitlement).mockReturnValue(
    value as unknown as ReturnType<typeof useUpdateEntitlement>,
  );
  return value;
}

const ORG: PlatformOrg = {
  id: 'org-3',
  name: 'Avícola Entitlement',
  slug: 'avicola-entitlement',
  status: 'ACTIVE',
  plan: 'FREE',
  contabilidadEnabled: true,
  granjaEnabled: false,
  createdAt: '2026-06-02T10:00:00Z',
};

describe('EntitlementSheet', () => {
  beforeEach(() => {
    vi.mocked(useUpdateEntitlement).mockReset();
  });

  it('al enviar sin cambios llama a mutate con el estado actual de la org', async () => {
    const mutation = mockMutation({});
    const user = userEvent.setup();
    render(<EntitlementSheet org={ORG} open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    const [vars] = mutation.mutate.mock.calls[0] ?? [];
    expect(vars).toEqual({
      id: 'org-3',
      body: { plan: 'FREE', contabilidadEnabled: true, granjaEnabled: false },
    });
  });

  it('si se activan ambas verticales no llama al backend (guard de exclusividad)', async () => {
    const mutation = mockMutation({});
    const user = userEvent.setup();
    render(<EntitlementSheet org={ORG} open onOpenChange={vi.fn()} />);

    // Org parte con contabilidad activa; activar también granja viola la exclusividad.
    await user.click(screen.getByLabelText(/granja/i));
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(
        screen.getByText(
          /solo puede tener un vertical activo \(contabilidad o granja, no ambos\)/i,
        ),
      ).toBeInTheDocument(),
    );
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('al actualizar con éxito cierra el sheet (onOpenChange false)', async () => {
    const onOpenChange = vi.fn();
    const mutation = mockMutation({});
    mutation.mutate.mockImplementation((_vars, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    const user = userEvent.setup();
    render(<EntitlementSheet org={ORG} open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('ante error 422 NO cierra el sheet (form sigue abierto para corregir)', async () => {
    const onOpenChange = vi.fn();
    const mutation = mockMutation({});
    mutation.mutate.mockImplementation((_vars, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.({ response: { status: 422 } });
    });
    const user = userEvent.setup();
    render(<EntitlementSheet org={ORG} open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('con isPending deshabilita el botón de submit', () => {
    mockMutation({ isPending: true });
    render(<EntitlementSheet org={ORG} open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /guardando/i })).toBeDisabled();
  });
});
