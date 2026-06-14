import { describe, expect, it } from 'vitest';

import type { Comprobante } from '@/types/api';

import { mapComprobanteAForm } from './map-comprobante-a-form';

const baseComprobante: Comprobante = {
  id: 'comp-1',
  tipo: 'DIARIO',
  numero: null,
  estado: 'BORRADOR',
  fechaContable: '2026-05-27',
  periodoFiscalId: 'p1',
  glosa: 'Pago servicios',
  monedaPrincipal: 'BOB',
  tipoCambioReexpresion: '1.00000000',
  totalDebitoBob: '1000.00',
  totalCreditoBob: '1000.00',
  anulado: false,
  fechaAnulacion: null,
  anuladoPorUserId: null,
  motivoAnulacion: null,
  createdByUserId: 'u1',
  createdAt: '2026-05-27T00:00:00Z',
  updatedAt: '2026-05-27T00:00:00Z',
  lineas: [],
};

describe('mapComprobanteAForm — hidratación del T/C de re-expresión', () => {
  it('incluye tipoCambioReexpresion aunque sea el default "1.00000000"', () => {
    // El backend siempre devuelve el T/C; el form debe reflejarlo para no
    // arrancar vacío y mandar "" a la validación zod (que exige decimal > 0).
    const result = mapComprobanteAForm({ ...baseComprobante, tipoCambioReexpresion: '1.00000000' });
    expect(result.tipoCambioReexpresion).toBe('1.00000000');
  });

  it('incluye tipoCambioReexpresion cuando el backend lo normaliza a "1"', () => {
    const result = mapComprobanteAForm({ ...baseComprobante, tipoCambioReexpresion: '1' });
    expect(result.tipoCambioReexpresion).toBe('1');
  });

  it('refleja un T/C de re-expresión no-default', () => {
    const result = mapComprobanteAForm({ ...baseComprobante, tipoCambioReexpresion: '6.96' });
    expect(result.tipoCambioReexpresion).toBe('6.96');
  });
});
