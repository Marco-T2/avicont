import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoVerificacionExtracto, Moneda } from '@prisma/client';

import type {
  ArranqueAplicadoView,
  CandidatoPartidaArranque,
  InformeConciliacionResultado,
  MotivoNoConciliado,
} from '../informe-conciliacion.service';

// Todos los montos viajan como STRING (§4.5) y todas las fechas contables
// como `YYYY-MM-DD` (§4.6). Cada importe de partida es la contribución
// FIRMADA extracto→libros que fija `armarInforme` — el DTO NO recalcula ni
// re-firma nada, solo serializa.

export const MOTIVOS_NO_CONCILIADO = [
  'SIN_ARRANQUE',
  'SIN_SALDO_EXTRACTO',
  'ARRANQUE_EXTRACTO_NO_COINCIDE',
  'ARRANQUE_LIBROS_NO_COINCIDE',
  'DESCUADRE',
  'HUECO',
  'DISCONTINUIDAD',
  'RESIDUO_NO_EXPLICADO',
] as const;

export class CuentaBancariaInformeDto {
  @ApiProperty() id!: string;
  @ApiProperty() alias!: string;
  @ApiProperty() cuentaId!: string;
  @ApiProperty({ enum: Moneda }) moneda!: Moneda;
  @ApiProperty({ type: String, nullable: true }) numeroCuenta!: string | null;
}

export class ArranqueAplicadoDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '2026-06-30' }) fecha!: string;
  @ApiProperty({ example: '1000.00' }) saldoExtracto!: string;
  @ApiProperty({ example: '990.00' }) saldoLibros!: string;
  @ApiProperty({
    example: '10.00',
    description:
      'DECLARADA por el usuario al fijar el arranque — jamás calculada como ' +
      'extracto − libros. Positiva cuando el extracto queda por encima de los libros.',
  })
  diferenciaResidual!: string;
  @ApiProperty({ type: String, nullable: true }) nota!: string | null;
  @ApiProperty() declaradoPorUserId!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Marco Tarqui',
    description:
      'Quién declaró el arranque. null si el id ya no resuelve dentro de la ' +
      'organización — el acto se muestra sin nombre, nunca con el UUID crudo.',
  })
  declaradoPorNombre!: string | null;
  @ApiProperty({ example: '2026-07-01T12:00:00.000Z' }) declaradoEl!: string;
  @ApiProperty({
    description:
      'true ⇒ la declaración fue ANULADA: dejó de aplicar, pero no se borró ni se oculta ' +
      '(§4.7). Que alguien haya fijado mal el punto de partida es parte del rastro.',
  })
  anulado!: boolean;
  @ApiProperty({ type: String, nullable: true }) motivoAnulacion!: string | null;
  @ApiProperty({ type: String, nullable: true }) anuladoPorUserId!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Marco Tarqui' })
  anuladoPorNombre!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '2026-07-26T18:00:00.000Z' })
  anuladoEl!: string | null;
}

export class DetalleMovimientoPendienteDto {
  @ApiProperty() movimientoId!: string;
  @ApiProperty({ example: '2026-07-10' }) fecha!: string;
  @ApiProperty({ example: '-200.00', description: 'Contribución FIRMADA extracto→libros.' })
  importe!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'No-nulo ⇒ el asiento existe pero es POSTERIOR al corte: la diferencia de ' +
      'este corte no se resolverá en él (REQ-ICB-07). Se señala, no se degrada.',
  })
  asentadoEl!: string | null;
  @ApiProperty({
    description:
      'true ⇒ la partida ya estaba abierta cuando se declaró el arranque y ' +
      'sigue abierta al corte. Su antigüedad es información: un ítem sin ' +
      'resolver desde antes del punto de partida no es lo mismo que uno de este mes.',
  })
  anteriorAlArranque!: boolean;
}

export class DetalleMovimientoIgnoradoDto {
  @ApiProperty() movimientoId!: string;
  @ApiProperty({ example: '2026-07-12' }) fecha!: string;
  @ApiProperty({ example: '-10.00' }) importe!: string;
  @ApiProperty({
    description:
      'true ⇒ la partida ya estaba abierta cuando se declaró el arranque y ' +
      'sigue abierta al corte. Su antigüedad es información: un ítem sin ' +
      'resolver desde antes del punto de partida no es lo mismo que uno de este mes.',
  })
  anteriorAlArranque!: boolean;
}

export class DetalleLineaEnTransitoDto {
  @ApiProperty() comprobanteId!: string;
  @ApiProperty() orden!: number;
  @ApiProperty({ example: '2026-07-20' }) fecha!: string;
  @ApiProperty({ example: '-400.00' }) importe!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'No-nulo ⇒ el banco lo registró, pero DESPUÉS del corte (simétrico de asentadoEl).',
  })
  registradoPorBancoEl!: string | null;
  @ApiProperty({
    description:
      'true ⇒ la partida ya estaba abierta cuando se declaró el arranque y ' +
      'sigue abierta al corte. Su antigüedad es información: un ítem sin ' +
      'resolver desde antes del punto de partida no es lo mismo que uno de este mes.',
  })
  anteriorAlArranque!: boolean;
}

export class PartidaPendientesDto {
  @ApiProperty({ example: '-200.00', description: 'Suma firmada del detalle.' })
  importe!: string;
  @ApiProperty({ type: () => [DetalleMovimientoPendienteDto] })
  detalle!: DetalleMovimientoPendienteDto[];
}

export class PartidaIgnoradosDto {
  @ApiProperty({ example: '-10.00' }) importe!: string;
  @ApiProperty({ type: () => [DetalleMovimientoIgnoradoDto] })
  detalle!: DetalleMovimientoIgnoradoDto[];
}

export class PartidaEnTransitoDto {
  @ApiProperty({ example: '-400.00' }) importe!: string;
  @ApiProperty({ type: () => [DetalleLineaEnTransitoDto] })
  detalle!: DetalleLineaEnTransitoDto[];
}

export class PartidaArranqueDto {
  @ApiProperty({ example: '2026-06-30' }) fecha!: string;
  @ApiProperty({
    example: '-10.00',
    description: 'Contribución al puente: −diferenciaResidual declarada.',
  })
  importe!: string;
}

export class PartidasInformeDto {
  @ApiProperty({
    type: () => PartidaPendientesDto,
    description: 'El banco lo registró; los libros, al corte, no.',
  })
  pendientes!: PartidaPendientesDto;
  @ApiProperty({
    type: () => PartidaIgnoradosDto,
    description: 'Partida con NOMBRE PROPIO (REQ-ICB-02): los libros nunca lo registrarán.',
  })
  ignorados!: PartidaIgnoradosDto;
  @ApiProperty({
    type: () => PartidaEnTransitoDto,
    description: 'Los libros lo registraron; el banco, al corte, no.',
  })
  enTransito!: PartidaEnTransitoDto;
  @ApiProperty({ type: () => PartidaArranqueDto })
  arranque!: PartidaArranqueDto;
}

export class MotivoNoConciliadoDto {
  @ApiProperty({ enum: MOTIVOS_NO_CONCILIADO })
  tipo!: (typeof MOTIVOS_NO_CONCILIADO)[number];
  @ApiPropertyOptional({ description: 'Solo DESCUADRE.' }) importacionId?: string;
  @ApiPropertyOptional({ example: '2026-07-11', description: 'Solo HUECO.' }) desde?: string;
  @ApiPropertyOptional({ example: '2026-07-19', description: 'Solo HUECO.' }) hasta?: string;
  @ApiPropertyOptional({ description: 'Solo DISCONTINUIDAD.' }) anteriorId?: string;
  @ApiPropertyOptional({ description: 'Solo DISCONTINUIDAD.' }) siguienteId?: string;
  @ApiPropertyOptional({
    example: '200.00',
    description: 'Solo DISCONTINUIDAD y los dos ARRANQUE_*_NO_COINCIDE. Siempre positiva.',
  })
  diferencia?: string;
  @ApiPropertyOptional({ example: '-0.01', description: 'Solo RESIDUO_NO_EXPLICADO. Firmado.' })
  importe?: string;
  @ApiPropertyOptional({
    example: '2026-06-05',
    description: 'Solo los dos ARRANQUE_*_NO_COINCIDE: la fecha del arranque contrastado.',
  })
  fecha?: string;
  @ApiPropertyOptional({
    example: '15.99',
    description:
      'Solo los dos ARRANQUE_*_NO_COINCIDE: el saldo DECLARADO en el arranque ' +
      'vigente — de extracto o de libros según el motivo.',
  })
  declarado?: string;
  @ApiPropertyOptional({
    example: '714.99',
    description:
      'Solo los dos ARRANQUE_*_NO_COINCIDE: el saldo REAL a la fecha del arranque ' +
      '— del extracto o del mayor según el motivo.',
  })
  real?: string;
}

/** Partida abierta PROPUESTA al declarar un arranque (REQ-ICB-04). */
export class CandidatoPartidaArranqueDto {
  @ApiProperty({
    example: 'LIN:9f3a-…:1',
    description: 'Referencia estable con la que se confirma esta partida en el POST.',
  })
  referencia!: string;
  @ApiProperty({ enum: ['MOVIMIENTO_PENDIENTE', 'MOVIMIENTO_IGNORADO', 'LINEA'] })
  origen!: 'MOVIMIENTO_PENDIENTE' | 'MOVIMIENTO_IGNORADO' | 'LINEA';
  @ApiProperty({ example: '2026-06-20' }) fecha!: string;
  @ApiProperty({
    example: '-400.00',
    description: 'Contribución FIRMADA extracto→libros. Sale del dato, no del cliente.',
  })
  importe!: string;
  @ApiProperty({ example: 'Pago a proveedor con cheque 4471' })
  descripcion!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Solo en LINEA: para abrir el asiento sin abandonar la declaración. Decidir si un ' +
      'comprobante viejo es un cheque en circulación o la apertura suele exigir verlo entero.',
  })
  comprobanteId!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'D2606-000012' })
  numeroComprobante!: string | null;
}

export class ConfiabilidadInformeDto {
  @ApiProperty({
    description:
      'true SOLO con arranque declarado, saldo de extracto publicado, insumos ' +
      'sanos y residuo cero exacto. La confiabilidad CALIFICA el informe, nunca ' +
      'lo suprime (REQ-ICB-05).',
  })
  conciliado!: boolean;
  @ApiProperty({ type: () => [MotivoNoConciliadoDto] })
  motivos!: MotivoNoConciliadoDto[];
}

export class ImportacionInsumoDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '2026-07-01' }) fechaDesde!: string;
  @ApiProperty({ example: '2026-07-31' }) fechaHasta!: string;
  @ApiProperty({ enum: EstadoVerificacionExtracto })
  estadoVerificacion!: EstadoVerificacionExtracto;
}

export class InsumosInformeDto {
  @ApiProperty({
    type: () => [ImportacionInsumoDto],
    description: 'Importaciones que cubren el rango del informe (REQ-ICB-08).',
  })
  importaciones!: ImportacionInsumoDto[];
}

export class InformeConciliacionResponseDto {
  @ApiProperty({ type: () => CuentaBancariaInformeDto })
  cuentaBancaria!: CuentaBancariaInformeDto;
  @ApiProperty({ example: '2026-07-31' }) corte!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Saldo del último movimiento ≤ corte. null si ninguno publica saldo (REQ-ICB-03).',
  })
  saldoExtracto!: string | null;
  @ApiProperty({ example: '990.00' }) saldoLibros!: string;
  @ApiProperty({
    type: () => ArranqueAplicadoDto,
    nullable: true,
    description: 'null ⇔ sin arranque declarado: el informe se emite ABSTENIDO (REQ-ICB-04).',
  })
  arranque!: ArranqueAplicadoDto | null;
  @ApiProperty({ type: () => PartidasInformeDto, nullable: true })
  partidas!: PartidasInformeDto | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Lo que las partidas NO explican. Se expone tal cual, jamás se ajusta ni ' +
      'se reparte (REQ-ICB-06). null sin arranque o sin saldo de extracto.',
  })
  residuo!: string | null;
  @ApiProperty({ type: () => ConfiabilidadInformeDto })
  confiabilidad!: ConfiabilidadInformeDto;
  @ApiProperty({ type: () => InsumosInformeDto })
  insumos!: InsumosInformeDto;
}

// ============================================================
// Mapper — boundary Money/FechaContable → string
// ============================================================

function aMotivoDto(motivo: MotivoNoConciliado): MotivoNoConciliadoDto {
  switch (motivo.tipo) {
    case 'SIN_ARRANQUE':
    case 'SIN_SALDO_EXTRACTO':
      return { tipo: motivo.tipo };
    case 'ARRANQUE_EXTRACTO_NO_COINCIDE':
    case 'ARRANQUE_LIBROS_NO_COINCIDE':
      return {
        tipo: motivo.tipo,
        fecha: motivo.fecha.toIso(),
        declarado: motivo.declarado.toBob(),
        real: motivo.real.toBob(),
        diferencia: motivo.diferencia.toBob(),
      };
    case 'DESCUADRE':
      return { tipo: motivo.tipo, importacionId: motivo.importacionId };
    case 'HUECO':
      return { tipo: motivo.tipo, desde: motivo.desde.toIso(), hasta: motivo.hasta.toIso() };
    case 'DISCONTINUIDAD':
      return {
        tipo: motivo.tipo,
        anteriorId: motivo.anteriorId,
        siguienteId: motivo.siguienteId,
        diferencia: motivo.diferencia.toBob(),
      };
    case 'RESIDUO_NO_EXPLICADO':
      return { tipo: motivo.tipo, importe: motivo.importe.toBob() };
  }
}

export function toCandidatoPartidaResponse(
  c: CandidatoPartidaArranque,
): CandidatoPartidaArranqueDto {
  return {
    referencia: c.referencia,
    origen: c.origen,
    fecha: c.fecha.toIso(),
    importe: c.importe.toBob(),
    descripcion: c.descripcion,
    comprobanteId: c.comprobanteId,
    numeroComprobante: c.numeroComprobante,
  };
}

/** También es la respuesta del `POST` de arranque (task 3.8): mismo acto, mismo shape. */
export function toArranqueAplicadoResponse(arranque: ArranqueAplicadoView): ArranqueAplicadoDto {
  return {
    id: arranque.id,
    fecha: arranque.fecha.toIso(),
    saldoExtracto: arranque.saldoExtracto.toBob(),
    saldoLibros: arranque.saldoLibros.toBob(),
    diferenciaResidual: arranque.diferenciaResidual.toBob(),
    nota: arranque.nota,
    declaradoPorUserId: arranque.declaradoPorUserId,
    declaradoPorNombre: arranque.declaradoPorNombre,
    declaradoEl: arranque.declaradoEl.toISOString(),
    anulado: arranque.anulado,
    motivoAnulacion: arranque.motivoAnulacion,
    anuladoPorUserId: arranque.anuladoPorUserId,
    anuladoPorNombre: arranque.anuladoPorNombre,
    anuladoEl: arranque.anuladoEl === null ? null : arranque.anuladoEl.toISOString(),
  };
}

export function toInformeConciliacionResponse(
  r: InformeConciliacionResultado,
): InformeConciliacionResponseDto {
  return {
    cuentaBancaria: r.cuentaBancaria,
    corte: r.corte.toIso(),
    saldoExtracto: r.saldoExtracto === null ? null : r.saldoExtracto.toBob(),
    saldoLibros: r.saldoLibros.toBob(),
    arranque: r.arranque === null ? null : toArranqueAplicadoResponse(r.arranque),
    partidas:
      r.partidas === null
        ? null
        : {
            pendientes: {
              importe: r.partidas.pendientes.importe.toBob(),
              detalle: r.partidas.pendientes.detalle.map((d) => ({
                movimientoId: d.movimientoId,
                fecha: d.fecha.toIso(),
                importe: d.importe.toBob(),
                asentadoEl: d.asentadoEl === null ? null : d.asentadoEl.toIso(),
                anteriorAlArranque: d.anteriorAlArranque,
              })),
            },
            ignorados: {
              importe: r.partidas.ignorados.importe.toBob(),
              detalle: r.partidas.ignorados.detalle.map((d) => ({
                movimientoId: d.movimientoId,
                fecha: d.fecha.toIso(),
                importe: d.importe.toBob(),
                anteriorAlArranque: d.anteriorAlArranque,
              })),
            },
            enTransito: {
              importe: r.partidas.enTransito.importe.toBob(),
              detalle: r.partidas.enTransito.detalle.map((d) => ({
                comprobanteId: d.comprobanteId,
                orden: d.orden,
                fecha: d.fecha.toIso(),
                importe: d.importe.toBob(),
                registradoPorBancoEl:
                  d.registradoPorBancoEl === null ? null : d.registradoPorBancoEl.toIso(),
                anteriorAlArranque: d.anteriorAlArranque,
              })),
            },
            arranque: {
              fecha: r.partidas.arranque.fecha.toIso(),
              importe: r.partidas.arranque.importe.toBob(),
            },
          },
    residuo: r.residuo === null ? null : r.residuo.toBob(),
    confiabilidad: {
      conciliado: r.confiabilidad.conciliado,
      motivos: r.confiabilidad.motivos.map(aMotivoDto),
    },
    insumos: {
      importaciones: r.insumos.importaciones.map((i) => ({
        id: i.id,
        fechaDesde: i.fechaDesde.toIso(),
        fechaHasta: i.fechaHasta.toIso(),
        estadoVerificacion: i.estadoVerificacion,
      })),
    },
  };
}
