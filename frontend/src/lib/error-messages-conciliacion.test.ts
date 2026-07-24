import { describe, expect, it } from 'vitest';

import { mensajeConciliacion } from './error-messages';

// El GlobalExceptionFilter del backend envuelve la carga útil bajo `error`
// (CLAUDE.md §6.4). Este helper arma el shape real de un error de axios.
function errorBackend(code: string, message = 'mensaje crudo del backend'): unknown {
  return { response: { data: { error: { code, message } } } };
}

describe('mensajeConciliacion — codes del workspace (REQ-CB-17 / REQ-CB-18)', () => {
  it('CONCILIACION_MOVIMIENTO_YA_TIENE_MATCH (409) pide deshacer el match existente', () => {
    expect(mensajeConciliacion(errorBackend('CONCILIACION_MOVIMIENTO_YA_TIENE_MATCH'))).toBe(
      'Este movimiento ya está conciliado con otra línea. Deshacé ese match antes de crear uno nuevo.',
    );
  });

  it('CONCILIACION_MOVIMIENTO_YA_CONCILIADO (422) es un mensaje DISTINTO: bloquea ignorar', () => {
    expect(mensajeConciliacion(errorBackend('CONCILIACION_MOVIMIENTO_YA_CONCILIADO'))).toBe(
      'El movimiento está conciliado. Deshacé el match antes de ignorarlo.',
    );
  });

  it('los dos codes de "ya conciliado" NO comparten mensaje — significan cosas distintas', () => {
    const yaTieneMatch = mensajeConciliacion(
      errorBackend('CONCILIACION_MOVIMIENTO_YA_TIENE_MATCH'),
    );
    const yaConciliado = mensajeConciliacion(
      errorBackend('CONCILIACION_MOVIMIENTO_YA_CONCILIADO'),
    );

    expect(yaTieneMatch).not.toBe(yaConciliado);
  });

  it('CONCILIACION_LINEA_YA_CONCILIADA (409)', () => {
    expect(mensajeConciliacion(errorBackend('CONCILIACION_LINEA_YA_CONCILIADA'))).toBe(
      'Esa línea contable ya está conciliada con otro movimiento bancario.',
    );
  });

  it('CONCILIACION_LINEA_NO_CONCILIABLE (422)', () => {
    expect(mensajeConciliacion(errorBackend('CONCILIACION_LINEA_NO_CONCILIABLE'))).toBe(
      'La línea contable no se puede conciliar: no existe, está anulada, no está contabilizada o pertenece a otra cuenta.',
    );
  });

  it('CONCILIACION_MATCH_NO_ENCONTRADO (404)', () => {
    expect(mensajeConciliacion(errorBackend('CONCILIACION_MATCH_NO_ENCONTRADO'))).toBe(
      'El match ya no existe. Actualizá la pantalla.',
    );
  });

  it('CONCILIACION_MOVIMIENTO_NO_ENCONTRADO (404)', () => {
    expect(mensajeConciliacion(errorBackend('CONCILIACION_MOVIMIENTO_NO_ENCONTRADO'))).toBe(
      'El movimiento bancario ya no existe. Actualizá la pantalla.',
    );
  });

  it('CONCILIACION_RANGO_INVALIDO (422)', () => {
    expect(mensajeConciliacion(errorBackend('CONCILIACION_RANGO_INVALIDO'))).toBe(
      'El rango de fechas es inválido: "desde" no puede ser posterior a "hasta".',
    );
  });
});

describe('mensajeConciliacion — codes de importación de extracto', () => {
  it('CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE conserva el mensaje del backend (trae los DOS números)', () => {
    const crudo =
      'El archivo corresponde a la cuenta 1191959-000-002 y lo estás importando en 1191959-000-001.';

    expect(
      mensajeConciliacion(errorBackend('CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE', crudo)),
    ).toBe(crudo);
  });

  it('CONCILIACION_ARCHIVO_PERFIL_NO_COINCIDE', () => {
    expect(mensajeConciliacion(errorBackend('CONCILIACION_ARCHIVO_PERFIL_NO_COINCIDE'))).toBe(
      'El archivo no coincide con el perfil de extracto configurado para esta cuenta bancaria.',
    );
  });

  it('CONCILIACION_ARCHIVO_XLS_LEGACY', () => {
    expect(mensajeConciliacion(errorBackend('CONCILIACION_ARCHIVO_XLS_LEGACY'))).toBe(
      'El archivo está en formato .xls antiguo. Abrilo en Excel y guardalo como .xlsx antes de importarlo.',
    );
  });
});

describe('mensajeConciliacion — fallback', () => {
  it('un code desconocido cae al message del backend', () => {
    expect(mensajeConciliacion(errorBackend('CONCILIACION_LO_QUE_SEA', 'explota todo'))).toBe(
      'explota todo',
    );
  });

  it('sin payload usable devuelve el fallback genérico', () => {
    expect(mensajeConciliacion(new Error('network'))).toBe(
      'No se pudo completar la operación. Intentá de nuevo.',
    );
  });
});
