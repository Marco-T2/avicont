import { describe, expect, it } from 'vitest';

import { mensajeComprobantes, mensajePeriodosFiscales } from './error-messages';

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

// ============================================================
// mensajeComprobantes — 31 códigos in-scope del slice 1
// ============================================================

describe('mensajeComprobantes', () => {
  // 404
  it('COMPROBANTE_NO_ENCONTRADO', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_NO_ENCONTRADO'))).toBeTruthy();
  });

  it('COMPROBANTE_CUENTA_NO_ENCONTRADA', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_CUENTA_NO_ENCONTRADA'))).toBeTruthy();
  });

  // 409 — estado inválido
  it('COMPROBANTE_ESTADO_INVALIDO', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_ESTADO_INVALIDO'))).toBeTruthy();
  });

  it('COMPROBANTE_BLOQUEADO', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_BLOQUEADO'));
    expect(msg.toLowerCase()).toMatch(/bloqueado|período|cerrado/i);
  });

  it('COMPROBANTE_ANULAR_YA_ANULADO', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_ANULAR_YA_ANULADO'))).toMatch(/anulado/i);
  });

  it('COMPROBANTE_ANULAR_BORRADOR_NO_PERMITIDO', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_ANULAR_BORRADOR_NO_PERMITIDO'))).toMatch(/borrador/i);
  });

  it('COMPROBANTE_NO_EDITABLE_ESTADO_INVALIDO', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_NO_EDITABLE_ESTADO_INVALIDO'))).toBeTruthy();
  });

  it('COMPROBANTE_ANULAR_PERIODO_CERRADO', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_ANULAR_PERIODO_CERRADO'))).toMatch(/período|periodo/i);
  });

  it('COMPROBANTE_ANULAR_MOTIVO_INVALIDO', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_ANULAR_MOTIVO_INVALIDO'))).toMatch(/motivo/i);
  });

  it('COMPROBANTE_ANULADO_NO_EDITABLE', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_ANULADO_NO_EDITABLE'))).toMatch(/anulado/i);
  });

  it('COMPROBANTE_PERIODO_NO_ABIERTO', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_PERIODO_NO_ABIERTO'))).toMatch(/período|periodo/i);
  });

  // 422 — invariantes
  it('COMPROBANTE_SIN_LINEAS', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_SIN_LINEAS'))).toMatch(/líneas|lineas/i);
  });

  it('COMPROBANTE_DESBALANCEADO sin diffBob usa mensaje genérico', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_DESBALANCEADO'));
    expect(msg.toLowerCase()).toMatch(/débito|debito|crédito|credito|balanc/i);
  });

  it('COMPROBANTE_DESBALANCEADO con diffBob interpolado', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_DESBALANCEADO', { diffBob: '5.00' }));
    expect(msg).toMatch(/5\.00/);
  });

  it('COMPROBANTE_MONTO_CERO', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_MONTO_CERO'))).toMatch(/cero/i);
  });

  it('COMPROBANTE_GLOSA_REQUERIDA', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_GLOSA_REQUERIDA'))).toMatch(/glosa/i);
  });

  it('COMPROBANTE_LINEA_SIN_MONTO sin orden usa mensaje genérico', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_LINEA_SIN_MONTO'));
    expect(msg.toLowerCase()).toMatch(/línea|linea|monto/i);
  });

  it('COMPROBANTE_LINEA_SIN_MONTO con orden interpolado', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_LINEA_SIN_MONTO', { orden: 3 }));
    expect(msg).toMatch(/3/);
  });

  it('COMPROBANTE_LINEA_AMBIGUA_DEBITO_CREDITO con orden', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_LINEA_AMBIGUA_DEBITO_CREDITO', { orden: 2 }));
    expect(msg).toMatch(/2/);
  });

  it('COMPROBANTE_MONTO_BOB_INCOHERENTE con orden', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_MONTO_BOB_INCOHERENTE', { orden: 1 }));
    expect(msg).toMatch(/1/);
    expect(msg.toLowerCase()).toMatch(/bob|boliviano/i);
  });

  it('COMPROBANTE_TIPO_CAMBIO_INVALIDO con orden', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_TIPO_CAMBIO_INVALIDO', { orden: 2 }));
    expect(msg).toMatch(/2/);
  });

  it('COMPROBANTE_FECHA_FUTURA_NO_PERMITIDA', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_FECHA_FUTURA_NO_PERMITIDA'))).toMatch(/fecha/i);
  });

  it('COMPROBANTE_CUENTA_NO_DETALLE con orden', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_CUENTA_NO_DETALLE', { orden: 4 }));
    expect(msg).toMatch(/4/);
  });

  it('COMPROBANTE_CUENTA_INACTIVA con orden', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_CUENTA_INACTIVA', { orden: 1 }));
    expect(msg).toMatch(/1/);
    expect(msg.toLowerCase()).toMatch(/inactiv/i);
  });

  it('COMPROBANTE_CONTACTO_REQUERIDO con orden', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_CONTACTO_REQUERIDO', { orden: 2 }));
    expect(msg).toMatch(/2/);
  });

  it('COMPROBANTE_CONTACTO_NO_EXISTE con orden', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_CONTACTO_NO_EXISTE', { orden: 3 }));
    expect(msg).toMatch(/3/);
  });

  it('COMPROBANTE_CONTACTO_INACTIVO con orden', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_CONTACTO_INACTIVO', { orden: 1 }));
    expect(msg).toMatch(/1/);
    expect(msg.toLowerCase()).toMatch(/inactiv/i);
  });

  it('COMPROBANTE_MONEDA_INCOMPATIBLE_CUENTA con orden', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_MONEDA_INCOMPATIBLE_CUENTA', { orden: 2 }));
    expect(msg).toMatch(/2/);
    expect(msg.toLowerCase()).toMatch(/moneda/i);
  });

  it('COMPROBANTE_GESTION_NO_ABIERTA', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_GESTION_NO_ABIERTA'))).toMatch(/gestión|gestion/i);
  });

  // 409 edición post-CONTABILIZADO
  it('COMPROBANTE_EDIT_PERIODO_CERRADO', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_EDIT_PERIODO_CERRADO'))).toMatch(/período|periodo/i);
  });

  it('COMPROBANTE_EDIT_PERIODO_DESTINO_CERRADO', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_EDIT_PERIODO_DESTINO_CERRADO'))).toMatch(/período|periodo/i);
  });

  it('COMPROBANTE_EDIT_NUMERO_INMUTABLE', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_EDIT_NUMERO_INMUTABLE'))).toMatch(/número|numero/i);
  });

  it('COMPROBANTE_CAMPOS_INMUTABLES', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_CAMPOS_INMUTABLES'))).toBeTruthy();
  });

  // 403
  it('MISSING_PERMISSION_EDIT_POSTED', () => {
    const msg = mensajeComprobantes(err('MISSING_PERMISSION_EDIT_POSTED'));
    expect(msg.toLowerCase()).toMatch(/permiso/i);
  });

  // 400
  it('COMPROBANTE_MOTIVO_ANULACION_REQUERIDO', () => {
    expect(mensajeComprobantes(err('COMPROBANTE_MOTIVO_ANULACION_REQUERIDO'))).toMatch(/motivo/i);
  });

  // Slice 2: COMPROBANTE_DOCUMENTO_FISICO_NO_EXISTE mapeado explícitamente (D6)
  it('COMPROBANTE_DOCUMENTO_FISICO_NO_EXISTE → mensaje accionable mapeado en D6', () => {
    const msg = mensajeComprobantes(err('COMPROBANTE_DOCUMENTO_FISICO_NO_EXISTE', undefined, 'Doc no encontrado'));
    expect(msg).toBe('El documento físico referenciado no existe en esta organización.');
  });

  it('código desconocido sin message cae al fallback genérico', () => {
    expect(mensajeComprobantes(err('UNKNOWN_CODE'))).toBe(
      'No se pudo completar la operación. Intentá de nuevo.',
    );
  });

  it('payload no-objeto cae al fallback genérico', () => {
    expect(mensajeComprobantes(null)).toBe(
      'No se pudo completar la operación. Intentá de nuevo.',
    );
  });
});
