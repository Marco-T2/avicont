import { ArrayNotEmpty, IsArray, IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Slug es inmutable. Si se quiere cambiar, clonar el rol con otro slug y borrar el viejo.
export class UpdateCustomRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissions?: string[];
}
