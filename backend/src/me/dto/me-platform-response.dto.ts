import { ApiProperty } from '@nestjs/swagger';

export class MePlatformResponseDto {
  @ApiProperty({ description: 'Indica si el usuario es super-admin de plataforma' })
  isSuperAdmin!: boolean;
}
