import { Money } from '@/common/domain/money';

import {
  AplicacionContactoDistintoError,
  AplicacionExcedeCobroError,
  AplicacionExcedeVentaError,
  AplicacionNoEncontradaError,
  AplicacionPuntaNoContabilizadaError,
  AplicacionVentaContadoError,
  AplicacionVentaNoEncontradaError,
  CobroAnuladoNoEditableError,
  CobroConceptoNoConfiguradoError,
  CobroContactoInactivoError,
  CobroContactoNoEncontradoError,
  CobroCuentaDestinoNoElegibleError,
  CobroGestionNoAbiertaError,
  CobroMontoInferiorAplicadoError,
  CobroNoEncontradoError,
  CobroNoEsBorradorError,
  CobroPeriodoNoAbiertoError,
} from './cobro-errors';

/**
 * Los codes son contrato público (§6.3): estables, con details accionables
 * (montos e ids, no texto suelto). Estos tests congelan code + httpStatus +
 * details de cada error del módulo.
 */
describe('cobro-errors — codes y details estables', () => {
  it('COBRO_NO_ENCONTRADO es 404 y nombra el id', () => {
    const err = new CobroNoEncontradoError('cobro-1');

    expect(err.code).toBe('COBRO_NO_ENCONTRADO');
    expect(err.httpStatus).toBe(404);
    expect(err.details).toMatchObject({ cobroId: 'cobro-1' });
  });

  it('COBRO_CONCEPTO_NO_CONFIGURADO es 422 y nombra el concepto faltante', () => {
    const err = new CobroConceptoNoConfiguradoError();

    expect(err.code).toBe('COBRO_CONCEPTO_NO_CONFIGURADO');
    expect(err.httpStatus).toBe(422);
    expect(err.details).toMatchObject({ concepto: 'cuentasPorCobrarId' });
  });

  it('COBRO_CUENTA_DESTINO_NO_ELEGIBLE es 422 y lleva la cuenta rechazada', () => {
    const err = new CobroCuentaDestinoNoElegibleError('cta-gasto-5x');

    expect(err.code).toBe('COBRO_CUENTA_DESTINO_NO_ELEGIBLE');
    expect(err.httpStatus).toBe(422);
    expect(err.details).toMatchObject({ cuentaDestinoId: 'cta-gasto-5x' });
  });

  it('COBRO_MONTO_INFERIOR_APLICADO es 422 e indica cuánto hay que desaplicar (escenario spec: 1000 → 500 con 800 aplicados)', () => {
    const err = new CobroMontoInferiorAplicadoError(Money.of('500.00'), Money.of('800.00'));

    expect(err.code).toBe('COBRO_MONTO_INFERIOR_APLICADO');
    expect(err.httpStatus).toBe(422);
    expect(err.details).toMatchObject({
      montoNuevoBob: '500.00',
      totalAplicadoBob: '800.00',
      montoADesaplicarBob: '300.00',
    });
  });

  it('APLICACION_EXCEDE_COBRO es 422 con montos accionables', () => {
    const err = new AplicacionExcedeCobroError(
      'cobro-1',
      Money.of('500.00'),
      Money.of('400.00'),
      Money.of('200.00'),
    );

    expect(err.code).toBe('APLICACION_EXCEDE_COBRO');
    expect(err.httpStatus).toBe(422);
    expect(err.details).toMatchObject({
      cobroId: 'cobro-1',
      montoCobroBob: '500.00',
      totalAplicadoBob: '400.00',
      montoSolicitadoBob: '200.00',
      disponibleBob: '100.00',
    });
  });

  it('APLICACION_EXCEDE_VENTA es 422 con montos accionables', () => {
    const err = new AplicacionExcedeVentaError(
      'venta-1',
      Money.of('1000.00'),
      Money.of('900.00'),
      Money.of('200.00'),
    );

    expect(err.code).toBe('APLICACION_EXCEDE_VENTA');
    expect(err.httpStatus).toBe(422);
    expect(err.details).toMatchObject({
      ventaId: 'venta-1',
      montoTotalVentaBob: '1000.00',
      totalAplicadoBob: '900.00',
      montoSolicitadoBob: '200.00',
      disponibleBob: '100.00',
    });
  });

  it('APLICACION_CONTACTO_DISTINTO es 422 y nombra ambas puntas', () => {
    const err = new AplicacionContactoDistintoError('contacto-a', 'contacto-b');

    expect(err.code).toBe('APLICACION_CONTACTO_DISTINTO');
    expect(err.httpStatus).toBe(422);
    expect(err.details).toMatchObject({
      contactoCobroId: 'contacto-a',
      contactoVentaId: 'contacto-b',
    });
  });

  it('COBRO_GESTION_NO_ABIERTA es 422 y lleva la fecha sin período', () => {
    const err = new CobroGestionNoAbiertaError('2026-07-15');

    expect(err.code).toBe('COBRO_GESTION_NO_ABIERTA');
    expect(err.httpStatus).toBe(422);
    expect(err.details).toMatchObject({ fechaContable: '2026-07-15' });
  });

  it('COBRO_PERIODO_NO_ABIERTO es 409, nombra el período y señala la reapertura como único camino', () => {
    const err = new CobroPeriodoNoAbiertoError('periodo-1', 'CERRADO');

    expect(err.code).toBe('COBRO_PERIODO_NO_ABIERTO');
    expect(err.httpStatus).toBe(409);
    expect(err.details).toMatchObject({ periodoFiscalId: 'periodo-1', status: 'CERRADO' });
    expect(err.message).toContain('reabrir');
  });

  it('COBRO_ANULADO_NO_EDITABLE es 409 (§4.7: la anulación es terminal)', () => {
    const err = new CobroAnuladoNoEditableError('cobro-1');

    expect(err.code).toBe('COBRO_ANULADO_NO_EDITABLE');
    expect(err.httpStatus).toBe(409);
    expect(err.details).toMatchObject({ cobroId: 'cobro-1' });
  });

  it('COBRO_NO_ES_BORRADOR es 409 y nombra el estado real del comprobante', () => {
    const err = new CobroNoEsBorradorError('cobro-1', 'CONTABILIZADO');

    expect(err.code).toBe('COBRO_NO_ES_BORRADOR');
    expect(err.httpStatus).toBe(409);
    expect(err.details).toMatchObject({ cobroId: 'cobro-1', estado: 'CONTABILIZADO' });
  });

  it('COBRO_CONTACTO_NO_ENCONTRADO es 404 (contacto ajeno = inexistente, §4.2)', () => {
    const err = new CobroContactoNoEncontradoError('contacto-1');

    expect(err.code).toBe('COBRO_CONTACTO_NO_ENCONTRADO');
    expect(err.httpStatus).toBe(404);
    expect(err.details).toMatchObject({ contactoId: 'contacto-1' });
  });

  it('COBRO_CONTACTO_INACTIVO es 422', () => {
    const err = new CobroContactoInactivoError('contacto-1');

    expect(err.code).toBe('COBRO_CONTACTO_INACTIVO');
    expect(err.httpStatus).toBe(422);
    expect(err.details).toMatchObject({ contactoId: 'contacto-1' });
  });

  it('APLICACION_NO_ENCONTRADA es 404 (aplicación ajena = inexistente, REQ-CXC-08)', () => {
    const err = new AplicacionNoEncontradaError('app-1');

    expect(err.code).toBe('APLICACION_NO_ENCONTRADA');
    expect(err.httpStatus).toBe(404);
    expect(err.details).toMatchObject({ aplicacionId: 'app-1' });
  });

  it('APLICACION_VENTA_NO_ENCONTRADA es 404 (venta ajena = inexistente, REQ-CXC-08)', () => {
    const err = new AplicacionVentaNoEncontradaError('venta-1');

    expect(err.code).toBe('APLICACION_VENTA_NO_ENCONTRADA');
    expect(err.httpStatus).toBe(404);
    expect(err.details).toMatchObject({ ventaId: 'venta-1' });
  });

  it('APLICACION_PUNTA_NO_CONTABILIZADA es 422 y nombra la punta, su estado y su flag anulado', () => {
    const err = new AplicacionPuntaNoContabilizadaError('cobro', 'cobro-1', 'BORRADOR', false);

    expect(err.code).toBe('APLICACION_PUNTA_NO_CONTABILIZADA');
    expect(err.httpStatus).toBe(422);
    expect(err.details).toMatchObject({
      punta: 'cobro',
      id: 'cobro-1',
      estado: 'BORRADOR',
      anulado: false,
    });
  });

  it('APLICACION_PUNTA_NO_CONTABILIZADA distingue la punta venta anulada', () => {
    const err = new AplicacionPuntaNoContabilizadaError('venta', 'venta-1', 'CONTABILIZADO', true);

    expect(err.details).toMatchObject({
      punta: 'venta',
      id: 'venta-1',
      estado: 'CONTABILIZADO',
      anulado: true,
    });
  });

  it('APLICACION_VENTA_CONTADO es 422, nombra la venta y NO habla de estados (la CONTADO está contabilizada)', () => {
    const err = new AplicacionVentaContadoError('venta-1');

    expect(err.code).toBe('APLICACION_VENTA_CONTADO');
    expect(err.httpStatus).toBe(422);
    expect(err.details).toMatchObject({ ventaId: 'venta-1' });
    expect(err.message).toContain('contado');
    expect(err.message).not.toContain('estado');
  });
});
