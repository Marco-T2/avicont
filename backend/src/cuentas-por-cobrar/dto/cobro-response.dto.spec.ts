import { EstadoComprobante, Prisma } from '@prisma/client';

import type { AplicacionCobroRow, Cobro, ComprobanteDeCobro } from '../ports/cobro.repository.port';

import { toAplicacionResponse, toCobroListItem, toCobroResponse } from './cobro-response.dto';

// El mapper es el borde §4.5/§4.6 de salida: dinero como STRING con sus 2
// decimales y fechas de calendario `YYYY-MM-DD` sin hora ni UTC.
describe('cobro-response.dto — mappers', () => {
  const cobro: Cobro = {
    id: 'cobro-1',
    organizationId: 'org-a',
    contactoId: 'contacto-1',
    fechaContable: new Date(Date.UTC(2026, 6, 15)),
    monto: new Prisma.Decimal('1250.50'),
    cuentaDestinoId: 'cuenta-caja',
    glosa: 'Pago parcial de la factura 12',
    createdByUserId: 'user-1',
    createdAt: new Date('2026-07-15T10:00:00.000Z'),
    updatedAt: new Date('2026-07-15T10:00:00.000Z'),
  };

  const comprobante: ComprobanteDeCobro = {
    id: 'comprobante-1',
    numero: 'I2607-000001',
    estado: EstadoComprobante.CONTABILIZADO,
    anulado: false,
  };

  it('la fecha contable sale como YYYY-MM-DD sin hora ni corrimiento UTC (§4.6)', () => {
    expect(toCobroListItem(cobro, comprobante).fechaContable).toBe('2026-07-15');
  });

  // Regresión: los montos salían con `Decimal.toString()`, que DESCARTA el cero
  // final — "504.40" viajaba como "504.4". La UI muestra el string crudo (§4.5,
  // no recalcula), así que un importe redondo aparecía con UN decimal en una
  // columna de dinero. Y `estado-cuenta`, en este mismo módulo, ya publicaba
  // "504.40" con `toBob()`: el mismo importe, dos strings según el endpoint.
  it('un monto redondo conserva sus 2 decimales: "504.40", nunca "504.4" (§4.5)', () => {
    const redondo: Cobro = { ...cobro, monto: new Prisma.Decimal('504.40') };

    expect(toCobroListItem(redondo, comprobante).monto).toBe('504.40');
    expect(toCobroResponse(redondo, comprobante, []).monto).toBe('504.40');
  });

  it('el monto aplicado de cada aplicación también conserva sus 2 decimales', () => {
    const aplicacion = {
      id: 'aplicacion-1',
      ventaId: 'venta-1',
      montoAplicado: new Prisma.Decimal('300.00'),
      createdAt: new Date('2026-07-15T11:00:00.000Z'),
    };

    const res = toCobroResponse(cobro, comprobante, [aplicacion]);
    expect(res.aplicaciones[0]?.montoAplicado).toBe('300.00');

    const row: AplicacionCobroRow = {
      ...aplicacion,
      organizationId: 'org-a',
      cobroId: 'cobro-1',
      createdByUserId: 'user-1',
      updatedAt: new Date('2026-07-15T11:00:00.000Z'),
    };
    expect(toAplicacionResponse(row).montoAplicado).toBe('300.00');
  });

  it('estado, numero y anulado vienen del comprobante — el cobro no espeja estado', () => {
    const borrador = toCobroListItem(cobro, {
      id: 'comprobante-1',
      numero: null,
      estado: EstadoComprobante.BORRADOR,
      anulado: false,
    });

    expect(borrador.estado).toBe(EstadoComprobante.BORRADOR);
    expect(borrador.numero).toBeNull();
    expect(borrador.anulado).toBe(false);
  });
});
