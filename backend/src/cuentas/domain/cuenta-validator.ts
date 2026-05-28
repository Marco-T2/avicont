// Validador puro del dominio de cuentas. Funciones sin side effects,
// sin acceso a BD, sin NestJS. Testeable en milisegundos.
// Concentra los invariantes estructurales del Plan de Cuentas boliviano:
//
//   1. codigoInterno: hasta 8 niveles separados por ".", segmentos numéricos.
//   2. Nivel se DERIVA del codigoInterno (no se recibe del cliente).
//   3. claseCuenta ↔ naturaleza default:
//      ACTIVO, EGRESO → DEUDORA
//      PASIVO, PATRIMONIO, INGRESO → ACREEDORA
//   4. esContraria → naturaleza debe ser OPUESTA al default de su clase.
//      Ej: Depreciación Acumulada (ACTIVO, esContraria=true) → ACREEDORA.
//   5. subClaseCuenta debe corresponder a la claseCuenta (tabla NIIF/PCGA).

import { ClaseCuenta } from '@prisma/client';

import { CuentaErrorCode, cuentaError, type CuentaErrorPayload } from './cuenta-errors';
import { NaturalezaCuenta, SubClaseCuenta } from './enums';

export const MAX_NIVELES_CODIGO_INTERNO = 8;
const CODIGO_INTERNO_REGEX = /^[0-9]+(\.[0-9]+)*$/;

export type ValidationResult = { valido: true } | { valido: false; error: CuentaErrorPayload };

// ------------------------------------------------------------
// codigoInterno
// ------------------------------------------------------------

export function validarCodigoInterno(codigo: string): ValidationResult {
  if (typeof codigo !== 'string' || codigo.length === 0) {
    return {
      valido: false,
      error: cuentaError(
        CuentaErrorCode.CODIGO_INTERNO_INVALIDO,
        'El código interno no puede estar vacío',
        { codigo },
      ),
    };
  }

  if (!CODIGO_INTERNO_REGEX.test(codigo)) {
    return {
      valido: false,
      error: cuentaError(
        CuentaErrorCode.CODIGO_INTERNO_INVALIDO,
        'El código interno solo admite segmentos numéricos separados por punto (ej: "1.1.1.001")',
        { codigo },
      ),
    };
  }

  const segmentos = codigo.split('.');
  if (segmentos.length > MAX_NIVELES_CODIGO_INTERNO) {
    return {
      valido: false,
      error: cuentaError(
        CuentaErrorCode.NIVEL_MAXIMO_EXCEDIDO,
        `El código interno excede el máximo de ${MAX_NIVELES_CODIGO_INTERNO} niveles`,
        { codigo, nivelesRecibidos: segmentos.length, maximo: MAX_NIVELES_CODIGO_INTERNO },
      ),
    };
  }

  return { valido: true };
}

export function calcularNivelDesdeCodigo(codigo: string): number {
  return codigo.split('.').length;
}

// ------------------------------------------------------------
// Naturaleza
// ------------------------------------------------------------

const NATURALEZA_DEFAULT_POR_CLASE: Record<ClaseCuenta, NaturalezaCuenta> = {
  ACTIVO: NaturalezaCuenta.DEUDORA,
  EGRESO: NaturalezaCuenta.DEUDORA,
  PASIVO: NaturalezaCuenta.ACREEDORA,
  PATRIMONIO: NaturalezaCuenta.ACREEDORA,
  INGRESO: NaturalezaCuenta.ACREEDORA,
};

export function naturalezaDefaultParaClase(clase: ClaseCuenta): NaturalezaCuenta {
  return NATURALEZA_DEFAULT_POR_CLASE[clase];
}

export function naturalezaOpuesta(n: NaturalezaCuenta): NaturalezaCuenta {
  return n === NaturalezaCuenta.DEUDORA ? NaturalezaCuenta.ACREEDORA : NaturalezaCuenta.DEUDORA;
}

export function validarContrariaNaturaleza(
  clase: ClaseCuenta,
  esContraria: boolean,
  naturaleza: NaturalezaCuenta,
): ValidationResult {
  const defaultN = naturalezaDefaultParaClase(clase);
  const esperada = esContraria ? naturalezaOpuesta(defaultN) : defaultN;

  if (naturaleza !== esperada) {
    return {
      valido: false,
      error: cuentaError(
        CuentaErrorCode.CONTRARIA_NATURALEZA_INVALIDA,
        esContraria
          ? `Cuenta contraria de clase ${clase} debe tener naturaleza ${esperada} (opuesta a la default)`
          : `Cuenta no contraria de clase ${clase} debe tener naturaleza ${esperada}`,
        { clase, esContraria, naturalezaRecibida: naturaleza, naturalezaEsperada: esperada },
      ),
    };
  }

  return { valido: true };
}

// ------------------------------------------------------------
// SubClase vs Clase (NIIF/PCGA)
// ------------------------------------------------------------

const SUBCLASES_VALIDAS_POR_CLASE: Record<ClaseCuenta, SubClaseCuenta[]> = {
  ACTIVO: [SubClaseCuenta.ACTIVO_CORRIENTE, SubClaseCuenta.ACTIVO_NO_CORRIENTE],
  PASIVO: [SubClaseCuenta.PASIVO_CORRIENTE, SubClaseCuenta.PASIVO_NO_CORRIENTE],
  PATRIMONIO: [SubClaseCuenta.PATRIMONIO_CAPITAL, SubClaseCuenta.PATRIMONIO_RESULTADOS],
  INGRESO: [SubClaseCuenta.INGRESO_OPERATIVO, SubClaseCuenta.INGRESO_NO_OPERATIVO],
  EGRESO: [
    SubClaseCuenta.EGRESO_OPERATIVO,
    SubClaseCuenta.EGRESO_ADMINISTRATIVO,
    SubClaseCuenta.EGRESO_COMERCIALIZACION,
    SubClaseCuenta.EGRESO_FINANCIERO,
    SubClaseCuenta.EGRESO_NO_OPERATIVO,
  ],
};

export function validarConsistenciaClaseSubclase(
  clase: ClaseCuenta,
  subClase: SubClaseCuenta | null,
  nivel: number,
): ValidationResult {
  // Nivel 1 (cuentas raíz) pueden omitir subClase — son agrupadores puros.
  // Pero si alguien la especifica, debe ser consistente con la clase.
  if (nivel === 1 && subClase === null) {
    return { valido: true };
  }

  if (subClase === null) {
    return {
      valido: false,
      error: cuentaError(
        CuentaErrorCode.SUBCLASE_INCONSISTENTE,
        `Las cuentas de nivel > 1 requieren subClaseCuenta`,
        { clase, nivel },
      ),
    };
  }

  const valores = SUBCLASES_VALIDAS_POR_CLASE[clase];
  if (!valores.includes(subClase)) {
    return {
      valido: false,
      error: cuentaError(
        CuentaErrorCode.SUBCLASE_INCONSISTENTE,
        `La subClase ${subClase} no corresponde a la clase ${clase}`,
        { clase, subClase, subClasesValidas: valores },
      ),
    };
  }

  return { valido: true };
}
