import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateOrgSheet } from './create-org-sheet';

vi.mock('../hooks/use-create-org', () => ({
  useCreateOrg: vi.fn(),
}));

import { useCreateOrg } from '../hooks/use-create-org';

type MutationStub = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
};

function mockMutation(stub: Partial<MutationStub>): MutationStub {
  const value = {
    mutate: vi.fn(),
    isPending: false,
    ...stub,
  } satisfies MutationStub;
  vi.mocked(useCreateOrg).mockReturnValue(value as unknown as ReturnType<typeof useCreateOrg>);
  return value;
}

describe('CreateOrgSheet', () => {
  beforeEach(() => {
    vi.mocked(useCreateOrg).mockReset();
  });

  it('con nombre vacío no llama al backend (validación zod)', async () => {
    const mutation = mockMutation({});
    const user = userEvent.setup();
    render(<CreateOrgSheet open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText(/email del responsable/i), 'owner@example.com');
    await user.click(screen.getByRole('button', { name: /crear organización/i }));

    await waitFor(() =>
      expect(screen.getByText('El nombre es obligatorio')).toBeInTheDocument(),
    );
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('con email inválido no llama al backend (validación zod)', async () => {
    const mutation = mockMutation({});
    const user = userEvent.setup();
    render(<CreateOrgSheet open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText(/nombre/i), 'Avícola Test');
    await user.type(screen.getByLabelText(/email del responsable/i), 'no-es-email');
    await user.click(screen.getByRole('button', { name: /crear organización/i }));

    await waitFor(() =>
      expect(screen.getByText('Formato de email inválido')).toBeInTheDocument(),
    );
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('con datos válidos llama a mutate con el payload del form', async () => {
    const mutation = mockMutation({});
    const user = userEvent.setup();
    render(<CreateOrgSheet open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText(/nombre/i), 'Avícola del Sur');
    await user.type(screen.getByLabelText(/email del responsable/i), 'owner@example.com');
    await user.click(screen.getByRole('button', { name: /crear organización/i }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    const [payload] = mutation.mutate.mock.calls[0] ?? [];
    expect(payload).toEqual({
      name: 'Avícola del Sur',
      modulo: 'CONTABILIDAD',
      ownerEmail: 'owner@example.com',
    });
  });

  it('al crear con éxito cierra el sheet (onOpenChange false)', async () => {
    const onOpenChange = vi.fn();
    const mutation = mockMutation({});
    mutation.mutate.mockImplementation((_payload, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    const user = userEvent.setup();
    render(<CreateOrgSheet open onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText(/nombre/i), 'Avícola del Sur');
    await user.type(screen.getByLabelText(/email del responsable/i), 'owner@example.com');
    await user.click(screen.getByRole('button', { name: /crear organización/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('ante error 422 NO cierra el sheet (form sigue abierto para corregir)', async () => {
    const onOpenChange = vi.fn();
    const mutation = mockMutation({});
    mutation.mutate.mockImplementation((_payload, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.({ response: { status: 422 } });
    });
    const user = userEvent.setup();
    render(<CreateOrgSheet open onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText(/nombre/i), 'Org sin owner');
    await user.type(screen.getByLabelText(/email del responsable/i), 'ghost@example.com');
    await user.click(screen.getByRole('button', { name: /crear organización/i }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('con isPending deshabilita el botón de submit', () => {
    mockMutation({ isPending: true });
    render(<CreateOrgSheet open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /creando/i })).toBeDisabled();
  });
});
