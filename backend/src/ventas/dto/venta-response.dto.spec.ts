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

  // Regresión: los montos salían con `Decimal.toString()`, que DESCARTA el cero
  // final — "504.40" viajaba como "504.4". Ningún test lo cazaba porque todos
  // usaban 31.53, que no tiene ceros a la derecha. Se veía en pantalla ("Bs 504.4"
  // en una columna de dinero, porque la UI muestra el string crudo) y además
  // contradecía a `estado-cuenta`, que publica ESA MISMA venta con `toBob()`:
  // dos endpoints, el mismo importe, dos strings distintos.
  it('un monto redondo conserva sus 2 decimales: "504.40", nunca "504.4" (§4.5)', () => {
    const redondo = {
      ...venta,
      montoTotal: new Prisma.Decimal('504.40'),
      lineas: [
        { ...linea, cantidad: new Prisma.Decimal('80'), subtotal: new Prisma.Decimal('504.40') },
      ],
    };
    const res = toVentaResponse(redondo, comprobante);

    expect(res.montoTotal).toBe('504.40');
    expect(res.lineas[0]?.subtotal).toBe('504.40');
    expect(toVentaListItem(redondo, comprobante).montoTotal).toBe('504.40');
  });

  // El gemelo del anterior: cantidad y precioUnitario son Decimal(18,6) y NO son
  // dinero. Sin este test, "arreglar" el de arriba aplicando toFixed(2) a todo
  // truncaría un precio de 6.305 a 6.31 y el test seguiría verde.
  it('cantidad y precioUnitario conservan sus decimales de escala 6, sin recortar a 2', () => {
    const preciso = {
      ...venta,
      lineas: [
        {
          ...linea,
          cantidad: new Prisma.Decimal('2.5'),
          precioUnitario: new Prisma.Decimal('6.305'),
        },
      ],
    };
    const res = toVentaResponse(preciso, comprobante);

    expect(res.lineas[0]?.precioUnitario).toBe('6.305');
    expect(res.lineas[0]?.cantidad).toBe('2.5');
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
