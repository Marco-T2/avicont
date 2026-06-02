import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as useEsSuperAdminModule from '@/features/platform-admin/hooks/use-es-super-admin';

import { RequireSuperAdmin } from './require-super-admin';

function mockEsSuperAdmin(esSuperAdmin: boolean, isLoading: boolean) {
  vi.spyOn(useEsSuperAdminModule, 'useEsSuperAdmin').mockReturnValue({
    esSuperAdmin,
    isLoading,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/platform-admin']}>
      <Routes>
        <Route
          path="/platform-admin"
          element={
            <RequireSuperAdmin>
              <div>panel-protegido</div>
            </RequireSuperAdmin>
          }
        />
        <Route path="/" element={<div>home-sentinel</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<RequireSuperAdmin>', () => {
  it('esSuperAdmin true → renderiza children', () => {
    mockEsSuperAdmin(true, false);
    renderGuard();
    expect(screen.getByText('panel-protegido')).toBeInTheDocument();
    expect(screen.queryByText('home-sentinel')).not.toBeInTheDocument();
  });

  it('esSuperAdmin false (resuelto) → redirige a /', () => {
    mockEsSuperAdmin(false, false);
    renderGuard();
    expect(screen.queryByText('panel-protegido')).not.toBeInTheDocument();
    expect(screen.getByText('home-sentinel')).toBeInTheDocument();
  });

  it('isLoading → skeleton, sin redirect ni children', () => {
    mockEsSuperAdmin(false, true);
    renderGuard();
    expect(screen.queryByText('panel-protegido')).not.toBeInTheDocument();
    expect(screen.queryByText('home-sentinel')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });
});
