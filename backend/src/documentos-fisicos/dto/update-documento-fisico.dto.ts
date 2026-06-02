import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Moneda } from '@prisma/client';

import { DECIMAL_POSITIVO } from './create-documento-fisico.dto';

export class UpdateDocumentoFisicoDto {
  @ApiPropertyOptional({
    description: 'ID del tipo de documento físico. Debe pertenecer al tenant y estar activo.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  tipoDocumentoFisicoId?: string;

  @ApiPropertyOptional({
    description:
      'Número impreso del documento. Se normaliza (trim + uppercase). Regex: ^[A-Z0-9./-]+$.',
    minLength: 1,
    maxLength: 50,
    example: 'FAC-0042',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  numero?: string;

  @ApiPropertyOptional({
    description: 'Fecha de emisión del documento. Formato ISO 8601 (YYYY-MM-DD).',
    example: '2026-03-15',
  })
  @IsOptional()
  @IsDateString()
  fechaEmision?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Monto del documento como string decimal. Para tipos tributarios no puede ser null (REQ-D-13). Se cruza como string para evitar pérdida IEEE-754 (CLAUDE.md §4.5).',
    example: '1250.50',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_POSITIVO, { message: 'monto debe ser un decimal mayor a 0 (ej "1250.50")' })
  monto?: string | null;

  @ApiPropertyOptional({
    description: 'Moneda del documento. BOB o USD.',
    enum: Moneda,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(Moneda)
  moneda?: Moneda | null;

  @ApiPropertyOptional({
    type: String,
    description: 'ID del contacto asociado al documento.',
    format: 'uuid',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  contactoId?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: 'Glosa o descripción libre del documento.',
    maxLength: 500,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  glosa?: string | null;
}
