/**
 * Tests unitarios del MovimientoValidator.
 * Sin DB, sin NestJS. Puro.
 */

import { NaturalezaRegistro } from './enums';
import {
  MovimientoCantidadInvalidaError,
  MovimientoInversionMontoInvalidoError,
  TipoRegistroNaturalezaInvalidaError,
  TipoRegistroInactivoError,
} from './granja-errors';
import {
  validarRegistroInversion,
  validarRegistroCantidad,
  type MovimientoInversionInput,
  type MovimientoCantidadInput,
} from './movimiento-validator';
import type { TipoRegistroRow } from '../ports/tipo-registro.repository.port';

// ============================================================
// Fixtures
// ============================================================

function makeTipoInversion(overrides: Partial<TipoRegistroRow> = {}): TipoRegistroRow {
  return {
    id: 'tipo-inversion-1',
    organizationId: 'org-1',
    nombre: 'Alimento',
    naturaleza: NaturalezaRegistro.INVERSION,
    esSistema: true,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTipoCantidad(overrides: Partial<TipoRegistroRow> = {}): TipoRegistroRow {
  return {
    id: 'tipo-cantidad-1',
    organizationId: 'org-1',
    nombre: 'Mortalidad',
    naturaleza: NaturalezaRegistro.CANTIDAD,
    esSistema: true,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const inversionInputValido: MovimientoInversionInput = {
  monto: '1250.50',
  detalle: null,
};

const cantidadInputValida: MovimientoCantidadInput = {
  cantidad: 30,
  detalle: null,
};

// ============================================================
// validarRegistroInversion
// ============================================================

describe('validarRegistroInversion', () => {
  describe('caso feliz', () => {
    it('no lanza si monto > 0 y tipo es INVERSION activo', () => {
      expect(() =>
        validarRegistroInversion(inversionInputValido, makeTipoInversion()),
      ).not.toThrow();
    });

    it('acepta monto como string con decimales válidos', () => {
      expect(() =>
        validarRegistroInversion({ monto: '0.01', detalle: null }, makeTipoInversion()),
      ).not.toThrow();
    });
  });

  describe('monto inválido', () => {
    it('lanza MontoInvalidoError si monto es "0"', () => {
      expect(() =>
        validarRegistroInversion({ monto: '0', detalle: null }, makeTipoInversion()),
      ).toThrow(MovimientoInversionMontoInvalidoError);
    });

    it('lanza MontoInvalidoError si monto es negativo', () => {
      expect(() =>
        validarRegistroInversion({ monto: '-50', detalle: null }, makeTipoInversion()),
      ).toThrow(MovimientoInversionMontoInvalidoError);
    });
  });

  describe('naturaleza incorrecta', () => {
    it('lanza TipoRegistroNaturalezaInvalidaError si tipo es CANTIDAD', () => {
      expect(() => validarRegistroInversion(inversionInputValido, makeTipoCantidad())).toThrow(
        TipoRegistroNaturalezaInvalidaError,
      );
    });
  });

  describe('tipo inactivo', () => {
    it('lanza TipoRegistroInactivoError si tipo está inactivo', () => {
      expect(() =>
        validarRegistroInversion(inversionInputValido, makeTipoInversion({ activo: false })),
      ).toThrow(TipoRegistroInactivoError);
    });
  });

  describe('detalle', () => {
    it('acepta detalle null', () => {
      expect(() =>
        validarRegistroInversion({ monto: '100', detalle: null }, makeTipoInversion()),
      ).not.toThrow();
    });

    it('acepta detalle de exactamente 500 caracteres', () => {
      const detalle = 'x'.repeat(500);
      expect(() =>
        validarRegistroInversion({ monto: '100', detalle }, makeTipoInversion()),
      ).not.toThrow();
    });

    it('lanza ValidationError si detalle supera 500 caracteres', () => {
      const detalle = 'x'.repeat(501);
      expect(() =>
        validarRegistroInversion({ monto: '100', detalle }, makeTipoInversion()),
      ).toThrow();
    });
  });
});

// ============================================================
// validarRegistroCantidad
// ============================================================

describe('validarRegistroCantidad', () => {
  describe('caso feliz', () => {
    it('no lanza si cantidad > 0 y tipo es CANTIDAD activo', () => {
      expect(() => validarRegistroCantidad(cantidadInputValida, makeTipoCantidad())).not.toThrow();
    });

    it('acepta cantidad = 1 (mínimo)', () => {
      expect(() =>
        validarRegistroCantidad({ cantidad: 1, detalle: null }, makeTipoCantidad()),
      ).not.toThrow();
    });
  });

  describe('cantidad inválida', () => {
    it('lanza MovimientoCantidadInvalidaError si cantidad = 0', () => {
      expect(() =>
        validarRegistroCantidad({ cantidad: 0, detalle: null }, makeTipoCantidad()),
      ).toThrow(MovimientoCantidadInvalidaError);
    });

    it('lanza MovimientoCantidadInvalidaError si cantidad es negativa', () => {
      expect(() =>
        validarRegistroCantidad({ cantidad: -5, detalle: null }, makeTipoCantidad()),
      ).toThrow(MovimientoCantidadInvalidaError);
    });

    it('lanza MovimientoCantidadInvalidaError si cantidad no es entero', () => {
      expect(() =>
        validarRegistroCantidad({ cantidad: 2.5, detalle: null }, makeTipoCantidad()),
      ).toThrow(MovimientoCantidadInvalidaError);
    });
  });

  describe('naturaleza incorrecta', () => {
    it('lanza TipoRegistroNaturalezaInvalidaError si tipo es INVERSION', () => {
      expect(() => validarRegistroCantidad(cantidadInputValida, makeTipoInversion())).toThrow(
        TipoRegistroNaturalezaInvalidaError,
      );
    });
  });

  describe('tipo inactivo', () => {
    it('lanza TipoRegistroInactivoError si tipo está inactivo', () => {
      expect(() =>
        validarRegistroCantidad(cantidadInputValida, makeTipoCantidad({ activo: false })),
      ).toThrow(TipoRegistroInactivoError);
    });
  });

  describe('detalle', () => {
    it('acepta detalle de exactamente 500 caracteres', () => {
      const detalle = 'x'.repeat(500);
      expect(() =>
        validarRegistroCantidad({ cantidad: 5, detalle }, makeTipoCantidad()),
      ).not.toThrow();
    });

    it('lanza si detalle supera 500 caracteres', () => {
      const detalle = 'x'.repeat(501);
      expect(() => validarRegistroCantidad({ cantidad: 5, detalle }, makeTipoCantidad())).toThrow();
    });
  });
});
