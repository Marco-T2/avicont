import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/use-permissions', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/use-permissions')>();
  return {
    ...original,
    useHasSystemRole: vi.fn(),
  };
});

import * as usePermissionsModule from '@/lib/use-permissions';
import { RequireSystemRole } from './require-system-role';

function mockHasSystemRole(result: boolean) {
  vi.mocked(usePermissionsModule.useHasSystemRole).mockReturnValue(result);
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/settings/complementos']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('<RequireSystemRole>', () => {
  it('con rol OWNER → renderiza children', () => {
    mockHasSystemRole(true);
    render(
      <Wrapper>
        <RequireSystemRole roles={['OWNER', 'ADMIN']}>
          <span>página complementos</span>
        </RequireSystemRole>
      </Wrapper>,
    );
    expect(screen.getByText('página complementos')).toBeInTheDocument();
  });

  it('sin rol OWNER/ADMIN → redirige (fail-closed: children NO se renderizan)', () => {
    mockHasSystemRole(false);
    render(
      <Wrapper>
        <RequireSystemRole roles={['OWNER', 'ADMIN']}>
          <span>página complementos</span>
        </RequireSystemRole>
      </Wrapper>,
    );
    expect(screen.queryByText('página complementos')).not.toBeInTheDocument();
  });

  it('NO hay loading state — rol sincrónico del JWT → sin skeleton', () => {
    mockHasSystemRole(false);
    render(
      <Wrapper>
        <RequireSystemRole roles={['OWNER', 'ADMIN']}>
          <span>no debería aparecer</span>
        </RequireSystemRole>
      </Wrapper>,
    );
    // Sin skeleton (a diferencia de RequirePermission que sí tiene)
    expect(document.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument();
    expect(screen.queryByText('no debería aparecer')).not.toBeInTheDocument();
  });
});
