import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as authStoreModule from '@/stores/auth-store';

import { PlatformShell } from './platform-shell';

// El auth-store responde a dos selectores en este shell: s.clear (logout) y
// s.user?.activeTenantId (decide si mostrar "Volver a la app").
function mockAuthStore(activeTenantId: string | undefined) {
  const state = {
    user: activeTenantId !== undefined ? { activeTenantId } : {},
    clear: vi.fn(),
  };
  vi.spyOn(authStoreModule, 'useAuthStore').mockImplementation(((
    selector: (s: typeof state) => unknown,
  ) => selector(state)) as typeof authStoreModule.useAuthStore);
}

afterEach(() => {
  vi.clearAllMocks();
});

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/platform-admin']}>
      <PlatformShell />
    </MemoryRouter>,
  );
}

describe('<PlatformShell> — "Volver a la app"', () => {
  it('con tenant activo → muestra "Volver a la app"', () => {
    mockAuthStore('tenant-1');
    renderShell();
    expect(screen.getAllByText('Volver a la app').length).toBeGreaterThan(0);
  });

  it('super-admin SIN tenant activo → oculta "Volver a la app" (evita rebote a /platform-admin)', () => {
    mockAuthStore(undefined);
    renderShell();
    expect(screen.queryByText('Volver a la app')).not.toBeInTheDocument();
  });
});
