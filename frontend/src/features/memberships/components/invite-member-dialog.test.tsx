import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssignableRole } from '@/types/api';

import { InviteMemberDialog } from './invite-member-dialog';

// Mock del hook de roles asignables para controlar data en tests.
const mockUseAssignableRoles = vi.fn();
vi.mock('../hooks/use-assignable-roles', () => ({
  useAssignableRoles: (...args: unknown[]) => mockUseAssignableRoles(...args),
}));

// Mock de useCreateInvitation para inspeccionar el body enviado.
const mockMutate = vi.fn();
vi.mock('@/features/invitations/hooks/use-invitations', () => ({
  useCreateInvitation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

// Mock de sonner para evitar errores de portal.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const rolesBase: AssignableRole[] = [
  { id: 'ADMIN', name: 'Administrador', kind: 'system', description: 'Todos los permisos excepto transferir ownership' },
];

// UUID válido para que el schema Zod lo acepte (customRoleId: z.string().uuid()).
const CUSTOM_ROLE_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const rolesConCustom: AssignableRole[] = [
  { id: 'ADMIN', name: 'Administrador', kind: 'system', description: 'Todos los permisos excepto transferir ownership' },
  { id: CUSTOM_ROLE_UUID, name: 'Contador', kind: 'custom' },
];

const rolesConOwner: AssignableRole[] = [
  { id: 'OWNER', name: 'Propietario', kind: 'system', description: 'Control total — puede agregar/quitar owners' },
  { id: 'ADMIN', name: 'Administrador', kind: 'system', description: 'Todos los permisos excepto transferir ownership' },
  { id: CUSTOM_ROLE_UUID, name: 'Contador', kind: 'custom' },
];

afterEach(() => {
  vi.clearAllMocks();
});

function renderDialog(open = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <InviteMemberDialog open={open} onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('InviteMemberDialog', () => {
  it('con open: false — el hook se llama con false (query deshabilitada)', () => {
    mockUseAssignableRoles.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderDialog(false);
    // El hook debe haber sido llamado con open=false para que la query esté deshabilitada.
    expect(mockUseAssignableRoles).toHaveBeenCalledWith(false);
  });

  it('con hook en loading — el select está deshabilitado y muestra texto de carga', async () => {
    mockUseAssignableRoles.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderDialog();
    // El trigger del select debe aparecer deshabilitado.
    await waitFor(() => {
      const trigger = screen.getByRole('combobox');
      expect(trigger).toBeDisabled();
    });
    // El botón de enviar también debe estar deshabilitado.
    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled();
  });

  it('con hook devolviendo roles — muestra el grupo Sistema con Administrador', async () => {
    mockUseAssignableRoles.mockReturnValue({ data: rolesBase, isLoading: false, isError: false });
    renderDialog();

    const user = userEvent.setup();
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByText('Sistema')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /administrador/i })).toBeInTheDocument();
    });
  });

  it('con hook devolviendo roles custom — muestra el grupo Personalizados con Contador', async () => {
    mockUseAssignableRoles.mockReturnValue({ data: rolesConCustom, isLoading: false, isError: false });
    renderDialog();

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getByText('Personalizados')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /contador/i })).toBeInTheDocument();
    });
  });

  it('OWNER NO aparece cuando el hook no lo devuelve', async () => {
    mockUseAssignableRoles.mockReturnValue({ data: rolesBase, isLoading: false, isError: false });
    renderDialog();

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));

    await waitFor(() => {
      // Administrador sí aparece.
      expect(screen.getByRole('option', { name: /administrador/i })).toBeInTheDocument();
    });
    // Propietario NO aparece.
    expect(screen.queryByRole('option', { name: /propietario/i })).not.toBeInTheDocument();
  });

  it('OWNER aparece cuando el hook lo incluye', async () => {
    mockUseAssignableRoles.mockReturnValue({ data: rolesConOwner, isLoading: false, isError: false });
    renderDialog();

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /propietario/i })).toBeInTheDocument();
    });
  });

  it('elegir un rol custom → el body de la mutación lleva customRoleId y NO systemRole', async () => {
    mockUseAssignableRoles.mockReturnValue({ data: rolesConCustom, isLoading: false, isError: false });
    renderDialog();

    const user = userEvent.setup();

    // Completar el email.
    await user.type(screen.getByLabelText(/email/i), 'test@empresa.bo');

    // Abrir el select y elegir el custom rol "Contador".
    await user.click(screen.getByRole('combobox'));
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /contador/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('option', { name: /contador/i }));

    // Enviar el formulario.
    await user.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@empresa.bo',
          customRoleId: CUSTOM_ROLE_UUID,
        }),
        expect.anything(),
      );
    });

    // NO debe tener systemRole.
    const callArgs = mockMutate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty('systemRole');
  });

  it('elegir un rol system → el body contiene systemRole y NO customRoleId', async () => {
    mockUseAssignableRoles.mockReturnValue({ data: rolesConCustom, isLoading: false, isError: false });
    renderDialog();

    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/email/i), 'admin@empresa.bo');

    // El select ya tiene ADMIN seleccionado por defecto — enviar directo.
    await user.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@empresa.bo',
          systemRole: 'ADMIN',
        }),
        expect.anything(),
      );
    });

    const callArgs = mockMutate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty('customRoleId');
  });

  it('con hook en isError — muestra mensaje de error inline sin lanzar excepción', () => {
    mockUseAssignableRoles.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    // No debe lanzar excepción no capturada.
    expect(() => renderDialog()).not.toThrow();
    expect(screen.getByText(/no se pudieron cargar los roles/i)).toBeInTheDocument();
  });

  it('tras invitar con éxito — muestra el enlace de aceptación con el token', async () => {
    mockUseAssignableRoles.mockReturnValue({ data: rolesBase, isLoading: false, isError: false });
    mockMutate.mockImplementation(
      (_body: unknown, opts: { onSuccess: (d: unknown) => void }) => {
        opts.onSuccess({ invitation: {}, token: 'tok-abc-123' });
      },
    );
    renderDialog();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'nuevo@empresa.bo');
    await user.click(screen.getByRole('button', { name: /enviar/i }));

    const linkInput = await screen.findByLabelText(/enlace de invitación/i);
    expect((linkInput as HTMLInputElement).value).toContain(
      '/accept-invite?token=tok-abc-123',
    );
    // El email del invitado se muestra en el resumen de éxito.
    expect(screen.getByText(/nuevo@empresa\.bo/i)).toBeInTheDocument();
  });

  it('el botón copiar escribe el enlace en el portapapeles', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockUseAssignableRoles.mockReturnValue({ data: rolesBase, isLoading: false, isError: false });
    mockMutate.mockImplementation(
      (_body: unknown, opts: { onSuccess: (d: unknown) => void }) => {
        opts.onSuccess({ invitation: {}, token: 'tok-xyz' });
      },
    );
    renderDialog();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'nuevo@empresa.bo');
    await user.click(screen.getByRole('button', { name: /enviar/i }));
    await screen.findByLabelText(/enlace de invitación/i);

    // defineProperty DESPUÉS del setup de userEvent (que stubea su propio
    // clipboard); navigator.clipboard es getter-only, no admite Object.assign.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    await user.click(screen.getByRole('button', { name: /copiar enlace/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('/accept-invite?token=tok-xyz'),
      );
    });
  });

  it('con hook devolviendo solo roles system (sin custom) — grupo Sistema funciona; sin grupo Personalizados', async () => {
    mockUseAssignableRoles.mockReturnValue({ data: rolesBase, isLoading: false, isError: false });
    renderDialog();

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getByText('Sistema')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /administrador/i })).toBeInTheDocument();
    });

    // No debe aparecer el grupo Personalizados cuando no hay custom roles.
    expect(screen.queryByText('Personalizados')).not.toBeInTheDocument();
  });
});
