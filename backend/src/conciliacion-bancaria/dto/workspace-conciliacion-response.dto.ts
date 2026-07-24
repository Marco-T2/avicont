import { ApiProperty } from '@nestjs/swagger';
import { LadoBancario, LadoContable, Moneda, EstadoMovimientoBancario } from '@prisma/client';

import type { WorkspaceConciliacion } from '../conciliacion.service';

const MOTIVOS_VINCULO_ROTO = [
  'LINEA_INEXISTENTE',
  'COMPROBANTE_ANULADO',
  'CUENTA_CAMBIADA',
  'MONTO_CAMBIADO',
  'LADO_CAMBIADO',
  'MONEDA_CAMBIADA',
  'FECHA_CAMBIADA',
] as const;

export class VinculoConciliacionDto {
  @ApiProperty() matchId!: string;
  @ApiProperty() comprobanteId!: string;
  @ApiProperty() orden!: number;
  @ApiProperty({
    enum: MOTIVOS_VINCULO_ROTO,
    nullable: true,
    description: 'null ⇒ el vínculo es válido. Cualquier otro valor ⇒ roto, con el motivo exacto.',
  })
  roto!: (typeof MOTIVOS_VINCULO_ROTO)[number] | null;
}

export class MovimientoConciliacionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '2026-06-10', description: 'Calendario puro, sin UTC (§4.6).' })
  fecha!: string;
  @ApiProperty({ type: String, nullable: true }) hora!: string | null;
  @ApiProperty({ example: '1500.00', description: 'Monto como string (§4.5), siempre positivo.' })
  monto!: string;
  @ApiProperty({ enum: LadoBancario, description: 'Perspectiva del BANCO.' })
  tipo!: LadoBancario;
  @ApiProperty({ enum: Moneda }) moneda!: Moneda;
  @ApiProperty() descripcion!: string;
  @ApiProperty({ type: String, nullable: true }) referencia!: string | null;
  @ApiProperty({ type: String, nullable: true }) saldo!: string | null;
  @ApiProperty({
    enum: EstadoMovimientoBancario,
    description: 'Columna PERSISTIDA (proyección cacheada). NO es lo que se muestra.',
  })
  estado!: EstadoMovimientoBancario;
  @ApiProperty({
    enum: ['PENDIENTE', 'CONCILIADO', 'IGNORADO'],
    description: 'DERIVADO en cada lectura (REQ-CB-10/11). Esto es lo que se muestra.',
  })
  estadoEfectivo!: 'PENDIENTE' | 'CONCILIADO' | 'IGNORADO';
  @ApiProperty({ type: () => VinculoConciliacionDto, nullable: true })
  vinculo!: VinculoConciliacionDto | null;
}

export class LineaConciliacionDto {
  @ApiProperty() comprobanteId!: string;
  @ApiProperty() orden!: number;
  @ApiProperty({ example: '2026-06-10' }) fecha!: string;
  @ApiProperty({ type: String, nullable: true }) numeroComprobante!: string | null;
  @ApiProperty() glosa!: string;
  @ApiProperty({ type: String, nullable: true }) glosaLinea!: string | null;
  @ApiProperty({ example: '1500.00', description: 'Moneda ORIGINAL, siempre positivo.' })
  monto!: string;
  @ApiProperty({ example: '1500.00', description: 'Equivalente en BOB, solo para mostrar.' })
  montoBob!: string;
  @ApiProperty({ enum: LadoContable, description: 'Perspectiva de la EMPRESA.' })
  tipo!: LadoContable;
  @ApiProperty({ enum: Moneda }) moneda!: Moneda;
  @ApiProperty({
    enum: ['EN_TRANSITO', 'CONCILIADO'],
    description: 'EN_TRANSITO es DERIVADO — no existe fila persistida con ese estado (REQ-CB-11).',
  })
  estadoEfectivo!: 'EN_TRANSITO' | 'CONCILIADO';
}

export class SugerenciaConciliacionDto {
  @ApiProperty() movimientoId!: string;
  @ApiProperty() comprobanteId!: string;
  @ApiProperty() orden!: number;
  @ApiProperty({ enum: ['ALTA', 'MEDIA', 'BAJA'] })
  confianza!: 'ALTA' | 'MEDIA' | 'BAJA';
  @ApiProperty() diferenciaDias!: number;
}

export class CuentaBancariaWorkspaceDto {
  @ApiProperty() id!: string;
  @ApiProperty() alias!: string;
  @ApiProperty() cuentaId!: string;
  @ApiProperty({ enum: Moneda }) moneda!: Moneda;
  @ApiProperty({ type: String, nullable: true }) numeroCuenta!: string | null;
}

export class ResumenConciliacionDto {
  @ApiProperty() movimientosPendientes!: number;
  @ApiProperty() movimientosConciliados!: number;
  @ApiProperty() movimientosIgnorados!: number;
  @ApiProperty() lineasEnTransito!: number;
}

export class WorkspaceConciliacionResponseDto {
  @ApiProperty({ type: () => CuentaBancariaWorkspaceDto })
  cuentaBancaria!: CuentaBancariaWorkspaceDto;
  @ApiProperty({ example: '2026-06-01' }) desde!: string;
  @ApiProperty({ example: '2026-06-30' }) hasta!: string;
  @ApiProperty({ type: () => [MovimientoConciliacionDto] })
  movimientos!: MovimientoConciliacionDto[];
  @ApiProperty({ type: () => [LineaConciliacionDto] })
  lineas!: LineaConciliacionDto[];
  @ApiProperty({ type: () => [SugerenciaConciliacionDto] })
  sugerencias!: SugerenciaConciliacionDto[];
  @ApiProperty({ type: () => ResumenConciliacionDto })
  resumen!: ResumenConciliacionDto;
}

export function toWorkspaceConciliacionResponse(
  ws: WorkspaceConciliacion,
): WorkspaceConciliacionResponseDto {
  return ws;
}
