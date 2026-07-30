import { describe, expect, it } from 'vitest';

import { ventaFormSchema, type VentaFormValues } from './venta-form-schema';

const LINEA_VALIDA = {
  itemId: 'item-1',
  descripcion: 'Pollo entero',
  cantidad: '5',
  precioUnitario: '6.305',
};

const CONTADO_VALIDO: VentaFormValues = {
  contactoId: 'contacto-1',
  fechaContable: '2026-07-15',
  condicionPago: 'CONTADO',
  fechaVencimiento: '',
  glosa: 'Venta de pollo faenado a Avícola Sur',
  cuentaDestinoId: 'cuenta-caja',
  lineas: [LINEA_VALIDA],
};

const CREDITO_VALIDO: VentaFormValues = {
  ...CONTADO_VALIDO,
  condicionPago: 'CREDITO',
  fechaVencimiento: '2026-08-15',
  cuentaDestinoId: '',
};

function issuesDe(values: VentaFormValues): string[] {
  const result = ventaFormSchema.safeParse(values);
  if (result.success) return [];
  return result.error.issues.map((i) => i.path.join('.'));
}

describe('ventaFormSchema — reglas cruzadas de condicionPago (REQ-VTA-02)', () => {
  it('CONTADO válido y CREDITO válido pasan', () => {
    expect(ventaFormSchema.safeParse(CONTADO_VALIDO).success).toBe(true);
    expect(ventaFormSchema.safeParse(CREDITO_VALIDO).success).toBe(true);
  });

  it('CREDITO sin fechaVencimiento → error en fechaVencimiento', () => {
    expect(issuesDe({ ...CREDITO_VALIDO, fechaVencimiento: '' })).toContain(
      'fechaVencimiento',
    );
  });

  it('CONTADO con fechaVencimiento → error en fechaVencimiento (prohibida)', () => {
    expect(
      issuesDe({ ...CONTADO_VALIDO, fechaVencimiento: '2026-08-15' }),
    ).toContain('fechaVencimiento');
  });

  it('CONTADO sin cuentaDestinoId → error en cuentaDestinoId (PA-1)', () => {
    expect(issuesDe({ ...CONTADO_VALIDO, cuentaDestinoId: '' })).toContain(
      'cuentaDestinoId',
    );
  });

  it('CREDITO sin cuentaDestinoId es válido — la contrapartida es CxC', () => {
    expect(
      ventaFormSchema.safeParse({ ...CREDITO_VALIDO, cuentaDestinoId: '' }).success,
    ).toBe(true);
  });
});

describe('ventaFormSchema — líneas', () => {
  it('exige al menos una línea', () => {
    expect(issuesDe({ ...CONTADO_VALIDO, lineas: [] })).toContain('lineas');
  });

  it('cantidad 0 rechazada en cualquier formato', () => {
    for (const cantidad of ['0', '0.0', '000']) {
      expect(
        issuesDe({
          ...CONTADO_VALIDO,
          lineas: [{ ...LINEA_VALIDA, cantidad }],
        }),
      ).toContain('lineas.0.cantidad');
    }
  });

  it('precioUnitario 0 es VÁLIDO — ítem bonificado (REQ-VTA-04)', () => {
    expect(
      ventaFormSchema.safeParse({
        ...CONTADO_VALIDO,
        lineas: [{ ...LINEA_VALIDA, precioUnitario: '0' }],
      }).success,
    ).toBe(true);
  });

  it('cantidad y precio son strings decimales — sin signo ni notación rara', () => {
    expect(
      issuesDe({
        ...CONTADO_VALIDO,
        lineas: [{ ...LINEA_VALIDA, cantidad: '-1' }],
      }),
    ).toContain('lineas.0.cantidad');
    expect(
      issuesDe({
        ...CONTADO_VALIDO,
        lineas: [{ ...LINEA_VALIDA, precioUnitario: '1,5' }],
      }),
    ).toContain('lineas.0.precioUnitario');
  });

  it('línea sin ítem del catálogo → error', () => {
    expect(
      issuesDe({
        ...CONTADO_VALIDO,
        lineas: [{ ...LINEA_VALIDA, itemId: '' }],
      }),
    ).toContain('lineas.0.itemId');
  });
});
