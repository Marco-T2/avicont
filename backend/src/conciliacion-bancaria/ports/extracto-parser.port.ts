// Puerto de parsing de extractos bancarios (decisión 3, design §4.1). Cada
// banco/formato soportado se implementa como un adapter que satisface este
// contrato. El registry (`extracto-parser.registry.ts`) agrega todas las
// instancias registradas y las expone por `PerfilExtracto`.
//
// v1 NO trae implementaciones — los 3 adapters concretos (BancoSol, Económico,
// Unión XLSX) llegan en slices 3-4. Este puerto es el contrato que fijan.

import type { LadoBancario, Moneda, PerfilExtracto } from '@prisma/client';

import type { FechaContable } from '@/common/domain/fecha-contable';
import type { Money } from '@/common/domain/money';

export type EstrategiaChecksum = 'DECLARADO' | 'DERIVADO' | 'IMPOSIBLE';

export interface DescriptorPerfilExtracto {
  /** Enum Prisma — clave estable. */
  readonly perfil: PerfilExtracto;
  /** "Banco Sol" — user-facing. */
  readonly banco: string;
  /** "Excel (.xlsx)" — user-facing. */
  readonly formato: string;
  readonly extensiones: readonly string[];
  readonly mimeTypes: readonly string[];
  readonly estrategiaChecksum: EstrategiaChecksum;
  readonly soportaContraparte: boolean;
  readonly soportaHora: boolean;
  /**
   * ¿Este perfil sabe extraer el número de cuenta de la cabecera?
   * `false` ⇒ el importador NO puede validar destino y cae al fallback de
   * advertencia (REQ-CB-16). Nunca se infiere: lo declara el adaptador.
   */
  readonly exponeNumeroCuenta: boolean;
  /** Decisión 11 — instructivo de descarga que renderiza la UI de importación. */
  readonly instruccionesDescarga: string;
  /** Decisión 11 — advertencia opcional (ej. limitaciones del export). */
  readonly advertencia?: string;
}

export interface MovimientoParseado {
  readonly fecha: FechaContable;
  /** 'HH:MM:SS' — null si el perfil no expone hora. */
  readonly hora: string | null;
  /** SIEMPRE positivo, 2 decimales. */
  readonly monto: Money;
  /** Perspectiva del BANCO (extracto). */
  readonly tipo: LadoBancario;
  readonly descripcion: string;
  readonly referencia: string | null;
  readonly saldo: Money | null;
  readonly contraparteNombre: string | null;
  readonly contraparteDocumento: string | null;
  /** Celdas crudas como STRING — nunca number (CLAUDE.md §4.5). */
  readonly datosOriginales: Readonly<Record<string, string | null>>;
}

export interface ExtractoParseado {
  readonly movimientos: readonly MovimientoParseado[];
  readonly cobertura: { desde: FechaContable; hasta: FechaContable; declarada: boolean };
  readonly saldoInicialDeclarado: Money | null;
  readonly saldoFinalDeclarado: Money | null;
  readonly monedaDeclarada: Moneda | null;
  /**
   * Número de cuenta tal como lo escribió el banco en la cabecera, CRUDO —
   * sin normalizar, sin comparar (REQ-CB-16). `null` cuando el perfil no lo
   * expone o cuando la etiqueta esperada no apareció en un perfil que sí
   * debería traerlo.
   */
  readonly numeroCuentaDeclarado: string | null;
}

export abstract class ExtractoParserPort {
  /** Metadata del perfil. Única fuente de verdad para desplegable + instructivo. */
  abstract get descriptor(): DescriptorPerfilExtracto;

  /**
   * ¿Este archivo corresponde a ESTE perfil? Detecta cabeceras/estructura,
   * NUNCA por extensión ni nombre de archivo. Barato — no parsea filas.
   */
  abstract reconoce(buffer: Buffer): Promise<boolean>;

  /**
   * Parsea a modelo canónico ya normalizado (Money 2 dec, FechaContable sin
   * UTC). NO garantiza orden — el caller aplica `ordenarCanonico` (slice 2).
   */
  abstract parse(buffer: Buffer): Promise<ExtractoParseado>;
}
