import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
// Cross-feature: el verificador es la puerta de entrada al MISMO módulo de
// conciliación (mismo pack, mismos estados derivados). El design del change
// manda reusar el badge y las etiquetas de `features/conciliacion` en vez de
// duplicarlos — excepción deliberada a §14.6 (que restringe imports de
// components/ de otra feature), documentada en el design del change.
import { EstadoMovimientoBadge } from '@/features/conciliacion/components/estado-movimiento-badge';
import { etiquetaLadoBancario } from '@/features/conciliacion/lib/etiquetas-conciliacion';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import type { MovimientoVerificador } from '@/types/api';

interface MovimientosTablaProps {
  movimientos: MovimientoVerificador[];
  /** alias por `cuentaBancariaId` (sale de la franja `saldos` de la misma respuesta). */
  aliasPorCuenta: Record<string, string>;
  /**
   * REQ-VMB-10 — presentación dual del saldo: `true` SOLO con una cuenta
   * seleccionada (la columna `saldo` es la serie corrida real de ESA cuenta).
   * En cross-cuenta se oculta: son series independientes intercaladas y
   * mostrarlas juntas no significa nada.
   */
  mostrarSaldo: boolean;
  /**
   * Código de moneda cuando TODO el resultado está en una sola moneda: se
   * rotula una vez en la cabecera en vez de repetirlo en cada fila. `null`
   * cuando hay más de una — ahí el código por fila SÍ discrimina y se muestra.
   */
  monedaUnica: string | null;
  isLoading: boolean;
}

// El backend publica la hora como HH:MM:SS; los extractos bancarios traen
// precisión de minuto, así que los segundos son siempre ':00' — ruido en 263
// filas. Se recorta en presentación, el dato crudo no se toca.
function horaSinSegundos(hora: string): string {
  return /^\d{2}:\d{2}:\d{2}$/.test(hora) ? hora.slice(0, 5) : hora;
}

/**
 * Tabla del mayor unificado. El estado que se pinta es `estadoEfectivo`
 * (derivado en cada lectura, REQ-VMB-06), nunca la columna cacheada — ver
 * `EstadoMovimientoBadge`.
 */
export function MovimientosTabla({
  movimientos,
  aliasPorCuenta,
  mostrarSaldo,
  monedaUnica,
  isLoading,
}: MovimientosTablaProps): React.JSX.Element {
  if (isLoading && movimientos.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (movimientos.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay movimientos bancarios en el rango consultado.
        </p>
      </div>
    );
  }

  return (
    // Tabla ancha del dominio: scroll horizontal explícito (frontend §7).
    <div className="overflow-x-auto rounded-md border">
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            {!mostrarSaldo && <TableHead>Cuenta</TableHead>}
            <TableHead>Descripción</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">
              Monto{monedaUnica !== null ? ` (${monedaUnica})` : ''}
            </TableHead>
            {mostrarSaldo && (
              <TableHead className="text-right">
                Saldo{monedaUnica !== null ? ` (${monedaUnica})` : ''}
              </TableHead>
            )}
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movimientos.map((mov) => (
            <TableRow key={mov.id}>
              <TableCell className="whitespace-nowrap tabular-nums">
                {formatearFechaContable(mov.fecha)}
                {mov.hora !== null && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    {horaSinSegundos(mov.hora)}
                  </span>
                )}
              </TableCell>

              {!mostrarSaldo && (
                <TableCell className="whitespace-nowrap">
                  {aliasPorCuenta[mov.cuentaBancariaId] ?? mov.cuentaBancariaId}
                </TableCell>
              )}

              {/* `whitespace-normal` NO es decorativo: TableCell trae
                  `whitespace-nowrap` en su clase base (ui/table.tsx) y el <p>
                  lo hereda, así que sin este reset el texto queda en UNA línea
                  recortada a lo ancho por el overflow:hidden del line-clamp —
                  sin elipsis y sin segunda línea. El clamp era código muerto.

                  Y NO lleva ancho propio a propósito: con un `w-[26rem]` fijo el
                  texto envolvía a los 416 px y dejaba el resto de la columna en
                  blanco en pantallas grandes. Como las demás columnas son
                  `nowrap` (no se dejan achicar) y ésta sí envuelve, el layout
                  automático de la tabla le asigna todo el sobrante: la
                  descripción se adapta al ancho real disponible. */}
              <TableCell className="whitespace-normal">
                <p className="line-clamp-2 break-words" title={mov.descripcion}>
                  {mov.descripcion}
                </p>
                {mov.referencia !== null && (
                  <p
                    className="line-clamp-1 break-all text-xs text-muted-foreground"
                    title={mov.referencia}
                  >
                    Ref. {mov.referencia}
                  </p>
                )}
              </TableCell>

              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {etiquetaLadoBancario(mov.tipo)}
              </TableCell>

              <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                {formatearMontoBob(mov.monto)}
                {monedaUnica === null && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {mov.moneda}
                  </span>
                )}
              </TableCell>

              {mostrarSaldo && (
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {mov.saldo !== null ? (
                    formatearMontoBob(mov.saldo)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}

              <TableCell>
                <EstadoMovimientoBadge movimiento={mov} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
