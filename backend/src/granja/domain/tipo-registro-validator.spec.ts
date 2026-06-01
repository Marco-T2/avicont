/**
 * Tests del validator puro de TipoRegistro. Cero dependencias de DB/NestJS.
 * Cada invariante tiene caso positivo (+) y negativo (−).
 *
 * Las validaciones que requieren el repo (unicidad de nombre, countMovimientos)
 * NO están aquí — viven en tipo-registro.service.spec.ts.
 */

import { NaturalezaRegistro } from './enums';
import {
  TipoRegistroNaturalezaInmutableError,
  TipoRegistroSistemaNoEditableError,
  TipoRegistroSistemaNoEliminableError,
} from './granja-errors';
import type { TipoRegistroRow } from '../ports/tipo-registro.repository.port';
import {
  validarEdicionTipoRegistro,
  validarEliminacionTipoRegistro,
} from './tipo-registro-validator';

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function makeTipoRow(overrides: Partial<TipoRegistroRow> = {}): TipoRegistroRow {
  return {
    id: 'tipo-1',
    organizationId: 'org-1',
    nombre: 'Alimento',
    naturaleza: NaturalezaRegistro.INVERSION,
    esSistema: false,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ------------------------------------------------------------
// validarEdicionTipoRegistro
// ------------------------------------------------------------

describe('validarEdicionTipoRegistro', () => {
  it('(+) permite cambiar nombre de tipo propio (esSistema=false)', () => {
    const tipo = makeTipoRow({ esSistema: false });
    expect(() => validarEdicionTipoRegistro(tipo, { nombre: 'Vacunas' })).not.toThrow();
  });

  it('(+) permite cambiar activo en tipo de sistema', () => {
    const tipo = makeTipoRow({ esSistema: true });
    expect(() => validarEdicionTipoRegistro(tipo, { activo: false })).not.toThrow();
  });

  it('(+) permite cambiar activo en tipo propio', () => {
    const tipo = makeTipoRow({ esSistema: false });
    expect(() => validarEdicionTipoRegistro(tipo, { activo: false })).not.toThrow();
  });

  it('(+) permite input vacío (sin campos)', () => {
    const tipo = makeTipoRow({ esSistema: false });
    expect(() => validarEdicionTipoRegistro(tipo, {})).not.toThrow();
  });

  it('(−) rechaza cambio de naturaleza (inmutable para todos)', () => {
    const tipo = makeTipoRow({ esSistema: false });
    expect(() =>
      validarEdicionTipoRegistro(tipo, {
        naturaleza: NaturalezaRegistro.CANTIDAD,
      } as Record<string, unknown>),
    ).toThrow(TipoRegistroNaturalezaInmutableError);
  });

  it('(−) rechaza cambio de naturaleza en tipo de sistema también', () => {
    const tipo = makeTipoRow({ esSistema: true });
    expect(() =>
      validarEdicionTipoRegistro(tipo, {
        naturaleza: NaturalezaRegistro.CANTIDAD,
      } as Record<string, unknown>),
    ).toThrow(TipoRegistroNaturalezaInmutableError);
  });

  it('(−) rechaza cambio de nombre en tipo de sistema (esSistema=true)', () => {
    const tipo = makeTipoRow({ esSistema: true });
    expect(() => validarEdicionTipoRegistro(tipo, { nombre: 'Otro nombre' })).toThrow(
      TipoRegistroSistemaNoEditableError,
    );
  });
});

// ------------------------------------------------------------
// validarEliminacionTipoRegistro
// ------------------------------------------------------------

describe('validarEliminacionTipoRegistro', () => {
  it('(+) permite eliminar tipo propio (esSistema=false)', () => {
    const tipo = makeTipoRow({ esSistema: false });
    expect(() => validarEliminacionTipoRegistro(tipo)).not.toThrow();
  });

  it('(−) rechaza eliminar tipo de sistema (esSistema=true)', () => {
    const tipo = makeTipoRow({ esSistema: true });
    expect(() => validarEliminacionTipoRegistro(tipo)).toThrow(
      TipoRegistroSistemaNoEliminableError,
    );
  });
});
