/**
 * Tests de los mappers Prisma → dominio del módulo reportes.
 * Verifican que cada mapper produce identity de strings (todos los valores cubiertos).
 * Si Prisma agrega un valor nuevo, el Record en enum-mappers.ts falla en compile — estos
 * tests son la red de seguridad en runtime para el mapping exhaustivo.
 */

import {
  ClaseCuenta as PrismaClaseCuenta,
  NaturalezaCuenta as PrismaNaturalezaCuenta,
  SubClaseCuenta as PrismaSubClaseCuenta,
} from '@prisma/client';

import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@/common/domain/enums';

import {
  toDominioClaseCuenta,
  toDominioNaturalezaCuenta,
  toDominioSubClaseCuenta,
} from './enum-mappers';

describe('toDominioNaturalezaCuenta', () => {
  it('mapea DEUDORA', () => {
    expect(toDominioNaturalezaCuenta(PrismaNaturalezaCuenta.DEUDORA)).toBe(
      NaturalezaCuenta.DEUDORA,
    );
  });

  it('mapea ACREEDORA', () => {
    expect(toDominioNaturalezaCuenta(PrismaNaturalezaCuenta.ACREEDORA)).toBe(
      NaturalezaCuenta.ACREEDORA,
    );
  });

  it('los valores string son idénticos (identity en runtime)', () => {
    expect(toDominioNaturalezaCuenta(PrismaNaturalezaCuenta.DEUDORA)).toBe('DEUDORA');
    expect(toDominioNaturalezaCuenta(PrismaNaturalezaCuenta.ACREEDORA)).toBe('ACREEDORA');
  });
});

describe('toDominioClaseCuenta', () => {
  it('mapea todos los valores', () => {
    expect(toDominioClaseCuenta(PrismaClaseCuenta.ACTIVO)).toBe(ClaseCuenta.ACTIVO);
    expect(toDominioClaseCuenta(PrismaClaseCuenta.PASIVO)).toBe(ClaseCuenta.PASIVO);
    expect(toDominioClaseCuenta(PrismaClaseCuenta.PATRIMONIO)).toBe(ClaseCuenta.PATRIMONIO);
    expect(toDominioClaseCuenta(PrismaClaseCuenta.INGRESO)).toBe(ClaseCuenta.INGRESO);
    expect(toDominioClaseCuenta(PrismaClaseCuenta.EGRESO)).toBe(ClaseCuenta.EGRESO);
  });

  it('los valores string son idénticos (identity en runtime)', () => {
    expect(toDominioClaseCuenta(PrismaClaseCuenta.ACTIVO)).toBe('ACTIVO');
    expect(toDominioClaseCuenta(PrismaClaseCuenta.EGRESO)).toBe('EGRESO');
  });
});

describe('toDominioSubClaseCuenta', () => {
  it('mapea todos los valores', () => {
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.ACTIVO_CORRIENTE)).toBe(
      SubClaseCuenta.ACTIVO_CORRIENTE,
    );
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.ACTIVO_NO_CORRIENTE)).toBe(
      SubClaseCuenta.ACTIVO_NO_CORRIENTE,
    );
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.PASIVO_CORRIENTE)).toBe(
      SubClaseCuenta.PASIVO_CORRIENTE,
    );
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.PASIVO_NO_CORRIENTE)).toBe(
      SubClaseCuenta.PASIVO_NO_CORRIENTE,
    );
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.PATRIMONIO_CAPITAL)).toBe(
      SubClaseCuenta.PATRIMONIO_CAPITAL,
    );
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.PATRIMONIO_RESULTADOS)).toBe(
      SubClaseCuenta.PATRIMONIO_RESULTADOS,
    );
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.INGRESO_OPERATIVO)).toBe(
      SubClaseCuenta.INGRESO_OPERATIVO,
    );
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.INGRESO_NO_OPERATIVO)).toBe(
      SubClaseCuenta.INGRESO_NO_OPERATIVO,
    );
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.EGRESO_OPERATIVO)).toBe(
      SubClaseCuenta.EGRESO_OPERATIVO,
    );
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.EGRESO_ADMINISTRATIVO)).toBe(
      SubClaseCuenta.EGRESO_ADMINISTRATIVO,
    );
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.EGRESO_COMERCIALIZACION)).toBe(
      SubClaseCuenta.EGRESO_COMERCIALIZACION,
    );
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.EGRESO_FINANCIERO)).toBe(
      SubClaseCuenta.EGRESO_FINANCIERO,
    );
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.EGRESO_NO_OPERATIVO)).toBe(
      SubClaseCuenta.EGRESO_NO_OPERATIVO,
    );
  });

  it('los valores string son idénticos (identity en runtime)', () => {
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.ACTIVO_CORRIENTE)).toBe('ACTIVO_CORRIENTE');
    expect(toDominioSubClaseCuenta(PrismaSubClaseCuenta.EGRESO_NO_OPERATIVO)).toBe(
      'EGRESO_NO_OPERATIVO',
    );
  });
});
