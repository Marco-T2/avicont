import { Inject, Injectable } from '@nestjs/common';
import { EstadoComprobante, PeriodoFiscalStatus, Prisma } from '@prisma/client';

import { CLOCK_PORT, ClockPort } from '@/common/clock/clock.port';
import { FechaContable } from '@/common/domain/fecha-contable';
import {
  CONTACTOS_READER_PORT,
  ContactosReaderPort,
} from '@/contactos/ports/contactos-reader.port';
import { CUENTAS_READER_PORT, CuentasReaderPort } from '@/cuentas/ports/cuentas-reader.port';
import {
  PERIODOS_READER_PORT,
  PeriodosReaderPort,
} from '@/periodos-fiscales/ports/periodos-reader.port';

import { toDominioMoneda } from './adapters/enum-mappers';
import { ComprobantesService } from './comprobantes.service';
import {
  ComprobanteAnuladoNoEditableError,
  ComprobanteNoEncontradoError,
  ComprobanteNoEsDeSistemaError,
  ContactoReferenciadoNoExisteError,
  GestionNoAbiertaError,
  MonedaIncompatibleCuentaError,
  PeriodoNoAbiertoError,
} from './domain/comprobante-errors';
import {
  calcularTotalesBob,
  type LineaParaValidar,
  validarComprobanteParaContabilizar,
  validarMotivoAnulacion,
} from './domain/comprobante-validator';
import { resolverCuentaDeLinea, validarContactoRequerido } from './domain/validacion-cuentas';
import {
  type AnularSistemaData,
  ComprobanteSistemaWriterPort,
  type CrearSistemaData,
  type LineaSistemaData,
  type RegenerarSistemaData,
} from './ports/comprobante-sistema-writer.port';
import {
  COMPROBANTE_REPOSITORY_PORT,
  type ComprobanteRepositoryPort,
  type LineaPersistData,
} from './ports/comprobante.repository.port';

/** Estados sobre los que el camino de sistema puede regenerar líneas (§4.3). */
const ESTADOS_REGENERABLES: readonly EstadoComprobante[] = [
  EstadoComprobante.BORRADOR,
  EstadoComprobante.CONTABILIZADO,
];

/**
 * Implementación del camino de escritura de sistema que consumen los módulos
 * comerciales (`ventas`, `cuentas-por-cobrar`).
 *
 * ## Es un servicio y no un adapter, a propósito
 *
 * Un adapter traduce hacia infraestructura. Esto orquesta validación de
 * dominio: resuelve el período, verifica las cuentas y aplica los invariantes
 * de §4.1 antes de dejar que nada toque la base. La persistencia la delega en
 * `ComprobanteRepositoryPort`, así que no tiene una línea de Prisma.
 *
 * ## Qué NO duplica
 *
 * `contabilizarSistema` y `anularSistema` NO reimplementan sus secuencias:
 * llaman a los núcleos que `ComprobantesService` expone para eso
 * (`contabilizarEnTx` / `anularEnTx`), los mismos que corre el camino de
 * usuario. Es inyección directa dentro del mismo módulo, que §3.7 permite
 * explícitamente. Duplicarlas habría dejado dos contabilizaciones y dos
 * anulaciones que se separan en el primer arreglo que alguien haga sobre una
 * sola — y el asiento automático es el que nadie mira a mano.
 */
@Injectable()
export class ComprobanteSistemaWriterService extends ComprobanteSistemaWriterPort {
  constructor(
    @Inject(COMPROBANTE_REPOSITORY_PORT)
    private readonly repo: ComprobanteRepositoryPort,
    @Inject(CUENTAS_READER_PORT)
    private readonly cuentas: CuentasReaderPort,
    @Inject(CONTACTOS_READER_PORT)
    private readonly contactos: ContactosReaderPort,
    @Inject(PERIODOS_READER_PORT)
    private readonly periodos: PeriodosReaderPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    // Mismo módulo — inyección directa OK (§3.7). Aporta los núcleos
    // compartidos de contabilizar y anular.
    private readonly comprobantes: ComprobantesService,
  ) {
    super();
  }

  async crearBorradorSistema(
    data: CrearSistemaData,
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    const fecha = FechaContable.fromDbDate(data.fechaContable);
    const periodo = await this.resolverPeriodoAbierto(data.tenantId, fecha, tx);

    const lineas = await this.validarLineas(data.tenantId, data.lineas, tx);
    this.validarInvariantes(data.glosa, fecha, lineas);

    return this.repo.crearBorradorSistemaSiNoExiste(
      data.tenantId,
      {
        tipo: data.tipo,
        fechaContable: data.fechaContable,
        periodoFiscalId: periodo.id,
        glosa: data.glosa,
        monedaPrincipal: data.monedaPrincipal,
        origenTipo: data.origenTipo,
        origenId: data.origenId,
        createdByUserId: data.createdByUserId,
        lineas,
      },
      tx,
    );
  }

  async regenerarLineasSistema(
    data: RegenerarSistemaData,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const actual = await this.repo.findById(data.tenantId, data.comprobanteId, tx);
    if (!actual) throw new ComprobanteNoEncontradoError(data.comprobanteId);
    if (actual.generadoPorSistema !== true) {
      throw new ComprobanteNoEsDeSistemaError(data.comprobanteId, 'no fue generado por el sistema');
    }
    if (!ESTADOS_REGENERABLES.includes(actual.estado)) {
      throw new ComprobanteNoEsDeSistemaError(
        data.comprobanteId,
        `su estado ${actual.estado} no admite regeneración`,
      );
    }
    // §4.7: la anulación es terminal sobre el ciclo de edición. Regenerar las
    // líneas de un asiento anulado reescribiría un documento que ya se declaró
    // sin efecto contable.
    if (actual.anulado) throw new ComprobanteAnuladoNoEditableError(data.comprobanteId);

    // El período de ORIGEN tiene que estar abierto: si el mes ya se cerró, el
    // asiento entró en un balance emitido y no se toca (§4.4).
    await this.resolverPeriodoAbierto(
      data.tenantId,
      FechaContable.fromDbDate(actual.fechaContable),
      tx,
    );

    // Y el de DESTINO también, si la fecha se movió a otro mes.
    const fechaNueva = FechaContable.fromDbDate(data.fechaContable);
    const periodoDestino = await this.resolverPeriodoAbierto(data.tenantId, fechaNueva, tx);

    const lineas = await this.validarLineas(data.tenantId, data.lineas, tx);
    const totales = this.validarInvariantes(data.glosa, fechaNueva, lineas);

    // Reemplazo en bloque (§4.3). `reemplazarComprobante` no toca `id`, `numero`,
    // `estado` ni `generadoPorSistema`: el correlativo sobrevive intacto, que es
    // justamente lo que el patrón del cierre —borrar y recrear— rompería (§4.9).
    // El `tipo` se preserva del comprobante existente y NO se toma del caller.
    await this.repo.reemplazarComprobante(
      data.tenantId,
      data.comprobanteId,
      {
        tipo: actual.tipo,
        fechaContable: data.fechaContable,
        periodoFiscalId: periodoDestino.id,
        glosa: data.glosa,
        monedaPrincipal: data.monedaPrincipal,
        lineas,
        totalDebitoBob: totales.debito.toPrismaDecimal(),
        totalCreditoBob: totales.credito.toPrismaDecimal(),
      },
      tx,
    );
  }

  async contabilizarSistema(
    comprobanteId: string,
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ numero: string }> {
    await this.exigirDeSistema(tenantId, comprobanteId, tx);

    const persistido = await this.comprobantes.contabilizarEnTx(tenantId, comprobanteId, tx);

    // `contabilizarEnTx` asigna el correlativo antes de persistir, así que el
    // numero no puede ser null acá. El chequeo existe para no propagar un `!`.
    if (persistido.numero === null) {
      throw new ComprobanteNoEsDeSistemaError(comprobanteId, 'quedó contabilizado sin número');
    }
    return { numero: persistido.numero };
  }

  async anularSistema(data: AnularSistemaData, tx: Prisma.TransactionClient): Promise<void> {
    const motivoTrim = validarMotivoAnulacion(data.motivo);
    await this.exigirDeSistema(data.tenantId, data.comprobanteId, tx);

    // `hayReaperturaActiva: false` — el camino de sistema exige período ABIERTO.
    // Tocar un período cerrado sigue siendo potestad del admin por el flujo de
    // reapertura (§4.4, sin bypass), que es una operación del módulo de
    // períodos y no algo que una venta pueda decidir por su cuenta.
    await this.comprobantes.anularEnTx(
      data.tenantId,
      data.comprobanteId,
      {
        motivoTrim,
        anuladoPorUserId: data.anuladoPorUserId,
        hayReaperturaActiva: false,
      },
      tx,
    );
  }

  async eliminarBorradorSistema(
    comprobanteId: string,
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const actual = await this.repo.findById(tenantId, comprobanteId, tx);
    // Ya no está: el borrado es idempotente. Un reintento del módulo origen no
    // tiene por qué fallar.
    if (!actual) return;

    if (actual.generadoPorSistema !== true) {
      throw new ComprobanteNoEsDeSistemaError(comprobanteId, 'no fue generado por el sistema');
    }
    if (actual.estado !== EstadoComprobante.BORRADOR) {
      // Un CONTABILIZADO no se borra: se anula (§4.7). Su número ya se emitió y
      // no se reutiliza.
      throw new ComprobanteNoEsDeSistemaError(
        comprobanteId,
        `su estado ${actual.estado} no admite borrado`,
      );
    }

    await this.repo.eliminarBorradorSistema(tenantId, comprobanteId, tx);
  }

  // ============================================================
  // Internos
  // ============================================================

  /**
   * Lee el comprobante y exige que sea de sistema y del tenant. Es la guarda
   * que impide que un id equivocado del módulo comercial termine operando
   * sobre el asiento manual de un contador (§4.2).
   */
  private async exigirDeSistema(
    tenantId: string,
    comprobanteId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const actual = await this.repo.findById(tenantId, comprobanteId, tx);
    if (!actual) throw new ComprobanteNoEncontradoError(comprobanteId);
    if (actual.generadoPorSistema !== true) {
      throw new ComprobanteNoEsDeSistemaError(comprobanteId, 'no fue generado por el sistema');
    }
  }

  private async resolverPeriodoAbierto(
    tenantId: string,
    fecha: FechaContable,
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    const periodo = await this.periodos.obtenerPorFecha(tenantId, fecha, tx);
    if (!periodo) throw new GestionNoAbiertaError(fecha.toIso());
    if (periodo.status !== PeriodoFiscalStatus.ABIERTO) {
      throw new PeriodoNoAbiertoError(periodo.id, periodo.status);
    }
    return periodo;
  }

  /**
   * Valida cada línea contra su cuenta y la baja al shape de persistencia,
   * asignando el `orden` por posición.
   *
   * Reusa los mismos helpers que el camino de usuario
   * (`resolverCuentaDeLinea`, `validarContactoRequerido`): son las reglas que
   * ya estaban copiadas tres veces y se unificaron para que este cuarto camino
   * no fuera una copia más.
   */
  private async validarLineas(
    tenantId: string,
    lineas: LineaSistemaData[],
    tx: Prisma.TransactionClient,
  ): Promise<LineaPersistData[]> {
    const cuentasMap = await this.cuentas.obtenerBatch(
      tenantId,
      lineas.map((l) => l.cuentaId),
      tx,
    );
    const contactoIds = lineas
      .map((l) => l.contactoId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const contactosMap = await this.contactos.obtenerBatch(tenantId, contactoIds, tx);

    return lineas.map((linea, index) => {
      const orden = index + 1;
      const cuenta = resolverCuentaDeLinea(orden, linea.cuentaId, cuentasMap);
      // B-1: el caso real es una cuenta de CUENTAS POR COBRAR sin contacto —
      // el aging de cartera se queda sin el dato del que depende.
      validarContactoRequerido(orden, cuenta, linea.contactoId);

      if (!cuenta.permiteMultiMoneda && linea.moneda !== cuenta.monedaFuncional) {
        throw new MonedaIncompatibleCuentaError(orden, {
          cuentaId: cuenta.id,
          codigoInterno: cuenta.codigoInterno,
          monedaLinea: linea.moneda,
          monedaFuncional: cuenta.monedaFuncional,
        });
      }

      if (linea.contactoId && !contactosMap.has(linea.contactoId)) {
        throw new ContactoReferenciadoNoExisteError(orden, linea.contactoId);
      }

      return {
        orden,
        cuentaId: linea.cuentaId,
        contactoId: linea.contactoId,
        moneda: linea.moneda,
        debito: linea.debito,
        credito: linea.credito,
        tipoCambio: linea.tipoCambio,
        debitoBob: linea.debitoBob,
        creditoBob: linea.creditoBob,
        glosaLinea: linea.glosaLinea,
      };
    });
  }

  /**
   * Invariantes estructurales de §4.1 sobre el asiento completo.
   *
   * El camino de sistema los aplica también al BORRADOR, a diferencia del
   * camino de usuario: un borrador humano puede estar a medio escribir, pero un
   * generador que emite un asiento desbalanceado tiene un bug, y conviene que
   * se sepa donde se origina y no dos pasos más tarde al contabilizar.
   */
  private validarInvariantes(
    glosa: string,
    fechaContable: FechaContable,
    lineas: LineaPersistData[],
  ) {
    const lineasParaValidar: LineaParaValidar[] = lineas.map((l) => ({
      orden: l.orden,
      moneda: toDominioMoneda(l.moneda),
      debito: l.debito,
      credito: l.credito,
      tipoCambio: l.tipoCambio,
      debitoBob: l.debitoBob,
      creditoBob: l.creditoBob,
    }));

    validarComprobanteParaContabilizar({
      glosa,
      fechaContable,
      hoy: FechaContable.fromIso(this.clock.currentDateLaPaz()),
      lineas: lineasParaValidar,
    });

    return calcularTotalesBob(lineasParaValidar);
  }
}
