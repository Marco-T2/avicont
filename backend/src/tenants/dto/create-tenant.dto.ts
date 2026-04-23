import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Corp', maxLength: 100, description: 'Organization name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
