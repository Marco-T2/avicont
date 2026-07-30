import { Inject, Injectable } from '@nestjs/common';
import {
  type CondicionPago,
  Moneda,
  PeriodoFiscalStatus,
  Prisma,
  TipoComprobante,
} from '@prisma/client';

import { AuditedTransactionRunner } from '@/common/audited-transaction.runner';
import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';
import {
  COMPROBANTE_SISTEMA_WRITER_PORT,
  ComprobanteSistemaWriterPort,
  ORIGEN_TIPO_VENTA,
} from '@/comprobantes/ports/comprobante-sistema-writer.port';
import {
  CONTACTOS_READER_PORT,
  ContactosReaderPort,
} from '@/contactos/ports/contactos-reader.port';
import {
  CUENTAS_EFECTIVO_READER_PORT,
  CuentasEfectivoReaderPort,
} from '@/cuentas/ports/cuentas-efectivo-reader.port';
import { CUENTAS_READER_PORT, CuentasReaderPort } from '@/cuentas/ports/cuentas-reader.port';
import { ITEMS_READER_PORT, ItemsReaderPort } from '@/items/ports/items-reader.port';
import {
  PERIODOS_READER_PORT,
  PeriodosReaderPort,
} from '@/periodos-fiscales/ports/periodos-reader.port';

import { construirAsientoVenta, type LineaVentaParaAsiento } from './domain/asiento-venta';
import { calcularSubtotal } from './domain/calculo-venta';
import { componerGlosaComprobanteVenta } from './domain/glosa-venta';
import { recortarAplicacionesLifo } from './domain/recorte-aplicaciones';
import {
  VentaAnuladaNoEditableError,
  VentaConceptoNoConfiguradoError,
  VentaContactoInactivoError,
  VentaContactoNoEncontradoError,
  VentaCuentaDestinoNoElegibleError,
  VentaCuentaSnapshotInactivaError,
  VentaGestionNoAbiertaError,
  VentaItemInactivoError,
  VentaItemNoEncontradoError,
  VentaNoEncontradaError,
  VentaNoEsBorradorError,
  VentaPeriodoNoAbiertoError,
  VentaVencimientoRequeridoError,
} from './domain/venta-errors';
import {
  VENTA_SNAPSHOTS_READER_PORT,
  VentaSnapshotsReaderPort,
} from './ports/venta-snapshots-reader.port';
import {
  VENTA_REPOSITORY_PORT,
  type AplicacionDeVenta,
  type ComprobanteDeVenta,
  type LineaVentaData,
  type VentaConLineas,
  VentaRepositoryPort,
} from './ports/venta.repository.port';
import {
  VENTAS_CONFIG_READER_PORT,
  VentasConfigReaderPort,
} from './ports/ventas-config-reader.port';

export interface CrearLineaVentaInput {
  itemId: string;
  descripcion: string;
  /** Cantidad como string decimal (§4.5: nada de `number` para montos/cantidades). */
  cantidad: string;
  precioUnitario: string;
  /** IGNORADO (REQ-VTA-03/B-9): el backend calcula; un valor malicioso no se persiste. */
  subtotal?: string;
}

export interface CrearVentaInput {
  contactoId: string;
  /** ISO `YYYY-MM-DD`, calendario puro (§4.6). */
  fechaContable: string;
  condicionPago: CondicionPago;
  /** Obligatoria en CREDITO, prohibida en CONTADO (REQ-VTA-02). ISO `YYYY-MM-DD`. */
  fechaVencimiento?: string;
  glosa: string;
  /** Cuenta destino ELEGIDA (PA-1) — solo CONTADO. En CREDITO se ignora. */
  cuentaDestinoId?: string;
  /** IGNORADO (REQ-VTA-03/B-9): el backend calcula la Σ de subtotales redondeados. */
  montoTotal?: string;
  lineas: CrearLineaVentaInput[];
}

export interface VentaCreada {
  venta: VentaConLineas;
  comprobanteId: string;
}

/**
 * La edición es full-state (D-17): el mismo shape del alta, sin campos
 * parciales. El reemplazo en bloque ES el mecanismo — incluido cambiar el
 * contacto (D-20).
 */
export type EditarVentaInput = CrearVentaInput;

export interface VentaContabilizada {
  comprobanteId: string;
  /** Número de la serie propia del tipo VENTA: `V{YY}{MM}-{correlativo:6}`. */
  numero: string;
}

/**
 * Motivos user-facing del rastro `AplicacionCobroDesvinculada` (B-14). El de
 * anulación se compone con el motivo que dio el usuario (§4.7).
 */
const MOTIVO_DESVINCULO_CAMBIO_CLIENTE = 'Cambio del cliente de la venta';
const MOTIVO_DESVINCULO_RECORTE =
  'Recorte por reducción del monto de la venta por debajo de lo cobrado';

/** Línea con sus snapshots resueltos y su subtotal calculado (REQ-VTA-02/03). */
interface LineaResuelta {
  itemId: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  cuentaIngresoId: string;
  subtotal: Money;
}

/**
 * Orquesta el documento comercial de venta, que ES su propio comprobante desde
 * el borrador (REQ-VTA-01, D-02/D-19): la venta y su asiento nacen, mutan y
 * mueren en la MISMA transacción auditada.
 *
 * Todo write corre dentro de `AuditedTransactionRunner.run` (§4.3): los
 * triggers de `comprobantes_audit` leen el actor de `app.audit_user_id`, que
 * el runner inyecta al abrir la TX — escribir fuera pierde el actor en
 * silencio.
 */
@Injectable()
export class VentasService {
  constructor(
    @Inject(VENTA_REPOSITORY_PORT)
    private readonly repo: VentaRepositoryPort,
    @Inject(COMPROBANTE_SISTEMA_WRITER_PORT)
    private readonly comprobanteWriter: ComprobanteSistemaWriterPort,
    @Inject(ITEMS_READER_PORT)
    private readonly items: ItemsReaderPort,
    @Inject(CONTACTOS_READER_PORT)
    private readonly contactos: ContactosReaderPort,
    @Inject(CUENTAS_EFECTIVO_READER_PORT)
    private readonly cuentasEfectivo: CuentasEfectivoReaderPort,
    @Inject(CUENTAS_READER_PORT)
    private readonly cuentas: CuentasReaderPort,
    @Inject(PERIODOS_READER_PORT)
    private readonly periodos: PeriodosReaderPort,
    @Inject(VENTAS_CONFIG_READER_PORT)
    private readonly config: VentasConfigReaderPort,
    @Inject(VENTA_SNAPSHOTS_READER_PORT)
    private readonly snapshots: VentaSnapshotsReaderPort,
    private readonly auditedTx: AuditedTransactionRunner,
  ) {}

  /**
   * Alta del borrador: valida, calcula, persiste la venta y genera su
   * comprobante BORRADOR por el path-sistema — todo en UNA transacción.
   *
   * @throws VentaGestionNoAbiertaError (422) sin período para la fecha.
   * @throws VentaPeriodoNoAbiertoError (409) período no ABIERTO (REQ-VTA-09, sin bypass).
   * @throws VentaVencimientoRequeridoError (422) CREDITO sin vencimiento / CONTADO con él.
   * @throws VentaContactoNoEncontradoError / VentaItemNoEncontradoError (404) cruce de tenant (REQ-VTA-08).
   * @throws VentaContactoInactivoError / VentaItemInactivoError (422).
   * @throws VentaConceptoNoConfiguradoError (422) `ventasId`/`cuentasPorCobrarId` sin mapear (B-12).
   * @throws VentaCuentaDestinoNoElegibleError (422) CONTADO contra cuenta no elegible (PA-1).
   */
  async crear(tenantId: string, userId: string, input: CrearVentaInput): Promise<VentaCreada> {
    const fecha = FechaContable.fromIso(input.fechaContable);

    return this.auditedTx.run({ userId }, async (tx) => {
      // REQ-VTA-09: el lock corre ANTES de cualquier escritura, dentro de la TX.
      await this.exigirPeriodoAbierto(tenantId, fecha, tx);

      const fechaVencimiento = this.validarVencimiento(input);
      await this.validarContacto(tenantId, input.contactoId, tx);
      await this.validarItems(tenantId, input.lineas, tx);

      const configComercial = await this.config.obtenerConfig(tenantId, tx);
      const lineas = await this.resolverLineas(
        tenantId,
        input.lineas,
        configComercial.ventasId,
        new Map(),
        tx,
      );
      // REQ-VTA-03: Σ de subtotales YA redondeados; lo que diga el payload se ignora.
      const montoTotal = lineas.reduce((acc, l) => acc.plus(l.subtotal), Money.ZERO);

      const cuentaDelDebeId = await this.resolverCuentaDelDebe(
        tenantId,
        input,
        configComercial.cuentasPorCobrarId,
        tx,
      );

      const razonSocial = await this.snapshots.obtenerRazonSocialContacto(
        tenantId,
        input.contactoId,
        tx,
      );
      // La existencia ya se validó vía ContactosReaderPort; esto es defensivo.
      if (razonSocial === null) throw new VentaContactoNoEncontradoError(input.contactoId);

      const venta = await this.repo.crear(
        tenantId,
        {
          contactoId: input.contactoId,
          fechaContable: fecha.toDbDate(),
          condicionPago: input.condicionPago,
          fechaVencimiento,
          glosa: input.glosa,
          // PA-1: la cuenta destino elegida se PERSISTE en la venta — regenerar
          // el asiento la lee de acá, no de la línea de débito del comprobante.
          cuentaDestinoId: input.condicionPago === 'CONTADO' ? cuentaDelDebeId : null,
          montoTotal: montoTotal.toPrismaDecimal(),
          createdByUserId: userId,
          lineas: lineas.map(toLineaVentaData),
        },
        tx,
      );

      const lineasAsiento = construirAsientoVenta(
        input.condicionPago === 'CONTADO'
          ? {
              condicionPago: 'CONTADO',
              contactoId: input.contactoId,
              montoTotal,
              lineas: lineas.map(toLineaParaAsiento),
              cuentaDestinoId: cuentaDelDebeId,
            }
          : {
              condicionPago: 'CREDITO',
              contactoId: input.contactoId,
              montoTotal,
              lineas: lineas.map(toLineaParaAsiento),
              cuentasPorCobrarId: cuentaDelDebeId,
            },
      );

      const { id: comprobanteId } = await this.comprobanteWriter.crearBorradorSistema(
        {
          tenantId,
          tipo: TipoComprobante.VENTA,
          fechaContable: fecha.toDbDate(),
          // Q-2: autosuficiente en el Libro Diario — operación + cliente.
          glosa: componerGlosaComprobanteVenta({
            condicionPago: input.condicionPago,
            razonSocialContacto: razonSocial,
            glosaVenta: input.glosa,
          }),
          monedaPrincipal: Moneda.BOB,
          origenTipo: ORIGEN_TIPO_VENTA,
          origenId: venta.id,
          createdByUserId: userId,
          lineas: lineasAsiento,
        },
        tx,
      );

      return { venta, comprobanteId };
    });
  }

  /**
   * REQ-VTA-01: borrar la venta borra su comprobante por el camino de sistema
   * (el flag `generadoPorSistema` bloquea la operación de usuario).
   *
   * Sin period lock a propósito: un borrador no puede existir en un período
   * CERRADO — el cierre exige cero borradores en el mes (§4.4).
   *
   * @throws VentaNoEncontradaError (404) inexistente o ajena.
   * @throws VentaNoEsBorradorError (409) un CONTABILIZADO no se borra, se anula (§4.7).
   */
  async eliminarBorrador(tenantId: string, ventaId: string, userId: string): Promise<void> {
    await this.auditedTx.run({ userId }, async (tx) => {
      const venta = await this.repo.findById(tenantId, ventaId, tx);
      if (venta === null) throw new VentaNoEncontradaError(ventaId);

      const comprobante = (
        await this.repo.obtenerComprobantesDeVentas(tenantId, [ventaId], tx)
      ).get(ventaId);
      if (comprobante && comprobante.estado !== 'BORRADOR') {
        throw new VentaNoEsBorradorError(ventaId, comprobante.estado);
      }

      await this.repo.eliminar(tenantId, ventaId, tx);
      if (comprobante) {
        await this.comprobanteWriter.eliminarBorradorSistema(comprobante.id, tenantId, tx);
      }
    });
  }

  /**
   * REQ-VTA-05: pasa el comprobante de la venta a CONTABILIZADO con número de
   * la serie propia del tipo VENTA (`V{YY}{MM}-{correlativo:6}`, §4.9),
   * independiente de la serie I de INGRESO.
   *
   * El camino de sistema RE-VALIDA, no solo escribe: los snapshots son
   * configuración almacenada y la cuenta pudo desactivarse después de crear el
   * borrador. Además del núcleo compartido del writer (partida doble, ≥2
   * líneas, glosa, `requiereContacto`), acá se re-valida en vocabulario de
   * ventas lo que el usuario puede accionar: el snapshot de cada línea y la
   * elegibilidad de la cuenta destino del CONTADO.
   *
   * @throws VentaNoEncontradaError (404) inexistente o ajena (REQ-VTA-08).
   * @throws VentaAnuladaNoEditableError (409) la anulación es terminal (§4.7).
   * @throws VentaNoEsBorradorError (409) ya contabilizada o bloqueada.
   * @throws VentaPeriodoNoAbiertoError (409) period lock sin bypass (REQ-VTA-09).
   * @throws VentaCuentaSnapshotInactivaError (422) snapshot inactivo o no-detalle, nombrando la cuenta.
   * @throws VentaCuentaDestinoNoElegibleError (422) el destino del CONTADO dejó de ser elegible.
   */
  async contabilizar(
    tenantId: string,
    ventaId: string,
    userId: string,
  ): Promise<VentaContabilizada> {
    return this.auditedTx.run({ userId }, async (tx) => {
      const { venta, comprobante } = await this.obtenerVentaConComprobante(tenantId, ventaId, tx);
      if (comprobante.anulado) throw new VentaAnuladaNoEditableError(ventaId);
      if (comprobante.estado !== 'BORRADOR') {
        throw new VentaNoEsBorradorError(ventaId, comprobante.estado);
      }

      await this.exigirPeriodoAbierto(tenantId, FechaContable.fromDbDate(venta.fechaContable), tx);
      await this.exigirSnapshotsVigentes(
        tenantId,
        venta.lineas.map((l) => l.cuentaIngresoId),
        tx,
      );
      await this.exigirDestinoElegible(tenantId, venta, tx);

      const { numero } = await this.comprobanteWriter.contabilizarSistema(
        comprobante.id,
        tenantId,
        tx,
      );
      return { comprobanteId: comprobante.id, numero };
    });
  }

  /**
   * Edición full-state (D-17): reemplaza la venta en bloque y regenera las
   * líneas del comprobante preservando cabecera, `id` y `numero` (§4.3/§4.9).
   * Aplica a BORRADOR y a CONTABILIZADO en período abierto. Mover la
   * `fechaContable` a otro mes CONSERVA el número original con su `YYMM` —
   * conducta que §4.3 acepta; no se "arregla".
   *
   * Matriz del monto (REQ-VTA-06; el saldo pendiente es DERIVADO):
   * subir o bajar sin perforar lo cobrado no toca nada; bajar POR DEBAJO de lo
   * cobrado dispara el recorte LIFO (D-21) — el excedente queda como saldo no
   * aplicado del cobro recortado.
   *
   * Cambiar el contacto (D-20) desvincula TODAS las aplicaciones de la venta
   * (matriz fila 6): sin eso queda un cobro del cliente A aplicado a una venta
   * del cliente B. Cada aplicación eliminada deja rastro en
   * `AplicacionCobroDesvinculada` (B-14).
   *
   * @throws VentaNoEncontradaError (404) inexistente o ajena.
   * @throws VentaAnuladaNoEditableError (409) la anulación es terminal (§4.7).
   * @throws VentaPeriodoNoAbiertoError (409) período de ORIGEN o DESTINO no abierto (REQ-VTA-09).
   * @throws VentaCuentaSnapshotInactivaError (422) un snapshot apunta a cuenta inactiva/no-detalle.
   */
  async editar(
    tenantId: string,
    ventaId: string,
    userId: string,
    input: EditarVentaInput,
  ): Promise<VentaCreada> {
    const fechaNueva = FechaContable.fromIso(input.fechaContable);

    return this.auditedTx.run({ userId }, async (tx) => {
      const { venta, comprobante } = await this.obtenerVentaConComprobante(tenantId, ventaId, tx);
      if (comprobante.anulado) throw new VentaAnuladaNoEditableError(ventaId);

      // REQ-VTA-09/§4.4: el período de ORIGEN tiene que estar abierto (el
      // asiento ya integró ese mes) y el de DESTINO también si la fecha se
      // mueve. Defense in depth con el mismo chequeo del writer.
      const fechaOrigen = FechaContable.fromDbDate(venta.fechaContable);
      await this.exigirPeriodoAbierto(tenantId, fechaOrigen, tx);
      if (fechaNueva.toIso() !== fechaOrigen.toIso()) {
        await this.exigirPeriodoAbierto(tenantId, fechaNueva, tx);
      }

      const fechaVencimiento = this.validarVencimiento(input);
      await this.validarContacto(tenantId, input.contactoId, tx);
      await this.validarItems(tenantId, input.lineas, tx);

      const configComercial = await this.config.obtenerConfig(tenantId, tx);
      // D-28: los ítems que YA estaban conservan su snapshot de cuenta.
      const snapshotsPrevios = new Map(venta.lineas.map((l) => [l.itemId, l.cuentaIngresoId]));
      const lineas = await this.resolverLineas(
        tenantId,
        input.lineas,
        configComercial.ventasId,
        snapshotsPrevios,
        tx,
      );
      const montoTotal = lineas.reduce((acc, l) => acc.plus(l.subtotal), Money.ZERO);

      const cuentaDelDebeId = await this.resolverCuentaDelDebe(
        tenantId,
        input,
        configComercial.cuentasPorCobrarId,
        tx,
      );
      await this.exigirSnapshotsVigentes(
        tenantId,
        lineas.map((l) => l.cuentaIngresoId),
        tx,
      );

      await this.ajustarAplicaciones(tenantId, venta, input.contactoId, montoTotal, userId, tx);

      const ventaActualizada = await this.repo.reemplazar(
        tenantId,
        ventaId,
        {
          contactoId: input.contactoId,
          fechaContable: fechaNueva.toDbDate(),
          condicionPago: input.condicionPago,
          fechaVencimiento,
          glosa: input.glosa,
          cuentaDestinoId: input.condicionPago === 'CONTADO' ? cuentaDelDebeId : null,
          montoTotal: montoTotal.toPrismaDecimal(),
          lineas: lineas.map(toLineaVentaData),
        },
        tx,
      );

      const razonSocial = await this.snapshots.obtenerRazonSocialContacto(
        tenantId,
        input.contactoId,
        tx,
      );
      if (razonSocial === null) throw new VentaContactoNoEncontradoError(input.contactoId);

      const lineasAsiento = construirAsientoVenta(
        input.condicionPago === 'CONTADO'
          ? {
              condicionPago: 'CONTADO',
              contactoId: input.contactoId,
              montoTotal,
              lineas: lineas.map(toLineaParaAsiento),
              cuentaDestinoId: cuentaDelDebeId,
            }
          : {
              condicionPago: 'CREDITO',
              contactoId: input.contactoId,
              montoTotal,
              lineas: lineas.map(toLineaParaAsiento),
              cuentasPorCobrarId: cuentaDelDebeId,
            },
      );

      await this.comprobanteWriter.regenerarLineasSistema(
        {
          tenantId,
          comprobanteId: comprobante.id,
          fechaContable: fechaNueva.toDbDate(),
          glosa: componerGlosaComprobanteVenta({
            condicionPago: input.condicionPago,
            razonSocialContacto: razonSocial,
            glosaVenta: input.glosa,
          }),
          monedaPrincipal: Moneda.BOB,
          lineas: lineasAsiento,
        },
        tx,
      );

      return { venta: ventaActualizada, comprobanteId: comprobante.id };
    });
  }

  /**
   * REQ-VTA-07: anulación §4.7 por flag, disparada DESDE ventas — el `anular`
   * de usuario rechaza los orígenes comerciales (Anti-14) justamente para que
   * esta orquestación no se saltee. El comprobante se preserva para siempre
   * con su número; la venta sale del estado de cuenta por derivación.
   *
   * El writer valida motivo (≥ 10 caracteres significativos) y estado ANTES de
   * que se toque ninguna aplicación; recién después se eliminan TODAS las
   * `AplicacionCobro` de la venta (borrado físico, D-12) registrando cada una
   * en `AplicacionCobroDesvinculada` (B-14) — los cobros quedan con saldo no
   * aplicado a favor del cliente por derivación pura.
   *
   * @throws VentaNoEncontradaError (404) inexistente o ajena.
   * @throws VentaAnuladaNoEditableError (409) ya anulada — la anulación es terminal.
   * @throws VentaPeriodoNoAbiertoError (409) period lock sin bypass (REQ-VTA-09).
   */
  async anular(tenantId: string, ventaId: string, userId: string, motivo: string): Promise<void> {
    await this.auditedTx.run({ userId }, async (tx) => {
      const { venta, comprobante } = await this.obtenerVentaConComprobante(tenantId, ventaId, tx);
      if (comprobante.anulado) throw new VentaAnuladaNoEditableError(ventaId);

      await this.exigirPeriodoAbierto(tenantId, FechaContable.fromDbDate(venta.fechaContable), tx);

      await this.comprobanteWriter.anularSistema(
        { tenantId, comprobanteId: comprobante.id, motivo, anuladoPorUserId: userId },
        tx,
      );

      const aplicaciones = await this.repo.listarAplicaciones(tenantId, ventaId, tx);
      await this.desvincularAplicaciones(
        tenantId,
        ventaId,
        aplicaciones,
        `Anulación de la venta: ${motivo.trim()}`,
        userId,
        tx,
      );
    });
  }

  // ============================================================
  // Period lock — pieza reutilizable (task 4.8)
  // ============================================================

  /**
   * REQ-VTA-09 / §4.4 — period lock SIN bypass de admin: crear, contabilizar,
   * editar y anular una venta cuya `fechaContable` cae en un período que no
   * está ABIERTO se rechazan; el único camino es la reapertura formal
   * (`PeriodoFiscalReopening`). Contabilizar/editar/anular (tasks 4.5–4.7)
   * DEBEN llamar este guard antes de escribir.
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
    if (periodo === null) throw new VentaGestionNoAbiertaError(fecha.toIso());
    if (periodo.status !== PeriodoFiscalStatus.ABIERTO) {
      throw new VentaPeriodoNoAbiertoError(periodo.id, periodo.status);
    }
  }

  // ============================================================
  // Privados de contabilizar / editar / anular
  // ============================================================

  /**
   * La venta con el comprobante que le da su estado (REQ-VTA-01: la venta no
   * espeja estado). Una venta sin comprobante es un dato roto — se responde el
   * mismo 404 que "no existe" (§4.2: no se revela nada más).
   */
  private async obtenerVentaConComprobante(
    tenantId: string,
    ventaId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ venta: VentaConLineas; comprobante: ComprobanteDeVenta }> {
    const venta = await this.repo.findById(tenantId, ventaId, tx);
    if (venta === null) throw new VentaNoEncontradaError(ventaId);

    const comprobante = (await this.repo.obtenerComprobantesDeVentas(tenantId, [ventaId], tx)).get(
      ventaId,
    );
    if (comprobante === undefined) throw new VentaNoEncontradaError(ventaId);

    return { venta, comprobante };
  }

  /**
   * REQ-VTA-05: el snapshot `cuentaIngresoId` es configuración almacenada y la
   * cuenta pudo desactivarse después. Cuenta inactiva o no-detalle → 422
   * nombrando la cuenta, jamás un bypass (§4.1).
   */
  private async exigirSnapshotsVigentes(
    tenantId: string,
    cuentaIngresoIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const ids = [...new Set(cuentaIngresoIds)];
    const cuentasMap = await this.cuentas.obtenerBatch(tenantId, ids, tx);

    ids.forEach((cuentaId) => {
      const cuenta = cuentasMap.get(cuentaId);
      if (cuenta === undefined) throw new VentaCuentaSnapshotInactivaError(cuentaId, null);
      if (!cuenta.activa || !cuenta.esDetalle) {
        throw new VentaCuentaSnapshotInactivaError(cuentaId, {
          codigoInterno: cuenta.codigoInterno,
          nombre: cuenta.nombre,
        });
      }
    });
  }

  /**
   * Escenarios (−) de REQ-VTA-04 al contabilizar: la cuenta destino del
   * CONTADO también es configuración almacenada — se re-valida contra el
   * criterio de REQ-CXC-02 (que ya excluye inactivas y no-detalle).
   */
  private async exigirDestinoElegible(
    tenantId: string,
    venta: VentaConLineas,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (venta.condicionPago !== 'CONTADO') return;
    if (venta.cuentaDestinoId === null) throw new VentaCuentaDestinoNoElegibleError(null);

    const elegible = await this.cuentasEfectivo.esElegibleComoDestino(
      tenantId,
      venta.cuentaDestinoId,
      tx,
    );
    if (!elegible) throw new VentaCuentaDestinoNoElegibleError(venta.cuentaDestinoId);
  }

  /**
   * Matriz de REQ-VTA-06 sobre las aplicaciones de la venta editada:
   * cambio de contacto → desvincular TODAS (fila 6); baja del monto por
   * debajo de lo cobrado → recorte LIFO (D-21). El caso "sube o baja sin
   * perforar lo cobrado" no toca nada — el saldo pendiente es derivado.
   */
  private async ajustarAplicaciones(
    tenantId: string,
    venta: VentaConLineas,
    contactoNuevoId: string,
    montoTotalNuevo: Money,
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const aplicaciones = await this.repo.listarAplicaciones(tenantId, venta.id, tx);
    if (aplicaciones.length === 0) return;

    if (contactoNuevoId !== venta.contactoId) {
      await this.desvincularAplicaciones(
        tenantId,
        venta.id,
        aplicaciones,
        MOTIVO_DESVINCULO_CAMBIO_CLIENTE,
        userId,
        tx,
      );
      return;
    }

    const plan = recortarAplicacionesLifo(
      aplicaciones.map((a) => ({
        id: a.id,
        cobroId: a.cobroId,
        montoAplicado: Money.of(a.montoAplicado),
      })),
      montoTotalNuevo,
    );

    for (const parcial of plan.parciales) {
      await this.repo.actualizarMontoAplicacion(
        tenantId,
        parcial.aplicacion.id,
        parcial.montoNuevo.toPrismaDecimal(),
        tx,
      );
    }

    if (plan.eliminadas.length > 0) {
      await this.repo.eliminarAplicaciones(
        tenantId,
        plan.eliminadas.map((e) => e.id),
        tx,
      );
      await this.repo.registrarAplicacionesDesvinculadas(
        tenantId,
        plan.eliminadas.map((e) => ({
          cobroId: e.cobroId,
          ventaId: venta.id,
          montoAplicado: e.montoAplicado.toPrismaDecimal(),
          motivo: MOTIVO_DESVINCULO_RECORTE,
          userId,
        })),
        tx,
      );
    }
  }

  /**
   * Borrado físico (D-12) + rastro append-only (B-14), SIEMPRE juntos y en la
   * misma TX: borrar sin rastro pierde el acto, rastrear sin borrar duplica
   * plata.
   */
  private async desvincularAplicaciones(
    tenantId: string,
    ventaId: string,
    aplicaciones: AplicacionDeVenta[],
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
        cobroId: a.cobroId,
        ventaId,
        montoAplicado: a.montoAplicado,
        motivo,
        userId,
      })),
      tx,
    );
  }

  // ============================================================
  // Privados del alta
  // ============================================================

  /** REQ-VTA-02: CREDITO exige `fechaVencimiento`; CONTADO la prohíbe. */
  private validarVencimiento(input: CrearVentaInput): Date | null {
    if (input.condicionPago === 'CREDITO') {
      if (input.fechaVencimiento === undefined) {
        throw new VentaVencimientoRequeridoError('CREDITO');
      }
      return FechaContable.fromIso(input.fechaVencimiento).toDbDate();
    }
    if (input.fechaVencimiento !== undefined) {
      throw new VentaVencimientoRequeridoError('CONTADO');
    }
    return null;
  }

  /** REQ-VTA-08: el cruce se valida contra el MISMO tenant — ajeno → 404. */
  private async validarContacto(
    tenantId: string,
    contactoId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const contacto = (await this.contactos.obtenerBatch(tenantId, [contactoId], tx)).get(
      contactoId,
    );
    if (contacto === undefined) throw new VentaContactoNoEncontradoError(contactoId);
    if (!contacto.activo) throw new VentaContactoInactivoError(contactoId);
  }

  /** REQ-VTA-08: los ids que el batch acotado al tenant no devuelve, no existen. */
  private async validarItems(
    tenantId: string,
    lineas: CrearLineaVentaInput[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const itemIds = [...new Set(lineas.map((l) => l.itemId))];
    const itemsMap = await this.items.obtenerBatch(tenantId, itemIds, tx);

    itemIds.forEach((itemId) => {
      const item = itemsMap.get(itemId);
      if (item === undefined) throw new VentaItemNoEncontradoError(itemId);
      if (!item.activo) throw new VentaItemInactivoError(itemId);
    });
  }

  /**
   * REQ-VTA-02: `cuentaIngresoId` se resuelve al CREAR — la del ítem, o el
   * concepto `ventasId` si el ítem no la tiene. Subtotal calculado por el
   * backend (REQ-VTA-03): el del payload se ignora.
   *
   * `snapshotsPrevios` (itemId → cuenta ya congelada) es la mitad "editar" de
   * D-28: una línea cuyo ítem YA estaba en la venta conserva su snapshot —
   * re-resolver el catálogo vigente haría que un cambio de configuración que
   * nada tuvo que ver con la edición altere el asiento (comentario-contrato de
   * `LineaVenta` en el schema). Solo los ítems NUEVOS resuelven del catálogo:
   * su línea se está creando recién ahora. En el alta el mapa va vacío.
   */
  private async resolverLineas(
    tenantId: string,
    lineas: CrearLineaVentaInput[],
    ventasId: string | null,
    snapshotsPrevios: ReadonlyMap<string, string>,
    tx: Prisma.TransactionClient,
  ): Promise<LineaResuelta[]> {
    const itemIdsNuevos = [...new Set(lineas.map((l) => l.itemId))].filter(
      (itemId) => !snapshotsPrevios.has(itemId),
    );
    const cuentasPorItem = await this.snapshots.obtenerCuentasIngresoDeItems(
      tenantId,
      itemIdsNuevos,
      tx,
    );

    return lineas.map((linea) => {
      const snapshotPrevio = snapshotsPrevios.get(linea.itemId) ?? null;
      const cuentaDelItem = cuentasPorItem.get(linea.itemId) ?? null;
      const cuentaIngresoId = snapshotPrevio ?? cuentaDelItem ?? ventasId;
      if (cuentaIngresoId === null) {
        throw new VentaConceptoNoConfiguradoError('ventasId');
      }

      return {
        itemId: linea.itemId,
        descripcion: linea.descripcion,
        cantidad: linea.cantidad,
        precioUnitario: linea.precioUnitario,
        cuentaIngresoId,
        subtotal: calcularSubtotal(linea),
      };
    });
  }

  /**
   * La cuenta del DEBE según la condición de pago (REQ-VTA-04):
   * CONTADO → la cuenta destino ELEGIDA, validada como efectivo/equivalente
   * (PA-1, criterio de REQ-CXC-02 vía `CuentasEfectivoReaderPort`);
   * CREDITO → el concepto `cuentasPorCobrarId` (B-12 si no está mapeado).
   */
  private async resolverCuentaDelDebe(
    tenantId: string,
    input: CrearVentaInput,
    cuentasPorCobrarId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    if (input.condicionPago === 'CONTADO') {
      if (input.cuentaDestinoId === undefined) {
        throw new VentaCuentaDestinoNoElegibleError(null);
      }
      const elegible = await this.cuentasEfectivo.esElegibleComoDestino(
        tenantId,
        input.cuentaDestinoId,
        tx,
      );
      if (!elegible) throw new VentaCuentaDestinoNoElegibleError(input.cuentaDestinoId);
      return input.cuentaDestinoId;
    }

    if (cuentasPorCobrarId === null) {
      throw new VentaConceptoNoConfiguradoError('cuentasPorCobrarId');
    }
    return cuentasPorCobrarId;
  }
}

function toLineaVentaData(linea: LineaResuelta): LineaVentaData {
  return {
    itemId: linea.itemId,
    descripcion: linea.descripcion,
    cantidad: new Prisma.Decimal(linea.cantidad),
    precioUnitario: new Prisma.Decimal(linea.precioUnitario),
    cuentaIngresoId: linea.cuentaIngresoId,
    subtotal: linea.subtotal.toPrismaDecimal(),
  };
}

function toLineaParaAsiento(linea: LineaResuelta): LineaVentaParaAsiento {
  return {
    cuentaIngresoId: linea.cuentaIngresoId,
    subtotal: linea.subtotal,
    descripcion: linea.descripcion,
  };
}
