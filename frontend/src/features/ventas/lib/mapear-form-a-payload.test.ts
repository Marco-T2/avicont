import { describe, expect, it } from 'vitest';

import type { VentaFormValues } from '../schemas/venta-form-schema';
import { mapearFormAPayload } from './mapear-form-a-payload';

const BASE: VentaFormValues = {
  contactoId: 'contacto-1',
  fechaContable: '2026-07-15',
  condicionPago: 'CONTADO',
  fechaVencimiento: '',
  glosa: 'Venta de pollo faenado a Avícola Sur',
  cuentaDestinoId: 'cuenta-caja',
  lineas: [
    {
      itemId: 'item-1',
      descripcion: 'Pollo entero',
      cantidad: '5',
      precioUnitario: '6.305',
    },
  ],
};

describe('mapearFormAPayload', () => {
  it('el payload NO lleva subtotal ni montoTotal — los calcula el backend (REQ-VTA-03)', () => {
    const payload = mapearFormAPayload(BASE);
    expect(Object.keys(payload)).not.toContain('montoTotal');
    expect(Object.keys(payload)).not.toContain('subtotal');
    // Cada línea viaja EXACTAMENTE con las 4 claves del CreateLineaVentaDto:
    // si alguien agrega `subtotal` al mapper, este aserto se pone rojo.
    expect(Object.keys(payload.lineas[0] ?? {}).sort()).toEqual([
      'cantidad',
      'descripcion',
      'itemId',
      'precioUnitario',
    ]);
  });

  it('cantidad y precio viajan como STRING sin tocar (§4.5)', () => {
    const payload = mapearFormAPayload(BASE);
    expect(payload.lineas[0]?.cantidad).toBe('5');
    expect(payload.lineas[0]?.precioUnitario).toBe('6.305');
  });

  it('CONTADO → viaja cuentaDestinoId y se omite fechaVencimiento', () => {
    const payload = mapearFormAPayload(BASE);
    expect(payload.cuentaDestinoId).toBe('cuenta-caja');
    expect(Object.keys(payload)).not.toContain('fechaVencimiento');
  });

  it('CREDITO → viaja fechaVencimiento y se omite cuentaDestinoId', () => {
    const payload = mapearFormAPayload({
      ...BASE,
      condicionPago: 'CREDITO',
      fechaVencimiento: '2026-08-15',
      // Aunque el form tenga una cuenta residual, en CREDITO no viaja.
      cuentaDestinoId: 'cuenta-caja',
    });
    expect(payload.fechaVencimiento).toBe('2026-08-15');
    expect(Object.keys(payload)).not.toContain('cuentaDestinoId');
  });
});
