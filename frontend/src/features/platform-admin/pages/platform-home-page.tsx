import { useMemo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { ActivityTimeline } from '../components/activity-timeline';
import { AltasChart } from '../components/altas-chart';
import { DashboardKpis } from '../components/dashboard-kpis';
import { usePlatformActivity } from '../hooks/use-platform-activity';
import { usePlatformDashboard } from '../hooks/use-platform-dashboard';

/**
 * Dashboard de plataforma — landing del panel de super-admin.
 * Container: orquesta usePlatformDashboard (useQuery) + usePlatformActivity
 * (useInfiniteQuery) y pasa datos planos a los componentes presentacionales.
 */
export function PlatformHomePage(): React.JSX.Element {
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
  } = usePlatformDashboard();

  const {
    data: activityData,
    isLoading: activityLoading,
    isError: activityError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = usePlatformActivity();

  // Aplanar todas las páginas de actividad en un array único.
  const activityItems = useMemo(
    () => activityData?.pages.flatMap((p) => p.items) ?? [],
    [activityData],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Panel de plataforma</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Resumen global de organizaciones y actividad del sistema.
          </p>
        </div>
      </div>

      {/* KPIs */}
      {dashboardError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">No se pudieron cargar los KPIs del dashboard.</p>
        </div>
      )}

      {dashboardLoading && (
        <div className="space-y-4">
          <Skeleton className="h-6 w-40" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      )}

      {dashboardData !== undefined && !dashboardLoading && (
        <DashboardKpis data={dashboardData} />
      )}

      {/* Gráfico de altas por mes */}
      {dashboardData !== undefined && !dashboardLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Altas de organizaciones — últimos 12 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <AltasChart altasPorMes={dashboardData.altasPorMes} />
          </CardContent>
        </Card>
      )}

      {/* Timeline de actividad */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Actividad reciente
        </h2>

        {activityError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
            <p className="text-sm text-destructive">
              No se pudo cargar la actividad reciente.
            </p>
          </div>
        )}

        {activityLoading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}

        {!activityLoading && !activityError && (
          <ActivityTimeline
            items={activityItems}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onFetchMore={fetchNextPage}
          />
        )}
      </div>
    </div>
  );
}
