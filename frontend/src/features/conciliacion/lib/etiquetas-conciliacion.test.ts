import { describe, expect, it } from 'vitest';

import {
  etiquetaConfianza,
  etiquetaEstadoEfectivoLinea,
  etiquetaEstadoEfectivoMovimiento,
  etiquetaLadoBancario,
  etiquetaLadoContable,
  etiquetaMotivoVinculoRoto,
} from './etiquetas-conciliacion';

describe('etiquetaMotivoVinculoRoto — REQ-CB-10, el motivo se muestra al usuario', () => {
  it('traduce LINEA_INEXISTENTE a un motivo legible en español', () => {
    expect(etiquetaMotivoVinculoRoto('LINEA_INEXISTENTE')).toBe(
      'La línea contable ya no existe',
    );
  });

  it('traduce COMPROBANTE_ANULADO a un motivo legible en español', () => {
    expect(etiquetaMotivoVinculoRoto('COMPROBANTE_ANULADO')).toBe(
      'El comprobante fue anulado',
    );
  });

  it('traduce MONTO_CAMBIADO a un motivo legible en español', () => {
    expect(etiquetaMotivoVinculoRoto('MONTO_CAMBIADO')).toBe(
      'El monto de la línea cambió',
    );
  });

  it('traduce CUENTA_CAMBIADA a un motivo legible en español', () => {
    expect(etiquetaMotivoVinculoRoto('CUENTA_CAMBIADA')).toBe(
      'La cuenta de la línea cambió',
    );
  });

  it('traduce LADO_CAMBIADO a un motivo legible en español', () => {
    expect(etiquetaMotivoVinculoRoto('LADO_CAMBIADO')).toBe(
      'La línea pasó de débito a crédito (o al revés)',
    );
  });

  it('traduce MONEDA_CAMBIADA a un motivo legible en español', () => {
    expect(etiquetaMotivoVinculoRoto('MONEDA_CAMBIADA')).toBe(
      'La moneda de la línea cambió',
    );
  });

  it('traduce FECHA_CAMBIADA a un motivo legible en español', () => {
    expect(etiquetaMotivoVinculoRoto('FECHA_CAMBIADA')).toBe(
      'La fecha de la línea cambió',
    );
  });
});

describe('etiquetaEstadoEfectivoMovimiento', () => {
  it('PENDIENTE → "Pendiente"', () => {
    expect(etiquetaEstadoEfectivoMovimiento('PENDIENTE')).toBe('Pendiente');
  });

  it('CONCILIADO → "Conciliado"', () => {
    expect(etiquetaEstadoEfectivoMovimiento('CONCILIADO')).toBe('Conciliado');
  });

  it('IGNORADO → "Ignorado"', () => {
    expect(etiquetaEstadoEfectivoMovimiento('IGNORADO')).toBe('Ignorado');
  });
});

describe('etiquetaEstadoEfectivoLinea', () => {
  it('EN_TRANSITO → "En tránsito"', () => {
    expect(etiquetaEstadoEfectivoLinea('EN_TRANSITO')).toBe('En tránsito');
  });

  it('CONCILIADO → "Conciliado"', () => {
    expect(etiquetaEstadoEfectivoLinea('CONCILIADO')).toBe('Conciliado');
  });
});

describe('etiquetaLadoBancario — perspectiva del BANCO (el extracto)', () => {
  it('CREDITO es plata que ENTRA a la cuenta', () => {
    expect(etiquetaLadoBancario('CREDITO')).toBe('Crédito (entrada)');
  });

  it('DEBITO es plata que SALE de la cuenta', () => {
    expect(etiquetaLadoBancario('DEBITO')).toBe('Débito (salida)');
  });
});

describe('etiquetaLadoContable — perspectiva de la EMPRESA (los libros)', () => {
  it('DEBITO se muestra con el vocabulario del contador: "Debe"', () => {
    expect(etiquetaLadoContable('DEBITO')).toBe('Debe');
  });

  it('CREDITO se muestra con el vocabulario del contador: "Haber"', () => {
    expect(etiquetaLadoContable('CREDITO')).toBe('Haber');
  });
});

describe('etiquetaConfianza — REQ-CB-12', () => {
  it('ALTA → "Alta"', () => {
    expect(etiquetaConfianza('ALTA')).toBe('Alta');
  });

  it('MEDIA → "Media"', () => {
    expect(etiquetaConfianza('MEDIA')).toBe('Media');
  });

  it('BAJA → "Baja"', () => {
    expect(etiquetaConfianza('BAJA')).toBe('Baja');
  });
});
