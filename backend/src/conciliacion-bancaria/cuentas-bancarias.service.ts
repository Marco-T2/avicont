import { Inject, Injectable } from '@nestjs/common';
import type { CuentaBancaria, Moneda, PerfilExtracto } from '@prisma/client';

import { CuentasReaderPort, CUENTAS_READER_PORT } from '@/cuentas/ports/cuentas-reader.port';

import {
  CuentaBancariaMonedaIncompatibleError,
  CuentaBancariaNoEncontradaError,
  CuentaBancariaNumeroDuplicadoError,
  CuentaBancariaYaVinculadaError,
  CuentaPlanInvalidaError,
  CuentaPlanNoEncontradaError,
} from './domain/cuenta-bancaria-errors';
import {
  CUENTA_BANCARIA_REPOSITORY_PORT,
  CuentaBancariaRepositoryPort,
  ListarCuentasBancariasFiltros,
  ListarCuentasBancariasPagination,
} from './ports/cuenta-bancaria.repository.port';

// ============================================================
// Inputs del service
// ============================================================

export interface CrearCuentaBancariaInput {
  cuentaId: string;
  alias: string;
  perfilExtracto: PerfilExtracto;
  numeroCuenta: string | null;
  moneda: Moneda;
}

export interface ActualizarCuentaBancariaInput {
  alias?: string;
  numeroCuenta?: string | null;
  moneda?: Moneda;
  activa?: boolean;
}

// ============================================================
// Service
// ============================================================

@Injectable()
export class CuentasBancariasService {
  constructor(
    @Inject(CUENTA_BANCARIA_REPOSITORY_PORT)
    private readonly repo: CuentaBancariaRepositoryPort,
    @Inject(CUENTAS_READER_PORT)
    private readonly cuentasReader: CuentasReaderPort,
  ) {}

  /**
   * Crea una cuenta bancaria vinculada a una cuenta del plan (REQ-CB-01),
   * validando: la cuenta existe y es de detalle activa; no está ya vinculada
   * a otra cuenta bancaria; la moneda es compatible con la cuenta (REQ-CB-02);
   * y, si viene `numeroCuenta`, que no colisione con otra cuenta del mismo
   * perfil (CRITICAL-5, defense in depth de `@@unique`).
   */
  async create(tenantId: string, input: CrearCuentaBancariaInput): Promise<CuentaBancaria> {
    const cuenta = await this.obtenerCuentaDelPlanValidada(tenantId, input.cuentaId);

    const yaVinculada = await this.repo.findByCuentaId(tenantId, input.cuentaId);
    if (yaVinculada) {
      throw new CuentaBancariaYaVinculadaError(input.cuentaId);
    }

    this.validarMonedaCompatible(cuenta, input.moneda);

    if (input.numeroCuenta !== null) {
      await this.validarNumeroCuentaNoDuplicado(tenantId, input.perfilExtracto, input.numeroCuenta);
    }

    return this.repo.create(tenantId, {
      cuentaId: input.cuentaId,
      alias: input.alias,
      perfilExtracto: input.perfilExtracto,
      numeroCuenta: input.numeroCuenta,
      moneda: input.moneda,
    });
  }

  /**
   * Devuelve la cuenta bancaria por id. Lanza `CuentaBancariaNoEncontradaError`
   * si no existe o pertenece a otro tenant (REQ-CB-13, multi-tenancy defense in depth).
   */
  async findById(tenantId: string, id: string): Promise<CuentaBancaria> {
    const cuentaBancaria = await this.repo.findById(tenantId, id);
    if (!cuentaBancaria) throw new CuentaBancariaNoEncontradaError(id);
    return cuentaBancaria;
  }

  /** Lista las cuentas bancarias del tenant con paginación y filtro opcional de `activa`. */
  async listar(
    tenantId: string,
    filtros: ListarCuentasBancariasFiltros,
    pagination: ListarCuentasBancariasPagination,
  ): Promise<{ items: CuentaBancaria[]; total: number }> {
    return this.repo.listar(tenantId, filtros, pagination);
  }

  /**
   * PATCH sobre una cuenta bancaria existente. `cuentaId` y `perfilExtracto`
   * son inmutables post-create (ver `CuentaBancariaUpdateData`). Si viene
   * `moneda`, re-valida REQ-CB-02 contra la cuenta del plan ya vinculada. Si
   * viene `numeroCuenta` no-null, re-valida la unicidad (perfil, número)
   * excluyendo la propia fila.
   */
  async update(
    tenantId: string,
    id: string,
    input: ActualizarCuentaBancariaInput,
  ): Promise<CuentaBancaria> {
    const existente = await this.repo.findById(tenantId, id);
    if (!existente) throw new CuentaBancariaNoEncontradaError(id);

    if (input.moneda !== undefined) {
      const cuenta = await this.obtenerCuentaDelPlanValidada(tenantId, existente.cuentaId);
      this.validarMonedaCompatible(cuenta, input.moneda);
    }

    if (input.numeroCuenta !== undefined && input.numeroCuenta !== null) {
      await this.validarNumeroCuentaNoDuplicado(
        tenantId,
        existente.perfilExtracto,
        input.numeroCuenta,
        id,
      );
    }

    // exactOptionalPropertyTypes: spread condicional (CLAUDE.md §2.5.1).
    return this.repo.update(tenantId, id, {
      ...(input.alias !== undefined ? { alias: input.alias } : {}),
      ...(input.numeroCuenta !== undefined ? { numeroCuenta: input.numeroCuenta } : {}),
      ...(input.moneda !== undefined ? { moneda: input.moneda } : {}),
      ...(input.activa !== undefined ? { activa: input.activa } : {}),
    });
  }

  /**
   * Elimina físicamente una cuenta bancaria. El adapter mapea el FK Restrict
   * de `movimientos_bancarios`/`importaciones_extracto` (si existieran) a
   * `CuentaBancariaConMovimientosError` (defense in depth, CLAUDE.md §4.8).
   */
  async eliminar(tenantId: string, id: string): Promise<void> {
    const existente = await this.repo.findById(tenantId, id);
    if (!existente) throw new CuentaBancariaNoEncontradaError(id);

    await this.repo.eliminar(tenantId, id);
  }

  // ============================================================
  // Helpers privados
  // ============================================================

  private async obtenerCuentaDelPlanValidada(tenantId: string, cuentaId: string) {
    const batch = await this.cuentasReader.obtenerBatch(tenantId, [cuentaId]);
    const cuenta = batch.get(cuentaId);
    if (!cuenta) throw new CuentaPlanNoEncontradaError(cuentaId);

    // REQ-CB-01: la Cuenta elegida por el usuario DEBE ser esDetalle=true AND activa=true.
    if (!cuenta.esDetalle) throw new CuentaPlanInvalidaError(cuentaId, 'NO_ES_DETALLE');
    if (!cuenta.activa) throw new CuentaPlanInvalidaError(cuentaId, 'INACTIVA');

    return cuenta;
  }

  private validarMonedaCompatible(
    cuenta: { permiteMultiMoneda: boolean; monedaFuncional: Moneda },
    monedaSolicitada: Moneda,
  ): void {
    // REQ-CB-02: un extracto tiene una única moneda por definición. Si la
    // cuenta del plan restringe la moneda, CuentaBancaria.moneda DEBE coincidir.
    if (!cuenta.permiteMultiMoneda && monedaSolicitada !== cuenta.monedaFuncional) {
      throw new CuentaBancariaMonedaIncompatibleError(monedaSolicitada, cuenta.monedaFuncional);
    }
  }

  private async validarNumeroCuentaNoDuplicado(
    tenantId: string,
    perfilExtracto: PerfilExtracto,
    numeroCuenta: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicada = await this.repo.findByPerfilYNumero(
      tenantId,
      perfilExtracto,
      numeroCuenta,
      excludeId,
    );
    if (duplicada) {
      throw new CuentaBancariaNumeroDuplicadoError(perfilExtracto, numeroCuenta);
    }
  }
}
