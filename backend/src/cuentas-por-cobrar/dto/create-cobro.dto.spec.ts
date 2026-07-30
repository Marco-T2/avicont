import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateCobroDto } from './create-cobro.dto';

// Validación en el borde HTTP (400 antes de tocar el service). El service
// ASUME ISO válido — `FechaContable.fromIso` lanza `RangeError` y un
// RangeError crudo sería un 500 — así que el DTO es la capa que lo impide
// (mismo agujero que la Fase 4 cerró en ventas; NO se reintroduce acá).
describe('CreateCobroDto — validación', () => {
  const base = {
    contactoId: '11111111-1111-4111-a111-111111111111',
    fechaContable: '2026-07-15',
    monto: '1250.57',
    cuentaDestinoId: '33333333-3333-4333-a333-333333333333',
    glosa: 'pago parcial de la factura 12',
  };

  async function errores(payload: Record<string, unknown>) {
    const dto = plainToInstance(CreateCobroDto, payload);
    return validate(dto, { whitelist: true });
  }

  async function tieneErrorEn(payload: Record<string, unknown>, prop: string): Promise<boolean> {
    return (await errores(payload)).some((e) => e.property === prop);
  }

  it('acepta un payload válido', async () => {
    expect(await errores(base)).toHaveLength(0);
  });

  describe('monto (§4.5: string, > 0)', () => {
    it('rechaza monto "0" (un cobro sin plata no es un cobro)', async () => {
      expect(await tieneErrorEn({ ...base, monto: '0' }, 'monto')).toBe(true);
    });

    it('rechaza monto negativo', async () => {
      expect(await tieneErrorEn({ ...base, monto: '-100' }, 'monto')).toBe(true);
    });

    it('rechaza monto no numérico', async () => {
      expect(await tieneErrorEn({ ...base, monto: '1.250,57' }, 'monto')).toBe(true);
    });

    it('rechaza monto como number (§4.5: la plata cruza HTTP como string)', async () => {
      expect(await tieneErrorEn({ ...base, monto: 1250.57 }, 'monto')).toBe(true);
    });
  });

  describe('fechaContable (§4.6: el DTO impide el RangeError del service)', () => {
    it.each(['2026-02-31', '2026-13-01', '2026-7-1', '15/07/2026', '2026-07-15T00:00:00Z', ''])(
      'rechaza fechaContable inválida %p',
      async (fecha) => {
        expect(await tieneErrorEn({ ...base, fechaContable: fecha }, 'fechaContable')).toBe(true);
      },
    );

    it('acepta 29 de febrero en año bisiesto', async () => {
      expect(await errores({ ...base, fechaContable: '2028-02-29' })).toHaveLength(0);
    });

    it('rechaza 29 de febrero en año no bisiesto', async () => {
      expect(await tieneErrorEn({ ...base, fechaContable: '2026-02-29' }, 'fechaContable')).toBe(
        true,
      );
    });
  });

  describe('estructura', () => {
    it('rechaza contactoId que no es UUID', async () => {
      expect(await tieneErrorEn({ ...base, contactoId: 'cliente-1' }, 'contactoId')).toBe(true);
    });

    it('rechaza cuentaDestinoId que no es UUID', async () => {
      expect(await tieneErrorEn({ ...base, cuentaDestinoId: 'caja' }, 'cuentaDestinoId')).toBe(
        true,
      );
    });

    it('rechaza glosa vacía', async () => {
      expect(await tieneErrorEn({ ...base, glosa: '' }, 'glosa')).toBe(true);
    });
  });
});
