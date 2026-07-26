import { Badge } from '@/components/ui/badge';
import { nombreDelDeclarante } from '../lib/declarante';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import { cn } from '@/lib/utils';
import type { EstadoVerificacionExtracto, InformeConciliacion } from '@/types/api';

import { esMontoCero } from '../lib/monto';

// Mismo criterio de color que `importaciones-drawer.tsx` (par claro/oscuro
// explícito): tres estados no se distinguen con una sola variable semántica.
const CLASES_VERIFICACION: Record<EstadoVerificacionExtracto, string> = {
  VERIFICADO:
    'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900',
  SIN_VERIFICAR: 'text-muted-foreground bg-muted border-border',
  DESCUADRE:
    'text-destructive border-destructive/40 bg-destructive/10',
};

const ETIQUETA_VERIFICACION: Record<EstadoVerificacionExtracto, string> = {
  VERIFICADO: 'Verificado',
  SIN_VERIFICAR: 'Sin verificar',
  DESCUADRE: 'Descuadre',
};

interface PapelDeTrabajoProps {
  informe: InformeConciliacion;
}

/**
 * El puente como PAPEL DE TRABAJO (task 3.10): una sola columna de importes
 * que se sigue con el dedo de arriba hacia abajo. Arranca en el saldo según
 * extracto, aplica las cuatro partidas FIRMADAS (REQ-ICB-02), expone el
 * residuo tal cual (REQ-ICB-06) y termina en el saldo según libros.
 *
 * Los importes vienen firmados del backend en el sentido extracto → libros y
 * se muestran SIN recalcular: el frontend no suma, no redondea y no absorbe
 * nada — la aritmética que se lee es exactamente la que el backend emitió.
 */
export function PapelDeTrabajo({ informe }: PapelDeTrabajoProps): React.JSX.Element | null {
  const { partidas, arranque } = informe;
  // La página solo monta el papel cuando hay puente (partidas ⇔ arranque
  // declarado, REQ-ICB-04). Guard defensivo, no un estado de UI.
  if (partidas === null || arranque === null) return null;

  const corte = formatearFechaContable(informe.corte);
  const residuoDestacado = informe.residuo !== null && !esMontoCero(informe.residuo);

  return (
    <section aria-label="Papel de trabajo" className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3 sm:px-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Papel de trabajo al {corte}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Cada importe está firmado en el sentido extracto → libros: partiendo del saldo según
          extracto y aplicando cada partida y el residuo, se llega al saldo según libros.
        </p>
      </div>

      <FilaSaldo etiqueta={`Saldo según extracto al ${corte}`} monto={informe.saldoExtracto} />

      <PartidaBloque
        nombre="Pendientes"
        descripcion="El banco lo registró; los libros, al corte, no."
        importe={partidas.pendientes.importe}
      >
        {partidas.pendientes.detalle.map((d) => (
          <FilaDetalle
            key={d.movimientoId}
            fecha={d.fecha}
            importe={d.importe}
            nota={
              d.asentadoEl !== null
                ? `Asentado el ${formatearFechaContable(d.asentadoEl)}, posterior al corte: la otra pata ya existe y esta diferencia no se resuelve en este corte.`
                : null
            }
          />
        ))}
      </PartidaBloque>

      <PartidaBloque
        nombre="Ignorados"
        descripcion="El banco lo registró y los libros nunca lo registrarán — ignorado por decisión explícita del usuario."
        importe={partidas.ignorados.importe}
      >
        {partidas.ignorados.detalle.map((d) => (
          <FilaDetalle key={d.movimientoId} fecha={d.fecha} importe={d.importe} nota={null} />
        ))}
      </PartidaBloque>

      <PartidaBloque
        nombre="En tránsito"
        descripcion="Los libros lo registraron; el banco, al corte, no."
        importe={partidas.enTransito.importe}
      >
        {partidas.enTransito.detalle.map((d) => (
          <FilaDetalle
            key={`${d.comprobanteId}#${d.orden}`}
            fecha={d.fecha}
            importe={d.importe}
            nota={
              d.registradoPorBancoEl !== null
                ? `El banco lo registró el ${formatearFechaContable(d.registradoPorBancoEl)}, posterior al corte: la otra pata ya existe y esta diferencia no se resuelve en este corte.`
                : null
            }
          />
        ))}
      </PartidaBloque>

      <PartidaBloque
        nombre="Diferencia de arranque"
        descripcion={`Residuo aceptado al declarar el punto de partida del ${formatearFechaContable(arranque.fecha)}.`}
        importe={partidas.arranque.importe}
      >
        <p className="text-xs text-muted-foreground">
          Declarada el {formatearFechaContable(arranque.declaradoEl.slice(0, 10))} por{' '}
          {nombreDelDeclarante(arranque.declaradoPorNombre)}.
        </p>
      </PartidaBloque>

      {residuoDestacado && informe.residuo !== null ? (
        <div
          role="alert"
          className="mx-4 my-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 sm:mx-6"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-destructive">Residuo no explicado</p>
            <p className="shrink-0 text-base font-bold tabular-nums text-destructive">
              {formatearMontoBob(informe.residuo)}
            </p>
          </div>
          <p className="mt-1 text-sm text-destructive">
            Algo tocó la cuenta banco fuera de lo que este módulo conoce. El residuo se muestra
            tal cual: no se ajusta, no se reparte entre partidas ni se esconde (REQ-ICB-06).
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-6">
          <div>
            <span className="text-sm font-medium">Residuo no explicado</span>
            <p className="text-xs text-muted-foreground">
              {informe.residuo !== null
                ? 'Las partidas explican toda la diferencia entre ambos saldos.'
                : 'El residuo no puede determinarse sin saldo de extracto.'}
            </p>
          </div>
          {informe.residuo !== null && (
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {formatearMontoBob(informe.residuo)}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t-2 px-4 py-3 sm:px-6">
        <span className="text-sm font-semibold">= Saldo según libros al {corte}</span>
        <span className="shrink-0 text-base font-bold tabular-nums">
          {formatearMontoBob(informe.saldoLibros)}
        </span>
      </div>

      <section aria-label="Insumos del informe" className="border-t px-4 py-3 sm:px-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Insumos del informe
        </h3>
        {informe.insumos.importaciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay importaciones de extracto cubriendo el rango.
          </p>
        ) : (
          <ul className="space-y-1">
            {informe.insumos.importaciones.map((imp) => (
              <li key={imp.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="tabular-nums text-muted-foreground">
                  {formatearFechaContable(imp.fechaDesde)} – {formatearFechaContable(imp.fechaHasta)}
                </span>
                <Badge
                  variant="outline"
                  className={cn('font-normal', CLASES_VERIFICACION[imp.estadoVerificacion])}
                >
                  {ETIQUETA_VERIFICACION[imp.estadoVerificacion]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

// ── Piezas presentacionales del papel ────────────────────────────────────

function FilaSaldo({
  etiqueta,
  monto,
}: {
  etiqueta: string;
  monto: string | null;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <span className="text-sm font-semibold">{etiqueta}</span>
      {monto !== null ? (
        <span className="shrink-0 text-base font-bold tabular-nums">
          {formatearMontoBob(monto)}
        </span>
      ) : (
        <span className="shrink-0 text-sm italic text-muted-foreground">Sin saldo publicado</span>
      )}
    </div>
  );
}

interface PartidaBloqueProps {
  nombre: string;
  descripcion: string;
  /** Firmado extracto → libros; se muestra tal cual. */
  importe: string;
  children?: React.ReactNode;
}

function PartidaBloque({
  nombre,
  descripcion,
  importe,
  children,
}: PartidaBloqueProps): React.JSX.Element {
  return (
    <section aria-label={nombre} className="border-t px-4 py-3 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{nombre}</h3>
          <p className="text-xs text-muted-foreground">{descripcion}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatearMontoBob(importe)}
        </span>
      </div>
      {children !== undefined && <div className="mt-2 space-y-1 border-l pl-3">{children}</div>}
    </section>
  );
}

function FilaDetalle({
  fecha,
  importe,
  nota,
}: {
  fecha: string;
  importe: string;
  /** REQ-ICB-07: la diferencia posterior al corte se SEÑALA, no se degrada. */
  nota: string | null;
}): React.JSX.Element {
  return (
    <div className="text-xs text-muted-foreground">
      <div className="flex items-center justify-between gap-3">
        <span className="tabular-nums">{formatearFechaContable(fecha)}</span>
        <span className="shrink-0 tabular-nums">{formatearMontoBob(importe)}</span>
      </div>
      {nota !== null && <p className="mt-0.5 italic">{nota}</p>}
    </div>
  );
}
