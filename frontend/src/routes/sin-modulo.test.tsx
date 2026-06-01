import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';

import * as usePermissionsModule from '@/lib/use-permissions';

import { SinModulo } from './sin-modulo';

function mockIsAdmin(isAdmin: boolean) {
  vi.spyOn(usePermissionsModule, 'useHasSystemRole').mockReturnValue(isAdmin);
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('SinModulo', () => {
  it('admin: muestra mensaje "No hay un módulo activo" y botón/enlace a /settings/features', () => {
    mockIsAdmin(true);
    render(
      <Wrapper>
        <SinModulo />
      </Wrapper>,
    );
    expect(screen.getByText(/No hay un módulo activo/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Activá un módulo/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/settings/features');
  });

  it('no-admin: muestra mensaje sobre el administrador; NO hay botón ni enlace a /settings/features', () => {
    mockIsAdmin(false);
    render(
      <Wrapper>
        <SinModulo />
      </Wrapper>,
    );
    expect(
      screen.getByText(/Tu organización no tiene un módulo activo/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Activá un módulo/i }),
    ).not.toBeInTheDocument();
    // No debe haber ningún enlace a /settings/features
    const allLinks = screen.queryAllByRole('link');
    for (const link of allLinks) {
      expect(link).not.toHaveAttribute('href', '/settings/features');
    }
  });
});
