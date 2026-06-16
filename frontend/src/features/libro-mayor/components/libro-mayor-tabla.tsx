import { ChevronDown, ChevronRight } from 'lucide-react';
import React, { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { cn } from '@/lib/utils';
import type { CuentaLibroMayor } from '@/types/api';
import { formatearMontoBob } from '../lib/formatear-monto-bob';

// ============================================================
// Props
// ============================================================

interface LibroMayorTablaProps {
  cuentas: CuentaLibroMayor[] | undefined;
  totalDebeBob: string;
  totalHaberBob: string;
  isLoading: boolean;
  isError: boolean;
}

// ============================================================
// Sub-componentes
// ============================================================

function TableSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

interface MontoBobProps {
  monto: string;
  className?: string;
}

function MontoBob({ monto, className }: MontoBobProps): React.JSX.Element {
  return (
    <span className={cn('font-mono tabular-nums text-sm', className)}>
      <span className="text-muted-foreground text-xs mr-0.5">Bs</span>
      {formatearMontoBob(monto)}
    </span>
  );
}

interface SaldoStatProps {
  label: string;
  monto: string;
  resaltado?: boolean;
}

/** Mini-stat de la cabecera de cuenta: etiqueta arriba, monto abajo. */
function SaldoStat({ label, monto, resaltado = false }: SaldoStatProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <MontoBob monto={monto} className={cn(resaltado && 'font-semibold')} />
    </div>
  );
}

interface CuentaBloqueProps {
  cuenta: CuentaLibroMayor;
}

/**
 * Bloque expandible por cuenta del Libro Mayor.
 *
 * Cabecera (siempre visible, clickeable): código + nombre + naturaleza +
 * saldo inicial / debe / haber / saldo final.
 * Cuerpo (al expandir): tabla de movimientos con saldo corriente acumulado.
 *
 * Anti-F-02: la expansión es estado local de UI (useState), no derivado.
 */
function CuentaBloque({ cuenta }: CuentaBloqueProps): React.JSX.Element {
  const [expandido, setExpandido] = useState(false);
  const Chevron = expandido ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-md border overflow-hidden">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        aria-expanded={expandido}
        className="flex w-full flex-col gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/40 md:flex-row md:items-center md:justify-between"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
            {cuenta.codigoInterno}
          </span>
          <span className="truncate text-sm font-medium">{cuenta.nombreCuenta}</span>
          <Badge variant="secondary" className="shrink-0">
            {cuenta.naturaleza}
          </Badge>
        </div>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-1 pl-6 md:pl-0">
          <SaldoStat label="Saldo inicial" monto={cuenta.saldoInicialBob} />
          <SaldoStat label="Debe" monto={cuenta.totalDebeBob} />
          <SaldoStat label="Haber" monto={cuenta.totalHaberBob} />
          <SaldoStat label="Saldo final" monto={cuenta.saldoFinalBob} resaltado />
        </div>
      </button>

      {expandido && (
        <div className="overflow-x-auto border-t">
          <Table className="min-w-[700px] table-fixed">
            <colgroup>
              <col className="w-[13%]" /> {/* Fecha */}
              <col className="w-[16%]" /> {/* Comprobante */}
              <col className="w-[33%]" /> {/* Glosa */}
              <col className="w-[12%]" /> {/* Debe */}
              <col className="w-[12%]" /> {/* Haber */}
              <col className="w-[14%]" /> {/* Saldo corriente */}
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Comprobante</TableHead>
                <TableHead>Glosa</TableHead>
                <TableHead className="text-right">Debe BOB</TableHead>
                <TableHead className="text-right">Haber BOB</TableHead>
                <TableHead className="text-right">Saldo BOB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cuenta.movimientos.map((m) => (
                // Anti-F-06: key estable por comprobante + orden (no índice de render).
                <TableRow
                  key={`${m.comprobanteId}-${m.orden}`}
                  className={cn(m.anulado && 'opacity-60')}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {formatearFechaContable(m.fechaContable)}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {m.numeroComprobante ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <span className="block truncate">{m.glosaLinea ?? m.glosa}</span>
                    {m.anulado && (
                      <span className="mt-0.5 inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                        Anulado
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {m.debeBob !== '0.00' ? (
                      <MontoBob monto={m.debeBob} />
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {m.haberBob !== '0.00' ? (
                      <MontoBob monto={m.haberBob} />
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <MontoBob monto={m.saldoCorrienteBob} className="font-medium" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Componente principal
// ============================================================

/**
 * Tabla del Libro Mayor: lista de cuentas expandibles.
 *
 * Cada cuenta es un bloque con su resumen (saldo inicial, debe, haber, saldo
 * final) que se expande para revelar la tabla de movimientos con saldo corriente
 * acumulado. Al pie, el total general del rango (todas las cuentas).
 *
 * Estados: loading (skeleton), vacío (empty state), error (banner), datos.
 *
 * CLAUDE.md §4.6: fechas formateadas en America/La_Paz (dd/mm/yyyy).
 * CLAUDE.md §4.5: montos llegan como string — no aritmética sobre ellos.
 * Anti-F-10: variables semánticas del tema para dark mode.
 */
export function LibroMayorTabla({
  cuentas,
  totalDebeBob,
  totalHaberBob,
  isLoading,
  isError,
}: LibroMayorTablaProps): React.JSX.Element {
  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
        <p className="text-sm text-destructive">
          No se pudieron cargar las cuentas del Libro Mayor. Intentá de nuevo.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <TableSkeleton />;
  }

  if (cuentas !== undefined && cuentas.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay cuentas con movimientos para mostrar en el rango seleccionado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {(cuentas ?? []).map((cuenta) => (
        <CuentaBloque key={cuenta.cuentaId} cuenta={cuenta} />
      ))}

      {/* Total general del rango (todas las cuentas) */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-md border bg-muted/20 px-4 py-3">
        <span className="text-sm font-semibold">Total general del rango</span>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total debe
            </span>
            <MontoBob monto={totalDebeBob} className="font-semibold" />
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total haber
            </span>
            <MontoBob monto={totalHaberBob} className="font-semibold" />
          </div>
        </div>
      </div>
    </div>
  );
}
