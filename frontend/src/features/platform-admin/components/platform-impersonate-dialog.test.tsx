import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ----------------------------------------------------------------
// Mocks al tope — vi.mock se eleva (hoisted) antes de los imports
// ----------------------------------------------------------------

vi.mock('../../../features/impersonation/hooks/use-impersonation', () => ({
  useStartImpersonation: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return { ...original, useNavigate: vi.fn() };
});

import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useStartImpersonation } from '../../../features/impersonation/hooks/use-impersonation';
import { PlatformImpersonateDialog } from './platform-impersonate-dialog';

const mockNavigate = vi.fn();
vi.mocked(useNavigate).mockReturnValue(mockNavigate);

type MutationStub = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
};

function mockMutation(overrides: Partial<MutationStub> = {}): MutationStub {
  const stub: MutationStub = { mutate: vi.fn(), isPending: false, ...overrides };
  vi.mocked(useStartImpersonation).mockReturnValue(
    stub as unknown as ReturnType<typeof useStartImpersonation>,
  );
  return stub;
}

const TARGET_USER = { id: 'user-123', email: 'target@example.com', displayName: 'Juan Pérez' };
const ORG_ID = 'org-456';

function renderDialog(open = true, onOpenChange = vi.fn()) {
  return render(
    <MemoryRouter>
      <PlatformImpersonateDialog
        open={open}
        onOpenChange={onOpenChange}
        targetUser={TARGET_USER}
        orgId={ORG_ID}
      />
    </MemoryRouter>,
  );
}

describe('PlatformImpersonateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  });

  it('renderiza con el nombre del target y el botón de confirmar', () => {
    mockMutation();
    renderDialog();

    expect(screen.getByText(/impersonar a juan pérez/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar impersonation/i })).toBeInTheDocument();
  });

  it('reason vacío → submit dispara validación, no llama backend', async () => {
    const mutation = mockMutation();
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /iniciar impersonation/i }));

    await waitFor(() => {
      expect(screen.getByText(/al menos 10 caracteres/i)).toBeInTheDocument();
    });
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('reason < 10 chars → error de validación, no llama backend', async () => {
    const mutation = mockMutation();
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByRole('textbox'), 'corta');
    await user.click(screen.getByRole('button', { name: /iniciar impersonation/i }));

    await waitFor(() => {
      expect(screen.getByText(/al menos 10 caracteres/i)).toBeInTheDocument();
    });
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('reason válido + confirm → llama mutation con { targetUserId, reason, organizationId }', async () => {
    const mutation = mockMutation();
    mutation.mutate.mockImplementation((_body, options) => {
      (options as { onSuccess?: () => void }).onSuccess?.();
    });
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByRole('textbox'),
      'Soporte: revisión de cuenta del cliente',
    );
    await user.click(screen.getByRole('button', { name: /iniciar impersonation/i }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    const [body] = mutation.mutate.mock.calls[0] ?? [];
    expect(body).toMatchObject({
      targetUserId: 'user-123',
      reason: 'Soporte: revisión de cuenta del cliente',
      organizationId: 'org-456',
    });
  });

  it('isPending → botón muestra spinner y está deshabilitado', () => {
    mockMutation({ isPending: true });
    renderDialog();

    // Cuando isPending=true el botón muestra "Iniciando…" y tiene disabled
    const btn = screen.getByRole('button', { name: /iniciando/i });
    expect(btn).toBeDisabled();
  });

  it('éxito → setToken + navigate("/")', async () => {
    // El hook ya maneja setToken+invalidateQueries en onSuccess.
    // El componente navega a "/" en el onSuccess de mutate.
    const mutation = mockMutation();
    mutation.mutate.mockImplementation((_body, options) => {
      (options as { onSuccess?: () => void }).onSuccess?.();
    });
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByRole('textbox'), 'Soporte: revisión de cuenta');
    await user.click(screen.getByRole('button', { name: /iniciar impersonation/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('error backend → toast.error + dialog permanece abierto', async () => {
    const mutation = mockMutation();
    mutation.mutate.mockImplementation((_body, options) => {
      (options as { onError?: (e: Error) => void }).onError?.(
        new Error('IMPERSONATION_TARGET_ES_OWNER'),
      );
    });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <PlatformImpersonateDialog
          open
          onOpenChange={onOpenChange}
          targetUser={TARGET_USER}
          orgId={ORG_ID}
        />
      </MemoryRouter>,
    );

    await user.type(screen.getByRole('textbox'), 'Soporte: revisión de cuenta');
    await user.click(screen.getByRole('button', { name: /iniciar impersonation/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1);
    });
    // El dialog no se cerró
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
