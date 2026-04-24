import { Inject, Injectable } from '@nestjs/common';
import {
  AccionAuditoriaComprobante,
  EstadoComprobante,
  Moneda,
  PeriodoFiscalStatus,
  Prisma,
  TipoComprobante,
} from '@prisma/client';

import { CLOCK_PORT, ClockPort } from '@/common/clock/clock.port';
import { FechaContable } from '@/common/domain/fecha-contable';
import { PrismaService } from '@/common/prisma.service';
import { CUENTAS_READER_PORT, CuentasReaderPort } from '@/cuentas/ports/cuentas-reader.port';
import {
  PERIODOS_READER_PORT,
  PeriodosReaderPort,
} from '@/periodos-fiscales/ports/periodos-reader.port';

import { CreateComprobanteDto, CreateLineaDto } from './dto/create-comprobante.dto';
import {
  ComprobanteResponseDto,
  ListarComprobantesResponseDto,
  toComprobanteResponse,
} from './dto/comprobante-response.dto';
import { LIST_DEFAULT_LIMIT, ListarComprobantesQueryDto } from './dto/listar-comprobantes.dto';
import { UpdateComprobanteDto } from './dto/update-comprobante.dto';
import {
  ComprobanteBloqueadoError,
  ComprobanteEstadoInvalidoError,
  ComprobanteNoEncontradoError,
  ComprobanteYaAnuladoError,
  ContactoRequeridoError,
  CuentaInactivaError,
  CuentaNoDetalleError,
  CuentaNoEncontradaError,
  FechaFuturaNoPermitidaError,
  GestionNoAbiertaError,
  LineaAmbiguaDebitoCreditoError,
  MonedaIncompatibleCuentaError,
  MontoBobIncoherenteError,
  MotivoAnulacionRequeridoError,
  PeriodoNoAbiertoError,
  PeriodoReversionNoAbiertoError,
  TipoCambioInvalidoError,
} from './domain/comprobante-errors';
import {
  calcularTotalesBob,
  type LineaParaValidar,
  TOLERANCIA_BOB,
  validarComprobanteParaContabilizar,
} from './domain/comprobante-validator';
import { formatearNumero } from './domain/numeracion';
import {
  COMPROBANTE_REPOSITORY_PORT,
  ComprobanteConLineas,
  ComprobanteRepositoryPort,
  LineaPersistData,
  ListarFiltros,
} from './ports/comprobante.repository.port';
import {
  SECUENCIA_COMPROBANTE_PORT,
  SecuenciaComprobantePort,
} from './ports/secuencia-comprobante.port';

interface DatosResueltos {
  tipo: TipoComprobante;
  fechaContable: Date;
  periodoFiscalId: string;
  glosa: string;
  monedaPrincipal: Moneda;
  lineas: LineaPersistData[];
}

@Injectable()
export class ComprobantesService {
  constructor(
    @Inject(COMPROBANTE_REPOSITORY_PORT)
    private readonly repo: ComprobanteRepositoryPort,
    @Inject(PERIODOS_READER_PORT)
    private readonly periodos: PeriodosReaderPort,
    @Inject(CUENTAS_READER_PORT)
    private readonly cuentas: CuentasReaderPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(SECUENCIA_COMPROBANTE_PORT)
    private readonly secuencia: SecuenciaComprobantePort,
    private readonly prisma: PrismaService,
  ) {}

  // ============================================================
  // Lectura
  // ============================================================

  async obtener(tenantId: string, id: string): Promise<ComprobanteResponseDto> {
    const c = await this.repo.findById(tenantId, id);
    if (!c) throw new ComprobanteNoEncontradoError(id);
    return toComprobanteResponse(c);
  }

  async listar(
    tenantId: string,
    query: ListarComprobantesQueryDto,
  ): Promise<ListarComprobantesResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? LIST_DEFAULT_LIMIT;

    const filtros: ListarFiltros = {
      ...(query.periodoFiscalId ? { periodoFiscalId: query.periodoFiscalId } : {}),
      ...(query.tipo ? { tipo: query.tipo } : {}),
      ...(query.estado ? { estado: query.estado } : {}),
      ...(query.fechaDesde
        ? { fechaDesde: FechaContable.fromIso(query.fechaDesde).toDbDate() }
        : {}),
      ...(query.fechaHasta
        ? { fechaHasta: FechaContable.fromIso(query.fechaHasta).toDbDate() }
        : {}),
      ...(query.q ? { q: query.q } : {}),
    };

    const { items, total } = await this.repo.listar(tenantId, filtros, { page, limit });
    return {
      items: items.map(toComprobanteResponse),
      total,
      page,
      limit,
    };
  }

  // ============================================================
  // Escritura — BORRADOR
  // ============================================================

  async crearBorrador(
    tenantId: string,
    userId: string,
    dto: CreateComprobanteDto,
  ): Promise<ComprobanteResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const resolved = await this.resolverYValidarBorrador(
        tenantId,
        {
          tipo: dto.tipo,
          fechaContable: dto.fechaContable,
          glosa: dto.glosa,
          monedaPrincipal: dto.monedaPrincipal ?? Moneda.BOB,
          lineas: dto.lineas,
        },
        tx,
      );

      const persist = await this.repo.crearBorrador(
        tenantId,
        { ...resolved, createdByUserId: userId },
        tx,
      );

      await this.repo.registrarAuditoria(
        tenantId,
        {
          comprobanteId: persist.id,
          userId,
          accion: AccionAuditoriaComprobante.CREADO,
          diff: {
            tipo: dto.tipo,
            fechaContable: dto.fechaContable,
            lineasCount: dto.lineas.length,
            monedaPrincipal: resolved.monedaPrincipal,
          },
        },
        tx,
      );

      return toComprobanteResponse(persist);
    });
  }

  async actualizarBorrador(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateComprobanteDto,
  ): Promise<ComprobanteResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.repo.findById(tenantId, id, tx);
      if (!actual) throw new ComprobanteNoEncontradoError(id);
      if (actual.estado !== EstadoComprobante.BORRADOR) {
        throw new ComprobanteEstadoInvalidoError(id, actual.estado, 'actualizarBorrador');
      }

      const fusionado = this.fusionarConActual(actual, dto);
      const resolved = await this.resolverYValidarBorrador(tenantId, fusionado, tx);

      const persist = await this.repo.reemplazarBorrador(tenantId, id, resolved, tx);

      const camposCambiados = Object.keys(dto);
      await this.repo.registrarAuditoria(
        tenantId,
        {
          comprobanteId: id,
          userId,
          accion: AccionAuditoriaComprobante.EDITADO,
          diff: {
            campos: camposCambiados,
            lineasCount: resolved.lineas.length,
            fechaContable: fusionado.fechaContable,
          },
        },
        tx,
      );

      return toComprobanteResponse(persist);
    });
  }

  async eliminarBorrador(tenantId: string, id: string): Promise<void> {
    const actual = await this.repo.findById(tenantId, id);
    if (!actual) throw new ComprobanteNoEncontradoError(id);
    if (actual.estado !== EstadoComprobante.BORRADOR) {
      throw new ComprobanteEstadoInvalidoError(id, actual.estado, 'eliminar');
    }
    const deleted = await this.repo.eliminarBorrador(tenantId, id);
    // Si otra request anuló o contabilizó entre el read y el delete, deleteMany
    // devuelve 0. Reportamos 404 para que el cliente re-lea el estado actual.
    if (deleted !== 1) throw new ComprobanteNoEncontradoError(id);
  }

  // ============================================================
  // Escritura — CONTABILIZAR (BORRADOR → CONTABILIZADO)
  // ============================================================

  /**
   * Transiciona un comprobante de BORRADOR a CONTABILIZADO asignando número
   * atómico, validando partida doble y bloqueando la operación si el período
   * se cerró, si alguna cuenta fue desactivada, o si falta contacto en una
   * cuenta que lo requiere.
   *
   * Todo ocurre en una sola TX de Prisma:
   *   1) Lock lógico: findById dentro de la TX (las validaciones posteriores
   *      asumen el estado leído; si otra TX concurrente modifica el
   *      comprobante, el update final choca con el where).
   *   2) Re-validación cross-módulo (período + cuentas) porque el estado
   *      puede haber cambiado entre crearBorrador y contabilizar.
   *   3) Invariantes estructurales completos (partida doble ±Bs 0.01,
   *      min 2 líneas, XOR, coherencia BOB, glosa, fecha no futura).
   *   4) Numeración atómica vía `SecuenciaComprobante` upsert RETURNING.
   *   5) Update de estado + número + totales cache.
   *   6) Auditoría CONTABILIZADO con { numero, totales }.
   */
  async contabilizar(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<ComprobanteResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.repo.findById(tenantId, id, tx);
      if (!actual) throw new ComprobanteNoEncontradoError(id);
      if (actual.estado !== EstadoComprobante.BORRADOR) {
        throw new ComprobanteEstadoInvalidoError(id, actual.estado, 'contabilizar');
      }

      const fechaContable = FechaContable.fromDbDate(actual.fechaContable);

      // 1) Período fiscal de la fecha sigue ABIERTO.
      const periodo = await this.periodos.obtenerPorFecha(tenantId, fechaContable, tx);
      if (!periodo) throw new GestionNoAbiertaError(fechaContable.toIso());
      if (periodo.status !== PeriodoFiscalStatus.ABIERTO) {
        throw new PeriodoNoAbiertoError(periodo.id, periodo.status);
      }

      // 2) Cuentas: activas, esDetalle, y contacto presente si requerido.
      const cuentaIds = actual.lineas.map((l) => l.cuentaId);
      const cuentasMap = await this.cuentas.obtenerBatch(tenantId, cuentaIds, tx);
      for (const linea of actual.lineas) {
        const cuenta = cuentasMap.get(linea.cuentaId);
        if (!cuenta) throw new CuentaNoEncontradaError(linea.cuentaId);
        if (!cuenta.activa) {
          throw new CuentaInactivaError(linea.orden, cuenta.id, cuenta.codigoInterno);
        }
        if (!cuenta.esDetalle) {
          throw new CuentaNoDetalleError(linea.orden, cuenta.id, cuenta.codigoInterno);
        }
        if (cuenta.requiereContacto && !linea.contactoId) {
          throw new ContactoRequeridoError(linea.orden, cuenta.id, cuenta.codigoInterno);
        }
      }

      // 3) Invariantes estructurales completos (partida doble, mínimo líneas,
      //    monto > 0, XOR, coherencia BOB, tipoCambio consistente, glosa,
      //    fecha no futura).
      const hoy = FechaContable.fromIso(this.clock.currentDateLaPaz());
      const lineasParaValidar: LineaParaValidar[] = actual.lineas.map((l) => ({
        orden: l.orden,
        moneda: l.moneda,
        debito: l.debito,
        credito: l.credito,
        tipoCambio: l.tipoCambio,
        debitoBob: l.debitoBob,
        creditoBob: l.creditoBob,
      }));
      validarComprobanteParaContabilizar({
        glosa: actual.glosa,
        fechaContable,
        hoy,
        lineas: lineasParaValidar,
      });

      // 4) Correlativo atómico en la misma TX (si esta TX falla más abajo,
      //    el correlativo se revierte y no queda "consumido").
      const correlativo = await this.secuencia.siguienteCorrelativo(
        tenantId,
        actual.tipo,
        fechaContable.year,
        fechaContable.month,
        tx,
      );
      const numero = formatearNumero(
        actual.tipo,
        fechaContable.year,
        fechaContable.month,
        correlativo,
      );

      // 5) Totales cache en BOB.
      const totales = calcularTotalesBob(lineasParaValidar);

      // 6) Update + auditoría.
      const persisted = await this.repo.contabilizar(
        tenantId,
        id,
        {
          numero,
          totalDebitoBob: totales.debito,
          totalCreditoBob: totales.credito,
        },
        tx,
      );
      await this.repo.registrarAuditoria(
        tenantId,
        {
          comprobanteId: id,
          userId,
          accion: AccionAuditoriaComprobante.CONTABILIZADO,
          diff: {
            numero,
            totales: {
              debito: totales.debito.toFixed(2),
              credito: totales.credito.toFixed(2),
            },
          },
        },
        tx,
      );

      return toComprobanteResponse(persisted);
    });
  }

  // ============================================================
  // Escritura — ANULAR (CONTABILIZADO → ANULADO + reversión AJUSTE)
  // ============================================================

  /**
   * Anula un comprobante CONTABILIZADO creando un comprobante AJUSTE de
   * reversión con las líneas invertidas (DEBE ↔ HABER, incluyendo
   * debitoBob ↔ creditoBob). Flujo (todo en una sola TX):
   *
   *   1) Valida estado = CONTABILIZADO. Rechaza BLOQUEADO (hay que reabrir
   *      el período primero), ANULADO (idempotencia) y BORRADOR.
   *   2) Obtiene el período ABIERTO de HOY (no la fecha del original — la
   *      anulación es un evento posterior). Rechaza si el período actual
   *      está cerrado.
   *   3) Asigna correlativo AJUSTE del mes de hoy vía SecuenciaComprobante
   *      (prefijo J). El correlativo se revierte si la TX falla.
   *   4) Crea el comprobante de reversión CONTABILIZADO con anulaAId al
   *      original, líneas invertidas, totales invertidos y glosa prefijada
   *      "Reversión de {numeroOriginal}: {motivo}".
   *   5) Marca el original como ANULADO con metadata (anuladoEn, usuario,
   *      motivo). La back-ref `original.reversion` queda resuelta por el
   *      @unique([anulaAId]) del schema.
   *   6) Audita ambos comprobantes (ANULADO en el original,
   *      CREADO_POR_REVERSION en la reversión).
   */
  async anular(
    tenantId: string,
    userId: string,
    id: string,
    motivo: string,
  ): Promise<{ original: ComprobanteResponseDto; reversion: ComprobanteResponseDto }> {
    const motivoTrim = (motivo ?? '').trim();
    if (motivoTrim.length < MotivoAnulacionRequeridoError.LONGITUD_MINIMA) {
      throw new MotivoAnulacionRequeridoError(motivoTrim.length);
    }

    return this.prisma.$transaction(async (tx) => {
      const original = await this.repo.findById(tenantId, id, tx);
      if (!original) throw new ComprobanteNoEncontradoError(id);

      if (original.estado === EstadoComprobante.BLOQUEADO) {
        throw new ComprobanteBloqueadoError(id);
      }
      if (original.estado === EstadoComprobante.ANULADO) {
        throw new ComprobanteYaAnuladoError(id);
      }
      if (original.estado !== EstadoComprobante.CONTABILIZADO) {
        throw new ComprobanteEstadoInvalidoError(id, original.estado, 'anular');
      }

      const hoy = FechaContable.fromIso(this.clock.currentDateLaPaz());
      const periodoReversion = await this.periodos.obtenerPorFecha(tenantId, hoy, tx);
      if (!periodoReversion || periodoReversion.status !== PeriodoFiscalStatus.ABIERTO) {
        throw new PeriodoReversionNoAbiertoError(hoy.toIso());
      }

      const correlativo = await this.secuencia.siguienteCorrelativo(
        tenantId,
        TipoComprobante.AJUSTE,
        hoy.year,
        hoy.month,
        tx,
      );
      const numeroReversion = formatearNumero(
        TipoComprobante.AJUSTE,
        hoy.year,
        hoy.month,
        correlativo,
      );

      // Líneas invertidas: lo que era DEBE pasa a HABER y viceversa. Misma
      // moneda, mismo tipoCambio, mismo contactoId, mismos montos — el único
      // swap es la columna debito/credito y la de BOB.
      const lineasInvertidas: LineaPersistData[] = original.lineas.map((l) => ({
        orden: l.orden,
        cuentaId: l.cuentaId,
        contactoId: l.contactoId,
        moneda: l.moneda,
        debito: l.credito,
        credito: l.debito,
        tipoCambio: l.tipoCambio,
        debitoBob: l.creditoBob,
        creditoBob: l.debitoBob,
        glosaLinea: l.glosaLinea,
      }));

      const reversion = await this.repo.crearReversion(
        tenantId,
        {
          tipo: TipoComprobante.AJUSTE,
          numero: numeroReversion,
          fechaContable: hoy.toDbDate(),
          periodoFiscalId: periodoReversion.id,
          glosa: `Reversión de ${original.numero ?? id}: ${motivoTrim}`,
          monedaPrincipal: original.monedaPrincipal,
          totalDebitoBob: original.totalCreditoBob,
          totalCreditoBob: original.totalDebitoBob,
          createdByUserId: userId,
          anulaAId: original.id,
          lineas: lineasInvertidas,
        },
        tx,
      );

      const originalAnulado = await this.repo.marcarAnulado(
        tenantId,
        id,
        {
          anuladoEn: this.clock.now(),
          anuladoPorUserId: userId,
          motivoAnulacion: motivoTrim,
        },
        tx,
      );

      await this.repo.registrarAuditoria(
        tenantId,
        {
          comprobanteId: id,
          userId,
          accion: AccionAuditoriaComprobante.ANULADO,
          diff: {
            motivo: motivoTrim,
            reversionId: reversion.id,
            reversionNumero: numeroReversion,
          },
        },
        tx,
      );
      await this.repo.registrarAuditoria(
        tenantId,
        {
          comprobanteId: reversion.id,
          userId,
          accion: AccionAuditoriaComprobante.CREADO_POR_REVERSION,
          diff: {
            anulaAId: original.id,
            anulaANumero: original.numero,
          },
        },
        tx,
      );

      return {
        original: toComprobanteResponse(originalAnulado),
        reversion: toComprobanteResponse(reversion),
      };
    });
  }

  // ============================================================
  // Helpers privados
  // ============================================================

  /**
   * Toma los campos del DTO (o los actuales si el DTO no los trae en un PATCH),
   * resuelve el período, valida cuentas y coherencia de líneas, y devuelve el
   * shape listo para persistir. NO valida partida doble ni mínimo de líneas:
   * eso se enforza sólo al contabilizar (CLAUDE.md §4.1 core).
   */
  private async resolverYValidarBorrador(
    tenantId: string,
    input: {
      tipo: TipoComprobante;
      fechaContable: string;
      glosa: string;
      monedaPrincipal: Moneda;
      lineas: CreateLineaDto[];
    },
    tx: Prisma.TransactionClient,
  ): Promise<DatosResueltos> {
    const fecha = FechaContable.fromIso(input.fechaContable);

    const hoy = FechaContable.fromIso(this.clock.currentDateLaPaz());
    if (fecha.isAfter(hoy)) {
      throw new FechaFuturaNoPermitidaError(fecha.toIso(), hoy.toIso());
    }

    // 1) Resolver período fiscal.
    const periodo = await this.periodos.obtenerPorFecha(tenantId, fecha, tx);
    if (!periodo) throw new GestionNoAbiertaError(fecha.toIso());
    if (periodo.status !== PeriodoFiscalStatus.ABIERTO) {
      throw new PeriodoNoAbiertoError(periodo.id, periodo.status);
    }

    // 2) Cargar batch de cuentas referenciadas.
    const cuentaIds = input.lineas.map((l) => l.cuentaId);
    const cuentas = await this.cuentas.obtenerBatch(tenantId, cuentaIds, tx);

    // 3) Validar cada línea.
    const lineas: LineaPersistData[] = input.lineas.map((linea, index) => {
      const orden = index + 1;
      const cuenta = cuentas.get(linea.cuentaId);
      if (!cuenta) throw new CuentaNoEncontradaError(linea.cuentaId);
      if (!cuenta.activa) throw new CuentaInactivaError(orden, cuenta.id, cuenta.codigoInterno);
      if (!cuenta.esDetalle) {
        throw new CuentaNoDetalleError(orden, cuenta.id, cuenta.codigoInterno);
      }
      if (!cuenta.permiteMultiMoneda && linea.moneda !== cuenta.monedaFuncional) {
        throw new MonedaIncompatibleCuentaError(orden, {
          cuentaId: cuenta.id,
          codigoInterno: cuenta.codigoInterno,
          monedaLinea: linea.moneda,
          monedaFuncional: cuenta.monedaFuncional,
        });
      }

      validarCoherenciaLineaBorrador(orden, linea);

      return {
        orden,
        cuentaId: linea.cuentaId,
        contactoId: linea.contactoId ?? null,
        moneda: linea.moneda,
        debito: linea.debito,
        credito: linea.credito,
        tipoCambio: linea.tipoCambio,
        debitoBob: linea.debitoBob,
        creditoBob: linea.creditoBob,
        glosaLinea: linea.glosaLinea ?? null,
      };
    });

    return {
      tipo: input.tipo,
      fechaContable: fecha.toDbDate(),
      periodoFiscalId: periodo.id,
      glosa: input.glosa,
      monedaPrincipal: input.monedaPrincipal,
      lineas,
    };
  }

  /**
   * Fusiona el estado actual del comprobante con el DTO parcial de PATCH,
   * dejando todo en el shape de `CreateComprobanteDto` para re-validar.
   * Si `lineas` no viene en el PATCH, se toman las actuales serializadas de
   * vuelta al shape del DTO (string en los Decimal).
   */
  private fusionarConActual(
    actual: ComprobanteConLineas,
    dto: UpdateComprobanteDto,
  ): {
    tipo: TipoComprobante;
    fechaContable: string;
    glosa: string;
    monedaPrincipal: Moneda;
    lineas: CreateLineaDto[];
  } {
    const lineasActualesComoDto: CreateLineaDto[] = actual.lineas
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map((l) => ({
        cuentaId: l.cuentaId,
        ...(l.contactoId !== null ? { contactoId: l.contactoId } : {}),
        moneda: l.moneda,
        debito: l.debito.toString(),
        credito: l.credito.toString(),
        tipoCambio: l.tipoCambio.toString(),
        debitoBob: l.debitoBob.toString(),
        creditoBob: l.creditoBob.toString(),
        ...(l.glosaLinea !== null ? { glosaLinea: l.glosaLinea } : {}),
      }));

    return {
      tipo: dto.tipo ?? actual.tipo,
      fechaContable: dto.fechaContable ?? FechaContable.fromDbDate(actual.fechaContable).toIso(),
      glosa: dto.glosa ?? actual.glosa,
      monedaPrincipal: dto.monedaPrincipal ?? actual.monedaPrincipal,
      lineas: dto.lineas ?? lineasActualesComoDto,
    };
  }
}

// ============================================================
// Validación inline de coherencia de línea en BORRADOR
// ============================================================
//
// El validador puro `validarLinea` exige XOR débito/crédito estricto (rechaza
// líneas con ambos en 0), pero en BORRADOR se tolera una línea "placeholder"
// con montos 0 mientras el usuario edita. Esta función aplica los chequeos
// que SÍ valen siempre: coherencia BOB, tipoCambio > 0 y consistencia con
// moneda, y ambigüedad débito+crédito.

function validarCoherenciaLineaBorrador(orden: number, linea: CreateLineaDto): void {
  const debito = new Prisma.Decimal(linea.debito);
  const credito = new Prisma.Decimal(linea.credito);
  const tipoCambio = new Prisma.Decimal(linea.tipoCambio);
  const debitoBob = new Prisma.Decimal(linea.debitoBob);
  const creditoBob = new Prisma.Decimal(linea.creditoBob);

  if (debito.greaterThan(0) && credito.greaterThan(0)) {
    throw new LineaAmbiguaDebitoCreditoError(orden);
  }

  if (tipoCambio.lessThanOrEqualTo(0)) {
    throw new TipoCambioInvalidoError(orden, {
      moneda: linea.moneda,
      tipoCambio: tipoCambio.toString(),
    });
  }
  if (linea.moneda === Moneda.BOB && !tipoCambio.equals(1)) {
    throw new TipoCambioInvalidoError(orden, {
      moneda: linea.moneda,
      tipoCambio: tipoCambio.toString(),
    });
  }

  // Coherencia: cada lado debe cuadrar con su moneda original × tipoCambio.
  const esperadoDebitoBob = debito.mul(tipoCambio);
  if (esperadoDebitoBob.minus(debitoBob).abs().greaterThan(TOLERANCIA_BOB)) {
    throw new MontoBobIncoherenteError(orden, {
      monto: debito.toString(),
      tipoCambio: tipoCambio.toString(),
      montoBobEsperado: esperadoDebitoBob.toFixed(2),
      montoBobRecibido: debitoBob.toFixed(2),
    });
  }
  const esperadoCreditoBob = credito.mul(tipoCambio);
  if (esperadoCreditoBob.minus(creditoBob).abs().greaterThan(TOLERANCIA_BOB)) {
    throw new MontoBobIncoherenteError(orden, {
      monto: credito.toString(),
      tipoCambio: tipoCambio.toString(),
      montoBobEsperado: esperadoCreditoBob.toFixed(2),
      montoBobRecibido: creditoBob.toFixed(2),
    });
  }
}
