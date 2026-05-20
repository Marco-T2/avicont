import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTenantDto } from './create-tenant.dto';

/**
 * Unit specs del DTO `CreateTenantDto`.
 * Validan que el campo `modulo` sea requerido y que solo acepte los valores del enum.
 */
describe('CreateTenantDto (unit)', () => {
  async function validar(plain: Record<string, unknown>) {
    const dto = plainToInstance(CreateTenantDto, plain);
    return validate(dto);
  }

  describe('campo name', () => {
    it('acepta un name válido', async () => {
      const errores = await validar({ name: 'Acme Corp', modulo: 'CONTABILIDAD' });
      expect(errores.filter((e) => e.property === 'name')).toHaveLength(0);
    });

    it('rechaza name vacío', async () => {
      const errores = await validar({ name: '', modulo: 'CONTABILIDAD' });
      expect(errores.some((e) => e.property === 'name')).toBe(true);
    });
  });

  describe('campo modulo', () => {
    it('acepta modulo CONTABILIDAD', async () => {
      const errores = await validar({ name: 'Org A', modulo: 'CONTABILIDAD' });
      expect(errores.filter((e) => e.property === 'modulo')).toHaveLength(0);
    });

    it('acepta modulo GRANJA', async () => {
      const errores = await validar({ name: 'Org B', modulo: 'GRANJA' });
      expect(errores.filter((e) => e.property === 'modulo')).toHaveLength(0);
    });

    it('acepta modulo OTROS', async () => {
      const errores = await validar({ name: 'Org C', modulo: 'OTROS' });
      expect(errores.filter((e) => e.property === 'modulo')).toHaveLength(0);
    });

    it('rechaza modulo ausente', async () => {
      const errores = await validar({ name: 'Org D' });
      expect(errores.some((e) => e.property === 'modulo')).toBe(true);
    });

    it('rechaza modulo null', async () => {
      const errores = await validar({ name: 'Org E', modulo: null });
      expect(errores.some((e) => e.property === 'modulo')).toBe(true);
    });

    it('rechaza modulo fuera del enum (FARMACIA)', async () => {
      const errores = await validar({ name: 'Org F', modulo: 'FARMACIA' });
      const errorModulo = errores.find((e) => e.property === 'modulo');
      expect(errorModulo).toBeDefined();
    });

    it('rechaza modulo vacío', async () => {
      const errores = await validar({ name: 'Org G', modulo: '' });
      expect(errores.some((e) => e.property === 'modulo')).toBe(true);
    });
  });
});
