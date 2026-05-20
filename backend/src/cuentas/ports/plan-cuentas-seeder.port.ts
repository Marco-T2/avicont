// Port DEFINIDO por cuentas (dueño del dominio Cuenta, §3.7 CLAUDE.md) para
// sembrar el plan de cuentas COMERCIAL + OrgConfiguracionContable en una
// organización recién creada. Consumido por `tenants` como cross-module port.
//
// El `tx` es OBLIGATORIO — este seeder corre dentro de la TX que crea la
// organización, garantizando que el tenant nace listo (con sus 111 cuentas
// y configuración contable) o no nace (atomicidad).

import type { Prisma } from '@prisma/client';

export const PLAN_CUENTAS_SEEDER_PORT = Symbol('PLAN_CUENTAS_SEEDER_PORT');

export abstract class PlanCuentasSeederPort {
  /**
   * Siembra el plan de cuentas COMERCIAL (111 cuentas) + la
   * OrgConfiguracionContable requerida en el tenant. Idempotente: usa
   * `upsert` por (organizationId, codigoInterno) para cuentas y por
   * organizationId para la configuración, así que re-ejecutar no duplica.
   *
   * `tx` es OBLIGATORIO: este seeder corre dentro de la TX que crea la
   * organización — el tenant nace listo o no nace (atomicidad).
   *
   * @throws Error si la plantilla COMERCIAL no sembró todas las cuentas
   *   requeridas por el sistema (fail loud de comercial.ts — es un bug de
   *   plantilla, no un error de dominio del usuario).
   */
  abstract seedDefaultsForTenant(tenantId: string, tx: Prisma.TransactionClient): Promise<void>;
}
