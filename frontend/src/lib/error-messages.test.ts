import { describe, expect, it } from 'vitest';

import { mensajePeriodosFiscales } from './error-messages';

// Construye un error con shape de axios.
function err(
  code: string,
  details?: Record<string, unknown>,
  message?: string,
): { response: { data: { code: string; message?: string; details?: unknown } } } {
  return {
    response: {
      data: {
        code,
        ...(message !== undefined ? { message } : {}),
        ...(details !== undefined ? { details } : {}),
      },
    },
  };
}

describe('mensajePeriodosFiscales', () => {
  it('GESTION_DUPLICADA con year en details', () => {
    const msg = mensajePeriodosFiscales(err('GESTION_DUPLICADA', { year: 2026 }));
    expect(msg).toBe('Ya existe una gestión para el año 2026.');
  });

  it('GESTION_DUPLICADA sin year cae a fallback genérico', () => {
    const msg = mensajePeriodosFiscales(err('GESTION_DUPLICADA'));
    expect(msg).toBe('Ya existe una gestión para ese año.');
  });

  it('GESTION_YEAR_FUERA_DE_RANGO con minYear/maxYear', () => {
    const msg = mensajePeriodosFiscales(
      err('GESTION_YEAR_FUERA_DE_RANGO', { minYear: 2000, maxYear: 2027 }),
    );
    expect(msg).toBe('El año debe estar entre 2000 y 2027.');
  });

  it('GESTION_YEAR_FUERA_DE_RANGO sin details usa fallback', () => {
    const msg = mensajePeriodosFiscales(err('GESTION_YEAR_FUERA_DE_RANGO'));
    expect(msg).toContain('El año debe estar entre');
  });

  it('GESTION_CON_PERIODOS_ABIERTOS formatea lista de meses', () => {
    const msg = mensajePeriodosFiscales(
      err('GESTION_CON_PERIODOS_ABIERTOS', {
        periodosAbiertos: [
          { year: 2026, month: 8, orden: 8 },
          { year: 2026, month: 11, orden: 11 },
        ],
      }),
    );
    expect(msg).toBe('Faltan cerrar: Agosto 2026, Noviembre 2026.');
  });

  it('GESTION_CON_PERIODOS_ABIERTOS sin lista cae al genérico', () => {
    const msg = mensajePeriodosFiscales(err('GESTION_CON_PERIODOS_ABIERTOS'));
    expect(msg).toBe('Hay períodos abiertos. Cerralos antes de cerrar la gestión.');
  });

  it('PERIODO_CERRADO', () => {
    expect(mensajePeriodosFiscales(err('PERIODO_CERRADO'))).toBe(
      'El período ya está cerrado.',
    );
  });

  it('PERIODO_YA_ABIERTO', () => {
    expect(mensajePeriodosFiscales(err('PERIODO_YA_ABIERTO'))).toBe(
      'El período ya está abierto.',
    );
  });

  it('PERIODO_DEFINITIVO_NO_REABRIBLE', () => {
    expect(mensajePeriodosFiscales(err('PERIODO_DEFINITIVO_NO_REABRIBLE'))).toBe(
      'Este período fue marcado definitivo y no puede reabrirse.',
    );
  });

  it('MOTIVO_REAPERTURA_INVALIDO', () => {
    expect(mensajePeriodosFiscales(err('MOTIVO_REAPERTURA_INVALIDO'))).toBe(
      'El motivo debe tener al menos 20 caracteres.',
    );
  });

  it('PERIODO_CON_BORRADORES', () => {
    expect(mensajePeriodosFiscales(err('PERIODO_CON_BORRADORES'))).toBe(
      'Hay comprobantes en borrador. Contabilizalos o eliminalos antes de cerrar.',
    );
  });

  it('código desconocido cae al message del backend si existe', () => {
    const msg = mensajePeriodosFiscales(err('UNKNOWN_CODE', undefined, 'Boom del backend'));
    expect(msg).toBe('Boom del backend');
  });

  it('código desconocido sin message cae al fallback genérico', () => {
    const msg = mensajePeriodosFiscales(err('UNKNOWN_CODE'));
    expect(msg).toBe('No se pudo completar la operación. Intentá de nuevo.');
  });

  it('payload no-objeto cae al fallback genérico', () => {
    expect(mensajePeriodosFiscales(null)).toBe(
      'No se pudo completar la operación. Intentá de nuevo.',
    );
    expect(mensajePeriodosFiscales('string')).toBe(
      'No se pudo completar la operación. Intentá de nuevo.',
    );
  });
});
