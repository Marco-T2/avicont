import type {
  ConfianzaSugerencia,
  EstadoEfectivoLinea,
  EstadoEfectivoMovimiento,
  LineaConciliacion,
  MotivoVinculoRoto,
  MovimientoConciliacion,
} from '@/types/api';

/** Perspectiva del BANCO (el extracto). */
type LadoBancario = MovimientoConciliacion['tipo'];
/** Perspectiva de la EMPRESA (los libros). */
type LadoContable = LineaConciliacion['tipo'];

/**
 * Traducciones al español de los motivos de vínculo roto (REQ-CB-10).
 *
 * El motivo NO se puede tragar: cuando el ancla de un match deja de calzar, el
 * movimiento vuelve a mostrarse `PENDIENTE` y el contador necesita saber POR QUÉ
 * se rompió para decidir si re-confirma o corrige el asiento.
 */
const MOTIVO_VINCULO_ROTO: Record<MotivoVinculoRoto, string> = {
  LINEA_INEXISTENTE: 'La línea contable ya no existe',
  COMPROBANTE_ANULADO: 'El comprobante fue anulado',
  CUENTA_CAMBIADA: 'La cuenta de la línea cambió',
  MONTO_CAMBIADO: 'El monto de la línea cambió',
  LADO_CAMBIADO: 'La línea pasó de débito a crédito (o al revés)',
  MONEDA_CAMBIADA: 'La moneda de la línea cambió',
  FECHA_CAMBIADA: 'La fecha de la línea cambió',
};

export function etiquetaMotivoVinculoRoto(motivo: MotivoVinculoRoto): string {
  return MOTIVO_VINCULO_ROTO[motivo];
}

const ESTADO_EFECTIVO_MOVIMIENTO: Record<EstadoEfectivoMovimiento, string> = {
  PENDIENTE: 'Pendiente',
  CONCILIADO: 'Conciliado',
  IGNORADO: 'Ignorado',
};

export function etiquetaEstadoEfectivoMovimiento(estado: EstadoEfectivoMovimiento): string {
  return ESTADO_EFECTIVO_MOVIMIENTO[estado];
}

const ESTADO_EFECTIVO_LINEA: Record<EstadoEfectivoLinea, string> = {
  EN_TRANSITO: 'En tránsito',
  CONCILIADO: 'Conciliado',
};

export function etiquetaEstadoEfectivoLinea(estado: EstadoEfectivoLinea): string {
  return ESTADO_EFECTIVO_LINEA[estado];
}

/**
 * El extracto está escrito desde la perspectiva del BANCO: un CREDITO es plata
 * que ENTRA a la cuenta. Espeja `ladoContableEsperado` del backend — la
 * inversión de lado es la pieza más fácil de equivocar (design §5.1), así que
 * la etiqueta lo dice en voz alta en vez de dejarlo a la intuición.
 */
const LADO_BANCARIO: Record<LadoBancario, string> = {
  CREDITO: 'Crédito (entrada)',
  DEBITO: 'Débito (salida)',
};

export function etiquetaLadoBancario(lado: LadoBancario): string {
  return LADO_BANCARIO[lado];
}

/** Perspectiva de la EMPRESA: el vocabulario del contador boliviano. */
const LADO_CONTABLE: Record<LadoContable, string> = {
  DEBITO: 'Debe',
  CREDITO: 'Haber',
};

export function etiquetaLadoContable(lado: LadoContable): string {
  return LADO_CONTABLE[lado];
}

const CONFIANZA: Record<ConfianzaSugerencia, string> = {
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
};

export function etiquetaConfianza(confianza: ConfianzaSugerencia): string {
  return CONFIANZA[confianza];
}
