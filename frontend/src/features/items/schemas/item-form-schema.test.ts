import { describe, expect, it } from 'vitest';

import { itemFormSchema, type ItemFormValues } from './item-form-schema';

// Mínimo válido: solo nombre + tipo con contenido; el resto en su valor
// "vacío" de formulario (la conversión '' → null vive en la capa api/).
const VALID: ItemFormValues = {
  nombre: 'Pollo entero',
  tipo: 'PRODUCTO',
  codigo: '',
  unidadMedida: '',
  precioUnitarioSugerido: '',
  cantidadPorDefecto: '1',
  cuentaIngresoId: '',
};

describe('itemFormSchema', () => {
  it('acepta el mínimo: nombre + tipo, con todos los opcionales vacíos', () => {
    const result = itemFormSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it('acepta un ítem completo con todos los campos', () => {
    const result = itemFormSchema.safeParse({
      nombre: 'Pollo entero',
      tipo: 'PRODUCTO',
      codigo: 'P-01',
      unidadMedida: 'kg',
      precioUnitarioSugerido: '6.305000',
      cantidadPorDefecto: '12',
      cuentaIngresoId: '4c9f4d1e-5b7a-4f3e-9c2d-1a2b3c4d5e6f',
    });
    expect(result.success).toBe(true);
  });

  // ── nombre ────────────────────────────────────────────────────────────
  it('rechaza nombre vacío', () => {
    const result = itemFormSchema.safeParse({ ...VALID, nombre: '' });
    expect(result.success).toBe(false);
  });

  it('rechaza nombre de más de 200 caracteres', () => {
    const result = itemFormSchema.safeParse({ ...VALID, nombre: 'A'.repeat(201) });
    expect(result.success).toBe(false);
  });

  // ── tipo ──────────────────────────────────────────────────────────────
  it('rechaza un tipo fuera del enum', () => {
    const result = itemFormSchema.safeParse({ ...VALID, tipo: 'OTRO' });
    expect(result.success).toBe(false);
  });

  it('acepta tipo SERVICIO', () => {
    const result = itemFormSchema.safeParse({ ...VALID, tipo: 'SERVICIO' });
    expect(result.success).toBe(true);
  });

  // ── codigo (opcional, la unicidad la resuelve el backend) ─────────────
  it('acepta código vacío — dos ítems sin código conviven (REQ-ITM-02)', () => {
    const result = itemFormSchema.safeParse({ ...VALID, codigo: '' });
    expect(result.success).toBe(true);
  });

  it('rechaza código de más de 50 caracteres', () => {
    const result = itemFormSchema.safeParse({ ...VALID, codigo: 'X'.repeat(51) });
    expect(result.success).toBe(false);
  });

  // ── unidadMedida ──────────────────────────────────────────────────────
  it('rechaza unidad de medida de más de 20 caracteres', () => {
    const result = itemFormSchema.safeParse({
      ...VALID,
      unidadMedida: 'u'.repeat(21),
    });
    expect(result.success).toBe(false);
  });

  // ── precioUnitarioSugerido (string decimal §4.5 — NUNCA number) ───────
  it('acepta precio vacío (opcional)', () => {
    const result = itemFormSchema.safeParse({ ...VALID, precioUnitarioSugerido: '' });
    expect(result.success).toBe(true);
  });

  it('acepta precio "0" (≥ 0 permitido)', () => {
    const result = itemFormSchema.safeParse({ ...VALID, precioUnitarioSugerido: '0' });
    expect(result.success).toBe(true);
  });

  it('acepta precio con hasta 6 decimales', () => {
    const result = itemFormSchema.safeParse({
      ...VALID,
      precioUnitarioSugerido: '6.305001',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza precio con más de 6 decimales', () => {
    const result = itemFormSchema.safeParse({
      ...VALID,
      precioUnitarioSugerido: '1.1234567',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza precio con coma decimal', () => {
    const result = itemFormSchema.safeParse({
      ...VALID,
      precioUnitarioSugerido: '1,50',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza precio no numérico', () => {
    const result = itemFormSchema.safeParse({
      ...VALID,
      precioUnitarioSugerido: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza precio negativo', () => {
    const result = itemFormSchema.safeParse({
      ...VALID,
      precioUnitarioSugerido: '-5',
    });
    expect(result.success).toBe(false);
  });

  // ── cantidadPorDefecto (string decimal > 0) ───────────────────────────
  it('rechaza cantidad vacía', () => {
    const result = itemFormSchema.safeParse({ ...VALID, cantidadPorDefecto: '' });
    expect(result.success).toBe(false);
  });

  it('rechaza cantidad "0"', () => {
    const result = itemFormSchema.safeParse({ ...VALID, cantidadPorDefecto: '0' });
    expect(result.success).toBe(false);
  });

  it('rechaza cantidad "0.000" (cero con decimales sigue siendo cero)', () => {
    const result = itemFormSchema.safeParse({
      ...VALID,
      cantidadPorDefecto: '0.000',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza cantidad negativa', () => {
    const result = itemFormSchema.safeParse({ ...VALID, cantidadPorDefecto: '-1' });
    expect(result.success).toBe(false);
  });

  it('acepta cantidad fraccionaria "0.5" (venta por peso)', () => {
    const result = itemFormSchema.safeParse({ ...VALID, cantidadPorDefecto: '0.5' });
    expect(result.success).toBe(true);
  });

  it('acepta cantidad entera "12" (venta por caja/jaula — D-25)', () => {
    const result = itemFormSchema.safeParse({ ...VALID, cantidadPorDefecto: '12' });
    expect(result.success).toBe(true);
  });
});
