import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Módulo vertical de la organización. Determina qué features se habilitan
 * y qué datos se siembran al crear la organización.
 * Input transitorio: no se persiste como columna; se traduce a los flags
 * `contabilidadEnabled` y `granjaEnabled` (Design D1, Design D2).
 */
export enum ModuloOrganizacion {
  CONTABILIDAD = 'CONTABILIDAD',
  GRANJA = 'GRANJA',
  OTROS = 'OTROS',
}

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Corp', maxLength: 100, description: 'Organization name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    enum: ModuloOrganizacion,
    description:
      'Módulo principal de la organización. Determina el seeding inicial y los feature flags activados.',
    example: ModuloOrganizacion.CONTABILIDAD,
  })
  @IsEnum(ModuloOrganizacion)
  @IsNotEmpty()
  modulo!: ModuloOrganizacion;
}
