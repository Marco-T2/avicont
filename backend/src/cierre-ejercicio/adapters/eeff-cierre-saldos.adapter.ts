import { Inject, Injectable } from '@nestjs/common';

import { ClaseCuenta } from '@/common/domain/enums';
import { Money } from '@/common/domain/money';
import {
  EEFF_SALDOS_READER_PORT,
  EeffSaldosReaderPort,
  type SaldoCuentaRow,
} from '@/reportes/ports/eeff-saldos-reader.port';

import type { SaldoCuentaCierre } from '../domain/cierre-builders';
import { CierreSaldosReaderPort } from '../ports/cierre-saldos-reader.port';

/**
 * Adapter de `CierreSaldosReaderPort` que DELEGA en `EeffSaldosReaderPort` de
 * `reportes` (cruce de frontera vía port, §3.7). Lee los saldos del rango con
 * `excluirCierre=true` (REQ-CE-06) y los une con la estructura de cuentas para
 * resolver `clase`/`naturaleza`, filtrando solo cuentas HOJA de resultado
 * (INGRESO/EGRESO). Convierte los `Decimal` del port a `Money` antes de devolver.
 */
@Injectable()
export class EeffCierreSaldosAdapter extends CierreSaldosReaderPort {
  constructor(
    @Inject(EEFF_SALDOS_READER_PORT)
    private readonly eeffSaldos: EeffSaldosReaderPort,
  ) {
    super();
  }

  async obtenerSaldosDeResultado(
    tenantId: string,
    desde: Date,
    hasta: Date,
  ): Promise<SaldoCuentaCierre[]> {
    // REQ-CE-06: excluirCierre=true para no cerrar sobre cierres previos y para
    // que un re-cierre idempotente recalcule sobre el resultado OPERATIVO.
    const [saldos, estructura] = await Promise.all([
      this.eeffSaldos.obtenerSaldosEnRango(tenantId, desde, hasta, false, true),
      this.eeffSaldos.obtenerEstructuraCuentas(tenantId),
    ]);

    const metaPorCuenta = new Map(estructura.map((c) => [c.id, c]));

    return saldos
      .map((s: SaldoCuentaRow): SaldoCuentaCierre | null => {
        const meta = metaPorCuenta.get(s.cuentaId);
        // Solo cuentas hoja de resultado: ACTIVO/PASIVO/PATRIMONIO no se cierran.
        if (
          meta === undefined ||
          !meta.esDetalle ||
          (meta.claseCuenta !== ClaseCuenta.INGRESO && meta.claseCuenta !== ClaseCuenta.EGRESO)
        ) {
          return null;
        }
        return {
          cuentaId: s.cuentaId,
          clase: meta.claseCuenta,
          naturaleza: meta.naturaleza,
          debitoBob: Money.of(s.totalDebitoBob),
          creditoBob: Money.of(s.totalCreditoBob),
        };
      })
      .filter((s): s is SaldoCuentaCierre => s !== null);
  }
}
