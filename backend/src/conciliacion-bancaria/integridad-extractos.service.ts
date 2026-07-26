import { Inject, Injectable } from '@nestjs/common';

import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import { CuentasBancariasService } from './cuentas-bancarias.service';
import { detectarHuecos, type RangoCobertura } from './domain/cobertura-extracto';
import { detectarDiscontinuidades, type Discontinuidad } from './domain/continuidad-extractos';
import {
  IMPORTACION_EXTRACTO_REPOSITORY_PORT,
  ImportacionExtractoRepositoryPort,
} from './ports/importacion-extracto.repository.port';

export interface IntegridadExtractos {
  /** Tramos de calendario sin ningún extracto que los cubra (REQ-CB-09). */
  huecos: RangoCobertura[];
  /** Saltos de saldo entre importaciones contiguas (REQ-CB-23). */
  discontinuidades: Discontinuidad[];
}

/**
 * Evalúa la integridad de la SERIE de extractos de una cuenta bancaria.
 *
 * Ambas señales son propiedades del CONJUNTO, no de una importación suelta:
 * por eso se leen todas las importaciones sin paginar y se derivan en cada
 * lectura. NO se persisten — un veredicto guardado dejaría de ser cierto en
 * cuanto llegue un extracto que rellene un hueco.
 *
 * Ninguna de las dos rechaza nada: ADVIERTEN (REQ-CB-08/09/23, decisión 3 del
 * módulo). Lo que se retiene aguas abajo es la CONCLUSIÓN del informe de
 * conciliación (REQ-ICB-05), nunca el dato.
 */
@Injectable()
export class IntegridadExtractosService {
  constructor(
    private readonly cuentasBancarias: CuentasBancariasService,
    @Inject(IMPORTACION_EXTRACTO_REPOSITORY_PORT)
    private readonly importaciones: ImportacionExtractoRepositoryPort,
  ) {}

  async evaluar(tenantId: string, cuentaBancariaId: string): Promise<IntegridadExtractos> {
    // REQ-CB-13: 404 si la cuenta no existe o es de otro tenant.
    await this.cuentasBancarias.findById(tenantId, cuentaBancariaId);

    const filas = await this.importaciones.listarCoberturaPorCuentaBancaria(
      tenantId,
      cuentaBancariaId,
    );

    const cobertura = filas.map((f) => ({
      desde: FechaContable.fromDbDate(f.fechaDesde),
      hasta: FechaContable.fromDbDate(f.fechaHasta),
    }));

    const conSaldos = filas.map((f) => ({
      id: f.id,
      desde: FechaContable.fromDbDate(f.fechaDesde),
      hasta: FechaContable.fromDbDate(f.fechaHasta),
      saldoInicial: f.saldoInicial === null ? null : Money.of(f.saldoInicial),
      saldoFinal: f.saldoFinal === null ? null : Money.of(f.saldoFinal),
    }));

    return {
      huecos: detectarHuecos(cobertura),
      discontinuidades: detectarDiscontinuidades(conSaldos),
    };
  }
}
