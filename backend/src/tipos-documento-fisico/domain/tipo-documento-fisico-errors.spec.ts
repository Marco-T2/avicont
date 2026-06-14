/**
 * Tests unitarios para los DomainErrors de numeración automática del módulo
 * tipos-documento-fisico. Verifica que los codes sean estables (contrato
 * público) y que el httpStatus sea 422 (InvalidStateError).
 */

import {
  TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError,
  TipoDocumentoFisicoNumeroInicialInmutableError,
} from './tipo-documento-fisico-errors';

describe('TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError', () => {
  it('tiene code estable TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA', () => {
    const error = new TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError();
    expect(error.code).toBe('TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA');
  });

  it('tiene httpStatus 422', () => {
    const error = new TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError();
    expect(error.httpStatus).toBe(422);
  });

  it('es una instancia de Error', () => {
    const error = new TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError();
    expect(error).toBeInstanceOf(Error);
  });
});

describe('TipoDocumentoFisicoNumeroInicialInmutableError', () => {
  it('tiene code estable TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE', () => {
    const error = new TipoDocumentoFisicoNumeroInicialInmutableError();
    expect(error.code).toBe('TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE');
  });

  it('tiene httpStatus 422', () => {
    const error = new TipoDocumentoFisicoNumeroInicialInmutableError();
    expect(error.httpStatus).toBe(422);
  });

  it('es una instancia de Error', () => {
    const error = new TipoDocumentoFisicoNumeroInicialInmutableError();
    expect(error).toBeInstanceOf(Error);
  });
});
