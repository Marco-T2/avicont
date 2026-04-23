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
  ComprobanteEstadoInvalidoError,
  ComprobanteNoEncontradoError,
  CuentaInactivaError,
  CuentaNoDetalleError,
  CuentaNoEncontradaError,
  FechaFuturaNoPermitidaError,
  GestionNoAbiertaError,
  LineaAmbiguaDebitoCreditoError,
  MonedaIncompatibleCuentaError,
  MontoBobIncoherenteError,
  PeriodoNoAbiertoError,
  TipoCambioInvalidoError,
} from './domain/comprobante-errors';
import { TOLERANCIA_BOB } from './domain/comprobante-validator';
import {
  COMPROBANTE_REPOSITORY_PORT,
  ComprobanteConLineas,
  ComprobanteRepositoryPort,
  LineaPersistData,
  ListarFiltros,
} from './ports/comprobante.repository.port';

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
