import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Moneda, PerfilExtracto } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCuentaBancariaDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Cuenta del plan de cuentas ELEGIDA por el usuario (esDetalle=true, activa=true). No se adivina.',
  })
  @IsUUID()
  cuentaId!: string;

  @ApiProperty({ example: 'Cuenta corriente BancoSol', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  alias!: string;

  @ApiProperty({
    enum: PerfilExtracto,
    description: 'Único campo de identidad de banco+formato (REQ-CB-01). Inmutable post-creación.',
  })
  @IsEnum(PerfilExtracto)
  perfilExtracto!: PerfilExtracto;

  @ApiPropertyOptional({
    example: '1191959-000-001',
    maxLength: 50,
    description:
      'Puede quedar vacío al crear — se captura y confirma en la primera importación (REQ-CB-16).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numeroCuenta?: string;

  @ApiProperty({
    enum: Moneda,
    description:
      'Un extracto tiene una única moneda por definición. Validada contra la cuenta del plan (REQ-CB-02).',
  })
  @IsEnum(Moneda)
  moneda!: Moneda;
}
