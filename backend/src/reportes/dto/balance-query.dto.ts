/**
 * DTO de query para GET /api/eeff/balance.
 *
 * Validación de FORMA en el DTO (class-validator);
 * regla de negocio (fecha → gestión) en el service con DomainError.
 * (CLAUDE.md §10.10 regla de oro: forma en DTO, negocio en service)
 */

import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class BalanceQueryDto {
  /**
   * Fecha de corte del Balance General. REQUERIDO. Formato YYYY-MM-DD.
   * Todas las cuentas se valoran con saldos ≤ esta fecha (inclusive).
   * REQ-BG-01.
   */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener formato YYYY-MM-DD' })
  fecha!: string;

  /**
   * UUID de la gestión fiscal. OPCIONAL.
   * Si se pasa, el service usa esta gestión para el Resultado del Ejercicio.
   * Si no, infiere la gestión vigente desde la fecha de corte.
   * REQ-BG-02.
   */
  @IsOptional()
  @IsUUID('4')
  gestionId?: string;

  /**
   * Si true, incluye líneas de comprobantes anulados (anulado=true) en los saldos.
   * Default false (§4.7 CLAUDE.md).
   * REQ-BG-04.
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
