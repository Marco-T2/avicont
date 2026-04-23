import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Toggle de módulos habilitados de la organización.
// Body parcial: solo se actualizan los flags presentes.
export class UpdateFeaturesDto {
  @ApiPropertyOptional({ description: 'Habilitar/deshabilitar el módulo Contabilidad' })
  @IsOptional()
  @IsBoolean()
  contabilidadEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Habilitar/deshabilitar el módulo Granja' })
  @IsOptional()
  @IsBoolean()
  granjaEnabled?: boolean;
}
