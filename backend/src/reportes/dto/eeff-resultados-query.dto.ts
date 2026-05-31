/**
 * DTO de query para GET /api/eeff/resultados.
 *
 * Validación de FORMA en el DTO (class-validator);
 * regla de negocio (exactamente una forma, rango válido) en el service con DomainError.
 * (CLAUDE.md §10.10 regla de oro: forma en DTO, negocio en service)
 *
 * REQ-ER-01: tres formas de rango — fechaDesde+fechaHasta, periodoFiscalId, gestionId.
 */

import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID, Matches } from 'class-validator';

export class EeffResultadosQueryDto {
  /**
   * Inicio del rango de flujo (inclusive). Formato YYYY-MM-DD.
   * Debe usarse junto con fechaHasta. REQ-ER-01 forma 1.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaDesde debe tener formato YYYY-MM-DD' })
  fechaDesde?: string;

  /**
   * Fin del rango de flujo (inclusive). Formato YYYY-MM-DD.
   * Debe usarse junto con fechaDesde. REQ-ER-01 forma 1.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaHasta debe tener formato YYYY-MM-DD' })
  fechaHasta?: string;

  /**
   * UUID del período fiscal. El rango es el mes completo del período.
   * REQ-ER-01 forma 2.
   */
  @IsOptional()
  @IsUUID('4')
  periodoFiscalId?: string;

  /**
   * UUID de la gestión fiscal. El rango es la gestión completa.
   * REQ-ER-01 forma 3.
   */
  @IsOptional()
  @IsUUID('4')
  gestionId?: string;

  /**
   * Si true, incluye líneas de comprobantes anulados (anulado=true) en los saldos.
   * Default false (§4.7 CLAUDE.md).
   * REQ-ER-04.
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
