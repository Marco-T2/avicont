/**
 * Puerto para acceder a "hoy" de forma determinista y con TZ explícita.
 *
 * Existe para que el dominio NO use `new Date()` directo (Anti-20 del
 * CLAUDE.md §8.1) y para que los tests puedan congelar el tiempo con
 * `FakeClockAdapter` sin sobreescribir globales.
 */
export abstract class ClockPort {
  /** Instante actual en UTC. Timestamp exacto del momento (auditoría, createdAt, etc.). */
  abstract now(): Date;

  /**
   * Año calendario actual en zona `America/La_Paz`.
   * Ej: si son las 22:00 UTC del 31/12/2026 (= 18:00 La Paz), devuelve 2026.
   * Ej: si son las 02:00 UTC del 01/01/2027 (= 22:00 La Paz del 31/12/2026), devuelve 2026.
   */
  abstract currentYearLaPaz(): number;

  /**
   * Fecha calendario actual en zona `America/La_Paz` en formato ISO `YYYY-MM-DD`.
   * Usada para validaciones como "fechaContable <= hoy" que deben operar en
   * calendario boliviano, nunca UTC.
   */
  abstract currentDateLaPaz(): string;
}

/** Token de inyección para NestJS. */
export const CLOCK_PORT = Symbol('CLOCK_PORT');
