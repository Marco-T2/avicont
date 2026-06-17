// Port DEFINIDO y POSEÍDO por `cierre-ejercicio` (§3.7 CLAUDE.md). Expone la
// superficie MÍNIMA de lectura de saldos que el servicio de cierre necesita: los
// saldos de las cuentas hoja de resultado (INGRESO/EGRESO) del rango de la
// gestión, ya tipados como `Money` y con su `clase`/`naturaleza` resueltas para
// alimentar el signed-net del dominio.
//
// El adapter (`eeff-cierre-saldos.adapter.ts`) DELEGA en `EeffSaldosReaderPort`
// de `reportes` (cruce de frontera vía port) con `excluirCierre=true`, para no
// cerrar sobre cierres previos (REQ-CE-06).

import type { SaldoCuentaCierre } from '../domain/cierre-builders';

export const CIERRE_SALDOS_READER_PORT = Symbol('CIERRE_SALDOS_READER_PORT');

export abstract class CierreSaldosReaderPort {
  /**
   * Saldos de las cuentas HOJA (`esDetalle=true`) clase INGRESO o EGRESO con
   * movimiento en el rango [desde, hasta] (ambos inclusive), leídos con
   * `excluirCierre=true` (REQ-CE-06). Cada saldo trae su `clase` y `naturaleza`
   * EFECTIVA (la BD ya resuelve `esContraria`) para que el signed-net del
   * dominio decida el lado de cada línea.
   *
   * Solo cuentas de resultado: ACTIVO/PASIVO/PATRIMONIO se excluyen (no se
   * cierran). organizationId SIEMPRE primer predicado (§4.2 Anti-31).
   */
  abstract obtenerSaldosDeResultado(
    tenantId: string,
    desde: Date,
    hasta: Date,
  ): Promise<SaldoCuentaCierre[]>;
}
