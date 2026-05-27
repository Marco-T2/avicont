import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

import { UpdateComprobanteDto } from './update-comprobante.dto';

// DTO para PATCH /:id — sirve tanto para BORRADOR como para CONTABILIZADO.
// El servicio determina internamente cuál path tomar según el estado actual.
//
// `numero` NO se incluye en el payload que el controller acepta; sin embargo
// el service lo permite en el type para poder detectar intentos de cambio
// y lanzar NumeroCorrelativoInmutableError (§4.9 CLAUDE.md).
export class EditarContabilizadoDto extends UpdateComprobanteDto {
  // El number correlativo es inmutable (§4.9 CLAUDE.md). Si el cliente lo envía
  // igual al actual, se ignora; si es diferente, el servicio lanza 409.
  // Se declara aquí solo para que el servicio pueda chequearlo tipadamente.
  @ApiPropertyOptional({
    description:
      'Número correlativo. INMUTABLE — si se envía distinto al actual, la ' +
      'petición será rechazada con 409 (§4.9 CLAUDE.md). Omitir en producción.',
  })
  @IsOptional()
  @IsString()
  numero?: string;

  @ApiPropertyOptional({
    description:
      'Motivo del cambio, registrado en comprobantes_audit. Si se omite, el trigger ' +
      'registrará motivo NULL (auditoría silenciosa). Mínimo 3 caracteres si se envía.',
    example: 'Corrección de glosa — error tipográfico en el nombre del cliente',
    minLength: 3,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  motivo?: string;
}
