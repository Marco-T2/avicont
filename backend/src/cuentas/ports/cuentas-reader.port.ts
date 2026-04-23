// Port DEFINIDO por cuentas (dueño del dominio Cuenta, §3.7 CLAUDE.md) para
// lecturas cross-módulo orientadas a VALIDAR LÍNEAS DE COMPROBANTE.
//
// Superficie distinta de `CuentaReaderPort` (singular, en
// configuracion-contable/ports/): ese otro port expone `findForConfigValidation`
// porque `configuracion-contable` tiene otro caso de uso (mapear cuentas a
// conceptos). Acá `comprobantes` necesita leer un BATCH de cuentas con los
// campos mínimos para validar cada línea: activa, esDetalle, requiereContacto,
// permiteMultiMoneda y monedaFuncional.
//
// Mantener las dos superficies separadas: cada consumidor pide solo lo que
// necesita, sin aumentar el blast radius de los dos módulos acoplados.

import type { Moneda, Prisma } from '@prisma/client';

export const CUENTAS_READER_PORT = Symbol('CUENTAS_READER_PORT');

export interface CuentaParaLinea {
  id: string;
  codigoInterno: string;
  nombre: string;
  activa: boolean;
  esDetalle: boolean;
  requiereContacto: boolean;
  permiteMultiMoneda: boolean;
  monedaFuncional: Moneda;
}

export abstract class CuentasReaderPort {
  /**
   * Lee un lote de cuentas por sus ids, scopeadas al tenant. Devuelve un Map
   * por `id` con los campos que el validador de comprobantes necesita. Los
   * ids que no existen o pertenecen a otro tenant NO aparecen en el Map.
   *
   * Acepta opcionalmente un `tx` de Prisma para que la lectura participe de
   * la misma transacción que el write del comprobante (aisla contra una
   * desactivación de cuenta concurrente, aunque el riesgo es bajo porque
   * `activa: false` es un soft-disable).
   */
  abstract obtenerBatch(
    tenantId: string,
    cuentaIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, CuentaParaLinea>>;
}
