import { Bird, Calendar, Home, Percent } from 'lucide-react';

import { PermissionButton } from '@/components/shared/permission-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PERMISSIONS } from '@/lib/permissions';
import { cn } from '@/lib/utils';

import type { LoteDashboardItem } from '../api/granja.types';
import { formatCostoPorPollo, formatFechaGranja, formatPorcentajeMortalidad } from '../lib/formatters';

interface LoteCardProps {
  lote: LoteDashboardItem;
  onRegistrarMovimiento: (loteId: string) => void;
  onCerrar: (loteId: string) => void;
  className?: string;
}

/**
 * Card mobile-first para un lote activo del dashboard.
 * - Costo/pollo como dato más prominente (norte del módulo).
 * - Botones de acción gateados por permisos.
 * - Lote CERRADO → sin botones de acción.
 */
export function LoteCard({ lote, onRegistrarMovimiento, onCerrar, className }: LoteCardProps): React.JSX.Element {
  const estaActivo = lote.estado === 'ACTIVO';

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg leading-tight">
            {lote.nombre ?? 'Lote sin nombre'}
          </CardTitle>
          <Badge
            variant={estaActivo ? 'default' : 'secondary'}
            className="shrink-0 capitalize"
          >
            {estaActivo ? 'Activo' : 'Cerrado'}
          </Badge>
        </div>

        {lote.galpon !== null ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Home className="h-3.5 w-3.5 shrink-0" />
            {lote.galpon}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {/* Costo por pollo — dato NORTE del módulo */}
        <div className="rounded-md bg-muted/50 px-3 py-3 text-center">
          <p
            className={cn(
              'text-3xl font-bold tabular-nums leading-none',
              lote.costoPorPolloVivo === null && 'text-destructive',
            )}
          >
            {formatCostoPorPollo(lote.costoPorPolloVivo)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">costo / pollo vivo</p>
        </div>

        {/* Métricas secundarias en grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Bird className="h-3.5 w-3.5 shrink-0" />
            <span>Aves vivas</span>
          </div>
          <span className="text-right font-medium tabular-nums">{lote.avesVivas}</span>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Percent className="h-3.5 w-3.5 shrink-0" />
            <span>Mortalidad</span>
          </div>
          <span className="text-right font-medium tabular-nums">
            {formatPorcentajeMortalidad(lote.porcentajeMortalidad)}
          </span>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>Edad</span>
          </div>
          <span className="text-right font-medium tabular-nums">{lote.edadDias} días</span>

          <span className="text-muted-foreground">Ingreso</span>
          <span className="text-right font-medium tabular-nums">
            {formatFechaGranja(lote.fechaIngreso)}
          </span>
        </div>
      </CardContent>

      {/* Botones de acción — solo en lotes ACTIVOS */}
      {estaActivo ? (
        <CardFooter className="flex flex-col gap-2 pt-0 sm:flex-row">
          <PermissionButton
            permission={PERMISSIONS.granja.movimientos.create}
            deniedReason="No tenés permiso para registrar movimientos"
            onClick={() => onRegistrarMovimiento(lote.id)}
            className="w-full min-h-[44px] sm:flex-1"
            size="sm"
          >
            Registrar gasto o mortalidad
          </PermissionButton>

          <PermissionButton
            permission={PERMISSIONS.granja.lotes.update}
            deniedReason="No tenés permiso para cerrar lotes"
            onClick={() => onCerrar(lote.id)}
            variant="outline"
            className="w-full min-h-[44px] sm:flex-1"
            size="sm"
          >
            Cerrar lote
          </PermissionButton>
        </CardFooter>
      ) : null}
    </Card>
  );
}
