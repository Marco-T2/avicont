import { Inject, Injectable } from '@nestjs/common';
import { EstadoComprobante, type Prisma, TipoComprobante } from '@prisma/client';

import { Money } from '@/common/domain/money';
import { PrismaService } from '@/common/prisma.service';
import {
  CIERRE_COMPROBANTE_WRITER_PORT,
  type CierreOrigenTipo,
  CierreComprobanteWriterPort,
} from '@/comprobantes/ports/cierre-comprobante-writer.port';

import {
  type AsientoCierre,
  buildCerrarGastos,
  buildCerrarIngresos,
  buildTrasladarResultado,
  type LineaCierre,
  type SaldoCuentaCierre,
} from './domain/cierre-builders';
import {
  CierreGestionCerradaError,
  CierreGestionNoEncontradaError,
  CierrePeriodoNoListoError,
  CierreSinResultadoError,
  CierreYaParcialmenteContabilizadoError,
} from './domain/cierre-errors';
import {
  CIERRE_CONFIG_READER_PORT,
  CierreConfigReaderPort,
} from './ports/cierre-config-reader.port';
import {
  CIERRE_GESTION_READER_PORT,
  type GestionParaCierre,
  CierreGestionReaderPort,
} from './ports/cierre-gestion-reader.port';
import {
  CIERRE_SALDOS_READER_PORT,
  CierreSaldosReaderPort,
} from './ports/cierre-saldos-reader.port';

/** Un comprobante de cierre tal como lo expone el servicio (preview / resultado). */
export interface CierreComprobanteResumen {
  id: string;
  origenTipo: CierreOrigenTipo;
  estado: EstadoComprobante;
}

export interface ResultadoCierre {
  gestionId: string;
  cierres: CierreComprobanteResumen[];
}

/** Un asiento de cierre con su slot (origenTipo) para persistir. */
interface AsientoConSlot {
  slot: CierreOrigenTipo;
  asiento: AsientoCierre;
}

@Injectable()
export class CierreEjercicioService {
  constructor(
    @Inject(CIERRE_GESTION_READER_PORT)
    private readonly gestionReader: CierreGestionReaderPort,
    @Inject(CIERRE_CONFIG_READER_PORT)
    private readonly configReader: CierreConfigReaderPort,
    @Inject(CIERRE_SALDOS_READER_PORT)
    private readonly saldosReader: CierreSaldosReaderPort,
    @Inject(CIERRE_COMPROBANTE_WRITER_PORT)
    private readonly writer: CierreComprobanteWriterPort,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Genera (o regenera) los ≤3 comprobantes de cierre de la gestión en BORRADOR
   * no-editable (`generadoPorSistema=true`).
   *
   * Ley 843 art. 46 + Código Tributario art. 47: cierre de cuentas de resultado y
   * traslado del resultado a patrimonio; partida doble por comprobante.
   *
   * @throws CierreGestionNoEncontradaError (404) gestión inexistente o ajena.
   * @throws CierreGestionCerradaError (409) gestión ya CERRADA.
   * @throws CierrePeriodoNoListoError (409) gate de períodos no cumplido.
   * @throws CierreYaParcialmenteContabilizadoError (409) regenerar con ≥1 cierre CONTABILIZADO.
   * @throws CierreConfigCuentaFaltanteError (422) cuentas destino sin configurar.
   * @throws CierreSinResultadoError (422) gestión sin movimiento de resultado.
   */
  async generarCierre(
    gestionId: string,
    tenantId: string,
    userId: string,
  ): Promise<ResultadoCierre> {
    const gestion = await this.cargarGestionGenerable(gestionId, tenantId);

    // Idempotencia (REQ-CE-09): decidir regenerar (todos BORRADOR) o rechazar
    // (alguno CONTABILIZADO) ANTES de tocar nada.
    const previos = gestion.comprobantesDeCierre;
    const hayContabilizado = previos.some((c) => c.estado !== EstadoComprobante.BORRADOR);
    if (hayContabilizado) {
      throw new CierreYaParcialmenteContabilizadoError(gestionId);
    }

    const config = await this.configReader.obtenerConfig(tenantId);

    const saldos = await this.saldosReader.obtenerSaldosDeResultado(
      tenantId,
      gestion.rangoGestion.desde,
      gestion.rangoGestion.hasta,
    );

    if (saldos.length === 0) {
      throw new CierreSinResultadoError();
    }

    const asientos = this.construirAsientos(
      saldos,
      config.resultadoEjercicioId,
      config.resultadosAcumuladosId,
      gestion.year,
    );

    // SKIP-on-zero: si ningún asiento tiene líneas, la gestión no tiene resultado
    // que cerrar (ej. todas las cuentas con net 0). REQ-CE-05.
    if (asientos.length === 0) {
      throw new CierreSinResultadoError();
    }

    const cierres = await this.prisma.$transaction(async (tx) => {
      // Regeneración: borrar los borradores previos por el path-sistema.
      for (const prev of previos) {
        await this.writer.eliminarBorradorSistema(prev.id, tenantId, tx);
      }

      const creados: CierreComprobanteResumen[] = [];
      for (const { slot, asiento } of asientos) {
        const { id } = await this.writer.crearBorradorSistema(
          {
            tenantId,
            periodoFiscalId: gestion.periodoMesCierre.id,
            fechaContable: gestion.periodoMesCierre.fechaCierre,
            tipo: TipoComprobante.CIERRE,
            glosa: asiento.glosa,
            origenTipo: slot,
            origenId: gestionId,
            createdByUserId: userId,
            lineas: asiento.lineas.map(toCrearCierreLinea),
          },
          tx,
        );
        creados.push({ id, origenTipo: slot, estado: EstadoComprobante.BORRADOR });
      }
      return creados;
    });

    return { gestionId, cierres };
  }

  /**
   * Preview / seguimiento: devuelve los comprobantes de cierre existentes de la
   * gestión sin generarlos. REQ-CE-01 (GET).
   */
  async obtenerEstadoCierre(
    gestionId: string,
    tenantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ResultadoCierre> {
    const gestion = await this.gestionReader.obtenerParaCierre(gestionId, tenantId, tx);
    if (gestion === null) {
      throw new CierreGestionNoEncontradaError(gestionId);
    }
    return {
      gestionId,
      cierres: gestion.comprobantesDeCierre.map((c) => ({
        id: c.id,
        origenTipo: c.origenTipo as CierreOrigenTipo,
        estado: c.estado,
      })),
    };
  }

  // ============================================================
  // Privados
  // ============================================================

  /** Carga la gestión y valida que sea generable: existe, ABIERTA, períodos listos. */
  private async cargarGestionGenerable(
    gestionId: string,
    tenantId: string,
  ): Promise<GestionParaCierre> {
    const gestion = await this.gestionReader.obtenerParaCierre(gestionId, tenantId);
    if (gestion === null) {
      throw new CierreGestionNoEncontradaError(gestionId);
    }
    if (gestion.status === 'CERRADA') {
      throw new CierreGestionCerradaError();
    }

    // Gate REQ-CE-10: los (periodosCount − 1) períodos previos CERRADO y el
    // mesCierre ABIERTO. Los cierres se contabilizan en el último período mientras
    // sigue abierto, antes de cerrarlo.
    const previosCerrados = gestion.periodosCerradosCount === gestion.periodosCount - 1;
    if (!previosCerrados || !gestion.periodoMesCierre.estaAbierto) {
      throw new CierrePeriodoNoListoError({
        periodosCount: gestion.periodosCount,
        periodosCerradosCount: gestion.periodosCerradosCount,
        mesCierreAbierto: gestion.periodoMesCierre.estaAbierto,
      });
    }

    return gestion;
  }

  /**
   * Aplica los 3 builders puros y descarta los que quedan vacíos (SKIP-on-zero
   * por asiento, REQ-CE-05). El resultado = `Σingresos − Σgastos` se deriva de
   * los saldos para el traslado #3.
   */
  private construirAsientos(
    saldos: SaldoCuentaCierre[],
    transitoriaId: string,
    resultadosAcumuladosId: string,
    year: number,
  ): AsientoConSlot[] {
    const gastos = buildCerrarGastos(saldos, transitoriaId, year);
    const ingresos = buildCerrarIngresos(saldos, transitoriaId, year);
    const resultado = this.calcularResultado(saldos);
    const traslado = buildTrasladarResultado(
      resultado,
      transitoriaId,
      resultadosAcumuladosId,
      year,
    );

    return (
      [
        { slot: 'CIERRE_GASTOS' as const, asiento: gastos },
        { slot: 'CIERRE_INGRESOS' as const, asiento: ingresos },
        { slot: 'CIERRE_RESULTADO' as const, asiento: traslado },
      ] satisfies AsientoConSlot[]
    ).filter((a) => a.asiento.lineas.length > 0);
  }

  /**
   * Resultado del ejercicio = Σingresos − Σgastos (en BOB). Coincide con el saldo
   * neto que queda en la transitoria tras #1+#2: positivo = utilidad (transitoria
   * ACREEDORA), negativo = pérdida (DEUDORA).
   *
   * El aporte de cada cuenta al resultado es `credito − debito`: para una cuenta
   * INGRESO normal (acreedora) suma su saldo; para una EGRESO normal (deudora)
   * resta su saldo (credito − debito < 0). Las cuentas contrarias entran con su
   * saldo real sin tratamiento especial — la mecánica `credito − debito` es
   * universal y espeja exactamente al neto de la transitoria.
   */
  private calcularResultado(saldos: SaldoCuentaCierre[]): Money {
    return saldos.reduce((acc, s) => acc.plus(s.creditoBob).minus(s.debitoBob), Money.ZERO);
  }
}

function toCrearCierreLinea(l: LineaCierre): {
  cuentaId: string;
  debito: Prisma.Decimal;
  credito: Prisma.Decimal;
} {
  return {
    cuentaId: l.cuentaId,
    debito: l.debito.toPrismaDecimal(),
    credito: l.credito.toPrismaDecimal(),
  };
}
