import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import { cn } from '@/lib/utils';
import type {
  ConfianzaSugerencia,
  LineaConciliacion,
  MovimientoConciliacion,
  SugerenciaConciliacion,
} from '@/types/api';

import { etiquetaConfianza } from '../lib/etiquetas-conciliacion';
import { claveLinea, indexarLineas, ordenarSugerencias } from '../lib/sugerencias';

const CLASES_CONFIANZA: Record<ConfianzaSugerencia, string> = {
  ALTA: 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900',
  MEDIA:
    'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900',
  BAJA: 'text-muted-foreground bg-muted border-border',
};

interface SugerenciasPanelProps {
  sugerencias: SugerenciaConciliacion[];
  movimientos: MovimientoConciliacion[];
  lineas: LineaConciliacion[];
  modoConsulta: boolean;
  accionEnCurso: boolean;
  onConfirmar: (sugerencia: SugerenciaConciliacion) => void;
}

/**
 * Panel de sugerencias ranqueadas (REQ-CB-12).
 *
 * El sistema NUNCA auto-confirma (decisión 2): esto es una lista de candidatos
 * y un botón. Nada se escribe hasta que el usuario aprieta "Confirmar".
 */
export function SugerenciasPanel({
  sugerencias,
  movimientos,
  lineas,
  modoConsulta,
  accionEnCurso,
  onConfirmar,
}: SugerenciasPanelProps): React.JSX.Element {
  // Derivado en render, sin useEffect ni estado espejo (Anti-F-02).
  const porMovimiento = new Map(movimientos.map((m) => [m.id, m]));
  const porLinea = indexarLineas(lineas);

  const filas = ordenarSugerencias(sugerencias).flatMap((s) => {
    const mov = porMovimiento.get(s.movimientoId);
    const lin = porLinea.get(claveLinea(s.comprobanteId, s.orden));
    // Una sugerencia sin ambos lados presentes no es mostrable: pasó a ser
    // ruido de una respuesta anterior.
    return mov !== undefined && lin !== undefined ? [{ sugerencia: s, mov, lin }] : [];
  });

  if (filas.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay sugerencias para el rango seleccionado.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-md border">
      <Table className="min-w-[820px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Confianza</TableHead>
            <TableHead className="min-w-[220px]">Movimiento del extracto</TableHead>
            <TableHead className="min-w-[220px]">Línea contable</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            {!modoConsulta && <TableHead className="text-right">Acción</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map(({ sugerencia, mov, lin }) => (
            // Anti-F-06: la sugerencia se identifica por el par que propone.
            <TableRow key={`${sugerencia.movimientoId}~${claveLinea(sugerencia.comprobanteId, sugerencia.orden)}`}>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn('font-normal', CLASES_CONFIANZA[sugerencia.confianza])}
                >
                  {etiquetaConfianza(sugerencia.confianza)}
                </Badge>
                {sugerencia.diferenciaDias > 0 && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {sugerencia.diferenciaDias} días de diferencia
                  </span>
                )}
              </TableCell>
              <TableCell>
                <span className="block">{mov.descripcion}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {formatearFechaContable(mov.fecha)}
                </span>
              </TableCell>
              <TableCell>
                <span className="block">{lin.glosa}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {lin.numeroComprobante ?? '—'} · {formatearFechaContable(lin.fecha)}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums whitespace-nowrap">
                {formatearMontoBob(mov.monto)}
                <span className="ml-1 text-xs text-muted-foreground">{mov.moneda}</span>
              </TableCell>
              {!modoConsulta && (
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    disabled={accionEnCurso}
                    onClick={() => onConfirmar(sugerencia)}
                  >
                    Confirmar
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
