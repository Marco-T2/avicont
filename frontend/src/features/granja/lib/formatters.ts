// Formateadores puros para el módulo granja.
// Sin React, sin I/O, sin side effects — testables directamente.

import { formatearFechaContable } from '@/lib/formatear-fecha-contable';

/**
 * Formatea el costo por pollo vivo.
 * `null` indica mortalidad total (avesVivas = 0) — se muestra como "—".
 * Un string decimal se muestra como "Bs {valor}".
 */
export function formatCostoPorPollo(value: string | null): string {
  if (value === null) return '—';
  return `Bs ${value}`;
}

/**
 * Formatea la tasa de mortalidad como porcentaje con 2 decimales.
 * Recibe un valor 0..1 (ej. 0.0512) y devuelve "5.12%".
 */
export function formatPorcentajeMortalidad(rate: number): string {
  const pct = (rate * 100).toFixed(2);
  return `${pct}%`;
}

/**
 * Convierte una fecha granja "YYYY-MM-DD" a "dd/MM/yyyy".
 *
 * Delega en el helper compartido: el criterio de presentación es IDÉNTICO al
 * del resto del sistema. Acá vivía una copia con su propio `Intl.DateTimeFormat`
 * y el comentario "no se reusa porque granja formatea con su propio criterio",
 * que era falso — y arrastraba el mismo bug de zona horaria que el original
 * (§4.6: una fecha de calendario no se convierte entre zonas).
 *
 * Se conserva el nombre porque es el vocabulario de la feature.
 *
 * Ejemplo: '2026-06-15' → '15/06/2026'.
 */
export function formatFechaGranja(fechaIso: string): string {
  return formatearFechaContable(fechaIso);
}
