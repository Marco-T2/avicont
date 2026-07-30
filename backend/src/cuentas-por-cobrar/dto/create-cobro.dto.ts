import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length, Matches } from 'class-validator';

import { EsFechaContableIso } from '@/common/validators/es-fecha-contable-iso';

// La plata cruza HTTP como STRING (§4.5): un float en JSON pierde precisión
// antes de llegar a la columna Decimal(18,2).
const DECIMAL_POSITIVE = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

/**
 * Alta del borrador de cobro (REQ-CXC-02): hecho contable independiente, sin
 * depender de ninguna venta. Las aplicaciones NO viajan acá — son vínculos
 * editables con endpoints propios (REQ-CXC-03).
 */
export class CreateCobroDto {
  @ApiProperty({ format: 'uuid', description: 'Cliente que paga.' })
  @IsUUID()
  contactoId!: string;

  @ApiProperty({
    example: '2026-07-15',
    description: 'Fecha contable de calendario, YYYY-MM-DD sin hora ni zona (§4.6).',
  })
  @EsFechaContableIso()
  fechaContable!: string;

  @ApiProperty({
    type: String,
    example: '1250.50',
    description: 'Decimal(18,2) como string, > 0 (§4.5).',
  })
  @Matches(DECIMAL_POSITIVE, { message: 'monto debe ser numérico mayor a 0 (ej "1250.50")' })
  monto!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Cuenta destino ELEGIDA (D-05): efectivo/equivalente según el criterio de REQ-CXC-02. El default Caja General es precarga de UI, no concepto de backend.',
  })
  @IsUUID()
  cuentaDestinoId!: string;

  @ApiProperty({ example: 'Pago parcial de la factura 12', minLength: 1, maxLength: 500 })
  @IsString()
  @Length(1, 500)
  glosa!: string;
}
