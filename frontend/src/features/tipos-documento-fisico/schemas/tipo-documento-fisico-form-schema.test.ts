import { describe, expect, it } from 'vitest';

import type { TipoDocumentoFisico } from '@/types/api';

import {
  mapTipoToFormValues,
  tipoDocumentoFisicoFormSchema,
} from './tipo-documento-fisico-form-schema';

const VALID_CREATE = {
  nombre: 'Factura recibida',
  codigo: 'factura-recibida',
  esTributario: true,
  activo: true,
  tiposComprobanteAplicables: [],
};

describe('tipoDocumentoFisicoFormSchema', () => {
  // Validaciones de nombre
  it('nombre vacío → falla con "El nombre es requerido"', () => {
    const result = tipoDocumentoFisicoFormSchema.safeParse({
      ...VALID_CREATE,
      nombre: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs).toContain('El nombre es requerido');
    }
  });

  it('nombre con más de 100 chars → falla con mensaje de longitud', () => {
    const result = tipoDocumentoFisicoFormSchema.safeParse({
      ...VALID_CREATE,
      nombre: 'A'.repeat(101),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs).toContain('El nombre no puede superar 100 caracteres');
    }
  });

  it('nombre válido → parse ok', () => {
    const result = tipoDocumentoFisicoFormSchema.safeParse(VALID_CREATE);
    expect(result.success).toBe(true);
  });

  // Validaciones de código
  it('codigo "Factura Recibida" (mayúscula/espacio) → falla con mensaje kebab-case', () => {
    const result = tipoDocumentoFisicoFormSchema.safeParse({
      ...VALID_CREATE,
      codigo: 'Factura Recibida',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.includes('kebab-case'))).toBe(true);
    }
  });

  it('codigo "factura-recibida" → ok', () => {
    const result = tipoDocumentoFisicoFormSchema.safeParse({
      ...VALID_CREATE,
      codigo: 'factura-recibida',
    });
    expect(result.success).toBe(true);
  });

  it('codigo con más de 20 chars → falla con mensaje de longitud', () => {
    const result = tipoDocumentoFisicoFormSchema.safeParse({
      ...VALID_CREATE,
      codigo: 'a'.repeat(21),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs).toContain('El código no puede superar 20 caracteres');
    }
  });

  it('codigo kebab con dígitos "fact-001" → ok', () => {
    const result = tipoDocumentoFisicoFormSchema.safeParse({
      ...VALID_CREATE,
      codigo: 'fact-001',
    });
    expect(result.success).toBe(true);
  });

  // tiposComprobanteAplicables vacío es permitido
  it('tiposComprobanteAplicables [] → parse ok, sin error', () => {
    const result = tipoDocumentoFisicoFormSchema.safeParse({
      ...VALID_CREATE,
      tiposComprobanteAplicables: [],
    });
    expect(result.success).toBe(true);
  });

  it('tiposComprobanteAplicables con valores válidos → ok', () => {
    const result = tipoDocumentoFisicoFormSchema.safeParse({
      ...VALID_CREATE,
      tiposComprobanteAplicables: ['DIARIO', 'INGRESO'],
    });
    expect(result.success).toBe(true);
  });
});

describe('mapTipoToFormValues', () => {
  it('mapea los 5 campos correctamente', () => {
    const tipo: TipoDocumentoFisico = {
      id: 'tdf-1',
      nombre: 'Factura recibida',
      codigo: 'factura-recibida',
      esTributario: true,
      activo: false,
      tiposComprobanteAplicables: ['DIARIO', 'INGRESO'],
      organizationId: 'org-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      numeracionAutomatica: false,
      numeroInicial: null,
    };
    const values = mapTipoToFormValues(tipo);
    expect(values.nombre).toBe('Factura recibida');
    expect(values.codigo).toBe('factura-recibida');
    expect(values.esTributario).toBe(true);
    expect(values.activo).toBe(false);
    expect(values.tiposComprobanteAplicables).toEqual(['DIARIO', 'INGRESO']);
  });
});
