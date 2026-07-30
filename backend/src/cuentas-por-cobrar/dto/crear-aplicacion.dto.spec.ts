import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AnularCobroDto } from './anular-cobro.dto';
import { CrearAplicacionDto, EditarAplicacionDto } from './crear-aplicacion.dto';

async function errores(cls: new () => object, payload: Record<string, unknown>) {
  const dto = plainToInstance(cls, payload);
  return validate(dto, { whitelist: true });
}

describe('CrearAplicacionDto — validación', () => {
  const base = {
    ventaId: '11111111-1111-4111-a111-111111111111',
    montoAplicado: '300.00',
  };

  it('acepta un payload válido', async () => {
    expect(await errores(CrearAplicacionDto, base)).toHaveLength(0);
  });

  it('rechaza ventaId que no es UUID', async () => {
    const errs = await errores(CrearAplicacionDto, { ...base, ventaId: 'venta-1' });
    expect(errs.some((e) => e.property === 'ventaId')).toBe(true);
  });

  it.each(['0', '-300', 'abc', 300])(
    'rechaza montoAplicado %p (§4.5: string > 0)',
    async (monto) => {
      const errs = await errores(CrearAplicacionDto, { ...base, montoAplicado: monto });
      expect(errs.some((e) => e.property === 'montoAplicado')).toBe(true);
    },
  );

  it('EditarAplicacionDto exige el mismo montoAplicado > 0', async () => {
    expect(await errores(EditarAplicacionDto, { montoAplicado: '150.50' })).toHaveLength(0);
    const errs = await errores(EditarAplicacionDto, { montoAplicado: '0' });
    expect(errs.some((e) => e.property === 'montoAplicado')).toBe(true);
  });
});

describe('AnularCobroDto — motivo §4.7', () => {
  it('acepta un motivo de 10+ caracteres', async () => {
    expect(
      await errores(AnularCobroDto, { motivo: 'Cobro duplicado por error de carga' }),
    ).toHaveLength(0);
  });

  it('rechaza un motivo de menos de 10 caracteres', async () => {
    const errs = await errores(AnularCobroDto, { motivo: 'corto' });
    expect(errs.some((e) => e.property === 'motivo')).toBe(true);
  });

  it('rechaza motivo ausente', async () => {
    const errs = await errores(AnularCobroDto, {});
    expect(errs.some((e) => e.property === 'motivo')).toBe(true);
  });
});
