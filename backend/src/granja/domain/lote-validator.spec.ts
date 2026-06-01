/**
 * Tests del validator puro de Lote. Cero dependencias de DB/NestJS.
 * Cada invariante tiene caso positivo (+) y negativo (−).
 */

import { EstadoLote } from './enums';
import {
  LoteCantidadInicialInmutableError,
  LoteCantidadInicialInvalidaError,
  LoteCerradoError,
  LoteYaCerradoError,
} from './granja-errors';
import type { LoteRow } from '../ports/lote.repository.port';
import { validarCreacionLote, validarEdicionLote, validarCierreLote } from './lote-validator';

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function makeLoteRow(overrides: Partial<LoteRow> = {}): LoteRow {
  return {
    id: 'lote-1',
    organizationId: 'org-1',
    cantidadInicial: 500,
    fechaIngreso: new Date('2026-05-01'),
    fechaEstimadaSaca: null,
    fechaCierre: null,
    galpon: 'Galpón A',
    estado: EstadoLote.ACTIVO,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ------------------------------------------------------------
// validarCreacionLote
// ------------------------------------------------------------

describe('validarCreacionLote', () => {
  it('(+) acepta cantidadInicial entero mayor a cero', () => {
    expect(() => validarCreacionLote({ cantidadInicial: 1 })).not.toThrow();
    expect(() => validarCreacionLote({ cantidadInicial: 500 })).not.toThrow();
    expect(() => validarCreacionLote({ cantidadInicial: 9999 })).not.toThrow();
  });

  it('(−) rechaza cantidadInicial = 0', () => {
    expect(() => validarCreacionLote({ cantidadInicial: 0 })).toThrow(
      LoteCantidadInicialInvalidaError,
    );
  });

  it('(−) rechaza cantidadInicial negativa', () => {
    expect(() => validarCreacionLote({ cantidadInicial: -1 })).toThrow(
      LoteCantidadInicialInvalidaError,
    );
    expect(() => validarCreacionLote({ cantidadInicial: -100 })).toThrow(
      LoteCantidadInicialInvalidaError,
    );
  });

  it('(−) rechaza cantidadInicial no entera (decimal)', () => {
    expect(() => validarCreacionLote({ cantidadInicial: 10.5 })).toThrow(
      LoteCantidadInicialInvalidaError,
    );
    expect(() => validarCreacionLote({ cantidadInicial: 1.1 })).toThrow(
      LoteCantidadInicialInvalidaError,
    );
  });
});

// ------------------------------------------------------------
// validarEdicionLote
// ------------------------------------------------------------

describe('validarEdicionLote', () => {
  it('(+) permite editar galpón de un lote ACTIVO sin cambiar cantidadInicial', () => {
    const lote = makeLoteRow({ estado: EstadoLote.ACTIVO });
    expect(() => validarEdicionLote(lote, { galpon: 'Galpón B' })).not.toThrow();
  });

  it('(+) permite pasar input vacío (sin campos) sobre lote ACTIVO', () => {
    const lote = makeLoteRow({ estado: EstadoLote.ACTIVO });
    expect(() => validarEdicionLote(lote, {})).not.toThrow();
  });

  it('(−) rechaza edición de lote CERRADO', () => {
    const lote = makeLoteRow({ estado: EstadoLote.CERRADO });
    expect(() => validarEdicionLote(lote, { galpon: 'Nuevo' })).toThrow(LoteCerradoError);
  });

  it('(−) rechaza intento de cambiar cantidadInicial (inmutable post-creación)', () => {
    const lote = makeLoteRow({ estado: EstadoLote.ACTIVO });
    expect(() =>
      validarEdicionLote(lote, { cantidadInicial: 999 } as Record<string, unknown>),
    ).toThrow(LoteCantidadInicialInmutableError);
  });

  it('(−) rechaza cambio de cantidadInicial en lote CERRADO (inmutable tiene precedencia)', () => {
    // Ambos invariantes aplican; el de cantidadInicial se chequea primero.
    const lote = makeLoteRow({ estado: EstadoLote.CERRADO });
    expect(() =>
      validarEdicionLote(lote, { cantidadInicial: 999 } as Record<string, unknown>),
    ).toThrow(LoteCantidadInicialInmutableError);
  });
});

// ------------------------------------------------------------
// validarCierreLote
// ------------------------------------------------------------

describe('validarCierreLote', () => {
  it('(+) permite cerrar un lote ACTIVO', () => {
    const lote = makeLoteRow({ estado: EstadoLote.ACTIVO });
    expect(() => validarCierreLote(lote)).not.toThrow();
  });

  it('(−) rechaza cerrar un lote ya CERRADO', () => {
    const lote = makeLoteRow({ estado: EstadoLote.CERRADO });
    expect(() => validarCierreLote(lote)).toThrow(LoteYaCerradoError);
  });
});
