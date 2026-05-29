import { describe, expect, it } from 'vitest';

import { mensajeComprobantes } from './error-messages';

// Helper: construye un error con el shape que el backend devuelve
// (response.data con code y message).
function makeBackendErr(code: string, message = 'backend msg'): unknown {
  return { response: { data: { code, message } } };
}

describe('mensajeComprobantes — 4 códigos de documentos de respaldo (D6)', () => {
  it('TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE → mensaje accionable', () => {
    const msg = mensajeComprobantes(makeBackendErr('TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE'));
    expect(msg).toBe('Este tipo de documento no es compatible con el tipo de comprobante.');
  });

  it('DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO → mensaje accionable', () => {
    const msg = mensajeComprobantes(
      makeBackendErr('DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO'),
    );
    expect(msg).toBe('Este documento ya está asociado a otro asiento contabilizado.');
  });

  it('COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO → mensaje accionable', () => {
    const msg = mensajeComprobantes(
      makeBackendErr('COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO'),
    );
    expect(msg).toBe('El período fiscal está cerrado. No se puede modificar el asiento.');
  });

  it('COMPROBANTE_DOCUMENTO_FISICO_NO_EXISTE → mensaje accionable', () => {
    const msg = mensajeComprobantes(makeBackendErr('COMPROBANTE_DOCUMENTO_FISICO_NO_EXISTE'));
    expect(msg).toBe('El documento físico referenciado no existe en esta organización.');
  });

  it('SIN_PERMISO_EDITAR_CONTABILIZADO → mensaje accionable', () => {
    const msg = mensajeComprobantes(makeBackendErr('SIN_PERMISO_EDITAR_CONTABILIZADO'));
    expect(msg).toBe('No tienes permiso para modificar un asiento contabilizado.');
  });

  it('código desconocido → cae al message del backend', () => {
    const msg = mensajeComprobantes(makeBackendErr('CODIGO_DESCONOCIDO', 'Error del backend'));
    expect(msg).toBe('Error del backend');
  });
});
