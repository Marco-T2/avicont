import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** Body del `PATCH /packs/:clave` del Owner: prender o apagar el pack. */
export class ActivarPackDto {
  @ApiProperty({ description: 'true = activar el pack; false = desactivarlo.' })
  @IsBoolean()
  activo!: boolean;
}
