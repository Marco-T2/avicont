import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as useEsSuperAdminModule from '../hooks/use-es-super-admin';

import { PlatformPanelLink } from './platform-panel-link';

function mockEsSuperAdmin(esSuperAdmin: boolean, isLoading = false) {
  vi.spyOn(useEsSuperAdminModule, 'useEsSuperAdmin').mockReturnValue({
    esSuperAdmin,
    isLoading,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

function renderLink() {
  return render(
    <MemoryRouter>
      <PlatformPanelLink />
    </MemoryRouter>,
  );
}

describe('<PlatformPanelLink>', () => {
  it('super-admin → muestra enlace al panel de plataforma', () => {
    mockEsSuperAdmin(true);
    renderLink();
    const link = screen.getByRole('link', { name: 'Ir al panel de plataforma' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/platform-admin');
  });

  it('no super-admin → no renderiza nada (oculto, es navegación §14.7)', () => {
    mockEsSuperAdmin(false);
    const { container } = renderLink();
    expect(screen.queryByRole('link', { name: 'Ir al panel de plataforma' })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('isLoading (fail-closed) → no renderiza el enlace hasta confirmar', () => {
    mockEsSuperAdmin(false, true);
    renderLink();
    expect(screen.queryByRole('link', { name: 'Ir al panel de plataforma' })).not.toBeInTheDocument();
  });
});
