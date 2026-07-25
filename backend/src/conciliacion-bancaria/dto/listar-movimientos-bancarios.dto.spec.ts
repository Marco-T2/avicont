import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListarMovimientosBancariosQueryDto } from './listar-movimientos-bancarios.dto';

/**
 * Validación del query DTO del verificador (REQ-VMB-01/03/04). El rango es
 * OBLIGATORIO; montos como string decimal (§4.5); limit con techo 200.
 */
describe('ListarMovimientosBancariosQueryDto (REQ-VMB-01/03/04)', () => {
  const BASE = { desde: '2026-06-01', hasta: '2026-06-30' };

  async function validar(query: Record<string, unknown>) {
    const dto = plainToInstance(ListarMovimientosBancariosQueryDto, query);
    const errores = await validate(dto);
    return { dto, propiedadesConError: errores.map((e) => e.property) };
  }

  it('rango solo: válido, con defaults page=1 y limit=50', async () => {
    const { dto, propiedadesConError } = await validar(BASE);

    expect(propiedadesConError).toEqual([]);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(50);
  });

  it('sin `desde` o sin `hasta` — rechazo de validación (REQ-VMB-01 escenario 3)', async () => {
    expect((await validar({ hasta: '2026-06-30' })).propiedadesConError).toContain('desde');
    expect((await validar({ desde: '2026-06-01' })).propiedadesConError).toContain('hasta');
  });

  it('fechas fuera del formato YYYY-MM-DD — rechazo (§4.6: sin UTC, sin hora)', async () => {
    expect((await validar({ ...BASE, desde: '2026-6-1' })).propiedadesConError).toContain('desde');
    expect(
      (await validar({ ...BASE, hasta: '2026-06-30T00:00:00Z' })).propiedadesConError,
    ).toContain('hasta');
  });

  it('limit: coerciona string numérico, acepta 200, rechaza 201/500/0', async () => {
    const ok = await validar({ ...BASE, limit: '200' });
    expect(ok.propiedadesConError).toEqual([]);
    expect(ok.dto.limit).toBe(200);

    expect((await validar({ ...BASE, limit: '201' })).propiedadesConError).toContain('limit');
    expect((await validar({ ...BASE, limit: '500' })).propiedadesConError).toContain('limit');
    expect((await validar({ ...BASE, limit: '0' })).propiedadesConError).toContain('limit');
  });

  it('page: mínimo 1', async () => {
    expect((await validar({ ...BASE, page: '0' })).propiedadesConError).toContain('page');
    expect((await validar({ ...BASE, page: '3' })).propiedadesConError).toEqual([]);
  });

  it('montos: string decimal con hasta 2 decimales (§4.5) — nunca number', async () => {
    expect((await validar({ ...BASE, montoDesde: '100' })).propiedadesConError).toEqual([]);
    expect((await validar({ ...BASE, montoDesde: '100.5' })).propiedadesConError).toEqual([]);
    expect((await validar({ ...BASE, montoHasta: '100.50' })).propiedadesConError).toEqual([]);

    expect((await validar({ ...BASE, montoDesde: '100.555' })).propiedadesConError).toContain(
      'montoDesde',
    );
    expect((await validar({ ...BASE, montoDesde: '-5' })).propiedadesConError).toContain(
      'montoDesde',
    );
    expect((await validar({ ...BASE, montoHasta: 'abc' })).propiedadesConError).toContain(
      'montoHasta',
    );
  });

  it('estado: solo valores del enum', async () => {
    expect((await validar({ ...BASE, estado: 'IGNORADO' })).propiedadesConError).toEqual([]);
    expect((await validar({ ...BASE, estado: 'CUALQUIERA' })).propiedadesConError).toContain(
      'estado',
    );
  });

  it('cuentaBancariaId: uuid válido', async () => {
    expect((await validar({ ...BASE, cuentaBancariaId: 'no-uuid' })).propiedadesConError).toContain(
      'cuentaBancariaId',
    );
  });
});
