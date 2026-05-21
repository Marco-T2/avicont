import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

// Body del POST /api/comprobantes/:comprobanteId/documentos-fisicos (REQ-A-01).
// La operación es aditiva: agrega las asociaciones nuevas sin reemplazar las
// previas. ArrayMaxSize=50 acota el batch (Anti-29: pagination de input).
export class AsociarDocumentosDto {
  @ApiProperty({
    description:
      'IDs de los documentos físicos a asociar al comprobante. La operación es aditiva e idempotente.',
    type: [String],
    format: 'uuid',
    example: ['7c0e5b2a-2f3d-4d6e-9a1b-1c2d3e4f5a6b'],
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  documentoFisicoIds!: string[];
}
