import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Moneda } from '@prisma/client';

export class CreateDocumentoFisicoDto {
  @ApiProperty({
    description: 'ID del tipo de documento físico (debe pertenecer al tenant y estar activo)',
    format: 'uuid',
  })
  @IsUUID()
  tipoDocumentoFisicoId!: string;

  @ApiProperty({
    description:
      'Número impreso del documento. Se normaliza (trim + uppercase). Regex: ^[A-Z0-9./-]+$.',
    minLength: 1,
    maxLength: 50,
    example: 'FAC-0042',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  numero!: string;

  @ApiProperty({
    description: 'Fecha de emisión del documento. Formato ISO 8601 (YYYY-MM-DD).',
    example: '2026-03-15',
  })
  @IsDateString()
  fechaEmision!: string;

  @ApiPropertyOptional({
    description:
      'Monto del documento como string decimal. Obligatorio para tipos tributarios (REQ-D-13). Se cruza como string para evitar pérdida IEEE-754 (CLAUDE.md §4.5).',
    example: '1250.50',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  monto?: string | null;

  @ApiPropertyOptional({
    description:
      'Moneda del documento. Obligatoria para tipos tributarios (REQ-D-14). BOB o USD.',
    enum: Moneda,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(Moneda)
  moneda?: Moneda | null;

  @ApiPropertyOptional({
    description: 'ID del contacto (cliente o proveedor) asociado al documento.',
    format: 'uuid',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  contactoId?: string | null;

  @ApiPropertyOptional({
    description: 'Glosa o descripción libre del documento.',
    maxLength: 500,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  glosa?: string | null;
}
