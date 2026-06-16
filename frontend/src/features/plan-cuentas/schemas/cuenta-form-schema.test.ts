import { describe, expect, it } from 'vitest';

import { cuentaFormSchema, type CuentaFormValues } from './cuenta-form-schema';

const VALID: CuentaFormValues = {
  codigoInterno: '1.1.1.001',
  nombre: 'CAJA',
  descripcion: '',
  claseCuenta: 'ACTIVO',
  subClaseCuenta: 'ACTIVO_CORRIENTE',
  naturaleza: 'DEUDORA',
  esDetalle: true,
  requiereContacto: false,
  esContraria: false,
  monedaFuncional: 'BOB',
  permiteMultiMoneda: true,
  // actividadFlujo es opcional — undefined = sin clasificar
};

describe('cuentaFormSchema', () => {
  it('acepta un dto válido mínimo', () => {
    const result = cuentaFormSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it('rechaza codigoInterno con segmento no numérico', () => {
    const result = cuentaFormSchema.safeParse({ ...VALID, codigoInterno: '1.a.1' });
    expect(result.success).toBe(false);
  });

  it('rechaza codigoInterno con más de 8 niveles', () => {
    const result = cuentaFormSchema.safeParse({
      ...VALID,
      codigoInterno: '1.1.1.1.1.1.1.1.1',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza nombre vacío', () => {
    const result = cuentaFormSchema.safeParse({ ...VALID, nombre: '' });
    expect(result.success).toBe(false);
  });

  it('rechaza subClaseCuenta inconsistente con claseCuenta', () => {
    // ACTIVO con subClase INGRESO_OPERATIVO — no pertenece.
    const result = cuentaFormSchema.safeParse({
      ...VALID,
      claseCuenta: 'ACTIVO',
      subClaseCuenta: 'INGRESO_OPERATIVO',
    });
    expect(result.success).toBe(false);
  });

  it('acepta sin subClaseCuenta (solo válido si nivel 1, backend lo valida)', () => {
    // El schema del frontend no conoce el nivel; acepta undefined y deja
    // la validación cruzada al backend (válido solo en cuentas raíz).
    const result = cuentaFormSchema.safeParse({ ...VALID, subClaseCuenta: undefined });
    expect(result.success).toBe(true);
  });

  it('rechaza parentId que no es UUID', () => {
    const result = cuentaFormSchema.safeParse({ ...VALID, parentId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('acepta actividadFlujo undefined (campo opcional, sin clasificar)', () => {
    const result = cuentaFormSchema.safeParse({ ...VALID, actividadFlujo: undefined });
    expect(result.success).toBe(true);
  });

  it('acepta actividadFlujo con un valor válido del enum', () => {
    const result = cuentaFormSchema.safeParse({ ...VALID, actividadFlujo: 'INVERSION' });
    expect(result.success).toBe(true);
  });

  it('rechaza actividadFlujo con un valor fuera del enum', () => {
    const result = cuentaFormSchema.safeParse({ ...VALID, actividadFlujo: 'CAJA' });
    expect(result.success).toBe(false);
  });
});
