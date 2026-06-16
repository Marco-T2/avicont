/**
 * Helpers compartidos de fecha del módulo `reportes`.
 *
 * Centraliza el parseo y formateo de FechaContable (§4.6 CLAUDE.md — calendario
 * puro, sin tz). Antes vivía duplicado en cada servicio/DTO de reporte (deuda D-02
 * del change reportes-estado-resultados).
 *
 * PROHIBIDO en domain/service: `new Date()` para "hoy" (§4.6). Estos helpers
 * parsean/formatean fechas provistas por el cliente, no generan la fecha actual.
 */

/**
 * Parsea "YYYY-MM-DD" a Date en UTC (FechaContable calendario puro, §4.6).
 *
 * No usa `new Date(string)` directamente — el parse de ISO sin hora es
 * implementation-defined (local vs UTC). Construye explícitamente en UTC y
 * valida que la fecha exista realmente (rechaza imposibles como 2026-02-30,
 * que el regex de formato dejaría pasar pero `Date.UTC` rodaría a marzo).
 *
 * @returns la Date en UTC, o `null` si el formato es inválido o la fecha no existe.
 */
export function parseFechaContable(fecha: string): Date | null {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;

  const parts = fecha.split('-');
  const year = parseInt(parts[0] ?? '0', 10);
  const month = parseInt(parts[1] ?? '0', 10) - 1; // 0-indexed
  const day = parseInt(parts[2] ?? '0', 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const date = new Date(Date.UTC(year, month, day));
  // Evita rollover silencioso: 2026-02-30 → 2026-03-02. Si los componentes no
  // sobreviven el round-trip, la fecha calendario no existe.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return null;
  }

  return date;
}

/**
 * Día calendario anterior a `date`, en UTC (FechaContable calendario puro, §4.6).
 *
 * Usado por el Estado de Evolución del Patrimonio Neto para obtener el saldo
 * INICIAL del período: los saldos acumulados deben cortar en el día PREVIO al
 * inicio del rango, para que `saldoInicial + movimiento(rango) = saldoFinal`
 * sin hueco ni solape.
 *
 * `Date.UTC` con día 0 (o negativo) rueda correctamente al mes/año anterior
 * (ej. 2026-01-01 → 2025-12-31). No usa `new Date()` sin args (§4.6).
 */
export function diaAnterior(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1));
}

/**
 * Serializa una Date (UTC) a string "YYYY-MM-DD" para respuestas HTTP.
 */
export function formatFechaContable(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
