import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TipoEmpresa } from '@/common/domain/enums';

/**
 * Shape de la respuesta de `GET /tenants/current`.
 * Espeja todos los campos de `Organization` expuestos por `findById` más los
 * dos campos nuevos: `tipoEmpresaPrincipal` (ya existía en el modelo) y
 * `tipoEmpresaEditable` (derivado — ver §10.10 WARNING-1 de CLAUDE.md).
 *
 * Cierra el WARNING-1 de §10.10: el endpoint ahora lleva `@ApiOkResponse`
 * tipado y el contrato queda en `openapi.json` + `api.generated.ts`.
 */
export class TenantCurrentResponseDto {
  @ApiProperty({ description: 'UUID de la organización' })
  id!: string;

  @ApiProperty({ description: 'Nombre de la organización' })
  name!: string;

  @ApiProperty({ description: 'Slug URL-friendly único de la organización' })
  slug!: string;

  @ApiProperty({ description: 'Estado de la organización', example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ description: 'Plan de suscripción', example: 'FREE' })
  plan!: string;

  @ApiProperty({ description: 'Módulo de contabilidad activo' })
  contabilidadEnabled!: boolean;

  @ApiProperty({ description: 'Módulo de granja activo' })
  granjaEnabled!: boolean;

  /**
   * Tipo de empresa principal (Ley 843 art. 46).
   * Inmutable una vez que existe una gestión fiscal.
   */
  @ApiProperty({
    enum: TipoEmpresa,
    enumName: 'TipoEmpresa',
    description: 'Tipo de empresa principal según Ley 843 art. 46',
    example: 'COMERCIAL',
  })
  tipoEmpresaPrincipal!: TipoEmpresa;

  @ApiProperty({
    type: [String],
    description: 'Tipos de empresa activos',
    example: ['COMERCIAL'],
  })
  tiposEmpresaActivos!: string[];

  /**
   * Indica si el campo `tipoEmpresaPrincipal` puede modificarse.
   * `true` cuando la organización no tiene ninguna gestión fiscal registrada;
   * `false` en caso contrario (el tipo queda inmutable por Ley 843 art. 46).
   */
  @ApiProperty({
    description:
      'false si ya existe al menos una gestión fiscal — tipoEmpresaPrincipal queda inmutable',
  })
  tipoEmpresaEditable!: boolean;

  // Perfil fiscal (RND 10-0025-14) — opcionales, null cuando no se han configurado.
  @ApiPropertyOptional({ type: String, nullable: true })
  razonSocial!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  nit!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  direccion!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  representanteLegal!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  telefono!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ description: 'Fecha de creación (ISO 8601)' })
  createdAt!: string;

  @ApiProperty({ description: 'Fecha de última actualización (ISO 8601)' })
  updatedAt!: string;
}
