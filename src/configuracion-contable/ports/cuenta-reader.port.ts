// Port DEFINIDO por configuracion-contable (consumidor) para leer Cuenta
// del módulo cuentas. Ver CLAUDE.md §3.7: el consumidor define qué
// lecturas necesita, el proveedor registra el adapter.
//
// El adapter concreto vive en src/cuentas/adapters/cuenta-reader.adapter.ts
// y el binding se exporta desde CuentasModule.

import type { ClaseCuenta } from '@prisma/client';

export const CUENTA_READER_PORT = Symbol('CUENTA_READER_PORT');

// Subset mínimo de Cuenta que necesitamos para validar un mapeo.
// No exponemos el modelo completo para no filtrar detalles internos
// del módulo cuentas.
export interface CuentaParaValidacion {
  id: string;
  organizationId: string;
  claseCuenta: ClaseCuenta;
  activa: boolean;
  esDetalle: boolean;
  codigoInterno: string;
  nombre: string;
}

export interface CuentaReaderPort {
  // Retorna null si no existe o no pertenece al tenant.
  findForConfigValidation(cuentaId: string, tenantId: string): Promise<CuentaParaValidacion | null>;
}
