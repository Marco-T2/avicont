import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ConfigContableErrorCode, configError } from './domain/configuracion-errors';
import {
  CONCEPTOS,
  type Concepto,
  esConceptoValido,
  reglaParaConcepto,
} from './domain/concepto-reglas';
import type { ActualizarConfiguracionDto } from './dto/actualizar-configuracion.dto';
import {
  type ConfiguracionContableResponseDto,
  configuracionVacia,
  toConfiguracionResponse,
} from './dto/configuracion-response.dto';
import {
  CONFIGURACION_CONTABLE_REPOSITORY_PORT,
  type ActualizarConfiguracionData,
  type ConfiguracionContableRepositoryPort,
} from './ports/configuracion-contable.repository.port';
import {
  CUENTA_READER_PORT,
  type CuentaParaValidacion,
  type CuentaReaderPort,
} from './ports/cuenta-reader.port';

@Injectable()
export class ConfiguracionContableService {
  constructor(
    @Inject(CONFIGURACION_CONTABLE_REPOSITORY_PORT)
    private readonly repo: ConfiguracionContableRepositoryPort,
    @Inject(CUENTA_READER_PORT)
    private readonly cuentas: CuentaReaderPort,
  ) {}

  async obtener(tenantId: string): Promise<ConfiguracionContableResponseDto> {
    const existente = await this.repo.obtener(tenantId);
    return existente === null ? configuracionVacia(tenantId) : toConfiguracionResponse(existente);
  }

  async actualizar(
    tenantId: string,
    dto: ActualizarConfiguracionDto,
  ): Promise<ConfiguracionContableResponseDto> {
    // Validar cada campo presente en el DTO contra cuenta + regla.
    // Undefined = no tocar. Null = desmapear (válido sin lookup).
    const rawDto = dto as unknown as Record<string, string | null | undefined>;
    for (const concepto of CONCEPTOS) {
      const cuentaId = rawDto[concepto];
      if (cuentaId === undefined || cuentaId === null) continue;
      await this.validarMapeo(concepto, cuentaId, tenantId);
    }

    // Validar que dif cambio ganancia !== pérdida considerando merge con lo existente.
    await this.validarDifCambio(tenantId, dto);

    const data = this.dtoToData(dto);
    const actualizada = await this.repo.upsert(tenantId, data);
    return toConfiguracionResponse(actualizada);
  }

  async desmapearConcepto(
    tenantId: string,
    concepto: string,
  ): Promise<ConfiguracionContableResponseDto> {
    if (!esConceptoValido(concepto)) {
      throw new BadRequestException(
        configError(
          ConfigContableErrorCode.CONCEPTO_INVALIDO,
          `Concepto "${concepto}" no existe. Válidos: ${CONCEPTOS.join(', ')}`,
          { concepto },
        ),
      );
    }
    const data: ActualizarConfiguracionData = { [concepto]: null };
    const actualizada = await this.repo.upsert(tenantId, data);
    return toConfiguracionResponse(actualizada);
  }

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------

  private async validarMapeo(
    concepto: Concepto,
    cuentaId: string,
    tenantId: string,
  ): Promise<void> {
    const cuenta = await this.cuentas.findForConfigValidation(cuentaId, tenantId);
    if (cuenta === null) {
      throw new NotFoundException(
        configError(
          ConfigContableErrorCode.CUENTA_NO_ENCONTRADA,
          `La cuenta ${cuentaId} no existe o no pertenece a esta organización`,
          { concepto, cuentaId },
        ),
      );
    }
    this.validarCuentaMapeable(concepto, cuenta);
  }

  private validarCuentaMapeable(concepto: Concepto, cuenta: CuentaParaValidacion): void {
    if (!cuenta.activa) {
      throw new ConflictException(
        configError(
          ConfigContableErrorCode.CUENTA_INACTIVA,
          `La cuenta ${cuenta.codigoInterno} está desactivada; reactivarla antes de mapear`,
          { concepto, cuentaId: cuenta.id, codigoInterno: cuenta.codigoInterno },
        ),
      );
    }
    if (!cuenta.esDetalle) {
      throw new BadRequestException(
        configError(
          ConfigContableErrorCode.CUENTA_NO_DETALLE,
          `La cuenta ${cuenta.codigoInterno} es agrupador; solo se mapean cuentas de detalle`,
          { concepto, cuentaId: cuenta.id, codigoInterno: cuenta.codigoInterno },
        ),
      );
    }
    const regla = reglaParaConcepto(concepto);
    if (cuenta.claseCuenta !== regla.claseEsperada) {
      throw new BadRequestException(
        configError(
          ConfigContableErrorCode.CUENTA_CLASE_INCORRECTA,
          `El concepto "${concepto}" requiere una cuenta de clase ${regla.claseEsperada}; se recibió ${cuenta.claseCuenta}`,
          {
            concepto,
            cuentaId: cuenta.id,
            codigoInterno: cuenta.codigoInterno,
            claseEsperada: regla.claseEsperada,
            claseRecibida: cuenta.claseCuenta,
          },
        ),
      );
    }
  }

  private async validarDifCambio(tenantId: string, dto: ActualizarConfiguracionDto): Promise<void> {
    const existente = await this.repo.obtener(tenantId);
    const gananciaFinal = resolverFinal(
      dto.difCambioGananciaId,
      existente?.difCambioGananciaId ?? null,
    );
    const perdidaFinal = resolverFinal(
      dto.difCambioPerdidaId,
      existente?.difCambioPerdidaId ?? null,
    );
    if (gananciaFinal !== null && perdidaFinal !== null && gananciaFinal === perdidaFinal) {
      // Norma Contable N° 6: ganancia y pérdida deben estar en cuentas distintas.
      throw new BadRequestException(
        configError(
          ConfigContableErrorCode.DIF_CAMBIO_MISMA_CUENTA,
          'difCambioGananciaId y difCambioPerdidaId no pueden apuntar a la misma cuenta (Norma Contable N° 6)',
          { cuentaId: gananciaFinal },
        ),
      );
    }
  }

  private dtoToData(dto: ActualizarConfiguracionDto): ActualizarConfiguracionData {
    const rawDto = dto as unknown as Record<string, string | null | undefined>;
    const out: ActualizarConfiguracionData = {};
    const mutable = out as unknown as Record<string, string | null>;
    for (const concepto of CONCEPTOS) {
      const value = rawDto[concepto];
      if (value !== undefined) {
        mutable[concepto] = value;
      }
    }
    return out;
  }
}

// Resuelve el valor "final" de un campo tras merge: si el DTO trae algo
// (string o null) usa eso; si viene undefined, mantiene el existente.
function resolverFinal(
  fromDto: string | null | undefined,
  fromExisting: string | null,
): string | null {
  if (fromDto === undefined) return fromExisting;
  return fromDto;
}
