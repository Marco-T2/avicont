import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as authStoreModule from '@/stores/auth-store';

import * as useMyProfileModule from '../hooks/use-my-profile';
import * as useSwitchTenantModule from '../hooks/use-switch-tenant';
import { OrgSwitcher } from './org-switcher';

// Mock de useNavigate para verificar la redirección post-switch sin montar el
// router completo (mismo patrón que comprobantes-page.test.tsx).
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const TENANTS = [
  { id: 'tenant-conta', name: 'Contabilidad SRL', role: 'OWNER' },
  { id: 'tenant-granja', name: 'Granja Los Andes', role: 'ADMIN' },
];

// Captura el callback mutate para poder disparar onSuccess manualmente y
// verificar el efecto (navegación). isPending=false para que los items no
// estén deshabilitados.
const mutateMock = vi.fn();

function mockSwitchTenant() {
  vi.spyOn(useSwitchTenantModule, 'useSwitchTenant').mockReturnValue({
    mutate: mutateMock,
    isPending: false,
  } as unknown as ReturnType<typeof useSwitchTenantModule.useSwitchTenant>);
}

function mockMyProfile() {
  vi.spyOn(useMyProfileModule, 'useMyProfile').mockReturnValue({
    data: { tenants: TENANTS },
    isLoading: false,
  } as unknown as ReturnType<typeof useMyProfileModule.useMyProfile>);
}

function mockActiveTenant(activeTenantId: string) {
  type Selector = (s: { user?: { activeTenantId?: string } }) => unknown;
  vi.spyOn(authStoreModule, 'useAuthStore').mockImplementation(((selector: Selector) =>
    selector({ user: { activeTenantId } })) as typeof authStoreModule.useAuthStore);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMyProfile();
  mockSwitchTenant();
  mockActiveTenant('tenant-conta');
});

function renderSwitcher() {
  return render(
    <MemoryRouter>
      <OrgSwitcher />
    </MemoryRouter>,
  );
}

describe('OrgSwitcher', () => {
  it('al cambiar de organización con éxito, redirige a "/" para evitar páginas huérfanas de otro vertical', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole('button', { name: /cambiar de organización/i }));
    await user.click(screen.getByText('Granja Los Andes'));

    // El componente delega el switch a la mutation con sus callbacks.
    expect(mutateMock).toHaveBeenCalledWith('tenant-granja', expect.any(Object));

    // Simular el éxito del backend disparando el onSuccess que pasó el componente.
    const [, opts] = mutateMock.mock.calls[0] as [string, { onSuccess: () => void }];
    opts.onSuccess();

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('no dispara el switch ni navega si se elige la organización ya activa', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole('button', { name: /cambiar de organización/i }));
    // "Contabilidad SRL" aparece en el trigger y en el menú; apuntar al item.
    const itemActivo = screen
      .getAllByRole('menuitem')
      .find((el) => el.textContent?.includes('Contabilidad SRL'));
    expect(itemActivo).toBeDefined();
    await user.click(itemActivo as HTMLElement);

    expect(mutateMock).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
