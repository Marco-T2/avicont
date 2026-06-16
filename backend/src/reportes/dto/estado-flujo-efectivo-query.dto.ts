/**
 * DTO de query para GET /api/eeff/flujo-efectivo.
 *
 * Validación de FORMA en el DTO (class-validator: formato YYYY-MM-DD, UUID v4);
 * la regla de negocio (exactamente un modo, rango coherente, período existe) vive
 * en el service con DomainError (CLAUDE.md §10.10, regla de oro).
 *
 * REQ-FE-01: dos modos mutuamente excluyentes — fechaDesde+fechaHasta O periodoFiscalId.
 * REQ-FE-12: incluirAnulados (default false).
 */

import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID, Matches } from 'class-validator';

export class EstadoFlujoEfectivoQueryDto {
  /** Inicio del rango (inclusive). Formato YYYY-MM-DD. Usar junto con `fechaHasta`. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaDesde debe tener formato YYYY-MM-DD' })
  fechaDesde?: string;

  /** Fin del rango (inclusive). Formato YYYY-MM-DD. Usar junto con `fechaDesde`. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaHasta debe tener formato YYYY-MM-DD' })
  fechaHasta?: string;

  /** UUID del período fiscal. El rango es el mes completo del período. */
  @IsOptional()
  @IsUUID('4')
  periodoFiscalId?: string;

  /**
   * Si true, incluye líneas de comprobantes anulados (anulado=true) en los saldos.
   * Default false (§4.7 CLAUDE.md).
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
