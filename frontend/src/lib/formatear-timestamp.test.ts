import { describe, expect, it } from 'vitest';

import { formatearTimestampLaPaz } from './formatear-timestamp';

describe('formatearTimestampLaPaz', () => {
  it('formatea un instante UTC como dd/mm/yyyy, hh:mm', () => {
    expect(formatearTimestampLaPaz('2026-07-01T10:00:00.000Z')).toBe('01/07/2026, 06:00');
  });

  it('corre el día hacia atrás cuando en La Paz todavía no cruzó la medianoche', () => {
    // 02:00 UTC del 1 de julio son las 22:00 del 30 de junio en Bolivia (UTC-4).
    // Mostrar el día UTC le daría al contador una fecha que él no vivió (§4.6).
    expect(formatearTimestampLaPaz('2026-07-01T02:00:00.000Z')).toBe('30/06/2026, 22:00');
  });

  it('usa reloj de 24 horas, sin am/pm', () => {
    expect(formatearTimestampLaPaz('2026-07-01T23:30:00.000Z')).toBe('01/07/2026, 19:30');
  });
});
