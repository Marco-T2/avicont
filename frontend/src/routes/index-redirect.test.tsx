import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';

import * as useVerticalModule from '@/lib/use-vertical';
import * as useEsSuperAdminModule from '@/features/platform-admin/hooks/use-es-super-admin';
import * as authStoreModule from '@/stores/auth-store';
import type { VerticalActivo } from '@/types/api';

// Mockear DashboardPage y SinModulo como sentinels para aislar IndexRedirect
vi.mock('@/features/dashboard/dashboard-page', () => ({
  DashboardPage: () => <div>contabilidad-sentinel</div>,
}));

vi.mock('./sin-modulo', () => ({
  SinModulo: () => <div>sin-modulo-sentinel</div>,
}));

function mockVertical(v: VerticalActivo | undefined) {
  vi.spyOn(useVerticalModule, 'useVerticalActivo').mockReturnValue({
    vertical: v,
    isLoading: v === undefined,
  });
}

function mockEsSuperAdmin(esSuperAdmin: boolean, isLoading = false) {
  vi.spyOn(useEsSuperAdminModule, 'useEsSuperAdmin').mockReturnValue({
    esSuperAdmin,
    isLoading,
  });
}

function mockActiveTenantId(activeTenantId: string | undefined) {
  type Selector = (s: { user?: { activeTenantId?: string } }) => unknown;
  vi.spyOn(authStoreModule, 'useAuthStore').mockImplementation(((selector: Selector) =>
    selector({
      user: activeTenantId !== undefined ? { activeTenantId } : {},
    })) as typeof authStoreModule.useAuthStore);
}

// Importar después de los mocks
import { IndexRedirect } from './index-redirect';

afterEach(() => {
  vi.clearAllMocks();
});

function renderWithRouter(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<IndexRedirect />} />
        <Route path="/granja" element={<div>granja-sentinel</div>} />
        <Route path="/platform-admin" element={<div>platform-sentinel</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('IndexRedirect', () => {
  // Default para los casos de vertical: usuario normal con tenant activo.
  // La rama de super-admin sin tenant solo se activa en sus tests dedicados.
  beforeEach(() => {
    mockEsSuperAdmin(false);
    mockActiveTenantId('tenant-1');
  });

  it('vertical GRANJA: navega a /granja', () => {
    mockVertical('GRANJA');
    renderWithRouter('/');
    expect(screen.getByText('granja-sentinel')).toBeInTheDocument();
    expect(screen.queryByText('contabilidad-sentinel')).not.toBeInTheDocument();
  });

  it('vertical CONTABILIDAD: renderiza DashboardPage', () => {
    mockVertical('CONTABILIDAD');
    renderWithRouter('/');
    expect(screen.getByText('contabilidad-sentinel')).toBeInTheDocument();
    expect(screen.queryByText('granja-sentinel')).not.toBeInTheDocument();
  });

  it('vertical undefined (cargando): muestra skeleton, NO navega a /granja ni renderiza DashboardPage', () => {
    mockVertical(undefined);
    const { container } = renderWithRouter('/');
    // No navega, no muestra dashboard ni sin-modulo
    expect(screen.queryByText('granja-sentinel')).not.toBeInTheDocument();
    expect(screen.queryByText('contabilidad-sentinel')).not.toBeInTheDocument();
    expect(screen.queryByText('sin-modulo-sentinel')).not.toBeInTheDocument();
    // Garantía REQ-SV-3: el skeleton está presente (anti-flash)
    expect(container.querySelector('[data-testid="index-redirect-skeleton"]')).toBeInTheDocument();
  });

  it('vertical null: renderiza SinModulo', () => {
    mockVertical(null);
    renderWithRouter('/');
    expect(screen.getByText('sin-modulo-sentinel')).toBeInTheDocument();
    expect(screen.queryByText('contabilidad-sentinel')).not.toBeInTheDocument();
    expect(screen.queryByText('granja-sentinel')).not.toBeInTheDocument();
  });

  describe('rama super-admin', () => {
    it('super-admin SIN activeTenantId → navega a /platform-admin', () => {
      mockEsSuperAdmin(true);
      mockActiveTenantId(undefined);
      mockVertical(undefined);
      renderWithRouter('/');
      expect(screen.getByText('platform-sentinel')).toBeInTheDocument();
      expect(
        screen.queryByText('[data-testid="index-redirect-skeleton"]'),
      ).not.toBeInTheDocument();
    });

    it('super-admin CON activeTenantId → sigue el flujo de vertical (no secuestra)', () => {
      mockEsSuperAdmin(true);
      mockActiveTenantId('tenant-1');
      mockVertical('CONTABILIDAD');
      renderWithRouter('/');
      expect(screen.getByText('contabilidad-sentinel')).toBeInTheDocument();
      expect(screen.queryByText('platform-sentinel')).not.toBeInTheDocument();
    });

    it('no super-admin sin tenant → flujo existente (skeleton mientras vertical undefined)', () => {
      mockEsSuperAdmin(false);
      mockActiveTenantId(undefined);
      mockVertical(undefined);
      const { container } = renderWithRouter('/');
      expect(screen.queryByText('platform-sentinel')).not.toBeInTheDocument();
      expect(
        container.querySelector('[data-testid="index-redirect-skeleton"]'),
      ).toBeInTheDocument();
    });

    it('useEsSuperAdmin().isLoading → skeleton (no redirect prematuro)', () => {
      mockEsSuperAdmin(false, true);
      mockActiveTenantId(undefined);
      mockVertical(undefined);
      const { container } = renderWithRouter('/');
      expect(screen.queryByText('platform-sentinel')).not.toBeInTheDocument();
      expect(
        container.querySelector('[data-testid="index-redirect-skeleton"]'),
      ).toBeInTheDocument();
    });
  });
});
