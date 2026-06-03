import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PlatformActivityQueryDto {
  @ApiPropertyOptional({
    description: 'Cantidad máxima de ítems a devolver (1-100)',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Cursor opaco de la respuesta anterior para avanzar a la siguiente página',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Filtrar actividad por organización (UUID)',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  orgId?: string;
}
