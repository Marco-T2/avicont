import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateVentaDto } from './create-venta.dto';

// Validación en el borde HTTP (400 antes de tocar el service). El service
// ASUME ISO válido — `FechaContable.fromIso` lanza `RangeError` y un
// RangeError crudo sería un 500 — así que el DTO es la capa que lo impide.
describe('CreateVentaDto — validación', () => {
  const lineaValida = {
    itemId: '22222222-2222-4222-a222-222222222222',
    descripcion: 'Pollo entero',
    cantidad: '5',
    precioUnitario: '6.305',
  };

  const base = {
    contactoId: '11111111-1111-4111-a111-111111111111',
    fechaContable: '2026-07-15',
    condicionPago: 'CONTADO',
    glosa: 'venta de pollo',
    cuentaDestinoId: '33333333-3333-4333-a333-333333333333',
    lineas: [lineaValida],
  };

  async function errores(payload: Record<string, unknown>) {
    const dto = plainToInstance(CreateVentaDto, payload);
    return validate(dto, { whitelist: true });
  }

  async function tieneErrorEn(payload: Record<string, unknown>, prop: string): Promise<boolean> {
    const errs = await errores(payload);
    const enRaiz = errs.some((e) => e.property === prop);
    // Errores anidados de las líneas (@ValidateNested)
    const enLineas = errs
      .filter((e) => e.property === 'lineas')
      .some((e) =>
        (e.children ?? []).some((linea) => (linea.children ?? []).some((c) => c.property === prop)),
      );
    return enRaiz || enLineas;
  }

  it('acepta un payload CONTADO válido', async () => {
    expect(await errores(base)).toHaveLength(0);
  });

  it('acepta un payload CREDITO válido con fechaVencimiento', async () => {
    const payload = {
      ...base,
      condicionPago: 'CREDITO',
      fechaVencimiento: '2026-08-15',
    };
    const { cuentaDestinoId: _omitida, ...sinDestino } = payload;
    expect(await errores(sinDestino)).toHaveLength(0);
  });

  describe('cantidad y precioUnitario (§4.5: string, positividad en el DTO)', () => {
    it('rechaza cantidad "0" (una línea sin cantidad no es una línea)', async () => {
      expect(
        await tieneErrorEn({ ...base, lineas: [{ ...lineaValida, cantidad: '0' }] }, 'cantidad'),
      ).toBe(true);
    });

    it('rechaza cantidad negativa "-5"', async () => {
      expect(
        await tieneErrorEn({ ...base, lineas: [{ ...lineaValida, cantidad: '-5' }] }, 'cantidad'),
      ).toBe(true);
    });

    it('rechaza cantidad no numérica "abc"', async () => {
      expect(
        await tieneErrorEn({ ...base, lineas: [{ ...lineaValida, cantidad: 'abc' }] }, 'cantidad'),
      ).toBe(true);
    });

    it('rechaza cantidad como number (§4.5: los montos cruzan como string)', async () => {
      expect(
        await tieneErrorEn({ ...base, lineas: [{ ...lineaValida, cantidad: 5 }] }, 'cantidad'),
      ).toBe(true);
    });

    it('rechaza precioUnitario negativo "-1"', async () => {
      expect(
        await tieneErrorEn(
          { ...base, lineas: [{ ...lineaValida, precioUnitario: '-1' }] },
          'precioUnitario',
        ),
      ).toBe(true);
    });

    it('acepta precioUnitario "0" (ítem bonificado, SKIP-on-zero del asiento)', async () => {
      expect(
        await errores({ ...base, lineas: [{ ...lineaValida, precioUnitario: '0' }] }),
      ).toHaveLength(0);
    });

    it('rechaza precioUnitario no numérico', async () => {
      expect(
        await tieneErrorEn(
          { ...base, lineas: [{ ...lineaValida, precioUnitario: '1,50' }] },
          'precioUnitario',
        ),
      ).toBe(true);
    });
  });

  describe('fechas (§4.6: calendario puro, el DTO impide el RangeError del service)', () => {
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

    it('rechaza fechaVencimiento inválida cuando viene', async () => {
      expect(
        await tieneErrorEn({ ...base, fechaVencimiento: '2026-02-31' }, 'fechaVencimiento'),
      ).toBe(true);
    });
  });

  describe('estructura del documento', () => {
    it('rechaza lineas vacías (al menos una línea)', async () => {
      expect(await tieneErrorEn({ ...base, lineas: [] }, 'lineas')).toBe(true);
    });

    it('rechaza lineas ausentes', async () => {
      const { lineas: _omitidas, ...sinLineas } = base;
      expect(await tieneErrorEn(sinLineas, 'lineas')).toBe(true);
    });

    it('rechaza descripcion vacía en la línea', async () => {
      expect(
        await tieneErrorEn(
          { ...base, lineas: [{ ...lineaValida, descripcion: '' }] },
          'descripcion',
        ),
      ).toBe(true);
    });

    it('rechaza itemId que no es UUID', async () => {
      expect(
        await tieneErrorEn({ ...base, lineas: [{ ...lineaValida, itemId: 'pollo' }] }, 'itemId'),
      ).toBe(true);
    });

    it('rechaza glosa vacía', async () => {
      expect(await tieneErrorEn({ ...base, glosa: '' }, 'glosa')).toBe(true);
    });

    it('rechaza contactoId que no es UUID', async () => {
      expect(await tieneErrorEn({ ...base, contactoId: 'cliente-1' }, 'contactoId')).toBe(true);
    });

    it('rechaza condicionPago fuera del enum', async () => {
      expect(await tieneErrorEn({ ...base, condicionPago: 'FIADO' }, 'condicionPago')).toBe(true);
    });
  });

  describe('REQ-VTA-03 / B-9: el cliente no dicta los totales', () => {
    it('subtotal y montoTotal NO están declarados en el DTO: el whitelist los elimina', async () => {
      const payload = {
        ...base,
        montoTotal: '999.99',
        lineas: [{ ...lineaValida, subtotal: '999.99' }],
      };
      const dto = plainToInstance(CreateVentaDto, payload);
      const errs = await validate(dto, { whitelist: true });

      expect(errs).toHaveLength(0);
      // El ValidationPipe global corre con whitelist: true (main.ts) — las
      // propiedades sin decorador se eliminan ANTES de llegar al service.
      expect((dto as unknown as Record<string, unknown>).montoTotal).toBeUndefined();
      expect((dto.lineas[0] as unknown as Record<string, unknown>).subtotal).toBeUndefined();
    });
  });
});
