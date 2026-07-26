import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Anulación de una declaración de arranque (REQ-ICB-04, §4.7).
 *
 * El motivo es OBLIGATORIO y con mínimo significativo, igual que
 * `motivoAnulacion` de comprobantes: el acto anulado queda para siempre en el
 * historial, y sin el porqué el rastro no sirve de nada — un "error" de cinco
 * letras no le explica al próximo contador qué pasó acá.
 */
export class AnularArranqueDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cuentaBancariaId!: string;

  @ApiProperty({
    minLength: 10,
    maxLength: 500,
    example: 'Se declaró con la fecha del cierre siguiente por error de carga',
  })
  @MinLength(10, { message: 'El motivo debe explicar la anulación (mínimo 10 caracteres)' })
  @MaxLength(500)
  // Diez espacios no son un motivo: se exige contenido real, mismo criterio
  // que §4.7 ("mínimo 10 caracteres significativos").
  @Matches(/\S{10,}|(\S+\s+){2,}\S+/, {
    message: 'El motivo debe explicar la anulación, no ser espacios en blanco',
  })
  motivo!: string;
}
