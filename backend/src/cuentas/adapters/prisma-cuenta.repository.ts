import { Injectable } from '@nestjs/common';
import type { Cuenta as PrismaCuenta, Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import type { Cuenta } from '../domain/cuenta';
import type {
  ActualizarCuentaData,
  CrearCuentaData,
  CuentaRepositoryPort,
  ListarCuentasFiltros,
  ListarCuentasResultado,
} from '../ports/cuenta.repository.port';

import {
  toDominioClaseCuenta,
  toDominioNaturalezaCuenta,
  toDominioSubClaseCuenta,
  toPrismaClaseCuenta,
  toPrismaNaturalezaCuenta,
  toPrismaSubClaseCuenta,
} from './enum-mappers';

// Nombres de campos en OrgConfiguracionContable que pueden apuntar a una Cuenta.
// Si agregás un concepto nuevo al schema, añadilo acá.
const CONCEPTO_FIELDS = [
  'ivaCreditoId',
  'ivaDebitoId',
  'ivaCreditoImportacionesId',
  'itPorPagarId',
  'iuePorPagarId',
  'rcIvaRetenidoId',
  'difCambioGananciaId',
  'difCambioPerdidaId',
  'resultadoEjercicioId',
  'resultadosAcumuladosId',
  'cajaChicaDefaultId',
  'ajustePorInflacionId',
] as const;

function toDominio(row: PrismaCuenta): Cuenta {
  return {
    ...row,
    claseCuenta: toDominioClaseCuenta(row.claseCuenta),
    naturaleza: toDominioNaturalezaCuenta(row.naturaleza),
    subClaseCuenta:
      row.subClaseCuenta === null ? null : toDominioSubClaseCuenta(row.subClaseCuenta),
  };
}

@Injectable()
export class PrismaCuentaRepository implements CuentaRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, tenantId: string): Promise<Cuenta | null> {
    const row = await this.prisma.cuenta.findFirst({
      where: { id, organizationId: tenantId },
    });
    return row === null ? null : toDominio(row);
  }

  async findByCodigoInterno(tenantId: string, codigoInterno: string): Promise<Cuenta | null> {
    const row = await this.prisma.cuenta.findUnique({
      where: { organizationId_codigoInterno: { organizationId: tenantId, codigoInterno } },
    });
    return row === null ? null : toDominio(row);
  }

  async findParent(tenantId: string, parentId: string): Promise<Cuenta | null> {
    const row = await this.prisma.cuenta.findFirst({
      where: { id: parentId, organizationId: tenantId },
    });
    return row === null ? null : toDominio(row);
  }

  async listar(tenantId: string, filtros: ListarCuentasFiltros): Promise<ListarCuentasResultado> {
    const where: Prisma.CuentaWhereInput = {
      organizationId: tenantId,
      ...(filtros.claseCuenta !== undefined
        ? { claseCuenta: toPrismaClaseCuenta(filtros.claseCuenta) }
        : {}),
      ...(filtros.subClaseCuenta !== undefined
        ? { subClaseCuenta: toPrismaSubClaseCuenta(filtros.subClaseCuenta) }
        : {}),
      ...(filtros.activa !== undefined ? { activa: filtros.activa } : {}),
      ...(filtros.esDetalle !== undefined ? { esDetalle: filtros.esDetalle } : {}),
      ...(filtros.search !== undefined && filtros.search.length > 0
        ? {
            OR: [
              { nombre: { contains: filtros.search, mode: 'insensitive' as const } },
              { codigoInterno: { startsWith: filtros.search } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cuenta.findMany({
        where,
        orderBy: { codigoInterno: 'asc' },
        skip: filtros.skip,
        take: filtros.take,
      }),
      this.prisma.cuenta.count({ where }),
    ]);

    return { items: rows.map(toDominio), total };
  }

  async arbolCompleto(tenantId: string): Promise<Cuenta[]> {
    const rows = await this.prisma.cuenta.findMany({
      where: { organizationId: tenantId },
      orderBy: { codigoInterno: 'asc' },
    });
    return rows.map(toDominio);
  }

  async crear(data: CrearCuentaData): Promise<Cuenta> {
    const row = await this.prisma.cuenta.create({
      data: {
        ...data,
        claseCuenta: toPrismaClaseCuenta(data.claseCuenta),
        naturaleza: toPrismaNaturalezaCuenta(data.naturaleza),
        subClaseCuenta:
          data.subClaseCuenta === null ? null : toPrismaSubClaseCuenta(data.subClaseCuenta),
      },
    });
    return toDominio(row);
  }

  actualizar(id: string, tenantId: string, data: ActualizarCuentaData): Promise<Cuenta> {
    // updateMany + findUnique para asegurar el filtro tenantId y devolver el registro.
    // Se usa tx para evitar inconsistencias entre el guard de tenant y el fetch.
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.cuenta.updateMany({
        where: { id, organizationId: tenantId },
        data,
      });
      if (result.count === 0) {
        throw new Error(`Cuenta ${id} no encontrada en tenant ${tenantId}`);
      }
      const updated = await tx.cuenta.findUniqueOrThrow({ where: { id } });
      return toDominio(updated);
    });
  }

  desactivar(id: string, tenantId: string): Promise<Cuenta> {
    return this.actualizarCampo(id, tenantId, { activa: false });
  }

  reactivar(id: string, tenantId: string): Promise<Cuenta> {
    return this.actualizarCampo(id, tenantId, { activa: true });
  }

  async conceptosQueUsanCuenta(tenantId: string, cuentaId: string): Promise<string[]> {
    const config = await this.prisma.orgConfiguracionContable.findUnique({
      where: { organizationId: tenantId },
    });
    if (config === null) return [];

    const rawConfig = config as unknown as Record<string, unknown>;
    return CONCEPTO_FIELDS.filter((field) => rawConfig[field] === cuentaId);
  }

  private async actualizarCampo(
    id: string,
    tenantId: string,
    data: Prisma.CuentaUncheckedUpdateInput,
  ): Promise<Cuenta> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.cuenta.updateMany({
        where: { id, organizationId: tenantId },
        data,
      });
      if (result.count === 0) {
        throw new Error(`Cuenta ${id} no encontrada en tenant ${tenantId}`);
      }
      const updated = await tx.cuenta.findUniqueOrThrow({ where: { id } });
      return toDominio(updated);
    });
  }
}
