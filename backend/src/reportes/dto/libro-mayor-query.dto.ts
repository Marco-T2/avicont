/**
 * DTO de query para GET /api/libros/mayor.
 *
 * Validación de FORMA (diseño decisión #6):
 *   - class-validator valida tipos, formato ISO de fechas y uuid.
 *   - La regla de negocio "exactamente uno de período O rango" se valida en
 *     el service (no aquí), que lanza DomainError con código estable.
 *
 * (CLAUDE.md §10.10 regla de oro: forma en DTO, negocio en service)
 */

import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID, Matches } from 'class-validator';

export class LibroMayorQueryDto {
  /**
   * UUID de la cuenta. Si se pasa, el Mayor muestra solo esa cuenta.
   * Exclusivo con otras cuentas (un Mayor puede filtrarse por cuenta o
   * mostrar todas).
   */
  @IsOptional()
  @IsUUID('4')
  cuentaId?: string;

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
   * Si true, incluye líneas de comprobantes anulados (anulado=true).
   * Default false (REQ-LM-03).
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  incluirAnulados?: boolean;

  /**
   * Si false, incluye cuentas con saldo inicial != 0 aunque no tengan
   * movimientos en el rango. Default true (solo cuentas con movimiento).
   * REQ-LM-08.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  soloConMovimiento?: boolean;
}
