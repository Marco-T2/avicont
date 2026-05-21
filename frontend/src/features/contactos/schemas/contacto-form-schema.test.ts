import { describe, expect, it } from 'vitest';

import {
  contactoFormSchema,
  type ContactoFormValues,
} from './contacto-form-schema';

const VALID: ContactoFormValues = {
  razonSocial: 'Avicola del Norte S.R.L.',
  nombreComercial: '',
  documento: '',
  email: '',
  telefono: '',
  direccion: '',
  esCliente: true,
  esProveedor: false,
};

describe('contactoFormSchema', () => {
  // E-FORM-01: objeto válido mínimo con esCliente=true, resto vacío → success
  it('E-FORM-01: acepta un contacto válido mínimo con esCliente=true', () => {
    const result = contactoFormSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  // E-FORM-02: esCliente=false && esProveedor=false → falla, path incluye esCliente
  it('E-FORM-02: rechaza contacto sin esCliente ni esProveedor', () => {
    const result = contactoFormSchema.safeParse({
      ...VALID,
      esCliente: false,
      esProveedor: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path).flat();
      expect(paths).toContain('esCliente');
    }
  });

  // E-FORM-03: razonSocial de 1 char → falla (min 2)
  it('E-FORM-03: rechaza razonSocial con menos de 2 caracteres', () => {
    const result = contactoFormSchema.safeParse({ ...VALID, razonSocial: 'A' });
    expect(result.success).toBe(false);
  });

  // E-FORM-04: email con formato inválido → falla
  it('E-FORM-04: rechaza email con formato inválido', () => {
    const result = contactoFormSchema.safeParse({
      ...VALID,
      email: 'no-es-email',
    });
    expect(result.success).toBe(false);
  });

  // E-FORM-05: todos los opcionales vacíos con esCliente=true → success
  it('E-FORM-05: acepta todos los campos opcionales vacíos', () => {
    const result = contactoFormSchema.safeParse({
      razonSocial: 'Cliente Válido',
      nombreComercial: '',
      documento: '',
      email: '',
      telefono: '',
      direccion: '',
      esCliente: true,
      esProveedor: false,
    });
    expect(result.success).toBe(true);
  });

  // Casos adicionales de robustez
  it('acepta contacto que es cliente Y proveedor a la vez', () => {
    const result = contactoFormSchema.safeParse({
      ...VALID,
      esCliente: true,
      esProveedor: true,
    });
    expect(result.success).toBe(true);
  });

  it('acepta contacto solo esProveedor=true', () => {
    const result = contactoFormSchema.safeParse({
      ...VALID,
      esCliente: false,
      esProveedor: true,
    });
    expect(result.success).toBe(true);
  });

  it('acepta email válido cuando se proporciona', () => {
    const result = contactoFormSchema.safeParse({
      ...VALID,
      email: 'contacto@empresa.com.bo',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza razonSocial vacía', () => {
    const result = contactoFormSchema.safeParse({ ...VALID, razonSocial: '' });
    expect(result.success).toBe(false);
  });

  it('rechaza razonSocial que supera 200 caracteres', () => {
    const result = contactoFormSchema.safeParse({
      ...VALID,
      razonSocial: 'A'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});
