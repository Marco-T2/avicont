/**
 * Tests de validación del DTO UpdateTenantDto para los campos fiscales.
 *
 * Verifica que el DTO con exactOptionalPropertyTypes acepta campos opcionales,
 * null para desmapear, y maxLength por campo. NIT y email SIN @Matches/@IsEmail
 * (la validación semántica va en el service con DomainError).
 */
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { UpdateTenantDto } from './update-tenant.dto';

async function validateDto(data: Record<string, unknown>) {
  const instance = plainToInstance(UpdateTenantDto, data);
  return validate(instance);
}

describe('UpdateTenantDto — campos fiscales', () => {
  it('payload vacío {} es válido (no hay campos requeridos)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('razonSocial de 200 caracteres → válido', async () => {
    const errors = await validateDto({ razonSocial: 'A'.repeat(200) });
    expect(errors).toHaveLength(0);
  });

  it('razonSocial de 201 caracteres → inválido (maxLength 200)', async () => {
    const errors = await validateDto({ razonSocial: 'A'.repeat(201) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('razonSocial');
  });

  it('direccion de 300 caracteres → válido', async () => {
    const errors = await validateDto({ direccion: 'A'.repeat(300) });
    expect(errors).toHaveLength(0);
  });

  it('direccion de 301 caracteres → inválido (maxLength 300)', async () => {
    const errors = await validateDto({ direccion: 'A'.repeat(301) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('direccion');
  });

  it('representanteLegal de 150 caracteres → válido', async () => {
    const errors = await validateDto({ representanteLegal: 'A'.repeat(150) });
    expect(errors).toHaveLength(0);
  });

  it('representanteLegal de 151 caracteres → inválido (maxLength 150)', async () => {
    const errors = await validateDto({ representanteLegal: 'A'.repeat(151) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('representanteLegal');
  });

  it('telefono de 30 caracteres → válido', async () => {
    const errors = await validateDto({ telefono: '1'.repeat(30) });
    expect(errors).toHaveLength(0);
  });

  it('telefono de 31 caracteres → inválido (maxLength 30)', async () => {
    const errors = await validateDto({ telefono: '1'.repeat(31) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('telefono');
  });

  it('email de 254 caracteres → válido (maxLength 254, sin @IsEmail en DTO)', async () => {
    // El DTO solo valida maxLength, el service valida formato
    const errors = await validateDto({ email: 'a'.repeat(250) + '@b.c' });
    expect(errors).toHaveLength(0);
  });

  it('email de 255 caracteres → inválido (maxLength 254)', async () => {
    const errors = await validateDto({ email: 'a'.repeat(252) + '@b.c' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('email');
  });

  it('nit con valor string → válido en el DTO (el service valida el formato)', async () => {
    // El DTO solo acepta strings opcionales; la validación NIT va en el service
    const errors = await validateDto({ nit: '12345AB' });
    expect(errors).toHaveLength(0);
  });

  it('nit: null → válido (desmapear)', async () => {
    const errors = await validateDto({ nit: null });
    expect(errors).toHaveLength(0);
  });

  it('email: null → válido (desmapear)', async () => {
    const errors = await validateDto({ email: null });
    expect(errors).toHaveLength(0);
  });

  it('razonSocial: null → válido (desmapear)', async () => {
    const errors = await validateDto({ razonSocial: null });
    expect(errors).toHaveLength(0);
  });

  it('nit como número (no string) → inválido (@IsString)', async () => {
    const errors = await validateDto({ nit: 1234567 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('nit');
  });
});
