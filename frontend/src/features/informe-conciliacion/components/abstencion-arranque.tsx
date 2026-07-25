import { Flag } from 'lucide-react';

import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import type { InformeConciliacion } from '@/types/api';

interface AbstencionArranqueProps {
  informe: InformeConciliacion;
}

/**
 * Abstención por falta de arranque (REQ-ICB-04): el backend respondió 200 con
 * los saldos presentes y `arranque/partidas/residuo` en null. Es el estado
 * NORMAL de toda cuenta recién incorporada — la UI lo explica e invita a
 * declarar el punto de partida; NO pinta un error.
 */
export function AbstencionArranque({ informe }: AbstencionArranqueProps): React.JSX.Element {
  const corte = formatearFechaContable(informe.corte);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TarjetaSaldo etiqueta={`Saldo según extracto al ${corte}`} monto={informe.saldoExtracto} />
        <TarjetaSaldo etiqueta={`Saldo según libros al ${corte}`} monto={informe.saldoLibros} />
      </div>

      <div className="rounded-lg border border-dashed bg-card px-6 py-10 text-center">
        <Flag className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold">Falta declarar el punto de arranque</h2>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          Ambos saldos existen, pero el puente entre ellos necesita un punto de partida: la fecha
          desde la cual se comparan, los dos saldos a esa fecha y la diferencia que se acepta como
          residual. Es el estado normal de una cuenta recién incorporada — no es un error.
        </p>
      </div>
    </div>
  );
}

function TarjetaSaldo({
  etiqueta,
  monto,
}: {
  etiqueta: string;
  monto: string | null;
}): React.JSX.Element {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      {monto !== null ? (
        <p className="mt-1 text-xl font-bold tabular-nums">{formatearMontoBob(monto)}</p>
      ) : (
        <p className="mt-1 text-sm italic text-muted-foreground">Sin saldo publicado</p>
      )}
    </div>
  );
}
