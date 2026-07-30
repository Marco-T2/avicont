import { describe, expect, it } from 'vitest';

import { formatearFechaContable } from './formatear-fecha-contable';

describe('formatearFechaContable — helper compartido (src/lib)', () => {
  it('convierte YYYY-MM-DD al formato dd/MM/yyyy', () => {
    expect(formatearFechaContable('2026-05-01')).toBe('01/05/2026');
  });

  it('convierte una fecha de julio correctamente', () => {
    expect(formatearFechaContable('2026-07-15')).toBe('15/07/2026');
  });

  it('mantiene el día correcto sin corrimiento UTC en fin de año', () => {
    expect(formatearFechaContable('2025-12-31')).toBe('31/12/2025');
  });

  it('mantiene el día correcto sin corrimiento UTC en inicio de año', () => {
    expect(formatearFechaContable('2026-01-01')).toBe('01/01/2026');
  });

  it('rellena con cero los días y meses de un dígito', () => {
    expect(formatearFechaContable('2026-05-03')).toBe('03/05/2026');
  });

  // §4.6: una fecha contable es calendario PURO. La implementación anterior
  // hacía `new Date(`${iso}T12:00:00`)` —que parsea en la zona del NAVEGADOR—
  // y recién después formateaba en America/La_Paz: dos conversiones donde no
  // debería haber ninguna. Desde UTC+9 el mediodía local cae en el día
  // anterior en La Paz y la fecha se renderizaba corrida un día.
  //
  // Este test no puede cambiar la zona del proceso (Intl la cachea al cargar
  // el módulo), así que congela la propiedad de la que dependía el bug: el
  // resultado NO puede pasar por Date. Si alguien reintroduce un Date, el
  // stub lo detecta.
  it('no construye ningún Date — es string puro, independiente de la zona horaria', () => {
    const DateReal = globalThis.Date;
    const construcciones: string[] = [];
    class DateEspia extends DateReal {
      constructor(...args: ConstructorParameters<typeof DateReal>) {
        construcciones.push(String(args[0]));
        super(...args);
      }
    }
    globalThis.Date = DateEspia as unknown as DateConstructor;
    try {
      expect(formatearFechaContable('2026-07-01')).toBe('01/07/2026');
    } finally {
      globalThis.Date = DateReal;
    }
    expect(construcciones).toEqual([]);
  });

  // Falla RUIDOSA, no silenciosa: un timestamp mal pasado devolvería su fecha
  // UTC (plausible pero equivocada). Se devuelve la entrada tal cual para que
  // el error se vea en pantalla en vez de propagarse como un día corrido.
  it('devuelve la entrada intacta si no es exactamente YYYY-MM-DD', () => {
    expect(formatearFechaContable('2026-07-01T00:00:00.000Z')).toBe(
      '2026-07-01T00:00:00.000Z',
    );
    expect(formatearFechaContable('')).toBe('');
  });
});
