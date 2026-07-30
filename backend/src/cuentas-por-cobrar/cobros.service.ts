import { Inject, Injectable } from '@nestjs/common';
import { Moneda, PeriodoFiscalStatus, Prisma, TipoComprobante } from '@prisma/client';

import { AuditedTransactionRunner } from '@/common/audited-transaction.runner';
import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';
import {
  COMPROBANTE_SISTEMA_WRITER_PORT,
  ComprobanteSistemaWriterPort,
  ORIGEN_TIPO_COBRO,
} from '@/comprobantes/ports/comprobante-sistema-writer.port';
import {
  CONTACTOS_READER_PORT,
  ContactosReaderPort,
} from '@/contactos/ports/contactos-reader.port';
import {
  CUENTAS_EFECTIVO_READER_PORT,
  CuentasEfectivoReaderPort,
} from '@/cuentas/ports/cuentas-efectivo-reader.port';
import {
  PERIODOS_READER_PORT,
  PeriodosReaderPort,
} from '@/periodos-fiscales/ports/periodos-reader.port';

import { construirAsientoCobro } from './domain/asiento-cobro';
import { esComprobanteConciliable, motivoVentaFueraDeCartera } from './domain/cartera';
import {
  AplicacionNoEncontradaError,
  AplicacionPuntaNoContabilizadaError,
  AplicacionVentaContadoError,
  AplicacionVentaNoEncontradaError,
  CobroAnuladoNoEditableError,
  CobroConceptoNoConfiguradoError,
  CobroContactoInactivoError,
  CobroContactoNoEncontradoError,
  CobroCuentaDestinoNoElegibleError,
  CobroGestionNoAbiertaError,
  CobroMontoInferiorAplicadoError,
  CobroNoEncontradoError,
  CobroNoEsBorradorError,
  CobroPeriodoNoAbiertoError,
} from './domain/cobro-errors';
import { componerGlosaComprobanteCobro } from './domain/glosa-cobro';
import {
  AplicacionMontoNoPositivoError,
  type SumasAplicacion,
  verificarMismoContacto,
  verificarSobreAplicacion,
} from './domain/sobre-aplicacion';
import { CARTERA_READER_PORT, CarteraReaderPort } from './ports/cartera-reader.port';
import {
  COBRO_REPOSITORY_PORT,
  type AplicacionCobroRow,
  type AplicacionDeCobro,
  type Cobro,
  type ComprobanteDeCobro,
  CobroRepositoryPort,
  type SumasAplicadasConLock,
} from './ports/cobro.repository.port';
import {
  COBROS_CONFIG_READER_PORT,
  CobrosConfigReaderPort,
} from './ports/cobros-config-reader.port';

export interface CrearCobroInput {
  contactoId: string;
  /** ISO `YYYY-MM-DD`, calendario puro (§4.6). */
  fechaContable: string;
  /** Monto como string decimal (§4.5: nada de `number` para plata). */
  monto: string;
  /** Cuenta destino ELEGIDA (D-05): el default Caja General es precarga de UI, no concepto de backend. */
  cuentaDestinoId: string;
  glosa: string;
}

export interface CobroCreado {
  cobro: Cobro;
  comprobanteId: string;
}

export interface CobroContabilizado {
  comprobanteId: string;
  /** Número de la serie I del tipo INGRESO: `I{YY}{MM}-{correlativo:6}` (D-11). */
  numero: string;
}

export interface CrearAplicacionInput {
  cobroId: string;
  ventaId: string;
  /** > 0, string decimal (§4.5). */
  montoAplicado: string;
}

/**
 * La edición es full-state (mismo criterio D-17 que la venta): el mismo shape
 * del alta, sin campos parciales. Cambiar el `contactoId` (matriz fila 12)
 * viaja por acá — el reemplazo en bloque ES el mecanismo.
 */
export type EditarCobroInput = CrearCobroInput;

export interface ListarCobrosInput {
  contactoId?: string;
  /** ISO `YYYY-MM-DD` (§4.6), límites inclusivos sobre `fechaContable`. */
  fechaDesde?: string;
  fechaHasta?: string;
  page?: number;
  limit?: number;
}

export interface ListarCobrosResult {
  cobros: { cobro: Cobro; comprobante: ComprobanteDeCobro }[];
  total: number;
  page: number;
  limit: number;
}

export interface CobroDetalle {
  cobro: Cobro;
  comprobante: ComprobanteDeCobro;
  aplicaciones: AplicacionDeCobro[];
}

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 100;

/**
 * Motivo user-facing del rastro `AplicacionCobroDesvinculada` (B-14) al
 * cambiar el cliente del cobro. El de anulación se compone con el motivo que
 * dio el usuario (§4.7). Espejo de los motivos de `VentasService`.
 */
const MOTIVO_DESVINCULO_CAMBIO_CLIENTE = 'Cambio del cliente del cobro';

/**
 * Orquesta el cobro como hecho contable independiente (REQ-CXC-02): el cobro y
 * su comprobante `INGRESO` (`origenTipo = 'COBRO'`, D-11) nacen, se
 * contabilizan y mueren en la MISMA transacción auditada — espejo de
 * `VentasService`. Las APLICACIONES (REQ-CXC-03) son vínculos editables que NO
 * generan asiento ni tocan ningún comprobante (D-03): el comprobante del cobro
 * queda byte-idéntico ante cualquier re-imputación.
 *
 * Todo write corre dentro de `AuditedTransactionRunner.run` (§4.3): los
 * triggers de `comprobantes_audit` leen el actor de `app.audit_user_id`, que
 * el runner inyecta al abrir la TX — escribir fuera pierde el actor en
 * silencio.
 */
@Injectable()
export class CobrosService {
  constructor(
    @Inject(COBRO_REPOSITORY_PORT)
    private readonly repo: CobroRepositoryPort,
    @Inject(COMPROBANTE_SISTEMA_WRITER_PORT)
    private readonly comprobanteWriter: ComprobanteSistemaWriterPort,
    @Inject(CONTACTOS_READER_PORT)
    private readonly contactos: ContactosReaderPort,
    @Inject(CUENTAS_EFECTIVO_READER_PORT)
    private readonly cuentasEfectivo: CuentasEfectivoReaderPort,
    @Inject(PERIODOS_READER_PORT)
    private readonly periodos: PeriodosReaderPort,
    @Inject(COBROS_CONFIG_READER_PORT)
    private readonly config: CobrosConfigReaderPort,
    @Inject(CARTERA_READER_PORT)
    private readonly cartera: CarteraReaderPort,
    private readonly auditedTx: AuditedTransactionRunner,
  ) {}

  // ============================================================
  // 5.3 — El cobro como hecho contable (REQ-CXC-02)
  // ============================================================

  /**
   * Alta del borrador: valida, persiste el cobro y genera su comprobante
   * `INGRESO` BORRADOR por el path-sistema — todo en UNA transacción. El
   * asiento es SIEMPRE `Debe destino / Haber CxC` con el contacto en ambas
   * líneas (B-1), se aplique el cobro a lo que se aplique.
   *
   * @throws CobroGestionNoAbiertaError (422) sin período para la fecha.
   * @throws CobroPeriodoNoAbiertoError (409) período no ABIERTO (REQ-CXC-09, sin bypass).
   * @throws CobroContactoNoEncontradoError (404) contacto ajeno o inexistente (§4.2).
   * @throws CobroContactoInactivoError (422).
   * @throws CobroCuentaDestinoNoElegibleError (422) destino fuera del criterio de REQ-CXC-02.
   * @throws CobroConceptoNoConfiguradoError (422) `cuentasPorCobrarId` sin mapear (B-12).
   * @throws CobroAsientoSinMontoError (422) monto no positivo (§4.1).
   */
  async crear(tenantId: string, userId: string, input: CrearCobroInput): Promise<CobroCreado> {
    const fecha = FechaContable.fromIso(input.fechaContable);
    // Redondeo EXPLÍCITO en dominio (half-up, decisión del design): sin esto lo
    // redondearía Postgres al insertar y el asiento podría divergir del cobro.
    const monto = Money.of(input.monto).redondearABob();

    return this.auditedTx.run({ userId }, async (tx) => {
      // REQ-CXC-09: el lock corre ANTES de cualquier escritura, dentro de la TX.
      await this.exigirPeriodoAbierto(tenantId, fecha, tx);
      await this.validarContacto(tenantId, input.contactoId, tx);
      await this.exigirDestinoElegible(tenantId, input.cuentaDestinoId, tx);

      const { cuentasPorCobrarId } = await this.config.obtenerConfig(tenantId, tx);
      if (cuentasPorCobrarId === null) throw new CobroConceptoNoConfiguradoError();

      // El builder valida monto > 0 (§4.1) — corre antes de escribir nada.
      const lineasAsiento = construirAsientoCobro({
        contactoId: input.contactoId,
        monto,
        cuentaDestinoId: input.cuentaDestinoId,
        cuentasPorCobrarId,
      });

      const razonSocial = await this.cartera.obtenerRazonSocialContacto(
        tenantId,
        input.contactoId,
        tx,
      );
      // La existencia ya se validó vía ContactosReaderPort; esto es defensivo.
      if (razonSocial === null) throw new CobroContactoNoEncontradoError(input.contactoId);

      const cobro = await this.repo.crear(
        tenantId,
        {
          contactoId: input.contactoId,
          fechaContable: fecha.toDbDate(),
          monto: monto.toPrismaDecimal(),
          cuentaDestinoId: input.cuentaDestinoId,
          glosa: input.glosa,
          createdByUserId: userId,
        },
        tx,
      );

      const { id: comprobanteId } = await this.comprobanteWriter.crearBorradorSistema(
        {
          tenantId,
          // D-11: serie I existente, SIN tipo nuevo. El listado distingue un
          // cobro de una venta por origenTipo, no por el tipo del comprobante.
          tipo: TipoComprobante.INGRESO,
          fechaContable: fecha.toDbDate(),
          // Q-2: autosuficiente en el Libro Diario — operación + cliente.
          glosa: componerGlosaComprobanteCobro({
            razonSocialContacto: razonSocial,
            glosaCobro: input.glosa,
          }),
          monedaPrincipal: Moneda.BOB,
          origenTipo: ORIGEN_TIPO_COBRO,
          origenId: cobro.id,
          createdByUserId: userId,
          lineas: lineasAsiento,
        },
        tx,
      );

      return { cobro, comprobanteId };
    });
  }

  /**
   * Pasa el comprobante del cobro a CONTABILIZADO con número de la serie I
   * (`I{YY}{MM}-{correlativo:6}`, §4.9). Re-valida la elegibilidad de la
   * cuenta destino: es configuración almacenada y pudo desactivarse después
   * del borrador (mismo criterio que REQ-VTA-05).
   *
   * @throws CobroNoEncontradoError (404) inexistente o ajeno (REQ-CXC-08).
   * @throws CobroAnuladoNoEditableError (409) la anulación es terminal (§4.7).
   * @throws CobroNoEsBorradorError (409) ya contabilizado o bloqueado.
   * @throws CobroPeriodoNoAbiertoError (409) period lock sin bypass (REQ-CXC-09).
   * @throws CobroCuentaDestinoNoElegibleError (422) el destino dejó de ser elegible.
   */
  async contabilizar(
    tenantId: string,
    cobroId: string,
    userId: string,
  ): Promise<CobroContabilizado> {
    return this.auditedTx.run({ userId }, async (tx) => {
      const { cobro, comprobante } = await this.obtenerCobroConComprobante(tenantId, cobroId, tx);
      if (comprobante.anulado) throw new CobroAnuladoNoEditableError(cobroId);
      if (comprobante.estado !== 'BORRADOR') {
        throw new CobroNoEsBorradorError(cobroId, comprobante.estado);
      }

      await this.exigirPeriodoAbierto(tenantId, FechaContable.fromDbDate(cobro.fechaContable), tx);
      await this.exigirDestinoElegible(tenantId, cobro.cuentaDestinoId, tx);

      const { numero } = await this.comprobanteWriter.contabilizarSistema(
        comprobante.id,
        tenantId,
        tx,
      );
      return { comprobanteId: comprobante.id, numero };
    });
  }

  /**
   * Borra el cobro en BORRADOR junto con su comprobante por el camino de
   * sistema. Un CONTABILIZADO no se borra: se anula (§4.7 — task 5.6).
   *
   * Sin period lock a propósito: un borrador no puede existir en un período
   * CERRADO — el cierre exige cero borradores en el mes (§4.4).
   *
   * @throws CobroNoEncontradoError (404) inexistente o ajeno.
   * @throws CobroNoEsBorradorError (409).
   */
  async eliminarBorrador(tenantId: string, cobroId: string, userId: string): Promise<void> {
    await this.auditedTx.run({ userId }, async (tx) => {
      const cobro = await this.repo.findById(tenantId, cobroId, tx);
      if (cobro === null) throw new CobroNoEncontradoError(cobroId);

      const comprobante = (
        await this.repo.obtenerComprobantesDeCobros(tenantId, [cobroId], tx)
      ).get(cobroId);
      if (comprobante && comprobante.estado !== 'BORRADOR') {
        throw new CobroNoEsBorradorError(cobroId, comprobante.estado);
      }

      await this.repo.eliminar(tenantId, cobroId, tx);
      if (comprobante) {
        await this.comprobanteWriter.eliminarBorradorSistema(comprobante.id, tenantId, tx);
      }
    });
  }

  // ============================================================
  // 5.5 / 5.7 — editar el cobro (REQ-CXC-06, matriz filas 7, 8 y 12)
  // ============================================================

  /**
   * Edición full-state: reemplaza la cabecera del cobro y REGENERA las líneas
   * de su comprobante en la misma TX — el monto del cobro ES el monto del
   * asiento, así que editarlo sin regenerar dejaría el asiento contradiciendo
   * al documento. El número correlativo se conserva (§4.9:
   * `regenerarLineasSistema` preserva cabecera, `id` y `numero`).
   *
   * Matriz del monto (REQ-CXC-06): subir RESUELVE (el excedente colapsa al
   * saldo a favor, que es derivado — no hay nada que repartir); bajar POR
   * DEBAJO de lo aplicado RECHAZA (fila 8) — el reparto sería entre ventas
   * distinguibles y el sistema no elige. La comparación corre BAJO el lock
   * del cobro (`obtenerCobroConAplicadoConLock`): sin él, una aplicación
   * concurrente entra entre el chequeo y el commit y deja el cobro
   * sobre-aplicado.
   *
   * Cambiar el `contactoId` (fila 12) desvincula TODAS las aplicaciones con
   * rastro B-14: sin eso queda un cobro del cliente A aplicado a ventas del
   * cliente B. Y como el contacto viaja en las líneas del asiento (B-1),
   * también obliga a regenerar.
   *
   * @throws CobroNoEncontradoError (404) inexistente o ajeno (REQ-CXC-08).
   * @throws CobroAnuladoNoEditableError (409) la anulación es terminal (§4.7).
   * @throws CobroPeriodoNoAbiertoError (409) período de ORIGEN o DESTINO no abierto (REQ-CXC-09).
   * @throws CobroMontoInferiorAplicadoError (422) bajar por debajo de lo aplicado (fila 8).
   * @throws CobroContactoNoEncontradoError (404) / CobroContactoInactivoError (422).
   * @throws CobroCuentaDestinoNoElegibleError (422) / CobroConceptoNoConfiguradoError (422).
   * @throws CobroAsientoSinMontoError (422) monto no positivo (§4.1).
   */
  async editar(
    tenantId: string,
    cobroId: string,
    userId: string,
    input: EditarCobroInput,
  ): Promise<CobroCreado> {
    const fechaNueva = FechaContable.fromIso(input.fechaContable);
    const monto = Money.of(input.monto).redondearABob();

    return this.auditedTx.run({ userId }, async (tx) => {
      // Lock del cobro PRIMERO — mismo primer lugar del orden global de locks
      // (cobro antes que venta) que toda escritura de aplicaciones: el guard
      // monto-vs-aplicado y las aplicaciones concurrentes se serializan acá.
      const cobroLock = await this.repo.obtenerCobroConAplicadoConLock(tenantId, cobroId, tx);
      if (cobroLock === null) throw new CobroNoEncontradoError(cobroId);

      const { cobro, comprobante } = await this.obtenerCobroConComprobante(tenantId, cobroId, tx);
      if (comprobante.anulado) throw new CobroAnuladoNoEditableError(cobroId);

      // REQ-CXC-09/§4.4: el período de ORIGEN tiene que estar abierto (el
      // asiento ya integró ese mes) y el de DESTINO también si la fecha se
      // mueve. Defense in depth con el mismo chequeo del writer.
      const fechaOrigen = FechaContable.fromDbDate(cobro.fechaContable);
      await this.exigirPeriodoAbierto(tenantId, fechaOrigen, tx);
      if (fechaNueva.toIso() !== fechaOrigen.toIso()) {
        await this.exigirPeriodoAbierto(tenantId, fechaNueva, tx);
      }

      await this.validarContacto(tenantId, input.contactoId, tx);
      await this.exigirDestinoElegible(tenantId, input.cuentaDestinoId, tx);

      const { cuentasPorCobrarId } = await this.config.obtenerConfig(tenantId, tx);
      if (cuentasPorCobrarId === null) throw new CobroConceptoNoConfiguradoError();

      // El builder valida monto > 0 (§4.1) ANTES de desvincular o escribir:
      // un monto inválido rechaza sin haber tocado ninguna aplicación.
      const lineasAsiento = construirAsientoCobro({
        contactoId: input.contactoId,
        monto,
        cuentaDestinoId: input.cuentaDestinoId,
        cuentasPorCobrarId,
      });

      await this.ajustarAplicacionesDelCobro(
        tenantId,
        cobro,
        input.contactoId,
        monto,
        Money.of(cobroLock.aplicadoAlCobro),
        userId,
        tx,
      );

      const actualizado = await this.repo.actualizar(
        tenantId,
        cobroId,
        {
          contactoId: input.contactoId,
          fechaContable: fechaNueva.toDbDate(),
          monto: monto.toPrismaDecimal(),
          cuentaDestinoId: input.cuentaDestinoId,
          glosa: input.glosa,
        },
        tx,
      );

      const razonSocial = await this.cartera.obtenerRazonSocialContacto(
        tenantId,
        input.contactoId,
        tx,
      );
      if (razonSocial === null) throw new CobroContactoNoEncontradoError(input.contactoId);

      await this.comprobanteWriter.regenerarLineasSistema(
        {
          tenantId,
          comprobanteId: comprobante.id,
          fechaContable: fechaNueva.toDbDate(),
          glosa: componerGlosaComprobanteCobro({
            razonSocialContacto: razonSocial,
            glosaCobro: input.glosa,
          }),
          monedaPrincipal: Moneda.BOB,
          lineas: lineasAsiento,
        },
        tx,
      );

      return { cobro: actualizado, comprobanteId: comprobante.id };
    });
  }

  // ============================================================
  // 5.6 — anular el cobro (REQ-CXC-06 fila 9, §4.7, B-14, D-13)
  // ============================================================

  /**
   * Anulación §4.7 por flag, disparada DESDE este módulo (Anti-14: el
   * `anular` de usuario en comprobantes rechaza los orígenes comerciales con
   * 409 justamente para que esta orquestación no se saltee). El comprobante
   * se preserva para siempre con su número; las ventas vuelven a quedar
   * pendientes por DERIVACIÓN pura — no hay ningún estado que reabrir,
   * ninguna columna de la venta se toca.
   *
   * ORDEN (lección Fase 4, task 4.7): `anularSistema` corre ANTES de
   * desvincular — valida motivo (≥ 10 caracteres significativos, §4.7) y
   * estado, así que un rechazo suyo sale sin haber tocado ninguna
   * aplicación. Al revés, un rechazo tardío dejaría las aplicaciones ya
   * borradas.
   *
   * D-13: anular un cobro ya depositado vía traspaso PROCEDE — sin guard de
   * saldo de Caja. Caja General puede quedar con saldo acreedor y eso lo
   * destapa el arqueo: trabajo del contador, asumido explícitamente.
   *
   * @throws CobroNoEncontradoError (404) inexistente o ajeno.
   * @throws CobroAnuladoNoEditableError (409) ya anulado — la anulación es terminal.
   * @throws CobroPeriodoNoAbiertoError (409) period lock sin bypass (REQ-CXC-09).
   */
  async anular(tenantId: string, cobroId: string, userId: string, motivo: string): Promise<void> {
    await this.auditedTx.run({ userId }, async (tx) => {
      const { cobro, comprobante } = await this.obtenerCobroConComprobante(tenantId, cobroId, tx);
      if (comprobante.anulado) throw new CobroAnuladoNoEditableError(cobroId);

      await this.exigirPeriodoAbierto(tenantId, FechaContable.fromDbDate(cobro.fechaContable), tx);

      await this.comprobanteWriter.anularSistema(
        { tenantId, comprobanteId: comprobante.id, motivo, anuladoPorUserId: userId },
        tx,
      );

      const aplicaciones = await this.repo.listarAplicacionesDeCobro(tenantId, cobroId, tx);
      await this.desvincularAplicaciones(
        tenantId,
        cobroId,
        aplicaciones,
        `Anulación del cobro: ${motivo.trim()}`,
        userId,
        tx,
      );
    });
  }

  // ============================================================
  // 5.4 — Aplicaciones: vínculos, no hechos contables (REQ-CXC-03/04/08)
  // ============================================================

  /**
   * Crea una aplicación cobro→venta. NO genera asiento ni toca ningún
   * comprobante (D-03) y queda EXENTA del period lock (REQ-CXC-03: no hay
   * hecho contable nuevo que fechar — reaplicar es mover una fila).
   *
   * REQ-CXC-04 corre DOS veces con la misma función de dominio: pre-TX con
   * sumas leídas sin lock (fail fast) e intra-TX con `SUM()` en SQL bajo
   * `FOR UPDATE` sobre el cobro y la venta (Anti-11/Anti-12, cicatriz F-03).
   *
   * @throws AplicacionMontoNoPositivoError (422).
   * @throws CobroNoEncontradoError (404) cobro ajeno o inexistente.
   * @throws AplicacionVentaNoEncontradaError (404) venta ajena o inexistente — nunca 403 ni 422 (REQ-CXC-08).
   * @throws AplicacionContactoDistintoError (422) puntas de clientes distintos.
   * @throws AplicacionPuntaNoContabilizadaError (422) alguna punta en BORRADOR o anulada.
   * @throws AplicacionExcedeCobroError / AplicacionExcedeVentaError (422).
   */
  async crearAplicacion(
    tenantId: string,
    userId: string,
    input: CrearAplicacionInput,
  ): Promise<AplicacionCobroRow> {
    const monto = Money.of(input.montoAplicado);
    if (!monto.isPositive()) throw new AplicacionMontoNoPositivoError(monto.toBob());

    // REQ-CXC-04 pre-TX: fail fast con lecturas sin lock, antes de abrir la TX.
    const cobro = await this.repo.findById(tenantId, input.cobroId, undefined);
    if (cobro === null) throw new CobroNoEncontradoError(input.cobroId);
    await this.verificarSobreAplicacionPreTx(tenantId, cobro, input.ventaId, monto, undefined);

    return this.auditedTx.run({ userId }, async (tx) => {
      const sumas = await this.obtenerSumasBajoLock(
        tenantId,
        input.cobroId,
        input.ventaId,
        undefined,
        tx,
      );

      verificarMismoContacto(sumas.cobro.contactoId, sumas.venta.contactoId);
      await this.exigirPuntasContabilizadas(
        tenantId,
        input.cobroId,
        input.ventaId,
        sumas.venta.condicionPago,
        tx,
      );
      // REQ-CXC-04 intra-TX: la decisión autoritativa, con las sumas bajo lock.
      verificarSobreAplicacion(aSumasDeDominio(sumas), monto);

      const creada = await this.repo.crearAplicacion(
        tenantId,
        {
          cobroId: input.cobroId,
          ventaId: input.ventaId,
          montoAplicado: monto.toPrismaDecimal(),
          createdByUserId: userId,
        },
        tx,
      );
      // El repositorio re-verifica ambas puntas (defense in depth, §4.2):
      // null = alguna punta desapareció o es ajena → el mismo 404.
      if (creada === null) throw new AplicacionVentaNoEncontradaError(input.ventaId);
      return creada;
    });
  }

  /**
   * Edita el `montoAplicado` de una aplicación. El invariante se evalúa
   * uniforme: las sumas EXCLUYEN la fila editada y se compara
   * `suma + montoNuevo ≤ tope`, pre-TX y bajo lock (REQ-CXC-04). Un monto 0
   * no se edita: se elimina (`eliminarAplicacion`).
   *
   * @throws AplicacionMontoNoPositivoError (422).
   * @throws CobroNoEncontradoError (404) / AplicacionNoEncontradaError (404).
   * @throws AplicacionContactoDistintoError / AplicacionPuntaNoContabilizadaError (422).
   * @throws AplicacionExcedeCobroError / AplicacionExcedeVentaError (422).
   */
  async editarMontoAplicacion(
    tenantId: string,
    cobroId: string,
    aplicacionId: string,
    userId: string,
    montoAplicado: string,
  ): Promise<void> {
    const monto = Money.of(montoAplicado);
    if (!monto.isPositive()) throw new AplicacionMontoNoPositivoError(monto.toBob());

    const cobro = await this.repo.findById(tenantId, cobroId, undefined);
    if (cobro === null) throw new CobroNoEncontradoError(cobroId);
    const aplicaciones = await this.repo.listarAplicacionesDeCobro(tenantId, cobroId, undefined);
    const aplicacion = aplicaciones.find((a) => a.id === aplicacionId);
    if (aplicacion === undefined) throw new AplicacionNoEncontradaError(aplicacionId);
    await this.verificarSobreAplicacionPreTx(
      tenantId,
      cobro,
      aplicacion.ventaId,
      monto,
      aplicacionId,
    );

    await this.auditedTx.run({ userId }, async (tx) => {
      const sumas = await this.obtenerSumasBajoLock(
        tenantId,
        cobroId,
        aplicacion.ventaId,
        aplicacionId,
        tx,
      );

      verificarMismoContacto(sumas.cobro.contactoId, sumas.venta.contactoId);
      await this.exigirPuntasContabilizadas(
        tenantId,
        cobroId,
        aplicacion.ventaId,
        sumas.venta.condicionPago,
        tx,
      );
      verificarSobreAplicacion(aSumasDeDominio(sumas), monto);

      try {
        await this.repo.actualizarMontoAplicacion(
          tenantId,
          aplicacionId,
          monto.toPrismaDecimal(),
          tx,
        );
      } catch (err) {
        // La aplicación desapareció entre la lectura pre-TX y el lock: para el
        // caller ya no existe (§4.2 — P2025 exacto del adapter).
        if (esP2025(err)) throw new AplicacionNoEncontradaError(aplicacionId);
        throw err;
      }
    });
  }

  /**
   * Borra físicamente una aplicación (D-12). SIN rastro a propósito:
   * desaplicar a mano es el "reaplicar" normal de D-03, no una desvinculación
   * forzada — B-14 aplica a anular el cobro o cambiarle el contacto (5.6/5.7).
   * Quitar plata aplicada nunca viola REQ-CXC-04, así que no re-evalúa sumas;
   * el lock del cobro serializa contra las escrituras concurrentes.
   *
   * @throws CobroNoEncontradoError (404) / AplicacionNoEncontradaError (404).
   */
  async eliminarAplicacion(
    tenantId: string,
    cobroId: string,
    aplicacionId: string,
    userId: string,
  ): Promise<void> {
    await this.auditedTx.run({ userId }, async (tx) => {
      const cobro = await this.repo.obtenerCobroConAplicadoConLock(tenantId, cobroId, tx);
      if (cobro === null) throw new CobroNoEncontradoError(cobroId);

      const aplicaciones = await this.repo.listarAplicacionesDeCobro(tenantId, cobroId, tx);
      if (!aplicaciones.some((a) => a.id === aplicacionId)) {
        throw new AplicacionNoEncontradaError(aplicacionId);
      }

      await this.repo.eliminarAplicaciones(tenantId, [aplicacionId], tx);
    });
  }

  // ============================================================
  // 5.10 — Lecturas: superficie read del controller. SIN transacción
  // auditada a propósito: los triggers de `comprobantes_audit` solo miran
  // escrituras, y una lectura no emite auditoría (espejo de ventas 4.9).
  // ============================================================

  /**
   * Listado paginado (Anti-28: paginación obligatoria, limit capeado) con el
   * estado de cada cobro DERIVADO de su comprobante (REQ-CXC-02). Un cobro
   * sin comprobante es un dato roto y queda fuera de la lista — el mismo
   * criterio que el 404 del detalle, sin tumbar el listado entero.
   */
  async listar(tenantId: string, input: ListarCobrosInput): Promise<ListarCobrosResult> {
    const page = input.page ?? 1;
    const limit = Math.min(input.limit ?? LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT);

    const filtros = {
      ...(input.contactoId !== undefined ? { contactoId: input.contactoId } : {}),
      ...(input.fechaDesde !== undefined
        ? { fechaDesde: FechaContable.fromIso(input.fechaDesde).toDbDate() }
        : {}),
      ...(input.fechaHasta !== undefined
        ? { fechaHasta: FechaContable.fromIso(input.fechaHasta).toDbDate() }
        : {}),
    };

    const { cobros, total } = await this.repo.listar(tenantId, filtros, { page, limit }, undefined);
    const comprobantes = await this.repo.obtenerComprobantesDeCobros(
      tenantId,
      cobros.map((c) => c.id),
      undefined,
    );

    return {
      cobros: cobros.flatMap((cobro) => {
        const comprobante = comprobantes.get(cobro.id);
        return comprobante === undefined ? [] : [{ cobro, comprobante }];
      }),
      total,
      page,
      limit,
    };
  }

  /**
   * Detalle con comprobante y aplicaciones vigentes.
   * @throws CobroNoEncontradoError (404) inexistente o ajeno (REQ-CXC-08).
   */
  async obtener(tenantId: string, cobroId: string): Promise<CobroDetalle> {
    const { cobro, comprobante } = await this.obtenerCobroConComprobante(
      tenantId,
      cobroId,
      undefined,
    );
    const aplicaciones = await this.repo.listarAplicacionesDeCobro(tenantId, cobroId, undefined);
    return { cobro, comprobante, aplicaciones };
  }

  // ============================================================
  // 5.8 — Period lock, pieza reutilizable (REQ-CXC-09, §4.4)
  // ============================================================

  /**
   * Period lock SIN bypass de admin: crear, contabilizar, editar y anular un
   * cobro cuya `fechaContable` cae en un período que no está ABIERTO se
   * rechazan; el único camino es la reapertura formal
   * (`PeriodoFiscalReopening`). Las tasks 5.5–5.7 DEBEN llamar este guard
   * antes de escribir. Las APLICACIONES quedan explícitamente EXENTAS
   * (REQ-CXC-03: no son hechos contables).
   *
   * Vocabulario: `PeriodoFiscalStatus` es `ABIERTO | CERRADO` — NO existe un
   * período `BLOQUEADO` (`BLOQUEADO` es valor de `EstadoComprobante`).
   *
   * Corre DENTRO de la TX del caller para que el veredicto y la escritura
   * compartan snapshot (defense in depth junto al chequeo propio del writer).
   */
  private async exigirPeriodoAbierto(
    tenantId: string,
    fecha: FechaContable,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const periodo = await this.periodos.obtenerPorFecha(tenantId, fecha, tx);
    if (periodo === null) throw new CobroGestionNoAbiertaError(fecha.toIso());
    if (periodo.status !== PeriodoFiscalStatus.ABIERTO) {
      throw new CobroPeriodoNoAbiertoError(periodo.id, periodo.status);
    }
  }

  // ============================================================
  // Privados
  // ============================================================

  /**
   * Matriz de REQ-CXC-06 sobre las aplicaciones del cobro editado:
   * cambio de contacto → desvincular TODAS con rastro (fila 12); baja del
   * monto por debajo de lo aplicado → rechazar (fila 8) — a diferencia de la
   * venta (recorte LIFO, D-21), acá el sistema NO recorta: el reparto sería
   * entre ventas distinguibles y el usuario desaplica primero.
   *
   * `totalAplicado` viene del snapshot BAJO LOCK (`obtenerCobroConAplicadoConLock`),
   * no de una lectura suelta: la comparación y el UPDATE comparten el lock
   * del cobro, así que una aplicación concurrente no puede colarse en el
   * medio (REQ-CXC-04, cicatriz F-03). Si el contacto cambia no hay nada que
   * comparar: lo desvinculado deja de contar y el invariante queda en 0.
   */
  private async ajustarAplicacionesDelCobro(
    tenantId: string,
    cobro: Cobro,
    contactoNuevoId: string,
    montoNuevo: Money,
    totalAplicado: Money,
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (contactoNuevoId !== cobro.contactoId) {
      const aplicaciones = await this.repo.listarAplicacionesDeCobro(tenantId, cobro.id, tx);
      await this.desvincularAplicaciones(
        tenantId,
        cobro.id,
        aplicaciones,
        MOTIVO_DESVINCULO_CAMBIO_CLIENTE,
        userId,
        tx,
      );
      return;
    }

    if (montoNuevo.lessThan(totalAplicado)) {
      throw new CobroMontoInferiorAplicadoError(montoNuevo, totalAplicado);
    }
  }

  /**
   * Borrado físico (D-12) + rastro append-only (B-14), SIEMPRE juntos y en la
   * misma TX: borrar sin rastro pierde el acto, rastrear sin borrar duplica
   * plata. Espejo de `VentasService.desvincularAplicaciones`.
   */
  private async desvincularAplicaciones(
    tenantId: string,
    cobroId: string,
    aplicaciones: AplicacionDeCobro[],
    motivo: string,
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (aplicaciones.length === 0) return;

    await this.repo.eliminarAplicaciones(
      tenantId,
      aplicaciones.map((a) => a.id),
      tx,
    );
    await this.repo.registrarAplicacionesDesvinculadas(
      tenantId,
      aplicaciones.map((a) => ({
        cobroId,
        ventaId: a.ventaId,
        montoAplicado: a.montoAplicado,
        motivo,
        userId,
      })),
      tx,
    );
  }

  /**
   * El cobro con el comprobante que le da su estado (REQ-CXC-02: el cobro no
   * espeja estado). Un cobro sin comprobante es un dato roto — se responde el
   * mismo 404 que "no existe" (§4.2: no se revela nada más).
   */
  private async obtenerCobroConComprobante(
    tenantId: string,
    cobroId: string,
    tx: Prisma.TransactionClient | undefined,
  ): Promise<{ cobro: Cobro; comprobante: ComprobanteDeCobro }> {
    const cobro = await this.repo.findById(tenantId, cobroId, tx);
    if (cobro === null) throw new CobroNoEncontradoError(cobroId);

    const comprobante = (await this.repo.obtenerComprobantesDeCobros(tenantId, [cobroId], tx)).get(
      cobroId,
    );
    if (comprobante === undefined) throw new CobroNoEncontradoError(cobroId);

    return { cobro, comprobante };
  }

  /** REQ-CXC-02: destino no elegible, ajeno o inexistente → el MISMO 422. */
  private async exigirDestinoElegible(
    tenantId: string,
    cuentaDestinoId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const elegible = await this.cuentasEfectivo.esElegibleComoDestino(
      tenantId,
      cuentaDestinoId,
      tx,
    );
    if (!elegible) throw new CobroCuentaDestinoNoElegibleError(cuentaDestinoId);
  }

  /** REQ-CXC-08: el contacto se valida contra el MISMO tenant — ajeno → 404. */
  private async validarContacto(
    tenantId: string,
    contactoId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const contacto = (await this.contactos.obtenerBatch(tenantId, [contactoId], tx)).get(
      contactoId,
    );
    if (contacto === undefined) throw new CobroContactoNoEncontradoError(contactoId);
    if (!contacto.activo) throw new CobroContactoInactivoError(contactoId);
  }

  /**
   * Snapshot bajo lock de REQ-CXC-04. El cobro ya se resolvió con `findById`
   * antes de abrir la TX: si el snapshot no aparece, la punta faltante es la
   * venta (o el cobro desapareció en el medio — se re-verifica para responder
   * el 404 correcto y no filtrar cuál punta existe con el código equivocado).
   */
  private async obtenerSumasBajoLock(
    tenantId: string,
    cobroId: string,
    ventaId: string,
    excluirAplicacionId: string | undefined,
    tx: Prisma.TransactionClient,
  ): Promise<SumasAplicadasConLock> {
    const sumas = await this.repo.obtenerSumasAplicadasConLock(
      tenantId,
      {
        cobroId,
        ventaId,
        ...(excluirAplicacionId !== undefined ? { excluirAplicacionId } : {}),
      },
      tx,
    );
    if (sumas !== null) return sumas;

    const cobro = await this.repo.findById(tenantId, cobroId, tx);
    if (cobro === null) throw new CobroNoEncontradoError(cobroId);
    throw new AplicacionVentaNoEncontradaError(ventaId);
  }

  /**
   * REQ-CXC-04 pre-TX (fail fast): la MISMA función de dominio que corre bajo
   * lock, con sumas leídas sueltas. La Σ del cobro se deriva de sus propias
   * aplicaciones y la de la venta sale de la fila de cartera (`groupBy` en
   * SQL). La decisión autoritativa es SIEMPRE la intra-TX (Anti-11): esto solo
   * evita abrir la TX y tomar locks para un pedido obviamente inválido. Si la
   * venta no aparece en la cartera del contacto del cobro (ajena, de otro
   * cliente, CONTADO, sin contabilizar…), no se decide nada acá — la TX tiene
   * el snapshot completo para responder el error correcto.
   */
  private async verificarSobreAplicacionPreTx(
    tenantId: string,
    cobro: Cobro,
    ventaId: string,
    monto: Money,
    excluirAplicacionId: string | undefined,
  ): Promise<void> {
    const aplicaciones = await this.repo.listarAplicacionesDeCobro(tenantId, cobro.id, undefined);
    const aplicadoAlCobro = aplicaciones
      .filter((a) => a.id !== excluirAplicacionId)
      .reduce((acc, a) => acc.plus(Money.of(a.montoAplicado)), Money.ZERO);

    const fila = (await this.cartera.listarVentasDeCartera(tenantId, cobro.contactoId)).find(
      (v) => v.ventaId === ventaId,
    );
    if (fila === undefined) return;

    const excluida =
      excluirAplicacionId !== undefined
        ? aplicaciones.find((a) => a.id === excluirAplicacionId && a.ventaId === ventaId)
        : undefined;
    const aplicadoALaVenta = excluida
      ? fila.totalAplicado.minus(Money.of(excluida.montoAplicado))
      : fila.totalAplicado;

    verificarSobreAplicacion(
      {
        cobro: { id: cobro.id, monto: Money.of(cobro.monto), totalAplicado: aplicadoAlCobro },
        venta: { id: ventaId, montoTotal: fila.montoTotal, totalAplicado: aplicadoALaVenta },
      },
      monto,
    );
  }

  /**
   * Una aplicación solo puede existir si sus dos puntas mueven plata de
   * verdad, y la exigencia es ASIMÉTRICA a propósito:
   *
   * - Punta COBRO: `esComprobanteConciliable` — `estado IN (CONTABILIZADO,
   *   BLOQUEADO) AND anulado = false` (§4.4). Un BORRADOR no movió plata y un
   *   anulado dejó de moverla. BLOQUEADO SÍ pasa: aplicar contra un cobro de
   *   período cerrado procede (REQ-CXC-03, "reaplicar es mover una fila").
   * - Punta VENTA: el predicado COMPLETO de cartera (`integraCartera`,
   *   Anti-01) — lo anterior MÁS `condicionPago = CREDITO`. Una CONTADO
   *   contabilizada cumple el predicado de estados pero no integra la
   *   cartera (D-04): aplicarle consumiría saldo del cobro sin cancelar
   *   ninguna deuda visible (task 0).
   *
   * `condicionPagoVenta` viene del snapshot BAJO LOCK
   * (`SumasAplicadasConLock.venta`), no de una lectura aparte.
   */
  private async exigirPuntasContabilizadas(
    tenantId: string,
    cobroId: string,
    ventaId: string,
    condicionPagoVenta: SumasAplicadasConLock['venta']['condicionPago'],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const comprobanteCobro = (
      await this.repo.obtenerComprobantesDeCobros(tenantId, [cobroId], tx)
    ).get(cobroId);
    if (comprobanteCobro === undefined) throw new CobroNoEncontradoError(cobroId);
    this.exigirPuntaContabilizada('cobro', cobroId, comprobanteCobro);

    const comprobanteVenta = (
      await this.repo.obtenerComprobantesDeVentas(tenantId, [ventaId], tx)
    ).get(ventaId);
    if (comprobanteVenta === undefined) throw new AplicacionVentaNoEncontradaError(ventaId);

    const motivo = motivoVentaFueraDeCartera({
      condicionPago: condicionPagoVenta,
      estado: comprobanteVenta.estado,
      anulado: comprobanteVenta.anulado,
    });
    if (motivo === 'NO_CONCILIABLE') {
      throw new AplicacionPuntaNoContabilizadaError(
        'venta',
        ventaId,
        comprobanteVenta.estado,
        comprobanteVenta.anulado,
      );
    }
    if (motivo === 'CONTADO') throw new AplicacionVentaContadoError(ventaId);
  }

  private exigirPuntaContabilizada(
    punta: 'cobro' | 'venta',
    id: string,
    comprobante: ComprobanteDeCobro,
  ): void {
    if (!esComprobanteConciliable(comprobante.estado, comprobante.anulado)) {
      throw new AplicacionPuntaNoContabilizadaError(
        punta,
        id,
        comprobante.estado,
        comprobante.anulado,
      );
    }
  }
}

function aSumasDeDominio(sumas: SumasAplicadasConLock): SumasAplicacion {
  return {
    cobro: {
      id: sumas.cobro.id,
      monto: Money.of(sumas.cobro.monto),
      totalAplicado: Money.of(sumas.aplicadoAlCobro),
    },
    venta: {
      id: sumas.venta.id,
      montoTotal: Money.of(sumas.venta.montoTotal),
      totalAplicado: Money.of(sumas.aplicadoALaVenta),
    },
  };
}

function esP2025(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}
