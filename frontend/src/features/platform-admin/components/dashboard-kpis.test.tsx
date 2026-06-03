import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PlatformDashboard } from '@/types/api';

import { DashboardKpis } from './dashboard-kpis';

const DASHBOARD_COMPLETO: PlatformDashboard = {
  orgsPorStatus: [
    { category: 'ACTIVE', count: 8 },
    { category: 'SUSPENDED', count: 2 },
    { category: 'ARCHIVED', count: 1 },
  ],
  orgsPorPlan: [
    { category: 'FREE', count: 7 },
    { category: 'PRO', count: 4 },
  ],
  orgsPorVertical: [
    { category: 'contabilidad', count: 6 },
    { category: 'granja', count: 3 },
    { category: 'otros', count: 2 },
  ],
  usuarios: { total: 45 },
  altasPorMes: [],
};

describe('DashboardKpis', () => {
  it('renderiza el KPI de total de orgs (suma de todos los status)', () => {
    render(<DashboardKpis data={DASHBOARD_COMPLETO} />);

    // 8 + 2 + 1 = 11
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('renderiza los KPIs de status individualmente', () => {
    render(<DashboardKpis data={DASHBOARD_COMPLETO} />);

    expect(screen.getByText('8')).toBeInTheDocument(); // activas
    // El valor 2 aparece también en Plan (granja count); usar getAllByText
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Suspendidas')).toBeInTheDocument();
    expect(screen.getByText('Archivadas')).toBeInTheDocument();
  });

  it('renderiza los KPIs de plan FREE y PRO', () => {
    render(<DashboardKpis data={DASHBOARD_COMPLETO} />);

    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renderiza los verticales con etiquetas en español', () => {
    render(<DashboardKpis data={DASHBOARD_COMPLETO} />);

    expect(screen.getByText('Contabilidad')).toBeInTheDocument();
    expect(screen.getByText('Granja')).toBeInTheDocument();
    expect(screen.getByText('Sin vertical')).toBeInTheDocument();
  });

  it('renderiza el KPI de usuarios totales', () => {
    render(<DashboardKpis data={DASHBOARD_COMPLETO} />);

    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('en la plataforma')).toBeInTheDocument();
  });

  it('no renderiza la sección vertical si orgsPorVertical está vacío', () => {
    const sinVertical: PlatformDashboard = { ...DASHBOARD_COMPLETO, orgsPorVertical: [] };
    render(<DashboardKpis data={sinVertical} />);

    expect(screen.queryByText('Contabilidad')).not.toBeInTheDocument();
  });
});
