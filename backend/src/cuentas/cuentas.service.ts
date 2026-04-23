import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Cuenta } from '@prisma/client';

import type { CreateCuentaDto } from './dto/create-cuenta.dto';
import type { ListarCuentasQueryDto } from './dto/listar-cuentas.dto';
import type { UpdateCuentaDto } from './dto/update-cuenta.dto';
import {
  type CuentaListResponseDto,
  type CuentaResponseDto,
  type CuentaTreeNodeDto,
  toCuentaResponse,
} from './dto/cuenta-response.dto';
import { CuentaErrorCode, cuentaError } from './domain/cuenta-errors';
import {
  calcularNivelDesdeCodigo,
  validarCodigoInterno,
  validarConsistenciaClaseSubclase,
  validarContrariaNaturaleza,
  validarNivelPuct,
} from './domain/cuenta-validator';
import {
  CATALOGO_PUCT_READER_PORT,
  type CatalogoPuctReaderPort,
} from './ports/catalogo-puct-reader.port';
import { CUENTA_REPOSITORY_PORT, type CuentaRepositoryPort } from './ports/cuenta.repository.port';
import {
  MOVIMIENTOS_READER_PORT,
  type MovimientosReaderPort,
} from './ports/movimientos-reader.port';

// Campos estructurales que NO deben cambiarse si la cuenta tiene movimientos.
// Hoy el UpdateCuentaDto no los expone, pero la validación en el servicio
// queda pre-cableada (defense in depth) para cuando Fase 1.1 cablee el
// PrismaMovimientosReader real.
const CAMPOS_PROTEGIDOS_ESTRUCTURALES = [
  'codigoInterno',
  'claseCuenta',
  'subClaseCuenta',
  'esDetalle',
  'parentId',
  'naturaleza',
  'esContraria',
] as const;

const DEFAULT_PAGE_SIZE = 25;

@Injectable()
export class CuentasService {
  constructor(
    @Inject(CUENTA_REPOSITORY_PORT)
    private readonly repo: CuentaRepositoryPort,
    @Inject(CATALOGO_PUCT_READER_PORT)
    private readonly catalogoPuct: CatalogoPuctReaderPort,
    @Inject(MOVIMIENTOS_READER_PORT)
    private readonly movimientosReader: MovimientosReaderPort,
  ) {}

  // ------------------------------------------------------------
  // Create
  // ------------------------------------------------------------

  async crear(tenantId: string, dto: CreateCuentaDto): Promise<CuentaResponseDto> {
    const codigoCheck = validarCodigoInterno(dto.codigoInterno);
    if (!codigoCheck.valido) {
      throw new BadRequestException(codigoCheck.error);
    }

    const nivel = calcularNivelDesdeCodigo(dto.codigoInterno);

    const yaExiste = await this.repo.findByCodigoInterno(tenantId, dto.codigoInterno);
    if (yaExiste !== null) {
      throw new ConflictException(
        cuentaError(
          CuentaErrorCode.CODIGO_INTERNO_DUPLICADO,
          `Ya existe una cuenta con código ${dto.codigoInterno} en esta organización`,
          { codigoInterno: dto.codigoInterno },
        ),
      );
    }

    // Parent validation + consistencia nivel
    if (dto.parentId !== undefined) {
      const parent = await this.repo.findParent(tenantId, dto.parentId);
      if (parent === null || parent.organizationId !== tenantId) {
        throw new BadRequestException(
          cuentaError(
            CuentaErrorCode.PADRE_INVALIDA,
            'La cuenta padre no existe o no pertenece a esta organización',
            { parentId: dto.parentId },
          ),
        );
      }
      if (!parent.activa) {
        throw new BadRequestException(
          cuentaError(CuentaErrorCode.PADRE_INACTIVA, 'La cuenta padre está desactivada', {
            parentId: dto.parentId,
          }),
        );
      }
      if (parent.esDetalle) {
        throw new BadRequestException(
          cuentaError(
            CuentaErrorCode.PADRE_ES_DETALLE,
            'La cuenta padre es de detalle (hoja); no puede tener hijas',
            { parentId: dto.parentId },
          ),
        );
      }
      if (nivel !== parent.nivel + 1) {
        throw new BadRequestException(
          cuentaError(
            CuentaErrorCode.CODIGO_INTERNO_INVALIDO,
            `El nivel derivado del código (${nivel}) no coincide con parent.nivel + 1 (${parent.nivel + 1})`,
            { nivelDerivado: nivel, nivelEsperado: parent.nivel + 1 },
          ),
        );
      }
    } else if (nivel !== 1) {
      throw new BadRequestException(
        cuentaError(
          CuentaErrorCode.CODIGO_INTERNO_INVALIDO,
          'Una cuenta sin padre debe ser raíz (nivel 1)',
          { nivelDerivado: nivel },
        ),
      );
    }

    const subClase = dto.subClaseCuenta ?? null;
    const subClaseCheck = validarConsistenciaClaseSubclase(dto.claseCuenta, subClase, nivel);
    if (!subClaseCheck.valido) {
      throw new BadRequestException(subClaseCheck.error);
    }

    const esContraria = dto.esContraria ?? false;
    const contrariaCheck = validarContrariaNaturaleza(dto.claseCuenta, esContraria, dto.naturaleza);
    if (!contrariaCheck.valido) {
      throw new BadRequestException(contrariaCheck.error);
    }

    // PUCT snapshot
    let codigoPuct: string | null = null;
    let nombrePuctSnapshot: string | null = null;
    let versionPuctMapeado: string | null = null;
    if (dto.codigoPuct !== undefined) {
      const snapshot = await this.resolverPuctSnapshot(dto.codigoPuct);
      codigoPuct = snapshot.codigo;
      nombrePuctSnapshot = snapshot.nombre;
      versionPuctMapeado = snapshot.version;
    }

    const creada = await this.repo.crear({
      organizationId: tenantId,
      codigoInterno: dto.codigoInterno,
      codigoPuct,
      nombrePuctSnapshot,
      versionPuctMapeado,
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      claseCuenta: dto.claseCuenta,
      subClaseCuenta: subClase,
      naturaleza: dto.naturaleza,
      parentId: dto.parentId ?? null,
      nivel,
      esDetalle: dto.esDetalle,
      requiereContacto: dto.requiereContacto ?? false,
      esContraria,
      monedaFuncional: dto.monedaFuncional ?? 'BOB',
      permiteMultiMoneda: dto.permiteMultiMoneda ?? true,
      esSystemSeed: false,
      esRequeridaSistema: false,
    });

    return toCuentaResponse(creada);
  }

  // ------------------------------------------------------------
  // Update
  // ------------------------------------------------------------

  async actualizar(tenantId: string, id: string, dto: UpdateCuentaDto): Promise<CuentaResponseDto> {
    await this.findByIdOrThrow(tenantId, id);

    // Defense in depth: si por alguna vía alguien envía campos estructurales,
    // bloquear si la cuenta tiene movimientos. Hoy el DTO no los expone;
    // cuando mañana se extienda, la validación ya queda cubierta.
    const rawDto = dto as unknown as Record<string, unknown>;
    const intentaCambiarEstructural = CAMPOS_PROTEGIDOS_ESTRUCTURALES.some(
      (c) => rawDto[c] !== undefined,
    );
    if (intentaCambiarEstructural) {
      const tieneMov = await this.movimientosReader.tieneMovimientos(id, tenantId);
      if (tieneMov) {
        throw new ConflictException(
          cuentaError(
            CuentaErrorCode.CON_MOVIMIENTOS,
            'No se pueden modificar campos estructurales de una cuenta con movimientos',
            { cuentaId: id, camposBloqueados: CAMPOS_PROTEGIDOS_ESTRUCTURALES },
          ),
        );
      }
    }

    const actualizada = await this.repo.actualizar(id, tenantId, {
      ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
      ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion } : {}),
      ...(dto.requiereContacto !== undefined ? { requiereContacto: dto.requiereContacto } : {}),
      ...(dto.permiteMultiMoneda !== undefined
        ? { permiteMultiMoneda: dto.permiteMultiMoneda }
        : {}),
      ...(dto.monedaFuncional !== undefined ? { monedaFuncional: dto.monedaFuncional } : {}),
    });

    return toCuentaResponse(actualizada);
  }

  // ------------------------------------------------------------
  // Desactivar / Reactivar
  // ------------------------------------------------------------

  async desactivar(tenantId: string, id: string): Promise<CuentaResponseDto> {
    const cuenta = await this.findByIdOrThrow(tenantId, id);

    if (cuenta.esRequeridaSistema) {
      throw new ForbiddenException(
        cuentaError(
          CuentaErrorCode.REQUERIDA_SISTEMA_INMUTABLE,
          'Esta cuenta es requerida por el sistema; no puede desactivarse',
          { cuentaId: id, codigoInterno: cuenta.codigoInterno },
        ),
      );
    }

    const conceptos = await this.repo.conceptosQueUsanCuenta(tenantId, id);
    if (conceptos.length > 0) {
      throw new ConflictException(
        cuentaError(
          CuentaErrorCode.CONFIGURADA_COMO_CONCEPTO,
          'La cuenta está mapeada como concepto contable; remap antes de desactivar',
          { cuentaId: id, conceptos },
        ),
      );
    }

    const desactivada = await this.repo.desactivar(id, tenantId);
    return toCuentaResponse(desactivada);
  }

  async reactivar(tenantId: string, id: string): Promise<CuentaResponseDto> {
    const cuenta = await this.findByIdOrThrow(tenantId, id);
    if (cuenta.parentId !== null) {
      const parent = await this.repo.findParent(tenantId, cuenta.parentId);
      if (parent === null || !parent.activa) {
        throw new ConflictException(
          cuentaError(
            CuentaErrorCode.PADRE_INACTIVA,
            'No se puede reactivar: la cuenta padre está desactivada',
            { cuentaId: id, parentId: cuenta.parentId },
          ),
        );
      }
    }
    const reactivada = await this.repo.reactivar(id, tenantId);
    return toCuentaResponse(reactivada);
  }

  // ------------------------------------------------------------
  // Mapear PUCT
  // ------------------------------------------------------------

  async mapearPuct(tenantId: string, id: string, codigoPuct: string): Promise<CuentaResponseDto> {
    const cuenta = await this.findByIdOrThrow(tenantId, id);

    // Cambiar el mapeo afecta retroactivamente el LCV y reportes fiscales:
    // si la cuenta ya tiene movimientos, bloquear.
    if (cuenta.codigoPuct !== null && cuenta.codigoPuct !== codigoPuct) {
      const tieneMov = await this.movimientosReader.tieneMovimientos(id, tenantId);
      if (tieneMov) {
        throw new ConflictException(
          cuentaError(
            CuentaErrorCode.CON_MOVIMIENTOS,
            'No se puede cambiar el mapeo PUCT de una cuenta con movimientos',
            { cuentaId: id, codigoPuctActual: cuenta.codigoPuct, codigoPuctNuevo: codigoPuct },
          ),
        );
      }
    }

    const snapshot = await this.resolverPuctSnapshot(codigoPuct);
    const actualizada = await this.repo.mapearPuct(id, tenantId, {
      codigoPuct: snapshot.codigo,
      nombrePuctSnapshot: snapshot.nombre,
      versionPuctMapeado: snapshot.version,
    });
    return toCuentaResponse(actualizada);
  }

  // ------------------------------------------------------------
  // Lecturas
  // ------------------------------------------------------------

  async listar(tenantId: string, query: ListarCuentasQueryDto): Promise<CuentaListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const resultado = await this.repo.listar(tenantId, {
      ...(query.claseCuenta !== undefined ? { claseCuenta: query.claseCuenta } : {}),
      ...(query.subClaseCuenta !== undefined ? { subClaseCuenta: query.subClaseCuenta } : {}),
      ...(query.activa !== undefined ? { activa: query.activa } : {}),
      ...(query.esDetalle !== undefined ? { esDetalle: query.esDetalle } : {}),
      ...(query.search !== undefined ? { search: query.search } : {}),
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      items: resultado.items.map(toCuentaResponse),
      total: resultado.total,
      page,
      pageSize,
    };
  }

  async obtenerPorId(tenantId: string, id: string): Promise<CuentaResponseDto> {
    const cuenta = await this.findByIdOrThrow(tenantId, id);
    return toCuentaResponse(cuenta);
  }

  async arbolCompleto(tenantId: string): Promise<CuentaTreeNodeDto[]> {
    const cuentas = await this.repo.arbolCompleto(tenantId);
    return this.armarArbol(cuentas);
  }

  async conceptosQueUsanCuenta(tenantId: string, id: string): Promise<string[]> {
    await this.findByIdOrThrow(tenantId, id);
    return this.repo.conceptosQueUsanCuenta(tenantId, id);
  }

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------

  private async findByIdOrThrow(tenantId: string, id: string): Promise<Cuenta> {
    const cuenta = await this.repo.findById(id, tenantId);
    if (cuenta === null) {
      throw new NotFoundException(
        cuentaError(CuentaErrorCode.NOT_FOUND, 'Cuenta no encontrada', { cuentaId: id }),
      );
    }
    return cuenta;
  }

  private async resolverPuctSnapshot(
    codigoPuct: string,
  ): Promise<{ codigo: string; nombre: string; version: string }> {
    const entry = await this.catalogoPuct.findByCodigo(codigoPuct);
    if (entry === null) {
      throw new BadRequestException(
        cuentaError(
          CuentaErrorCode.CODIGO_PUCT_INVALIDO,
          `El código PUCT ${codigoPuct} no existe en el catálogo oficial`,
          { codigoPuct },
        ),
      );
    }
    const nivelCheck = validarNivelPuct(entry.nivel);
    if (!nivelCheck.valido) {
      throw new BadRequestException(nivelCheck.error);
    }
    return { codigo: entry.codigo, nombre: entry.nombre, version: entry.versionPuct };
  }

  private armarArbol(cuentas: Cuenta[]): CuentaTreeNodeDto[] {
    const porId = new Map<string, CuentaTreeNodeDto>();
    for (const c of cuentas) {
      porId.set(c.id, { ...toCuentaResponse(c), hijas: [] });
    }
    const raices: CuentaTreeNodeDto[] = [];
    for (const nodo of porId.values()) {
      if (nodo.parentId !== null) {
        const padre = porId.get(nodo.parentId);
        if (padre !== undefined) {
          padre.hijas.push(nodo);
          continue;
        }
      }
      raices.push(nodo);
    }
    // Ordenar jerárquicamente por codigoInterno en cada nivel para output estable.
    const ordenar = (nodos: CuentaTreeNodeDto[]): void => {
      nodos.sort((a, b) => a.codigoInterno.localeCompare(b.codigoInterno));
      for (const n of nodos) ordenar(n.hijas);
    };
    ordenar(raices);
    return raices;
  }
}
