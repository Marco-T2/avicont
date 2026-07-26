import { Plus } from 'lucide-react';
import { useState } from 'react';

import { PermissionButton } from '@/components/shared/permission-button';
import { usePermissions } from '@/lib/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';
import type { InformeConciliacionParams } from '@/types/api';

import { AbstencionArranque } from '../components/abstencion-arranque';
import { ConfiabilidadBanner } from '../components/confiabilidad-banner';
import { DeclararArranqueSheet } from '../components/declarar-arranque-sheet';
import { HistorialArranques } from '../components/historial-arranques';
import { InformeFiltros } from '../components/informe-filtros';
import { PapelDeTrabajo } from '../components/papel-de-trabajo';
import { useHistorialArranques } from '../hooks/use-historial-arranques';
import { useInformeConciliacion } from '../hooks/use-informe-conciliacion';

const DENIED_DECLARAR =
  'Declarar un arranque requiere el permiso de conciliar: fija el saldo de partida de todos los informes futuros.';

/**
 * Página del informe de conciliación bancaria (tasks 3.9/3.10/3.11).
 *
 * Orquesta filtros → informe + historial de arranques. Dos salidas posibles,
 * ambas respuestas 200:
 * - Con arranque declarado: el puente como PAPEL DE TRABAJO, calificado por
 *   la sección de confiabilidad (que CALIFICA, nunca suprime — REQ-ICB-05).
 * - Sin arranque: la ABSTENCIÓN visible y ACCIONABLE (REQ-ICB-04) — saldos
 *   presentes, explicación de qué falta e invitación a declararlo; jamás un
 *   cartel de error.
 *
 * Declarar exige `conciliar` (D7): con solo `read` el botón queda
 * deshabilitado con su motivo — la UI refleja el 403, no lo descubre.
 */
export function InformeConciliacionPage(): React.JSX.Element {
  const [params, setParams] = useState<InformeConciliacionParams | null>(null);
  const [declararOpen, setDeclararOpen] = useState(false);

  const { has } = usePermissions();
  const { data, isError, isFetching } = useInformeConciliacion(params);
  const historial = useHistorialArranques(params?.cuentaBancariaId ?? null);

  // Derivado en render, sin estado espejo (Anti-F-02).
  const abstenido = data !== undefined && data.arranque === null;
  // Anular pesa lo mismo que declarar (D7): con solo `read` el historial se ve
  // entero pero sin la acción. fail-closed lo garantiza `has`.
  const puedeConciliar = has(PERMISSIONS.contabilidad.conciliacion.conciliar);

  const botonDeclarar = (
    <PermissionButton
      permission={PERMISSIONS.contabilidad.conciliacion.conciliar}
      deniedReason={DENIED_DECLARAR}
      size="sm"
      variant="outline"
      onClick={() => setDeclararOpen(true)}
    >
      <Plus className="h-4 w-4 mr-2" />
      Declarar arranque
    </PermissionButton>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Informe de conciliación</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Saldo según extracto ± partidas = saldo según libros: el puente entre el banco y los
          libros a una fecha de corte.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <InformeFiltros onEmitir={setParams} isFetching={isFetching} />
      </div>

      {params === null && (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            Elegí una cuenta bancaria y una fecha de corte para emitir el informe.
          </p>
        </div>
      )}

      {/* Anti-F-13: el error de una query se muestra inline, nunca con toast. */}
      {params !== null && isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">
            No se pudo emitir el informe. Revisá la cuenta y la fecha elegidas y volvé a
            intentar.
          </p>
        </div>
      )}

      {params !== null && !isError && data !== undefined && (
        <>
          {abstenido ? (
            <>
              <AbstencionArranque informe={data} accionDeclarar={botonDeclarar} />
              {/* El card de abstención ya explica SIN_ARRANQUE; el banner no lo repite. */}
              <ConfiabilidadBanner
                conciliado={false}
                motivos={data.confiabilidad.motivos.filter((m) => m.tipo !== 'SIN_ARRANQUE')}
              />
            </>
          ) : (
            <>
              <ConfiabilidadBanner
                conciliado={data.confiabilidad.conciliado}
                motivos={data.confiabilidad.motivos}
              />
              <PapelDeTrabajo informe={data} />
            </>
          )}

          <section aria-label="Declaraciones de arranque">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Declaraciones de arranque
              </h2>
              {botonDeclarar}
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Registro permanente: una declaración nueva nunca borra las anteriores. El informe
              aplica la más reciente con fecha menor o igual al corte.
            </p>
            <HistorialArranques
              historial={historial.data ?? []}
              corte={params.corte}
              isLoading={historial.isLoading}
              cuentaBancariaId={params.cuentaBancariaId}
              puedeConciliar={puedeConciliar}
            />
          </section>

          <DeclararArranqueSheet
            open={declararOpen}
            onOpenChange={setDeclararOpen}
            cuentaBancariaId={params.cuentaBancariaId}
            fechaInicial={params.corte}
          />
        </>
      )}
    </div>
  );
}
