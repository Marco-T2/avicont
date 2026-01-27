import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SwitchTenantDto {
  @ApiProperty({ format: 'uuid', description: 'ID of the tenant to switch to' })
  @IsUUID()
  @IsNotEmpty()
  tenantId!: string;
}
