import { leerFechaCelda } from './fechas';
import type { DialectoFecha } from './fechas';

const SERIAL_EXCEL: DialectoFecha = { tipo: 'SERIAL_EXCEL' };
const TEXTO_ES: DialectoFecha = { tipo: 'TEXTO_ES_DD_MMM_YYYY' };
const DD_MM_YYYY: DialectoFecha = { tipo: 'DD_MM_YYYY' };
const YYYYMMDD: DialectoFecha = { tipo: 'YYYYMMDD' };

// Boundary de parsing — testeable sin DB (design §8.2). `new Date(string)`
// PROHIBIDO en todo este archivo: depende del locale del proceso.
describe('leerFechaCelda (design §8.2, caso #953)', () => {
  describe('SERIAL_EXCEL — BancoSol', () => {
    it('caso real: 46224.6478587963 → 2026-07-21, hora 15:32:55 (época 1899-12-30, bug bisiesto 1900)', () => {
      const resultado = leerFechaCelda('46224.6478587963', SERIAL_EXCEL);
      expect(resultado.fecha.toIso()).toBe('2026-07-21');
      expect(resultado.hora).toBe('15:32:55');
    });

    it('serial sin parte fraccionaria → hora null', () => {
      const resultado = leerFechaCelda('46224', SERIAL_EXCEL);
      expect(resultado.fecha.toIso()).toBe('2026-07-21');
      expect(resultado.hora).toBeNull();
    });

    it('rechaza serial fuera del rango 1 ≤ ent ≤ 60000', () => {
      expect(() => leerFechaCelda('0', SERIAL_EXCEL)).toThrow();
      expect(() => leerFechaCelda('60001', SERIAL_EXCEL)).toThrow();
    });

    it('serial en el borde inferior aceptado por el guard (2) resuelve a una fecha válida', () => {
      // 1899-12-30 + 2 días = 1900-01-01 — el mínimo year aceptado por
      // FechaContable (CLAUDE.md §4.6). Serial=1 resolvería a 1899-12-31,
      // año 1899, y FechaContable.of lo rechazaría como segunda capa de
      // defensa (nunca ocurre con datos reales de un extracto boliviano).
      expect(leerFechaCelda('2', SERIAL_EXCEL).fecha.toIso()).toBe('1900-01-01');
    });

    it('serial=1 pasa el guard 1≤ent≤60000 pero FechaContable rechaza el año resultante (1899) — defensa en profundidad', () => {
      expect(() => leerFechaCelda('1', SERIAL_EXCEL)).toThrow();
    });

    it('rechaza celda vacía', () => {
      expect(() => leerFechaCelda('', SERIAL_EXCEL)).toThrow();
    });
  });

  describe('TEXTO_ES_DD_MMM_YYYY — Económico', () => {
    it('caso real: 03/Jun/2026', () => {
      const resultado = leerFechaCelda('03/Jun/2026', TEXTO_ES);
      expect(resultado.fecha.toIso()).toBe('2026-06-03');
      expect(resultado.hora).toBeNull();
    });

    it('mapa completo de meses en español, sin diacríticos', () => {
      const casos: Array<[string, string]> = [
        ['01/Ene/2026', '01'],
        ['01/Feb/2026', '02'],
        ['01/Mar/2026', '03'],
        ['01/Abr/2026', '04'],
        ['01/May/2026', '05'],
        ['01/Jun/2026', '06'],
        ['01/Jul/2026', '07'],
        ['01/Ago/2026', '08'],
        ['01/Sep/2026', '09'],
        ['01/Oct/2026', '10'],
        ['01/Nov/2026', '11'],
        ['01/Dic/2026', '12'],
      ];
      for (const [raw, mesEsperado] of casos) {
        expect(leerFechaCelda(raw, TEXTO_ES).fecha.toIso()).toBe(`2026-${mesEsperado}-01`);
      }
    });

    it('SET es alias de SEP (setiembre, variante ortográfica boliviana)', () => {
      expect(leerFechaCelda('15/Set/2026', TEXTO_ES).fecha.toIso()).toBe('2026-09-15');
    });

    it('acepta mes en mayúsculas', () => {
      expect(leerFechaCelda('03/JUN/2026', TEXTO_ES).fecha.toIso()).toBe('2026-06-03');
    });

    it('rechaza mes no reconocido', () => {
      expect(() => leerFechaCelda('03/Xyz/2026', TEXTO_ES)).toThrow();
    });

    it('rechaza formato sin las 3 partes', () => {
      expect(() => leerFechaCelda('03/2026', TEXTO_ES)).toThrow();
    });
  });

  describe('DD_MM_YYYY — Unión XLSX', () => {
    it('caso real: 02/04/2026 (sin hora)', () => {
      const resultado = leerFechaCelda('02/04/2026', DD_MM_YYYY);
      expect(resultado.fecha.toIso()).toBe('2026-04-02');
      expect(resultado.hora).toBeNull();
    });

    it('con hora — split por espacio, ej. 22/07/2026 09:01', () => {
      const resultado = leerFechaCelda('22/07/2026 09:01', DD_MM_YYYY);
      expect(resultado.fecha.toIso()).toBe('2026-07-22');
      expect(resultado.hora).toBe('09:01:00');
    });

    it('con hora ya en formato HH:MM:SS la conserva', () => {
      const resultado = leerFechaCelda('22/07/2026 09:01:30', DD_MM_YYYY);
      expect(resultado.hora).toBe('09:01:30');
    });

    it('rechaza formato sin las 3 partes', () => {
      expect(() => leerFechaCelda('07/2026', DD_MM_YYYY)).toThrow();
    });
  });

  describe('YYYYMMDD — BCP XLSX', () => {
    it('caso real del fixture: 20260701 → 2026-07-01, sin hora (BCP la trae en columna aparte)', () => {
      const resultado = leerFechaCelda('20260701', YYYYMMDD);
      expect(resultado.fecha.toIso()).toBe('2026-07-01');
      expect(resultado.hora).toBeNull();
    });

    it('tolera padding — la celda llega como string crudo del XLSX', () => {
      expect(leerFechaCelda('  20260715  ', YYYYMMDD).fecha.toIso()).toBe('2026-07-15');
    });

    // El riesgo real de este dialecto es el `slice` ciego: cortar posiciones
    // fijas sobre una cadena que NO es YYYYMMDD produce una fecha plausible
    // pero equivocada, y una fecha mal leída se propaga hasta el hash de
    // dedup sin que nada la detecte. Por eso se exige la forma exacta.
    it('rechaza una fecha con separadores en vez de cortarla a ciegas', () => {
      expect(() => leerFechaCelda('2026-07-01', YYYYMMDD)).toThrow(RangeError);
    });

    it('rechaza cadenas de largo distinto de 8', () => {
      expect(() => leerFechaCelda('2026071', YYYYMMDD)).toThrow(RangeError);
      expect(() => leerFechaCelda('202607011', YYYYMMDD)).toThrow(RangeError);
    });

    it('rechaza una cadena de 8 caracteres que no sean todos dígitos', () => {
      expect(() => leerFechaCelda('2026JUL1', YYYYMMDD)).toThrow(RangeError);
    });

    it('rechaza una fecha de calendario imposible (delega en FechaContable)', () => {
      expect(() => leerFechaCelda('20260231', YYYYMMDD)).toThrow();
    });
  });

  it('nunca usa new Date(string) — un string ambiguo para el locale del proceso no explota distinto según TZ', () => {
    // Regresión estructural: '13/02/2026' NO es un mes 13 válido en
    // DD/MM/YYYY (día=13, mes=02) y debe parsear sin lanzar — si el código
    // usara `new Date('13/02/2026')` el resultado dependería del locale.
    const resultado = leerFechaCelda('13/02/2026', DD_MM_YYYY);
    expect(resultado.fecha.toIso()).toBe('2026-02-13');
  });
});
