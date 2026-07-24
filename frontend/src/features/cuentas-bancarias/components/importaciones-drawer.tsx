import { AlertTriangle, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { PaginationBar } from '@/components/shared/pagination-bar';
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
import { formatearTimestampLaPaz } from '@/lib/formatear-timestamp';
import { mensajeConciliacion } from '@/lib/error-messages';
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

// El drawer es angosto: el default de 50 del backend obliga a un scroll enorme.
const IMPORTACIONES_POR_PAGINA = 5;

/**
 * Se acepta `.xls` a propósito, aunque el importador SOLO procese `.xlsx`.
 *
 * Filtrarlo acá lo dejaba en gris en el explorador de archivos: el usuario con
 * un extracto viejo no podía ni elegirlo y no había forma de enterarse por qué.
 * Dejándolo pasar, el backend lo detecta por magic bytes (OLE2) y responde
 * `CONCILIACION_ARCHIVO_XLS_LEGACY`, que sí explica qué hacer: abrirlo en Excel
 * y guardarlo como `.xlsx`.
 */
const ACCEPT_EXTRACTO = [
  '.xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls',
  'application/vnd.ms-excel',
].join(',');

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
  const [page, setPage] = useState(1);

  // El drawer NO se desmonta al cerrarse (el padre lo deja montado y le pasa
  // `open`), así que la página sobrevive al cambio de cuenta: quedarse en la 2
  // sobre una cuenta con una sola página devolvería una lista vacía y el empty
  // state mentiría diciendo que nunca se importó nada. Ajuste de estado en
  // render — la variante recomendada por React sobre un useEffect, que
  // renderizaría una vez con la página equivocada.
  const [cuentaDeLaPagina, setCuentaDeLaPagina] = useState(cuentaId);
  if (cuentaDeLaPagina !== cuentaId) {
    setCuentaDeLaPagina(cuentaId);
    setPage(1);
  }
  const { data, isLoading } = useImportaciones(open ? cuentaId : null, {
    page,
    pageSize: IMPORTACIONES_POR_PAGINA,
  });
  const importar = useImportarExtracto();

  const [archivo, setArchivo] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resultado = importar.data;
  const requiereConfirmacion = resultado?.requiereConfirmacionCuenta === true;

  function limpiarSeleccion(): void {
    setArchivo(null);
    if (inputRef.current !== null) inputRef.current.value = '';
  }

  /**
   * El componente NO se desmonta al cerrarse: el padre lo deja montado y solo
   * cambia `open`. Radix sí desmonta el contenido, así que al reabrir aparece un
   * `<input type="file">` nuevo y vacío — pero el `File` seguía vivo en el
   * estado. Resultado: el input decía "ningún archivo seleccionado" y el botón
   * de importar estaba habilitado, listo para volver a subir el archivo de la
   * sesión anterior. Se limpia al cerrar para que lo que se ve y lo que se
   * enviaría sean lo mismo.
   */
  function handleOpenChange(next: boolean): void {
    if (!next) {
      limpiarSeleccion();
      importar.reset();
      setPage(1);
    }
    onOpenChange(next);
  }

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
          limpiarSeleccion();
          // El historial viene del más reciente al más viejo: lo recién importado
          // está en la página 1, no en la que el usuario estuviera mirando.
          setPage(1);
        },
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
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
                accept={ACCEPT_EXTRACTO}
                className="text-base md:text-sm"
                // Cambiar el archivo mientras sube dejaría el resultado hablando
                // de un archivo que ya no es el seleccionado.
                disabled={importar.isPending}
                onChange={(e) => {
                  setArchivo(e.target.files?.[0] ?? null);
                  // El resultado que quedó en pantalla es de OTRO archivo. Dejarlo
                  // visible hizo que se importara dos veces el mismo extracto, y en
                  // el flujo de confirmación (REQ-CB-16) era peor: el cartel seguía
                  // preguntando por el número detectado en el archivo anterior, así
                  // que "Sí, es esta cuenta" mandaba el archivo NUEVO con
                  // confirmarNumeroCuenta y el backend guardaba en la cuenta el
                  // número declarado por ese otro archivo, sin que nadie lo viera.
                  importar.reset();
                }}
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

            {importar.isError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <span>{mensajeConciliacion(importar.error)}</span>
              </div>
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
                    {/* Rango que CUBRE el extracto (fecha contable, sin zona §4.6). */}
                    {formatearFechaContable(soloFecha(imp.fechaDesde))} —{' '}
                    {formatearFechaContable(soloFecha(imp.fechaHasta))}
                  </p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {/* Cuándo se SUBIÓ: instante real, en hora de La Paz (§4.6). */}
                    Subido el {formatearTimestampLaPaz(imp.createdAt)}
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

            <PaginationBar
              page={page}
              limit={IMPORTACIONES_POR_PAGINA}
              total={data?.total ?? 0}
              onPageChange={setPage}
            />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
