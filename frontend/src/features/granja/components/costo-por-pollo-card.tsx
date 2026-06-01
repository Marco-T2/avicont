import { AlertTriangle } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { formatCostoPorPollo } from '../lib/formatters';

interface CostoPorPolloCardProps {
  costoPorPolloVivo: string | null;
  avesVivas: number;
  costoAcumulado: string;
  className?: string;
}

/**
 * Card que expone el costo por pollo vivo como el dato más prominente del módulo.
 * `costoPorPolloVivo === null` indica mortalidad total (avesVivas = 0):
 * se muestra con estilo de alerta para que el granjero lo note de inmediato.
 */
export function CostoPorPolloCard({
  costoPorPolloVivo,
  avesVivas,
  costoAcumulado,
  className,
}: CostoPorPolloCardProps): React.JSX.Element {
  const esMortalidadTotal = costoPorPolloVivo === null;

  return (
    <Card
      className={cn(
        'transition-colors',
        esMortalidadTotal && 'border-destructive/50 bg-destructive/5',
        className,
      )}
      data-mortalidad-total={esMortalidadTotal ? 'true' : undefined}
    >
      <CardContent className="pt-4 pb-4">
        {/* Costo por pollo — dato NORTE del módulo. text-3xl mínimo en mobile. */}
        <div className="flex flex-col items-center gap-1 text-center">
          {esMortalidadTotal ? (
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span className="text-xs font-medium uppercase tracking-wide">
                Mortalidad total
              </span>
            </div>
          ) : null}

          <p
            className={cn(
              'text-3xl font-bold tabular-nums leading-none',
              esMortalidadTotal ? 'text-destructive' : 'text-foreground',
            )}
          >
            {formatCostoPorPollo(costoPorPolloVivo)}
          </p>
          <p className="text-xs text-muted-foreground">costo / pollo vivo</p>
        </div>

        {/* Datos secundarios */}
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">Aves vivas</span>
          <span className="text-right font-medium tabular-nums">{avesVivas}</span>

          <span className="text-muted-foreground">Costo acumulado</span>
          <span className="text-right font-medium tabular-nums">Bs {costoAcumulado}</span>
        </div>
      </CardContent>
    </Card>
  );
}
