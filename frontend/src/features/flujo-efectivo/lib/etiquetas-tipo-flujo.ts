import type { EstadoFlujoEfectivoResponse } from '@/types/api';

/** Tipo de línea del flujo de efectivo (valores del enum del backend). */
export type LineaFlujoTipo =
  EstadoFlujoEfectivoResponse['operacion']['lineas'][number]['tipo'];

/**
 * Mapa de tipo enum de línea de flujo → etiqueta legible en español.
 *
 * El backend devuelve literales del enum; mostrarlos crudos sería ruido técnico
 * para el contador. Esta función pura convierte el literal a un label accesible.
 */
export const ETIQUETAS_TIPO_FLUJO: Record<LineaFlujoTipo, string> = {
  RESULTADO_EJERCICIO: 'Resultado del ejercicio',
  PARTIDA_NO_MONETARIA: 'Partida no monetaria',
  VARIACION_CAPITAL_TRABAJO: 'Variación de capital de trabajo',
  VARIACION_CUENTA: 'Variación de cuenta',
};

export function etiquetaTipoFlujo(tipo: LineaFlujoTipo): string {
  return ETIQUETAS_TIPO_FLUJO[tipo];
}
