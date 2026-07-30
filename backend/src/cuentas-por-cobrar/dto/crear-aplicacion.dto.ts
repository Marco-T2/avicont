import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';

const DECIMAL_POSITIVE = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

const MENSAJE_MONTO = 'montoAplicado debe ser numérico mayor a 0 (ej "300.00")';

/**
 * Aplicación cobro→venta (REQ-CXC-03): vínculo editable, NO hecho contable.
 * El `cobroId` viaja en la URL (`POST /cobros/:id/aplicaciones`), no acá.
 * En 0 no se crea ni se edita: se elimina (`DELETE`).
 */
export class CrearAplicacionDto {
  @ApiProperty({ format: 'uuid', description: 'Venta abierta del MISMO contacto (REQ-CXC-03).' })
  @IsUUID()
  ventaId!: string;

  @ApiProperty({
    type: String,
    example: '300.00',
    description: 'Decimal(18,2) como string, > 0 (§4.5).',
  })
  @Matches(DECIMAL_POSITIVE, { message: MENSAJE_MONTO })
  montoAplicado!: string;
}

/** Edición del monto de UNA aplicación — la venta no cambia (se mueve borrando y recreando). */
export class EditarAplicacionDto {
  @ApiProperty({
    type: String,
    example: '150.50',
    description: 'Decimal(18,2) como string, > 0 (§4.5).',
  })
  @Matches(DECIMAL_POSITIVE, { message: MENSAJE_MONTO })
  montoAplicado!: string;
}
