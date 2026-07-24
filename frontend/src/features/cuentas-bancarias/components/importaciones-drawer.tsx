import { AlertTriangle, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { PermissionButton } from '@/components/shared/permission-button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import { PERMISSIONS } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import type { EstadoVerificacionExtracto } from '@/types/api';

import { useImportaciones } from '../hooks/use-importaciones';
import { useImportarExtracto } from '../hooks/use-importar-extracto';

const ETIQUETA_VERIFICACION: Record<EstadoVerificacionExtracto, string> = {
  VERIFICADO: 'Checksum verificado',
  SIN_VERIFICAR: 'Sin verificar',
  DESCUADRE: 'Descuadre',
};

const CLASES_VERIFICACION: Record<EstadoVerificacionExtracto, string> = {
  VERIFICADO:
    'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900',
  SIN_VERIFICAR: 'text-muted-foreground bg-muted border-border',
  DESCUADRE: 'text-destructive border-destructive/40 bg-destructive/10',
};

// El backend serializa fechaDesde/fechaHasta como ISO completo; la parte de
// calendario es lo único que importa (§4.6) y se corta sin pasar por Date.
function soloFecha(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Lo MÍNIMO que el drawer necesita de una cuenta bancaria.
 *
 * Deliberadamente no es `CuentaBancaria`: el workspace de conciliación devuelve
 * una proyección más chica (`CuentaBancariaWorkspaceDto`) y también tiene que
 * poder abrir este drawer. Ambos tipos calzan estructuralmente.
 */
export interface CuentaBancariaResumen {
  id: string;
  alias: string;
}

interface ImportacionesDrawerProps {
  cuentaBancaria: CuentaBancariaResumen | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Historial de importaciones de extracto de una cuenta bancaria + la subida de
 * un archivo nuevo.
 *
 * Vive en `cuentas-bancarias` porque el endpoint es un sub-recurso de la cuenta
 * (`/api/cuentas-bancarias/:id/importaciones`); el workspace de conciliación lo
 * reusa desde ahí.
 *
 * REQ-CB-16: cuando la cuenta todavía no tiene `numeroCuenta` cargado y el
 * archivo lo declara, el backend NO importa nada y devuelve el número detectado
 * para que el usuario lo confirme. Ese segundo viaje es explícito, nunca
 * automático.
 */
export function ImportacionesDrawer({
  cuentaBancaria,
  open,
  onOpenChange,
}: ImportacionesDrawerProps): React.JSX.Element {
  const cuentaId = cuentaBancaria?.id ?? null;
  const { data, isLoading } = useImportaciones(open ? cuentaId : null);
  const importar = useImportarExtracto();

  const [archivo, setArchivo] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resultado = importar.data;
  const requiereConfirmacion = resultado?.requiereConfirmacionCuenta === true;

  function lanzarImportacion(confirmarNumeroCuenta: boolean): void {
    if (cuentaId === null || archivo === null) return;
    importar.mutate(
      { cuentaBancariaId: cuentaId, file: archivo, confirmarNumeroCuenta },
      {
        onSuccess: (res) => {
          // Solo se limpia el formulario cuando la importación se concretó: si
          // falta confirmar el número de cuenta hay que conservar el archivo
          // para el segundo viaje.
          if (res.requiereConfirmacionCuenta) return;
          setArchivo(null);
          if (inputRef.current !== null) inputRef.current.value = '';
        },
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto overflow-x-hidden">
        <SheetHeader>
          <SheetTitle>Extractos importados</SheetTitle>
          <SheetDescription>{cuentaBancaria?.alias ?? ''}</SheetDescription>
        </SheetHeader>

        <div className="px-4 py-2 space-y-6">
          {/* ── Subir un extracto nuevo ─────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Importar extracto
            </h3>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="archivo-extracto">Archivo del extracto (.xlsx)</Label>
              <Input
                id="archivo-extracto"
                ref={inputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="text-base md:text-sm"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
            </div>

            {requiereConfirmacion ? (
              <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 space-y-3">
                <p className="text-sm">
                  Este extracto dice cuenta{' '}
                  <span className="font-semibold">{resultado?.numeroDetectado}</span>. Todavía no
                  se importó nada. ¿Es esta cuenta?
                </p>
                <PermissionButton
                  permission={PERMISSIONS.contabilidad.conciliacion.importar}
                  deniedReason="No tenés permiso para importar extractos"
                  size="sm"
                  disabled={archivo === null || importar.isPending}
                  onClick={() => lanzarImportacion(true)}
                >
                  {importar.isPending ? 'Importando…' : 'Sí, es esta cuenta'}
                </PermissionButton>
              </div>
            ) : (
              <PermissionButton
                permission={PERMISSIONS.contabilidad.conciliacion.importar}
                deniedReason="No tenés permiso para importar extractos"
                size="sm"
                disabled={archivo === null || importar.isPending}
                onClick={() => lanzarImportacion(false)}
              >
                <Upload className="h-4 w-4 mr-2" />
                {importar.isPending ? 'Importando…' : 'Importar extracto'}
              </PermissionButton>
            )}

            {resultado !== undefined && !resultado.requiereConfirmacionCuenta && (
              <div className="rounded-md border bg-card px-4 py-3 space-y-2">
                <p className="text-sm">
                  Se leyeron {resultado.filasLeidas} filas: {resultado.movimientosNuevos}{' '}
                  movimientos nuevos, {resultado.movimientosDuplicados} ya existían.
                </p>
                {resultado.estadoVerificacion !== undefined && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-normal',
                      CLASES_VERIFICACION[resultado.estadoVerificacion],
                    )}
                  >
                    {ETIQUETA_VERIFICACION[resultado.estadoVerificacion]}
                    {resultado.diferencia != null
                      ? ` · ${formatearMontoBob(resultado.diferencia)}`
                      : ''}
                  </Badge>
                )}
                {(resultado.advertencias ?? []).map((a) => (
                  <p
                    key={a.codigo}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {a.mensaje}
                  </p>
                ))}
              </div>
            )}
          </section>

          {/* ── Historial ───────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Historial
            </h3>

            {isLoading && (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            )}

            {!isLoading && (data?.items ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Todavía no importaste ningún extracto en esta cuenta.
              </p>
            )}

            <ul className="space-y-3">
              {(data?.items ?? []).map((imp) => (
                <li key={imp.id} className="rounded-md border bg-card px-4 py-3 space-y-1">
                  <p className="font-medium break-all">{imp.nombreArchivo}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {formatearFechaContable(soloFecha(imp.fechaDesde))} —{' '}
                    {formatearFechaContable(soloFecha(imp.fechaHasta))}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {imp.filasLeidas} filas · {imp.movimientosNuevos} nuevos ·{' '}
                    {imp.movimientosDuplicados} ya existían
                  </p>
                  <Badge
                    variant="outline"
                    className={cn('font-normal', CLASES_VERIFICACION[imp.estadoVerificacion])}
                  >
                    {ETIQUETA_VERIFICACION[imp.estadoVerificacion]}
                    {imp.diferencia !== null ? ` · ${formatearMontoBob(imp.diferencia)}` : ''}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
