import { Inject, Injectable } from '@nestjs/common';

import { CLOCK_PORT, ClockPort } from '@/common/clock/clock.port';
import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import {
  diasAtraso,
  estadoComercial,
  estaVencida,
  ordenarCarteraFifo,
  saldoPendiente,
  type EstadoComercialVenta,
} from './domain/cartera';
import { CobroContactoNoEncontradoError } from './domain/cobro-errors';
import { CARTERA_READER_PORT, CarteraReaderPort } from './ports/cartera-reader.port';

/** Partida abierta del estado de cuenta — TODO derivado (REQ-CXC-07, Anti-05). */
export interface VentaEstadoCuentaItem {
  ventaId: string;
  /** ISO `YYYY-MM-DD`, calendario puro (§4.6). */
  fechaContable: string;
  fechaVencimiento: string | null;
  montoTotal: Money;
  /** Σ `montoAplicado` de sus aplicaciones vigentes. */
  cobrado: Money;
  saldoPendiente: Money;
  estadoComercial: EstadoComercialVenta;
  vencida: boolean;
  diasAtraso: number;
}

export interface EstadoCuentaResult {
  contactoId: string;
  razonSocial: string;
  /** El "hoy" de `ClockPort` con el que se derivaron vencimiento y atraso. */
  fechaCorte: string;
  /** Orden canónico FIFO (REQ-CXC-05): el frontend auto-tilda sobre este orden. */
  ventas: VentaEstadoCuentaItem[];
  totalSaldoPendiente: Money;
  /** Σ saldos no aplicados de los cobros del contacto (anticipos). */
  saldoAFavor: Money;
}

/**
 * Estado de cuenta por cliente (REQ-CXC-07): las ventas de la cartera con
 * saldo > 0 en orden canónico FIFO, más el saldo a favor. TODO derivado en
 * cada lectura (Anti-05) con las piezas de `domain/cartera.ts`.
 *
 * Servicio propio y no un método más de `CobrosService` a propósito: aquel
 * orquesta ESCRITURAS (transacción auditada, writer de comprobantes, period
 * lock, config contable — 8 colaboradores); esta lectura pura necesita
 * exactamente dos (`CarteraReaderPort` + `ClockPort`) y no emite auditoría.
 * Mezclarlos obligaría a cada test de lectura a construir el service de
 * escritura completo.
 *
 * El "hoy" sale de `ClockPort.currentDateLaPaz()` elevado con
 * `FechaContable.fromIso` — `new Date()` está prohibido acá (§4.6, Anti-20):
 * VENCIDA es una lectura contra el reloj inyectado, no un evento ni un cron.
 */
@Injectable()
export class EstadoCuentaService {
  constructor(
    @Inject(CARTERA_READER_PORT)
    private readonly cartera: CarteraReaderPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
  ) {}

  /**
   * @throws CobroContactoNoEncontradoError (404) contacto ajeno o inexistente
   *         — el mismo 404 en ambos casos (§4.2, REQ-CXC-08).
   */
  async obtener(tenantId: string, contactoId: string): Promise<EstadoCuentaResult> {
    const razonSocial = await this.cartera.obtenerRazonSocialContacto(tenantId, contactoId);
    if (razonSocial === null) throw new CobroContactoNoEncontradoError(contactoId);

    const hoy = FechaContable.fromIso(this.clock.currentDateLaPaz());

    const filas = await this.cartera.listarVentasDeCartera(tenantId, contactoId);
    const cobros = await this.cartera.listarCobrosDeContacto(tenantId, contactoId);

    // El orden FIFO se aplica con la regla del DOMINIO aunque el adapter ya
    // publique ese ORDER BY (defense in depth sobre REQ-CXC-05: el frontend
    // auto-tilda sobre este orden y no lo recalcula).
    const abiertas = ordenarCarteraFifo(
      filas
        .map((fila) => ({
          id: fila.ventaId,
          fechaContable: FechaContable.fromDbDate(fila.fechaContable),
          createdAt: fila.createdAt,
          fila,
        }))
        .filter(({ fila }) => saldoPendiente(fila.montoTotal, fila.totalAplicado).isPositive()),
    );

    const ventas = abiertas.map(({ fila, fechaContable }) => {
      const saldo = saldoPendiente(fila.montoTotal, fila.totalAplicado);
      const vencimiento =
        fila.fechaVencimiento === null ? null : FechaContable.fromDbDate(fila.fechaVencimiento);

      return {
        ventaId: fila.ventaId,
        fechaContable: fechaContable.toIso(),
        fechaVencimiento: vencimiento === null ? null : vencimiento.toIso(),
        montoTotal: fila.montoTotal,
        cobrado: fila.totalAplicado,
        saldoPendiente: saldo,
        estadoComercial: estadoComercial(fila.montoTotal, fila.totalAplicado),
        vencida: vencimiento === null ? false : estaVencida(vencimiento, hoy, saldo),
        diasAtraso: vencimiento === null ? 0 : diasAtraso(vencimiento, hoy, saldo),
      };
    });

    const totalSaldoPendiente = ventas.reduce((acc, v) => acc.plus(v.saldoPendiente), Money.ZERO);
    const saldoAFavor = cobros.reduce(
      (acc, c) => acc.plus(c.monto.minus(c.totalAplicado)),
      Money.ZERO,
    );

    return {
      contactoId,
      razonSocial,
      fechaCorte: hoy.toIso(),
      ventas,
      totalSaldoPendiente,
      saldoAFavor,
    };
  }
}
