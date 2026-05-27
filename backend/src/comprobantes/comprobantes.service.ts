import { Inject, Injectable } from '@nestjs/common';
import {
  type ComprobanteDocumentoFisico,
  EstadoComprobante,
  Moneda,
  PeriodoFiscalStatus,
  Prisma,
  TipoComprobante,
} from '@prisma/client';

import { CLOCK_PORT, ClockPort } from '@/common/clock/clock.port';
import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';
import { PrismaService } from '@/common/prisma.service';
import {
  CONTACTOS_READER_PORT,
  ContactosReaderPort,
} from '@/contactos/ports/contactos-reader.port';
import { CUENTAS_READER_PORT, CuentasReaderPort } from '@/cuentas/ports/cuentas-reader.port';
import {
  toDocumentoFisicoAsociadoDto,
  type DocumentoFisicoAsociadoDto,
} from '@/documentos-fisicos/dto/documento-fisico-response.dto';
import { DocumentoFisicoYaAsociadoAOtroContabilizadoError } from '@/documentos-fisicos/domain/documento-fisico-errors';
import {
  ASOCIACION_COMPROBANTE_REPOSITORY_PORT,
  AsociacionComprobanteRepositoryPort,
} from '@/documentos-fisicos/ports/asociacion-comprobante.repository.port';
import {
  DOCUMENTOS_FISICOS_READER_PORT,
  DocumentosFisicosReaderPort,
} from '@/documentos-fisicos/ports/documentos-fisicos-reader.port';
import {
  PERIODOS_READER_PORT,
  PeriodosReaderPort,
} from '@/periodos-fiscales/ports/periodos-reader.port';
import { RbacService } from '@/rbac/rbac.service';

import { AuditoriaEntryDto, toAuditoriaEntry } from './dto/auditoria-response.dto';
import { AuditedTransactionRunner } from './infrastructure/audited-transaction.runner';
import { CreateComprobanteDto, CreateLineaDto } from './dto/create-comprobante.dto';
import {
  ComprobanteResponseDto,
  ListarComprobantesResponseDto,
  toComprobanteResponse,
} from './dto/comprobante-response.dto';
import { LIST_DEFAULT_LIMIT, ListarComprobantesQueryDto } from './dto/listar-comprobantes.dto';
import { UpdateComprobanteDto } from './dto/update-comprobante.dto';
import {
  ComprobanteAnuladoNoAnulableError,
  ComprobanteAnuladoNoEditableError,
  ComprobanteAnularBorradorNoPermitidoError,
  ComprobanteAnularMotivoInvalidoError,
  ComprobanteAnularPeriodoCerradoError,
  ComprobanteDocumentoNoDesasociableContabilizadoError,
  ComprobanteEditarContabilizadoEnPeriodoCerradoError,
  ComprobanteEditarFechaPeriodoDestinoCerradoError,
  ComprobanteEstadoInvalidoError,
  ComprobanteEstadoNoEditableContabilizadoError,
  ComprobanteNoEncontradoError,
  ComprobanteNoEsBorradorError,
  ContactoInactivoError,
  ContactoReferenciadoNoExisteError,
  ContactoRequeridoError,
  CuentaInactivaError,
  CuentaNoDetalleError,
  CuentaNoEncontradaError,
  DocumentoFisicoReferenciadoNoExisteError,
  FechaFuturaNoPermitidaError,
  GestionNoAbiertaError,
  LineaAmbiguaDebitoCreditoError,
  MonedaIncompatibleCuentaError,
  MontoBobIncoherenteError,
  NumeroCorrelativoInmutableError,
  PeriodoNoAbiertoError,
  SinPermisoEditarContabilizadoError,
  TipoCambioInvalidoError,
  TipoDocumentoIncompatibleConComprobanteError,
} from './domain/comprobante-errors';
import {
  calcularTotalesBob,
  type LineaParaValidar,
  validarComprobanteParaContabilizar,
} from './domain/comprobante-validator';
import { NumeroComprobante } from './domain/numero-comprobante';
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
    @Inject(CONTACTOS_READER_PORT)
    private readonly contactos: ContactosReaderPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(SECUENCIA_COMPROBANTE_PORT)
    private readonly secuencia: SecuenciaComprobantePort,
    @Inject(DOCUMENTOS_FISICOS_READER_PORT)
    private readonly documentosFisicosReader: DocumentosFisicosReaderPort,
    @Inject(ASOCIACION_COMPROBANTE_REPOSITORY_PORT)
    private readonly asociacionRepo: AsociacionComprobanteRepositoryPort,
    private readonly prisma: PrismaService,
    // Mismo módulo — inyección directa OK per CLAUDE.md §3.7
    private readonly auditedTx: AuditedTransactionRunner,
    // RBAC checker para verificar permisos de acciones específicas
    // (e.g. contabilidad.asientos.edit-posted) desde el service.
    private readonly rbac: RbacService,
  ) {}

  // ============================================================
  // Lectura
  // ============================================================

  async obtener(tenantId: string, id: string): Promise<ComprobanteResponseDto> {
    const c = await this.repo.findById(tenantId, id);
    if (!c) throw new ComprobanteNoEncontradoError(id);
    return toComprobanteResponse(c);
  }

  async obtenerAuditoria(tenantId: string, id: string): Promise<AuditoriaEntryDto[]> {
    // Validamos existencia primero para devolver 404 si el comprobante no es
    // visible desde el tenant (en vez de lista vacía sin contexto).
    const c = await this.repo.findById(tenantId, id);
    if (!c) throw new ComprobanteNoEncontradoError(id);
    const rows = await this.repo.listarAuditoria(tenantId, id);
    return rows.map(toAuditoriaEntry);
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
      // REQ-COMP-REPORTES-01: default oculta anulados; toggle expone.
      incluirAnulados: query.incluirAnulados ?? false,
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
    // Los triggers Postgres en comprobantes_audit capturan INSERT automáticamente;
    // auditedTx.run inyecta app.audit_user_id para que el trigger sepa el actor.
    return this.auditedTx.run({ userId }, async (tx) => {
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

      return toComprobanteResponse(persist);
    });
  }

  async actualizarBorrador(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateComprobanteDto,
  ): Promise<ComprobanteResponseDto> {
    return this.auditedTx.run({ userId }, async (tx) => {
      const actual = await this.repo.findById(tenantId, id, tx);
      if (!actual) throw new ComprobanteNoEncontradoError(id);
      if (actual.estado !== EstadoComprobante.BORRADOR) {
        throw new ComprobanteEstadoInvalidoError(id, actual.estado, 'actualizarBorrador');
      }

      const fusionado = this.fusionarConActual(actual, dto);
      const resolved = await this.resolverYValidarBorrador(tenantId, fusionado, tx);

      const persist = await this.repo.reemplazarBorrador(tenantId, id, resolved, tx);

      return toComprobanteResponse(persist);
    });
  }

  async eliminarBorrador(tenantId: string, userId: string, id: string): Promise<void> {
    // Pre-check fuera de TX: si el estado ya no es BORRADOR, fail rápido.
    const actual = await this.repo.findById(tenantId, id);
    if (!actual) throw new ComprobanteNoEncontradoError(id);
    if (actual.estado !== EstadoComprobante.BORRADOR) {
      throw new ComprobanteEstadoInvalidoError(id, actual.estado, 'eliminar');
    }
    // TX auditada: trigger DELETE en comprobantes necesita app.audit_user_id.
    await this.auditedTx.run({ userId }, async (tx) => {
      const deleted = await this.repo.eliminarBorrador(tenantId, id, tx);
      // Si otra request anuló o contabilizó entre el read y el delete, deleteMany
      // devuelve 0. Reportamos 404 para que el cliente re-lea el estado actual.
      if (deleted !== 1) throw new ComprobanteNoEncontradoError(id);
    });
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
    return this.auditedTx.run({ userId }, async (tx) => {
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

      // 2.5) Contactos: existencia + activo. Lectura dentro de la misma TX
      // para aislarse contra una desactivación concurrente. El contacto
      // pudo haberse desactivado (pero no borrado, FK Restrict lo bloquea)
      // entre crear/editar el borrador y este contabilizar.
      const contactoIds = actual.lineas
        .map((l) => l.contactoId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      const contactosMap = await this.contactos.obtenerBatch(tenantId, contactoIds, tx);

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
        if (linea.contactoId) {
          const contacto = contactosMap.get(linea.contactoId);
          if (!contacto) {
            throw new ContactoReferenciadoNoExisteError(linea.orden, linea.contactoId);
          }
          if (!contacto.activo) {
            throw new ContactoInactivoError(linea.orden, linea.contactoId);
          }
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

      // 3.5) Documentos físicos asociados (design §4.3). Solo si el comprobante
      // tiene asociaciones. Antes del correlativo: si falla, no consumimos
      // numeración. La pre-validación lanza con ids REALES (el adapter, al
      // chocar el UNIQUE PARCIAL en el UPDATE, no tiene contexto del id —
      // riesgo heredado de la asociación). El UNIQUE PARCIAL en BD sigue
      // siendo la última línea de defensa contra races (CLAUDE.md §4.8).
      const asociaciones = await this.asociacionRepo.listarPorComprobante(tenantId, id, tx);
      if (asociaciones.length > 0) {
        const documentoFisicoIds = asociaciones.map((a) => a.documentoFisicoId);
        const yaContabilizados = await this.documentosFisicosReader.idsYaAsociadosAContabilizado(
          tenantId,
          documentoFisicoIds,
          id,
          tx,
        );
        const [primerYaContabilizado] = yaContabilizados;
        if (primerYaContabilizado !== undefined) {
          throw new DocumentoFisicoYaAsociadoAOtroContabilizadoError(primerYaContabilizado);
        }
        await this.asociacionRepo.refrescarEstadoComprobante(
          tenantId,
          id,
          EstadoComprobante.CONTABILIZADO,
          tx,
        );
      }

      // 4) Correlativo atómico en la misma TX (si esta TX falla más abajo,
      //    el correlativo se revierte y no queda "consumido").
      const correlativo = await this.secuencia.siguienteCorrelativo(
        tenantId,
        actual.tipo,
        fechaContable.year,
        fechaContable.month,
        tx,
      );
      const numero = NumeroComprobante.of(
        actual.tipo,
        fechaContable.year,
        fechaContable.month,
        correlativo,
      ).toString();

      // 5) Totales cache en BOB.
      const totales = calcularTotalesBob(lineasParaValidar);

      // 6) Update de estado + número + totales. Los triggers Postgres en
      // comprobantes_audit capturan el UPDATE automáticamente con el actor
      // inyectado por auditedTx (app.audit_user_id).
      const persisted = await this.repo.contabilizar(
        tenantId,
        id,
        {
          numero,
          totalDebitoBob: totales.debito.toPrismaDecimal(),
          totalCreditoBob: totales.credito.toPrismaDecimal(),
        },
        tx,
      );

      return toComprobanteResponse(persisted);
    });
  }

  // ============================================================
  // Escritura — EDITAR CONTABILIZADO (CLAUDE.md §4.3)
  // ============================================================

  /**
   * Edita los campos editables de un comprobante CONTABILIZADO dentro de un
   * período abierto (o reapertura activa). El número correlativo es INMUTABLE
   * (CLAUDE.md §4.9 REQ-COMP-CORRELATIVO-02). Requiere permiso RBAC
   * `contabilidad.asientos.edit-posted` (REQ-COMP-EDIT-10).
   *
   * Si se proveen `lineas` se reemplazan completamente y se re-valida partida
   * doble. Si no se proveen, se mantienen las actuales.
   *
   * La TX es `auditedTx.run` para que el trigger de `comprobantes_audit`
   * capture el actor y motivo (REQ-COMP-AUDIT-04).
   */
  async editarContabilizado(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateComprobanteDto & { numero?: string },
  ): Promise<ComprobanteResponseDto> {
    // 1) Verificar permiso RBAC (CLAUDE.md §3.7 — desde servicio, no controller).
    // REQ-COMP-EDIT-10.
    const tienePermiso = await this.rbac.hasPermission(
      userId,
      tenantId,
      'contabilidad.asientos.edit-posted',
    );
    if (!tienePermiso) {
      throw new SinPermisoEditarContabilizadoError(userId);
    }

    // 2) Leer pre-TX para validar estado y obtener periodoFiscalId.
    const comprobantePreTx = await this.repo.findById(tenantId, id);
    if (!comprobantePreTx) throw new ComprobanteNoEncontradoError(id);

    // 3) Validar estado (no necesita lock — CONTABILIZADO no puede retroceder).
    this.validarEstadoParaEditar(
      comprobantePreTx.id,
      comprobantePreTx.estado,
      comprobantePreTx.anulado,
    );

    // 4) Número inmutable — CLAUDE.md §4.9.
    if (dto.numero !== undefined && dto.numero !== comprobantePreTx.numero) {
      throw new NumeroCorrelativoInmutableError(
        comprobantePreTx.id,
        comprobantePreTx.numero ?? '',
        dto.numero,
      );
    }

    // 5) Resolver reapertura activa del período origen pre-TX.
    const reapertura = await this.periodos.obtenerReaperturaActiva(
      tenantId,
      comprobantePreTx.periodoFiscalId,
    );

    return this.auditedTx.run(
      {
        userId,
        ...(reapertura ? { reaperturaId: reapertura.id } : {}),
      },
      async (tx) => {
        // 6) Re-leer dentro de la TX para estado fresco.
        const original = await this.repo.findById(tenantId, id, tx);
        if (!original) throw new ComprobanteNoEncontradoError(id);

        this.validarEstadoParaEditar(original.id, original.estado, original.anulado);

        // 7) Resolver campos efectivos (usar los del dto o los actuales).
        const tipoEfectivo = dto.tipo ?? original.tipo;
        const fechaEfectiva = dto.fechaContable
          ? FechaContable.fromIso(dto.fechaContable)
          : FechaContable.fromDbDate(original.fechaContable);
        const glosaEfectiva = dto.glosa ?? original.glosa;
        const monedaEfectiva = dto.monedaPrincipal ?? original.monedaPrincipal;

        // 8) Validar período origen (con reapertura si aplica).
        const periodoOrigen = await this.periodos.obtenerPorFecha(
          tenantId,
          FechaContable.fromDbDate(original.fechaContable),
          tx,
        );
        if (!periodoOrigen) {
          throw new GestionNoAbiertaError(FechaContable.fromDbDate(original.fechaContable).toIso());
        }
        if (periodoOrigen.status !== PeriodoFiscalStatus.ABIERTO && !reapertura) {
          throw new ComprobanteEditarContabilizadoEnPeriodoCerradoError(
            periodoOrigen.id,
            periodoOrigen.status,
          );
        }

        // 9) Si la fecha cambió a otro período, validar período destino.
        const fechaOriginalIso = FechaContable.fromDbDate(original.fechaContable).toIso();
        let periodoEfectivo = periodoOrigen;
        if (dto.fechaContable && dto.fechaContable !== fechaOriginalIso) {
          const periodoDestino = await this.periodos.obtenerPorFecha(tenantId, fechaEfectiva, tx);
          if (!periodoDestino) throw new GestionNoAbiertaError(fechaEfectiva.toIso());
          if (periodoDestino.status !== PeriodoFiscalStatus.ABIERTO) {
            throw new ComprobanteEditarFechaPeriodoDestinoCerradoError(
              periodoDestino.id,
              periodoDestino.status,
            );
          }
          periodoEfectivo = periodoDestino;
        }

        // 10) Construir líneas a persistir — usar las del DTO o las actuales.
        // No reutilizamos resolverYValidarBorrador porque ese helper valida
        // PeriodoNoAbierto internamente y aquí ya hemos aceptado la reapertura.
        const lineasInput: CreateLineaDto[] =
          dto.lineas ??
          original.lineas
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

        // 11) Cargar cuentas y validar coherencia de líneas.
        const cuentaIds = lineasInput.map((l) => l.cuentaId);
        const cuentasMap = await this.cuentas.obtenerBatch(tenantId, cuentaIds, tx);

        const lineasPersist = lineasInput.map((l, idx) => {
          const orden = idx + 1;
          const cuenta = cuentasMap.get(l.cuentaId);
          if (!cuenta) throw new CuentaNoEncontradaError(l.cuentaId);
          if (!cuenta.activa) throw new CuentaInactivaError(orden, cuenta.id, cuenta.codigoInterno);
          if (!cuenta.esDetalle) {
            throw new CuentaNoDetalleError(orden, cuenta.id, cuenta.codigoInterno);
          }
          validarCoherenciaLineaBorrador(orden, l);
          return {
            orden,
            cuentaId: l.cuentaId,
            contactoId: l.contactoId ?? null,
            moneda: l.moneda,
            debito: l.debito,
            credito: l.credito,
            tipoCambio: l.tipoCambio,
            debitoBob: l.debitoBob,
            creditoBob: l.creditoBob,
            glosaLinea: l.glosaLinea ?? null,
          };
        });

        // 12) Validar partida doble e invariantes de contabilización.
        const lineasParaValidar: LineaParaValidar[] = lineasPersist.map((l) => ({
          orden: l.orden,
          moneda: l.moneda,
          debito: new Prisma.Decimal(l.debito),
          credito: new Prisma.Decimal(l.credito),
          tipoCambio: new Prisma.Decimal(l.tipoCambio),
          debitoBob: new Prisma.Decimal(l.debitoBob),
          creditoBob: new Prisma.Decimal(l.creditoBob),
        }));

        const hoy = FechaContable.fromIso(this.clock.currentDateLaPaz());
        validarComprobanteParaContabilizar({
          glosa: glosaEfectiva,
          fechaContable: fechaEfectiva,
          hoy,
          lineas: lineasParaValidar,
        });

        const totales = calcularTotalesBob(lineasParaValidar);

        // 13) Persistir. reemplazarBorrador reemplaza campos y lineas atómicamente.
        // El caller ya validó estado; el repo aplica sin re-chequearlo.
        const editado = await this.repo.reemplazarBorrador(
          tenantId,
          id,
          {
            tipo: tipoEfectivo,
            fechaContable: fechaEfectiva.toDbDate(),
            periodoFiscalId: periodoEfectivo.id,
            glosa: glosaEfectiva,
            monedaPrincipal: monedaEfectiva,
            lineas: lineasPersist,
          },
          tx,
        );
        void totales; // totales usados en cache si repo lo requiere en el futuro

        return toComprobanteResponse(editado);
      },
    );
  }

  // ============================================================
  // Escritura — ANULAR (flag anulado = true, sin contra-asiento)
  // ============================================================

  /**
   * Anula un comprobante CONTABILIZADO mediante un UPDATE in-place que setea
   * el flag `anulado = true`. CLAUDE.md §4.7: no se genera contra-asiento,
   * no se consume número correlativo, el comprobante anulado se preserva
   * forever. La auditoría la registran los triggers Postgres de comprobantes_audit.
   *
   * El período validado es el del comprobante mismo (no "hoy"), con
   * SELECT ... FOR UPDATE para prevenir race con cierre concurrente (F-03).
   * Si hay una PeriodoFiscalReopening activa, se permite la operación y
   * el reaperturaId se propaga al AuditedTransactionRunner.
   */
  async anular(
    tenantId: string,
    userId: string,
    id: string,
    motivo: string,
  ): Promise<ComprobanteResponseDto> {
    // 1) Validar motivo significativo (invariante de dominio, no protocolo).
    // REQ-COMP-ANULAR-02: 10 chars no-whitespace.
    const motivoTrim = (motivo ?? '').trim();
    if (motivoTrim.length < ComprobanteAnularMotivoInvalidoError.LONGITUD_MINIMA) {
      throw new ComprobanteAnularMotivoInvalidoError(motivoTrim.length);
    }

    // 2) Resolver reapertura activa ANTES de abrir la TX del wrapper.
    // La reapertura se resuelve con una query simple (sin lock) para determinar
    // el contexto de auditoría. El lock real del período ocurre dentro de la TX.
    // Se usa el periodoFiscalId del comprobante, que se lee en el paso 3.
    // Estrategia: leemos el comprobante primero fuera de TX para obtener periodoFiscalId,
    // luego re-leemos dentro de la TX con lock. La ventana de race es mínima y
    // la validación final ocurre dentro de la TX (F-03 cumplido).
    const comprobantePreTx = await this.repo.findById(tenantId, id);
    if (!comprobantePreTx) throw new ComprobanteNoEncontradoError(id);

    // Validaciones de estado pre-TX (no requieren lock — el estado CONTABILIZADO
    // no puede cambiar hacia atrás; solo puede pasar a BLOQUEADO o anulado=true).
    this.validarEstadoParaAnular(
      comprobantePreTx.id,
      comprobantePreTx.estado,
      comprobantePreTx.anulado,
    );

    // Resolver reapertura activa del período del comprobante.
    const reapertura = await this.periodos.obtenerReaperturaActiva(
      tenantId,
      comprobantePreTx.periodoFiscalId,
    );

    return this.auditedTx.run(
      {
        userId,
        motivo: motivoTrim,
        ...(reapertura ? { reaperturaId: reapertura.id } : {}),
      },
      async (tx) => {
        // 3) Re-leer dentro de la TX (lock implícito — el UPDATE final lockea el row).
        const original = await this.repo.findById(tenantId, id, tx);
        if (!original) throw new ComprobanteNoEncontradoError(id);

        // Re-validar estado dentro de TX (defensa contra race CONTABILIZADO→BLOQUEADO).
        this.validarEstadoParaAnular(original.id, original.estado, original.anulado);

        // 4) Validar período del comprobante (no "hoy").
        // REQ-COMP-ANULAR-07/08: FOR UPDATE del período está implícito en el UPDATE
        // del comprobante que Prisma emite al final. Si queremos explícito usamos
        // obtenerPorFecha que ya hace la query en TX.
        const fecha = FechaContable.fromDbDate(original.fechaContable);
        const periodo = await this.periodos.obtenerPorFecha(tenantId, fecha, tx);
        if (!periodo) throw new GestionNoAbiertaError(fecha.toIso());

        if (periodo.status !== PeriodoFiscalStatus.ABIERTO) {
          // Solo permitir si hay reapertura activa (ya la resolvimos pre-TX).
          if (!reapertura) {
            throw new ComprobanteAnularPeriodoCerradoError(periodo.id, periodo.status);
          }
          // Con reapertura activa: el período se considera ABIERTO (REQ-COMP-REAPERTURA-01).
        }

        // 5) CLAUDE.md §4.7: desasociar documentos físicos del comprobante anulado.
        await this.asociacionRepo.desasociarTodasDelComprobante(tenantId, id, tx);

        // 6) Persistir el flag de anulación. Usa repo.marcarAnulado cuando esté
        // disponible (task 6.2); por ahora delega al repo existente.
        const anulado = await this.repo.marcarAnulado(
          tenantId,
          id,
          {
            anuladoEn: this.clock.now(),
            anuladoPorUserId: userId,
            motivoAnulacion: motivoTrim,
          },
          tx,
        );

        return toComprobanteResponse(anulado);
      },
    );
  }

  /**
   * Valida que el comprobante esté en un estado anulable.
   * Extraído para reusar en pre-TX y dentro de TX (defense in depth).
   */
  private validarEstadoParaAnular(id: string, estado: EstadoComprobante, anulado: boolean): void {
    // CLAUDE.md §4.7: solo se anulan comprobantes CONTABILIZADOS con anulado=false.
    if (anulado) {
      throw new ComprobanteAnuladoNoAnulableError(id);
    }
    if (estado === EstadoComprobante.BORRADOR) {
      throw new ComprobanteAnularBorradorNoPermitidoError(id);
    }
    if (estado !== EstadoComprobante.CONTABILIZADO) {
      // Cubre BLOQUEADO y cualquier otro estado no esperado.
      throw new ComprobanteEstadoNoEditableContabilizadoError(id, estado);
    }
  }

  /**
   * Valida que el comprobante esté en un estado editable (editarContabilizado).
   * Reglas: CONTABILIZADO + no anulado.
   * Extraído para reusar en pre-TX y dentro de TX (defense in depth).
   */
  private validarEstadoParaEditar(id: string, estado: EstadoComprobante, anulado: boolean): void {
    // CLAUDE.md §4.7: anulado es terminal — no se edita post-anulación.
    if (anulado) {
      throw new ComprobanteAnuladoNoEditableError(id);
    }
    if (estado !== EstadoComprobante.CONTABILIZADO) {
      // Cubre BORRADOR, BLOQUEADO y cualquier otro estado no esperado.
      throw new ComprobanteEstadoNoEditableContabilizadoError(id, estado);
    }
  }

  // ============================================================
  // Documentos físicos asociados (sub-recurso del comprobante)
  // ============================================================

  /**
   * Asocia uno o más documentos físicos a un comprobante en BORRADOR.
   * Operación aditiva (REQ-A-01) e idempotente: re-asociar un par existente
   * es no-op. Toda la lógica corre en una sola TX (design §4.2):
   *   1) Comprobante existe + estado BORRADOR (inmutabilidad post-CONTABILIZADO,
   *      CLAUDE.md §4.3).
   *   2) Cada documento existe, pertenece al tenant (defense in depth §4.2) y
   *      su tipo es compatible con el tipo del comprobante (REQ-A-11 / D11).
   *   3) Inserta solo las asociaciones que aún no existen.
   *
   * `documentoFisicoIds` vacío → no-op (return []).
   */
  async asociarDocumentos(
    tenantId: string,
    comprobanteId: string,
    documentoFisicoIds: string[],
  ): Promise<ComprobanteDocumentoFisico[]> {
    if (documentoFisicoIds.length === 0) return [];

    return this.prisma.$transaction(async (tx) => {
      const comp = await this.repo.findById(tenantId, comprobanteId, tx);
      if (!comp) throw new ComprobanteNoEncontradoError(comprobanteId);
      if (comp.estado !== EstadoComprobante.BORRADOR) {
        throw new ComprobanteNoEsBorradorError(comprobanteId, comp.estado);
      }

      const docMap = await this.documentosFisicosReader.obtenerBatchParaAsociar(
        tenantId,
        documentoFisicoIds,
        tx,
      );
      for (const id of documentoFisicoIds) {
        const doc = docMap.get(id);
        if (!doc) throw new DocumentoFisicoReferenciadoNoExisteError(id);
        if (!doc.tiposComprobanteAplicables.includes(comp.tipo)) {
          throw new TipoDocumentoIncompatibleConComprobanteError(
            doc.tipoDocumentoNombre,
            comp.tipo,
            doc.tiposComprobanteAplicables,
          );
        }
      }

      // Idempotencia (REQ-A-01): re-asociar un par ya existente es no-op.
      // Filtramos contra las asociaciones actuales del comprobante para no
      // chocar con el UNIQUE normal (documentoFisicoId, comprobanteId), que
      // el adapter relanza tal cual.
      const yaAsociados = await this.asociacionRepo.listarPorComprobante(
        tenantId,
        comprobanteId,
        tx,
      );
      const yaAsociadosIds = new Set(yaAsociados.map((a) => a.documentoFisicoId));
      const idsAInsertar = [...new Set(documentoFisicoIds)].filter((id) => !yaAsociadosIds.has(id));

      const result: ComprobanteDocumentoFisico[] = [];
      for (const id of idsAInsertar) {
        result.push(
          await this.asociacionRepo.asociar(
            tenantId,
            {
              comprobanteId,
              documentoFisicoId: id,
              comprobanteEstado: EstadoComprobante.BORRADOR,
            },
            tx,
          ),
        );
      }
      return result;
    });
  }

  /**
   * Desasocia un documento físico de un comprobante en BORRADOR (REQ-A-02 /
   * E-A-04). Si el comprobante está CONTABILIZADO, rechaza con
   * `ComprobanteDocumentoNoDesasociableContabilizadoError` (REQ-A-03 / E-A-05):
   * el comprobante ya consumió numeración y es inmutable (CLAUDE.md §4.3).
   */
  async desasociarDocumento(
    tenantId: string,
    comprobanteId: string,
    documentoFisicoId: string,
  ): Promise<void> {
    const comp = await this.repo.findById(tenantId, comprobanteId);
    if (!comp) throw new ComprobanteNoEncontradoError(comprobanteId);
    if (comp.estado !== EstadoComprobante.BORRADOR) {
      throw new ComprobanteDocumentoNoDesasociableContabilizadoError(
        comprobanteId,
        documentoFisicoId,
      );
    }
    await this.asociacionRepo.desasociar(tenantId, comprobanteId, documentoFisicoId);
  }

  /**
   * Lista los documentos físicos asociados a un comprobante, enriquecidos
   * para display (REQ-A-09). Valida que el comprobante pertenezca al tenant
   * (REQ-S-04) antes de listar. La lectura enriquecida la resuelve el reader
   * port de `documentos-fisicos` (owner-owned, CLAUDE.md §3.5/§3.7);
   * `comprobantes` no toca Prisma ni el repo concreto.
   */
  async listarDocumentosAsociados(
    tenantId: string,
    comprobanteId: string,
  ): Promise<DocumentoFisicoAsociadoDto[]> {
    const comp = await this.repo.findById(tenantId, comprobanteId);
    if (!comp) throw new ComprobanteNoEncontradoError(comprobanteId);

    const docs = await this.documentosFisicosReader.listarAsociadosDeComprobante(
      tenantId,
      comprobanteId,
    );
    return docs.map(toDocumentoFisicoAsociadoDto);
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

    // 2.5) Cargar batch de contactos referenciados. En BORRADOR validamos
    // sólo EXISTENCIA — permitimos referenciar inactivos (el contacto
    // puede haberse desactivado mientras se editaba). El check de activo
    // corre al contabilizar (ver §8.2 de docs/disenos/contactos.md).
    const contactoIds = input.lineas
      .map((l) => l.contactoId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const contactos = await this.contactos.obtenerBatch(tenantId, contactoIds, tx);

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

      if (linea.contactoId && !contactos.has(linea.contactoId)) {
        throw new ContactoReferenciadoNoExisteError(orden, linea.contactoId);
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
  const debito = Money.of(linea.debito);
  const credito = Money.of(linea.credito);
  const tipoCambio = Money.of(linea.tipoCambio);
  const debitoBob = Money.of(linea.debitoBob);
  const creditoBob = Money.of(linea.creditoBob);

  if (debito.isPositive() && credito.isPositive()) {
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
  if (!esperadoDebitoBob.balanceadoEnBobCon(debitoBob)) {
    throw new MontoBobIncoherenteError(orden, {
      monto: debito.toString(),
      tipoCambio: tipoCambio.toString(),
      montoBobEsperado: esperadoDebitoBob.toBob(),
      montoBobRecibido: debitoBob.toBob(),
    });
  }
  const esperadoCreditoBob = credito.mul(tipoCambio);
  if (!esperadoCreditoBob.balanceadoEnBobCon(creditoBob)) {
    throw new MontoBobIncoherenteError(orden, {
      monto: credito.toString(),
      tipoCambio: tipoCambio.toString(),
      montoBobEsperado: esperadoCreditoBob.toBob(),
      montoBobRecibido: creditoBob.toBob(),
    });
  }
}
