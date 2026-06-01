import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { OrganizationStatus } from '@prisma/client';

export class UpdateOrgStatusDto {
  @ApiProperty({
    enum: OrganizationStatus,
    description: 'Nuevo status de la organización.',
    example: OrganizationStatus.SUSPENDED,
  })
  @IsEnum(OrganizationStatus)
  @IsNotEmpty()
  status!: OrganizationStatus;
}
