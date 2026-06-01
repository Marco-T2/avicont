import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';

import * as useVerticalModule from '@/lib/use-vertical';
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
      </Routes>
    </MemoryRouter>,
  );
}

describe('IndexRedirect', () => {
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
});
