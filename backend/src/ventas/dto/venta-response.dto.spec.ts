import { EstadoComprobante, Prisma } from '@prisma/client';

import { toVentaListItem, toVentaResponse } from './venta-response.dto';

// El mapper es el borde §4.5/§4.6 de salida: montos como STRING (el cliente
// muestra, no recalcula) y fechas de calendario `YYYY-MM-DD` sin hora ni UTC.
describe('venta-response.dto — mappers', () => {
  const linea = {
    id: 'linea-1',
    organizationId: 'org-a',
    ventaId: 'venta-1',
    orden: 1,
    itemId: 'item-1',
    descripcion: 'Pollo entero',
    cantidad: new Prisma.Decimal('5'),
    precioUnitario: new Prisma.Decimal('6.305'),
    cuentaIngresoId: 'cuenta-ingreso-1',
    subtotal: new Prisma.Decimal('31.53'),
  };

  const venta = {
    id: 'venta-1',
    organizationId: 'org-a',
    contactoId: 'contacto-1',
    fechaContable: new Date(Date.UTC(2026, 6, 15)),
    condicionPago: 'CONTADO' as const,
    fechaVencimiento: null,
    glosa: 'venta de pollo',
    cuentaDestinoId: 'cuenta-caja',
    montoTotal: new Prisma.Decimal('31.53'),
    createdAt: new Date('2026-07-15T14:30:00Z'),
    createdByUserId: 'user-1',
    updatedAt: new Date('2026-07-15T14:30:00Z'),
    lineas: [linea],
  };

  const comprobante = {
    id: 'comp-1',
    numero: 'V2607-000001',
    estado: EstadoComprobante.CONTABILIZADO,
    anulado: false,
  };

  it('los montos cruzan como string, nunca number (§4.5)', () => {
    const res = toVentaResponse(venta, comprobante);

    expect(res.montoTotal).toBe('31.53');
    expect(res.lineas[0]?.cantidad).toBe('5');
    expect(res.lineas[0]?.precioUnitario).toBe('6.305');
    expect(res.lineas[0]?.subtotal).toBe('31.53');
  });

  it('fechaContable sale como YYYY-MM-DD sin hora ni corrimiento UTC (§4.6)', () => {
    const res = toVentaResponse(venta, comprobante);
    expect(res.fechaContable).toBe('2026-07-15');
  });

  it('fechaVencimiento null se preserva; con valor sale como YYYY-MM-DD', () => {
    expect(toVentaResponse(venta, comprobante).fechaVencimiento).toBeNull();
    expect(
      toVentaResponse({ ...venta, fechaVencimiento: new Date(Date.UTC(2026, 7, 15)) }, comprobante)
        .fechaVencimiento,
    ).toBe('2026-08-15');
  });

  it('estado, numero y anulado vienen del comprobante (REQ-VTA-01: la venta no espeja estado)', () => {
    const res = toVentaResponse(venta, comprobante);

    expect(res.comprobanteId).toBe('comp-1');
    expect(res.estado).toBe(EstadoComprobante.CONTABILIZADO);
    expect(res.numero).toBe('V2607-000001');
    expect(res.anulado).toBe(false);
  });

  it('el item de listado no lleva líneas pero sí el estado derivado', () => {
    const { lineas: _lineas, ...cabecera } = venta;
    const res = toVentaListItem(cabecera, {
      id: 'comp-1',
      numero: null,
      estado: EstadoComprobante.BORRADOR,
      anulado: false,
    });

    expect(res.id).toBe('venta-1');
    expect(res.estado).toBe(EstadoComprobante.BORRADOR);
    expect(res.numero).toBeNull();
    expect(res.montoTotal).toBe('31.53');
    expect('lineas' in res).toBe(false);
  });

  it('organizationId y createdByUserId NO se exponen en la respuesta', () => {
    const res = toVentaResponse(venta, comprobante) as unknown as Record<string, unknown>;
    expect(res.organizationId).toBeUndefined();
    expect(res.createdByUserId).toBeUndefined();
  });
});
