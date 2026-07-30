import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListarVentasQueryDto } from './listar-ventas.dto';

describe('ListarVentasQueryDto — validación de query params', () => {
  async function errores(payload: Record<string, unknown>) {
    const dto = plainToInstance(ListarVentasQueryDto, payload);
    return validate(dto, { whitelist: true });
  }

  it('acepta query vacía (todo opcional)', async () => {
    expect(await errores({})).toHaveLength(0);
  });

  it('acepta filtros válidos', async () => {
    expect(
      await errores({
        contactoId: '11111111-1111-4111-a111-111111111111',
        fechaDesde: '2026-07-01',
        fechaHasta: '2026-07-31',
        page: '2',
        pageSize: '25',
      }),
    ).toHaveLength(0);
  });

  it('rechaza fechaDesde que no es fecha de calendario (§4.6)', async () => {
    const errs = await errores({ fechaDesde: '2026-02-31' });
    expect(errs.some((e) => e.property === 'fechaDesde')).toBe(true);
  });

  it('rechaza fechaHasta con hora', async () => {
    const errs = await errores({ fechaHasta: '2026-07-31T00:00:00Z' });
    expect(errs.some((e) => e.property === 'fechaHasta')).toBe(true);
  });

  it('rechaza contactoId que no es UUID', async () => {
    const errs = await errores({ contactoId: 'cliente' });
    expect(errs.some((e) => e.property === 'contactoId')).toBe(true);
  });

  it('rechaza page 0', async () => {
    const errs = await errores({ page: '0' });
    expect(errs.some((e) => e.property === 'page')).toBe(true);
  });

  it('rechaza pageSize por encima del máximo (100)', async () => {
    const errs = await errores({ pageSize: '101' });
    expect(errs.some((e) => e.property === 'pageSize')).toBe(true);
  });

  it('convierte page string → number (query params llegan como string)', async () => {
    const dto = plainToInstance(ListarVentasQueryDto, { page: '3' });
    expect(dto.page).toBe(3);
  });
});
