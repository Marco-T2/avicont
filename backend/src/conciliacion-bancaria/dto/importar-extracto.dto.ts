import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/**
 * Campo de formulario multipart adicional al archivo (REQ-CB-16, design §10).
 * Llega como string ('true'/'false') porque multipart no tipa booleanos.
 */
export class ImportarExtractoDto {
  @ApiPropertyOptional({
    description:
      'Confirma el número de cuenta detectado en el archivo cuando la CuentaBancaria todavía no lo tiene cargado. Segundo viaje del flujo de REQ-CB-16.',
    enum: ['true', 'false'],
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  confirmarNumeroCuenta?: string;
}
