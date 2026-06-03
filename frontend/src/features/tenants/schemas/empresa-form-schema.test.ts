import { describe, expect, it } from 'vitest';

import { empresaFormSchema } from './empresa-form-schema';

// Helper: base de campos vacíos para evitar errores de campo requerido en tests unitarios
const EMPTY_BASE = {
  razonSocial: '',
  nit: '',
  direccion: '',
  representanteLegal: '',
  telefono: '',
  email: '',
};

describe('empresaFormSchema — validación NIT', () => {
  it('NIT de 7 dígitos es válido', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, nit: '1234567' });
    expect(result.success).toBe(true);
  });

  it('NIT de 12 dígitos es válido', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, nit: '123456789012' });
    expect(result.success).toBe(true);
  });

  it('NIT de 6 dígitos es inválido', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, nit: '123456' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('El NIT debe tener entre 7 y 12 dígitos');
    }
  });

  it('NIT de 13 dígitos es inválido', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, nit: '1234567890123' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('El NIT debe tener entre 7 y 12 dígitos');
    }
  });

  it('NIT con letras es inválido', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, nit: '12345AB' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('El NIT debe tener entre 7 y 12 dígitos');
    }
  });

  it('NIT vacío es válido (campo opcional — desmapear)', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, nit: '' });
    expect(result.success).toBe(true);
  });
});

describe('empresaFormSchema — validación email', () => {
  it('email válido es aceptado', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, email: 'contacto@empresa.com' });
    expect(result.success).toBe(true);
  });

  it('email malformado es rechazado', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, email: 'no-es-un-email' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Email inválido');
    }
  });

  it('email vacío es válido (campo opcional — desmapear)', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, email: '' });
    expect(result.success).toBe(true);
  });
});

describe('empresaFormSchema — maxLength', () => {
  it('razonSocial de 200 caracteres es válida', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, razonSocial: 'A'.repeat(200) });
    expect(result.success).toBe(true);
  });

  it('razonSocial de 201 caracteres es inválida', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, razonSocial: 'A'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('direccion de 300 caracteres es válida', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, direccion: 'A'.repeat(300) });
    expect(result.success).toBe(true);
  });

  it('direccion de 301 caracteres es inválida', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, direccion: 'A'.repeat(301) });
    expect(result.success).toBe(false);
  });

  it('representanteLegal de 150 caracteres es válido', () => {
    const result = empresaFormSchema.safeParse({
      ...EMPTY_BASE,
      representanteLegal: 'A'.repeat(150),
    });
    expect(result.success).toBe(true);
  });

  it('representanteLegal de 151 caracteres es inválido', () => {
    const result = empresaFormSchema.safeParse({
      ...EMPTY_BASE,
      representanteLegal: 'A'.repeat(151),
    });
    expect(result.success).toBe(false);
  });

  it('telefono de 30 caracteres es válido', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, telefono: '1'.repeat(30) });
    expect(result.success).toBe(true);
  });

  it('telefono de 31 caracteres es inválido', () => {
    const result = empresaFormSchema.safeParse({ ...EMPTY_BASE, telefono: '1'.repeat(31) });
    expect(result.success).toBe(false);
  });
});

describe('empresaFormSchema — defaults vacíos', () => {
  it('objeto con todos los campos en string vacío es válido', () => {
    const result = empresaFormSchema.safeParse(EMPTY_BASE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nit).toBe('');
      expect(result.data.email).toBe('');
      expect(result.data.razonSocial).toBe('');
    }
  });
});
