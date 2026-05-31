import { formatFechaContable, parseFechaContable } from './fecha-contable';

describe('fecha-contable (helpers compartidos de reportes)', () => {
  describe('parseFechaContable', () => {
    it('parsea "YYYY-MM-DD" a Date en UTC calendario puro', () => {
      const fecha = parseFechaContable('2026-05-31');

      expect(fecha).not.toBeNull();
      expect(fecha!.getUTCFullYear()).toBe(2026);
      expect(fecha!.getUTCMonth()).toBe(4); // 0-indexed → mayo
      expect(fecha!.getUTCDate()).toBe(31);
      expect(fecha!.getUTCHours()).toBe(0);
    });

    it('devuelve null si el formato no es YYYY-MM-DD', () => {
      expect(parseFechaContable('31/05/2026')).toBeNull();
      expect(parseFechaContable('2026-5-31')).toBeNull();
      expect(parseFechaContable('hoy')).toBeNull();
    });

    it('devuelve null para cadena vacía', () => {
      expect(parseFechaContable('')).toBeNull();
    });

    it('devuelve null para fechas calendario imposibles (no hace rollover silencioso)', () => {
      // 30 de febrero: el regex lo deja pasar pero la fecha no existe.
      // Sin esta validación new Date(Date.UTC(...)) rodaría a marzo (bug latente).
      expect(parseFechaContable('2026-02-30')).toBeNull();
      expect(parseFechaContable('2026-13-01')).toBeNull();
      expect(parseFechaContable('2026-00-10')).toBeNull();
      expect(parseFechaContable('2026-04-31')).toBeNull(); // abril tiene 30 días
    });

    it('acepta 29 de febrero en año bisiesto', () => {
      const fecha = parseFechaContable('2024-02-29');
      expect(fecha).not.toBeNull();
      expect(fecha!.getUTCMonth()).toBe(1);
      expect(fecha!.getUTCDate()).toBe(29);
    });
  });

  describe('formatFechaContable', () => {
    it('serializa Date UTC a "YYYY-MM-DD"', () => {
      const date = new Date(Date.UTC(2026, 4, 31));
      expect(formatFechaContable(date)).toBe('2026-05-31');
    });

    it('rellena con cero mes y día de un solo dígito', () => {
      const date = new Date(Date.UTC(2026, 0, 5)); // 5 de enero
      expect(formatFechaContable(date)).toBe('2026-01-05');
    });

    it('es inversa de parseFechaContable para fechas válidas', () => {
      const parsed = parseFechaContable('2026-12-09');
      expect(formatFechaContable(parsed!)).toBe('2026-12-09');
    });
  });
});
