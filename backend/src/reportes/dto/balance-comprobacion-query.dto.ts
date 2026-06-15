/**
 * DTO de query para GET /api/eeff/balance-comprobacion.
 *
 * Validación de FORMA en el DTO (class-validator: formato YYYY-MM-DD, UUID v4);
 * la regla de negocio (exactamente un modo, rango coherente, período existe) vive
 * en el service con DomainError (CLAUDE.md §10.10, regla de oro).
 *
 * REQ-BC-01: dos modos mutuamente excluyentes — desde+hasta O periodoFiscalId.
 * REQ-BC-08: incluirAnulados (default false).
 */

import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID, Matches } from 'class-validator';

export class BalanceComprobacionQueryDto {
  /**
   * Inicio del rango (inclusive). Formato YYYY-MM-DD.
   * Debe usarse junto con `hasta`. REQ-BC-01 modo rango.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe tener formato YYYY-MM-DD' })
  desde?: string;

  /**
   * Fin del rango (inclusive). Formato YYYY-MM-DD.
   * Debe usarse junto con `desde`. REQ-BC-01 modo rango.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe tener formato YYYY-MM-DD' })
  hasta?: string;

  /**
   * UUID del período fiscal. El rango es el mes completo del período.
   * REQ-BC-01 modo período.
   */
  @IsOptional()
  @IsUUID('4')
  periodoFiscalId?: string;

  /**
   * Si true, incluye líneas de comprobantes anulados (anulado=true) en los saldos.
   * Default false (§4.7 CLAUDE.md). REQ-BC-08.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  incluirAnulados?: boolean;
}
