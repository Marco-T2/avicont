import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AnularVentaDto } from './anular-venta.dto';

// §4.7: la única fricción del flujo es el motivo de anulación — y por eso
// tiene que estar presente y ser significativo YA en el borde HTTP.
describe('AnularVentaDto — motivo obligatorio', () => {
  async function tieneError(payload: Record<string, unknown>): Promise<boolean> {
    const dto = plainToInstance(AnularVentaDto, payload);
    const errores = await validate(dto);
    return errores.some((e) => e.property === 'motivo');
  }

  it('rechaza motivo ausente', async () => {
    expect(await tieneError({})).toBe(true);
  });

  it('rechaza motivo corto (< 10 caracteres)', async () => {
    expect(await tieneError({ motivo: 'corto' })).toBe(true);
  });

  it('acepta motivo válido', async () => {
    expect(await tieneError({ motivo: 'Error en la imputación al cliente' })).toBe(false);
  });
});
