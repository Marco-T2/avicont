import type { OrgPlanCount, OrgStatusCount, OrgVerticalCount, PlatformDashboard } from '@/types/api';

import { KpiCard } from './kpi-card';

export interface DashboardKpisProps {
  /** Datos del dashboard ya resueltos (sin undefined/null). */
  data: PlatformDashboard;
}

/** Suma el total de orgs contando todos los status. */
function totalOrgs(items: OrgStatusCount[]): number {
  return items.reduce((acc, item) => acc + item.count, 0);
}

/** Extrae el conteo de un valor específico de categoría, o 0 si no existe. */
function contarCategoria<T extends { category: string; count: number }>(
  items: T[],
  category: string,
): number {
  return items.find((i) => i.category === category)?.count ?? 0;
}

/** Extrae el label de vertical para mostrar al usuario. */
function labelVertical(vertical: string): string {
  const labels: Record<string, string> = {
    contabilidad: 'Contabilidad',
    granja: 'Granja',
    otros: 'Sin vertical',
  };
  return labels[vertical] ?? vertical;
}

/**
 * Grilla de KPIs del dashboard de plataforma. Presentacional puro.
 *
 * Muestra 4 grupos: status de orgs, plan, vertical activo, usuarios.
 */
export function DashboardKpis({ data }: DashboardKpisProps): React.JSX.Element {
  const total = totalOrgs(data.orgsPorStatus);
  const activas = contarCategoria(data.orgsPorStatus, 'ACTIVE');
  const suspendidas = contarCategoria(data.orgsPorStatus, 'SUSPENDED');
  const archivadas = contarCategoria(data.orgsPorStatus, 'ARCHIVED');
  const planFree = contarCategoria<OrgPlanCount>(data.orgsPorPlan, 'FREE');
  const planPro = contarCategoria<OrgPlanCount>(data.orgsPorPlan, 'PRO');

  return (
    <div className="space-y-6">
      {/* Status de organizaciones */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Organizaciones
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard title="Total" value={total} />
          <KpiCard title="Activas" value={activas} />
          <KpiCard title="Suspendidas" value={suspendidas} />
          <KpiCard title="Archivadas" value={archivadas} />
        </div>
      </div>

      {/* Plan de suscripción */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Plan
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard title="Free" value={planFree} />
          <KpiCard title="Pro" value={planPro} />
        </div>
      </div>

      {/* Vertical activo */}
      {data.orgsPorVertical.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Vertical
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.orgsPorVertical.map((v: OrgVerticalCount) => (
              <KpiCard
                key={v.category}
                title={labelVertical(v.category)}
                value={v.count}
              />
            ))}
          </div>
        </div>
      )}

      {/* Usuarios */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Usuarios
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard title="Registrados" value={data.usuarios.total} label="en la plataforma" />
        </div>
      </div>
    </div>
  );
}
