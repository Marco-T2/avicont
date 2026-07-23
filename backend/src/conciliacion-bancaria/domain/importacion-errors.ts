/**
 * Errores de dominio de la importación de extractos (design rev4 §0(a) —
 * `CONCILIACION_ARCHIVO_*`, alineado a `spec.md`). Subclases de `DomainError`
 * mapeadas por el `GlobalExceptionFilter` (CLAUDE.md §6.4).
 */
import { InvalidStateError } from '@/common/errors';

// ============================================================
// 422 — archivo rechazado (fallos duros, design §10 — fuera de la $transaction)
// ============================================================

// REQ-CB-03: el archivo no corresponde al perfilExtracto declarado en la CuentaBancaria.
export class ArchivoPerfilNoCoincideError extends InvalidStateError {
  constructor(perfilEsperado: string) {
    super(
      'CONCILIACION_ARCHIVO_PERFIL_NO_COINCIDE',
      `El archivo no corresponde al formato esperado (${perfilEsperado}). Verificá que exportaste el extracto del banco correcto.`,
      { perfilEsperado },
    );
  }
}

// REQ-CB-04: magic bytes OLE2 (.xls legacy) en un perfil que espera XLSX.
export class ArchivoXlsLegacyError extends InvalidStateError {
  constructor() {
    super(
      'CONCILIACION_ARCHIVO_XLS_LEGACY',
      'Este archivo es Excel 97-2003 (.xls). Abrilo en Excel y guardalo como .xlsx antes de subirlo.',
    );
  }
}

// REQ-CB-16: el número de cuenta del archivo no coincide con el de la CuentaBancaria destino.
export class ArchivoCuentaNoCoincideError extends InvalidStateError {
  constructor(numeroArchivo: string, numeroCuentaDestino: string) {
    super(
      'CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE',
      `El archivo corresponde a la cuenta ${numeroArchivo} y lo estás importando en ${numeroCuentaDestino}. Verificá que bajaste el extracto de la cuenta correcta.`,
      { numeroArchivo, numeroCuentaDestino },
    );
  }
}

// design §4.3 regla 2: el prefijo/sufijo esperado del dialecto no apareció —
// error de formato, NUNCA strip silencioso.
export class ArchivoFormatoNoReconocidoError extends InvalidStateError {
  constructor(motivo: string) {
    super(
      'CONCILIACION_ARCHIVO_FORMATO_NO_RECONOCIDO',
      `El archivo no tiene el formato esperado: ${motivo}`,
      { motivo },
    );
  }
}

// REQ-CB-13/16: el perfil no tiene adapter registrado todavía (v1 parcial —
// ver conciliacion-bancaria.module.ts) o el archivo no coincide con NINGÚN
// perfil conocido.
export class ArchivoSinParserRegistradoError extends InvalidStateError {
  constructor(perfil: string) {
    super(
      'CONCILIACION_ARCHIVO_PERFIL_NO_SOPORTADO',
      `El perfil ${perfil} todavía no tiene un adaptador de importación disponible.`,
      { perfil },
    );
  }
}
