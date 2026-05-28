import { ClaseCuenta, Moneda } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

import { NaturalezaCuenta, SubClaseCuenta } from '../domain/enums';

export class CreateCuentaDto {
  @ApiProperty({
    example: '1.1.1.001',
    description: 'Código jerárquico, hasta 8 niveles numéricos',
  })
  @IsString()
  @Matches(/^[0-9]+(\.[0-9]+)*$/, {
    message: 'codigoInterno debe ser numérico separado por puntos (ej: "1.1.1.001")',
  })
  codigoInterno!: string;

  @ApiProperty({ example: 'CAJA MONEDA NACIONAL' })
  @IsString()
  @Length(1, 200)
  nombre!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  descripcion?: string;

  @ApiProperty({ enum: ClaseCuenta })
  @IsEnum(ClaseCuenta)
  claseCuenta!: ClaseCuenta;

  @ApiPropertyOptional({
    enum: SubClaseCuenta,
    description: 'Requerido para cuentas de nivel > 1; nulo solo en raíz.',
  })
  @IsOptional()
  @IsEnum(SubClaseCuenta)
  subClaseCuenta?: SubClaseCuenta;

  @ApiProperty({ enum: NaturalezaCuenta })
  @IsEnum(NaturalezaCuenta)
  naturaleza!: NaturalezaCuenta;

  @ApiPropertyOptional({ description: 'ID de la cuenta padre. Null/omitido = cuenta raíz.' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ description: 'Si true, admite asientos directos. Si false, es agrupador.' })
  @IsBoolean()
  esDetalle!: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiereContacto?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Cuenta contraria: vive en una clase pero con naturaleza opuesta. Ej: Depreciación Acumulada.',
  })
  @IsOptional()
  @IsBoolean()
  esContraria?: boolean;

  @ApiPropertyOptional({ enum: Moneda, default: 'BOB' })
  @IsOptional()
  @IsEnum(Moneda)
  monedaFuncional?: Moneda;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  permiteMultiMoneda?: boolean;
}
