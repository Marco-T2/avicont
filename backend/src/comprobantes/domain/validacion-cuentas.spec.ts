import {
  ContactoRequeridoError,
  CuentaInactivaError,
  CuentaNoDetalleError,
  CuentaNoEncontradaError,
} from './comprobante-errors';
import {
  resolverCuentaDeLinea,
  validarContactoRequerido,
  type CuentaValidable,
} from './validacion-cuentas';

const cuenta = (over: Partial<CuentaValidable> = {}): CuentaValidable => ({
  id: 'cta-1',
  codigoInterno: '1.1.1.001',
  activa: true,
  esDetalle: true,
  requiereContacto: false,
  ...over,
});

describe('resolverCuentaDeLinea', () => {
  it('devuelve la cuenta cuando existe, está activa y es de detalle', () => {
    const mapa = new Map([['cta-1', cuenta()]]);
    expect(resolverCuentaDeLinea(1, 'cta-1', mapa)).toEqual(cuenta());
  });

  it('rechaza una cuenta ausente del mapa', () => {
    // El batch está acotado al tenant, así que "ausente" cubre tanto
    // inexistente como de otra organización (§4.2).
    expect(() => resolverCuentaDeLinea(1, 'cta-ajena', new Map())).toThrow(CuentaNoEncontradaError);
  });

  it('rechaza una cuenta inactiva (§4.1)', () => {
    const mapa = new Map([['cta-1', cuenta({ activa: false })]]);
    expect(() => resolverCuentaDeLinea(3, 'cta-1', mapa)).toThrow(CuentaInactivaError);
  });

  it('rechaza una cuenta que no es de detalle (§4.1)', () => {
    const mapa = new Map([['cta-1', cuenta({ esDetalle: false })]]);
    expect(() => resolverCuentaDeLinea(2, 'cta-1', mapa)).toThrow(CuentaNoDetalleError);
  });

  it('chequea inactiva ANTES que no-detalle', () => {
    // Fija el orden porque los tres call sites lo tenían así y el mensaje que
    // ve el usuario depende de cuál gana.
    const mapa = new Map([['cta-1', cuenta({ activa: false, esDetalle: false })]]);
    expect(() => resolverCuentaDeLinea(1, 'cta-1', mapa)).toThrow(CuentaInactivaError);
  });

  it('propaga el orden de la línea al error, no el índice', () => {
    const mapa = new Map([['cta-1', cuenta({ activa: false })]]);
    try {
      resolverCuentaDeLinea(7, 'cta-1', mapa);
      fail('debía lanzar');
    } catch (e) {
      expect((e as CuentaInactivaError).message).toContain('7');
    }
  });
});

describe('validarContactoRequerido', () => {
  it('acepta una cuenta que exige contacto cuando la línea lo trae', () => {
    expect(() =>
      validarContactoRequerido(1, cuenta({ requiereContacto: true }), 'contacto-1'),
    ).not.toThrow();
  });

  it('acepta una cuenta que NO exige contacto y la línea no lo trae', () => {
    expect(() => validarContactoRequerido(1, cuenta(), null)).not.toThrow();
  });

  it('rechaza una cuenta que exige contacto con la línea sin contacto', () => {
    // Es el invariante del que depende el aging de CxC (B-1): una línea contra
    // CUENTAS POR COBRAR sin `contactoId` deja la deuda sin dueño.
    expect(() => validarContactoRequerido(4, cuenta({ requiereContacto: true }), null)).toThrow(
      ContactoRequeridoError,
    );
  });

  it('trata el string vacío como ausencia de contacto', () => {
    expect(() => validarContactoRequerido(4, cuenta({ requiereContacto: true }), '')).toThrow(
      ContactoRequeridoError,
    );
  });
});
