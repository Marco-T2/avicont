/**
 * DTO de query para GET /api/eeff/evolucion-patrimonio.
 *
 * Validación de FORMA en el DTO (class-validator);
 * regla de negocio (exactamente una forma, rango válido) en el service con DomainError.
 * (CLAUDE.md §10.10 regla de oro: forma en DTO, negocio en service)
 *
 * El EEPN es anual por naturaleza → la forma habitual es `gestionId`. Se aceptan
 * las 3 formas del Estado de Resultados por consistencia (fechaDesde+fechaHasta,
 * periodoFiscalId, gestionId).
 */

import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID, Matches } from 'class-validator';

export class EvolucionPatrimonioQueryDto {
  /** Inicio del rango (inclusive). Formato YYYY-MM-DD. Usar junto con fechaHasta. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaDesde debe tener formato YYYY-MM-DD' })
  fechaDesde?: string;

  /** Fin del rango (inclusive). Formato YYYY-MM-DD. Usar junto con fechaDesde. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaHasta debe tener formato YYYY-MM-DD' })
  fechaHasta?: string;

  /** UUID del período fiscal. El rango es el mes completo del período. */
  @IsOptional()
  @IsUUID('4')
  periodoFiscalId?: string;

  /** UUID de la gestión fiscal. El rango es la gestión completa (forma habitual del EEPN). */
  @IsOptional()
  @IsUUID('4')
  gestionId?: string;

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
