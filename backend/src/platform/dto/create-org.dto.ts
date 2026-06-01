import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { ModuloOrganizacion } from '@/tenants/dto/create-tenant.dto';

export class CreateOrgDto {
  @ApiProperty({ example: 'Asociación Avícola Cochabamba', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    enum: ModuloOrganizacion,
    description: 'Módulo principal de la organización (determina el seeding inicial y los flags).',
    example: ModuloOrganizacion.CONTABILIDAD,
  })
  @IsEnum(ModuloOrganizacion)
  @IsNotEmpty()
  modulo!: ModuloOrganizacion;

  @ApiProperty({
    example: 'user@example.com',
    description: 'Email del usuario que será designado como OWNER de la nueva organización.',
  })
  @IsEmail()
  @IsNotEmpty()
  ownerEmail!: string;
}
