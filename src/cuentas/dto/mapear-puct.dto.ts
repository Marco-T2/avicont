import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class MapearPuctDto {
  @ApiProperty({
    example: '1.1.1.001',
    description: 'Código PUCT nivel 4 del catálogo oficial (RND-101800000004)',
  })
  @IsString()
  @Length(1, 50)
  codigoPuct!: string;
}
