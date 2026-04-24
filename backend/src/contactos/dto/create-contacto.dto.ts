import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateContactoDto {
  @ApiProperty({ example: 'Granjas El Sol SRL', minLength: 2, maxLength: 200 })
  @IsString()
  @Length(2, 200)
  razonSocial!: string;

  @ApiPropertyOptional({ example: 'El Sol', maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  nombreComercial?: string | null;

  @ApiPropertyOptional({
    example: '1234567019',
    maxLength: 50,
    nullable: true,
    description: 'NIT, CI, CEX o pasaporte. Texto libre.',
  })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  documento?: string | null;

  @ApiProperty({ example: true })
  @IsBoolean()
  esCliente!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  esProveedor!: boolean;

  @ApiPropertyOptional({ example: 'ventas@elsol.bo', nullable: true })
  @IsOptional()
  @IsEmail()
  @Length(0, 200)
  email?: string | null;

  @ApiPropertyOptional({ example: '+591 3 1234567', maxLength: 50, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  telefono?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  direccion?: string | null;
}
