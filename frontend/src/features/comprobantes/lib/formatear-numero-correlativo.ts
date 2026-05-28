/**
 * Renderiza el número correlativo de un comprobante.
 * Retorna "—" para null, undefined o string vacío (caso BORRADOR sin número).
 *
 * Exporta también `prefijoDe` y `secuenciaDe` para renderizar el correlativo
 * con segmento "muted" en UI: `<span>{prefijo}</span><span className="text-muted-foreground">-{seq}</span>`.
 */
export function formatearNumeroCorrelativo(numero: string | null | undefined): string {
  if (numero === null || numero === undefined || numero === '') return '—';
  return numero;
}

/**
 * Extrae la parte del prefijo (antes del guión) de un correlativo.
 * Ej: "D2604-000042" → "D2604".
 * Retorna el string completo si no hay guión.
 * Retorna null para null/undefined.
 */
export function prefijoDe(numero: string | null | undefined): string | null {
  if (numero === null || numero === undefined || numero === '') return null;
  const idx = numero.indexOf('-');
  return idx === -1 ? numero : numero.slice(0, idx);
}

/**
 * Extrae la parte de secuencia (después del guión) de un correlativo.
 * Ej: "D2604-000042" → "000042".
 * Retorna null si no hay guión o para null/undefined.
 */
export function secuenciaDe(numero: string | null | undefined): string | null {
  if (numero === null || numero === undefined || numero === '') return null;
  const idx = numero.indexOf('-');
  return idx === -1 ? null : numero.slice(idx + 1);
}
