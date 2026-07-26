import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router';

// Cross-feature: mismas etiquetas de motivo que el workspace de conciliación
// (mismo módulo/pack) — el design del change manda reusarlas, no duplicarlas.
import { etiquetaMotivoVinculoRoto } from '@/features/conciliacion/lib/etiquetas-conciliacion';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import type { AuditoriaVinculos } from '@/types/api';

interface AuditoriaVinculosBannerProps {
  auditoria: AuditoriaVinculos;
  aliasPorCuenta: Record<string, string>;
}

/**
 * Franja de auditoría de vínculos rotos (REQ-VMB-07).
 *
 * Solo existe cuando el request llevó filtro `estado`: ese filtro (que mira la
 * columna cacheada) puede ESCONDER movimientos cuyo vínculo se rompió — la
 * franja los destapa fuera de la paginación, con el total REAL aunque la lista
 * venga al tope de 100.
 */
export function AuditoriaVinculosBanner({
  auditoria,
  aliasPorCuenta,
}: AuditoriaVinculosBannerProps): React.JSX.Element | null {
  if (!auditoria.aplicada || auditoria.total === 0) return null;

  const { total, rotos } = auditoria;

  return (
    <div
      role="alert"
      className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 space-y-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {total === 1
            ? '1 movimiento con vínculo roto'
            : `${total} movimientos con vínculo roto`}{' '}
          que el filtro de estado escondería
        </p>
        <Link
          to="/conciliacion"
          className="text-sm font-medium underline underline-offset-4 text-amber-800 dark:text-amber-300 self-start sm:self-auto"
        >
          Ir a conciliación
        </Link>
      </div>

      {total > rotos.length && (
        <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
          Mostrando los primeros {rotos.length} de {total}.
        </p>
      )}

      <ul className="divide-y divide-amber-200 dark:divide-amber-900">
        {rotos.map((r) => (
          <li
            key={r.movimientoBancarioId}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5 text-sm"
          >
            <span className="whitespace-nowrap tabular-nums text-muted-foreground">
              {formatearFechaContable(r.fecha)}
            </span>
            <span className="whitespace-nowrap">
              {aliasPorCuenta[r.cuentaBancariaId] ?? r.cuentaBancariaId}
            </span>
            <span className="whitespace-nowrap font-semibold tabular-nums">
              {formatearMontoBob(r.monto)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">{r.moneda}</span>
            </span>
            <span className="min-w-0 flex-1 truncate" title={r.descripcion}>
              {r.descripcion}
            </span>
            <span className="text-xs text-muted-foreground">
              {etiquetaMotivoVinculoRoto(r.motivo)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
