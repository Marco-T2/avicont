/**
 * DTO de query para GET /api/libros/diario.
 *
 * Validación de FORMA (design decisión #6):
 *   - class-validator valida tipos, formato ISO de fechas y uuid.
 *   - La regla de negocio "exactamente uno de período O rango" se valida en
 *     el service (no aquí), que lanza DomainError con código estable.
 *
 * (CLAUDE.md §10.10 regla de oro: forma en DTO, negocio en service)
 */

import { Transform } from 'class-transformer';
import { IsBoolean, IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';

export class LibroDiarioQueryDto {
  /**
   * UUID del período fiscal. Si se pasa, el service lo resuelve a un rango
   * de fechas via PeriodosReaderPort.obtenerRangoFechas.
   * Exclusivo con fechaDesde+fechaHasta (validado en el service).
   */
  @IsOptional()
  @IsUUID('4')
  periodoFiscalId?: string;

  /**
   * Inicio del rango de fechas (inclusive). Formato ISO 8601 YYYY-MM-DD.
   * Exclusivo con periodoFiscalId (validado en el service).
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fechaDesde debe tener formato YYYY-MM-DD',
  })
  fechaDesde?: string;

  /**
   * Fin del rango de fechas (inclusive). Formato ISO 8601 YYYY-MM-DD.
   * Exclusivo con periodoFiscalId (validado en el service).
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fechaHasta debe tener formato YYYY-MM-DD',
  })
  fechaHasta?: string;

  /**
   * Si true, incluye comprobantes anulados (anulado=true) en el resultado.
   * Default false (REQ-LD-03).
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
