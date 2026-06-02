import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * Cuerpo de `POST /admin/platform/orgs/:id/packs` (super-admin habilita un pack).
 * Acepta el pack por `packId` (id del catálogo) o por su `clave` estable
 * namespaced (`{modulo}.{submodulo}`). Al menos uno es obligatorio; el service
 * resuelve la referencia contra el catálogo y rechaza con `PACK_NO_ENCONTRADO`
 * si no existe.
 */
export class HabilitarPackDto {
  @ApiPropertyOptional({
    description: 'Id del pack en el catálogo. Alternativo a `clave` (uno requerido).',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ValidateIf((dto: HabilitarPackDto) => dto.clave === undefined)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  packId?: string;

  @ApiPropertyOptional({
    description: 'Clave estable del pack. Alternativa a `packId` (uno requerido).',
    example: 'contabilidad.adjuntos',
  })
  @ValidateIf((dto: HabilitarPackDto) => dto.packId === undefined)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  clave?: string;
}
