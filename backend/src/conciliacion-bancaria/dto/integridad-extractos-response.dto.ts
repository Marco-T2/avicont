import { ApiProperty } from '@nestjs/swagger';

import type { IntegridadExtractos } from '../integridad-extractos.service';

export class HuecoCoberturaDto {
  @ApiProperty({ example: '2026-07-01', description: 'Inclusive, `YYYY-MM-DD` (§4.6).' })
  desde!: string;
  @ApiProperty({ example: '2026-07-31', description: 'Inclusive.' })
  hasta!: string;
}

export class DiscontinuidadSaldoDto {
  @ApiProperty({ format: 'uuid' }) anteriorId!: string;
  @ApiProperty({ format: 'uuid' }) siguienteId!: string;
  @ApiProperty({ example: '700.00', description: 'Monto como STRING (§4.5).' })
  saldoFinalAnterior!: string;
  @ApiProperty({ example: '900.00' }) saldoInicialSiguiente!: string;
  @ApiProperty({ example: '200.00', description: 'Magnitud del salto, siempre positiva.' })
  diferencia!: string;
}

export class IntegridadExtractosResponseDto {
  @ApiProperty({ type: () => [HuecoCoberturaDto] })
  huecos!: HuecoCoberturaDto[];

  @ApiProperty({
    type: () => [DiscontinuidadSaldoDto],
    description:
      'Saltos de saldo entre importaciones contiguas. Detectan la mutilación de ' +
      'un extracto por los extremos, que el checksum DERIVADO no puede ver (REQ-CB-23).',
  })
  discontinuidades!: DiscontinuidadSaldoDto[];

  @ApiProperty({
    description:
      'true cuando no hay huecos NI discontinuidades. Informativo: nunca bloquea ' +
      'una importación — lo que se retiene aguas abajo es la conclusión del informe.',
  })
  serieIntegra!: boolean;
}

export function toIntegridadExtractosResponse(
  integridad: IntegridadExtractos,
): IntegridadExtractosResponseDto {
  return {
    huecos: integridad.huecos.map((h) => ({ desde: h.desde.toIso(), hasta: h.hasta.toIso() })),
    discontinuidades: integridad.discontinuidades.map((d) => ({
      anteriorId: d.anteriorId,
      siguienteId: d.siguienteId,
      saldoFinalAnterior: d.saldoFinalAnterior.toBob(),
      saldoInicialSiguiente: d.saldoInicialSiguiente.toBob(),
      diferencia: d.diferencia.toBob(),
    })),
    serieIntegra: integridad.huecos.length === 0 && integridad.discontinuidades.length === 0,
  };
}
