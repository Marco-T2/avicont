import { ApiProperty } from '@nestjs/swagger';
import { EstadoComprobante } from '@prisma/client';

import type { CierreOrigenTipo } from '@/comprobantes/ports/cierre-comprobante-writer.port';

import type { ResultadoCierre } from '../cierre-ejercicio.service';

/** Los 3 slots posibles de un comprobante de cierre del ejercicio. */
const CIERRE_ORIGEN_TIPOS: readonly CierreOrigenTipo[] = [
  'CIERRE_GASTOS',
  'CIERRE_INGRESOS',
  'CIERRE_RESULTADO',
];

/** Un comprobante de cierre tal como lo expone el endpoint (resumen sin líneas). */
export class CierreComprobanteResponseDto {
  @ApiProperty({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })
  id!: string;

  @ApiProperty({
    enum: CIERRE_ORIGEN_TIPOS,
    description: 'Slot del comprobante de cierre: gastos (#1), ingresos (#2) o traslado (#3).',
    example: 'CIERRE_RESULTADO',
  })
  origenTipo!: CierreOrigenTipo;

  @ApiProperty({ enum: EstadoComprobante, example: EstadoComprobante.BORRADOR })
  estado!: EstadoComprobante;
}

/** Respuesta de `POST`/`GET /api/gestiones/:id/cierre`. */
export class CierreEjercicioResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  gestionId!: string;

  @ApiProperty({
    type: [CierreComprobanteResponseDto],
    description:
      'Comprobantes de cierre de la gestión (≤3). En generación recién creados están en BORRADOR.',
  })
  cierres!: CierreComprobanteResponseDto[];
}

export function toCierreEjercicioResponse(r: ResultadoCierre): CierreEjercicioResponseDto {
  return {
    gestionId: r.gestionId,
    cierres: r.cierres.map((c) => ({
      id: c.id,
      origenTipo: c.origenTipo,
      estado: c.estado,
    })),
  };
}
