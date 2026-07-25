import { useState } from 'react';

import type { InformeConciliacionParams } from '@/types/api';

import { AbstencionArranque } from '../components/abstencion-arranque';
import { ConfiabilidadBanner } from '../components/confiabilidad-banner';
import { InformeFiltros } from '../components/informe-filtros';
import { PapelDeTrabajo } from '../components/papel-de-trabajo';
import { useInformeConciliacion } from '../hooks/use-informe-conciliacion';

/**
 * Página del informe de conciliación bancaria (tasks 3.9/3.10).
 *
 * Orquesta filtros → informe. Dos salidas posibles, ambas respuestas 200:
 * - Con arranque declarado: el puente como PAPEL DE TRABAJO, calificado por
 *   la sección de confiabilidad (que CALIFICA, nunca suprime — REQ-ICB-05).
 * - Sin arranque: la ABSTENCIÓN visible (REQ-ICB-04) — saldos presentes y una
 *   explicación de qué falta, jamás un cartel de error.
 */
export function InformeConciliacionPage(): React.JSX.Element {
  const [params, setParams] = useState<InformeConciliacionParams | null>(null);
  const { data, isError, isFetching } = useInformeConciliacion(params);

  // Derivado en render, sin estado espejo (Anti-F-02).
  const abstenido = data !== undefined && data.arranque === null;

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
              <AbstencionArranque informe={data} />
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
        </>
      )}
    </div>
  );
}
