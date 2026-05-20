import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { TipoComprobante } from '@prisma/client';

export class CreateTipoDocumentoFisicoDto {
  @ApiProperty({ example: 'Factura recibida', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre!: string;

  @ApiProperty({
    example: 'factura-recibida',
    maxLength: 20,
    description: 'Identificador estable en kebab-case alfanumérico. Inmutable post-creación.',
    pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
  })
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'codigo debe ser kebab-case alfanumérico (ej: factura-recibida)',
  })
  @MaxLength(20)
  codigo!: string;

  @ApiProperty({ example: false, description: 'true para documentos con requisitos tributarios (factura, NC, ND).' })
  @IsBoolean()
  esTributario!: boolean;

  @ApiProperty({
    example: ['EGRESO', 'DIARIO'],
    isArray: true,
    enum: TipoComprobante,
    description: 'Tipos de comprobante con los que este tipo puede asociarse. Array vacío = ninguno.',
  })
  @IsArray()
  @IsEnum(TipoComprobante, { each: true })
  tiposComprobanteAplicables!: TipoComprobante[];
}
