import { PartialType } from '@nestjs/swagger';

import { CreateComprobanteDto } from './create-comprobante.dto';

// PATCH sobre un BORRADOR — todos los campos de CreateComprobanteDto
// son opcionales. Si se envía `lineas`, se reemplazan completas; si no,
// se dejan como están.
//
// Nota: el PATCH NO sirve para editar un CONTABILIZADO fuera de ventana
// de reapertura. El servicio valida el estado antes de tocar nada.
export class UpdateComprobanteDto extends PartialType(CreateComprobanteDto) {}
