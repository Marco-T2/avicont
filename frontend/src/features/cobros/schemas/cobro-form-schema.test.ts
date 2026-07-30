import { describe, expect, it } from 'vitest';

import { cobroFormSchema } from './cobro-form-schema';

const VALIDO = {
  contactoId: 'c-1',
  fechaContable: '2026-07-15',
  monto: '1250.50',
  cuentaDestinoId: 'cta-1',
  glosa: 'Cobro factura 12',
};

describe('cobroFormSchema', () => {
  it('acepta un cobro válido', () => {
    expect(cobroFormSchema.safeParse(VALIDO).success).toBe(true);
  });

  it.each(['1250', '1250.5', '1250.50', '0.01'])('acepta el monto %j', (monto) => {
    expect(cobroFormSchema.safeParse({ ...VALIDO, monto }).success).toBe(true);
  });

  it.each(['0', '0.00', '', '-5', '1,50', '1.234', 'abc'])(
    'rechaza el monto %j',
    (monto) => {
      expect(cobroFormSchema.safeParse({ ...VALIDO, monto }).success).toBe(false);
    },
  );

  it('rechaza fecha que no sea YYYY-MM-DD', () => {
    expect(cobroFormSchema.safeParse({ ...VALIDO, fechaContable: '15/07/2026' }).success).toBe(
      false,
    );
  });

  it('rechaza glosa de solo espacios', () => {
    expect(cobroFormSchema.safeParse({ ...VALIDO, glosa: '   ' }).success).toBe(false);
  });

  it('exige cliente y cuenta destino', () => {
    expect(cobroFormSchema.safeParse({ ...VALIDO, contactoId: '' }).success).toBe(false);
    expect(cobroFormSchema.safeParse({ ...VALIDO, cuentaDestinoId: '' }).success).toBe(false);
  });
});
