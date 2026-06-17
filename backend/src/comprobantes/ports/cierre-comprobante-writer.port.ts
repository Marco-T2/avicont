// Writer port DEFINIDO y POSEÍDO por `comprobantes` (§3.7 CLAUDE.md): el módulo
// `cierre-ejercicio` lo consume para CREAR y BORRAR comprobantes de cierre por
// el PATH-SISTEMA, distinto del flujo de usuario.
//
// Por qué un path-sistema separado (REQ-CMP-SYS-03): el enforcement del Batch 2
// bloquea `eliminarBorrador` / `actualizarBorrador` de usuario sobre cualquier
// comprobante con `generadoPorSistema=true`. La regeneración del cierre necesita
// borrar los borradores-sistema previos y recrearlos — para eso existe esta vía
// interna autorizada, que NO pasa por `ComprobantesService` (no aplica la
// validación de usuario) y reusa el `ComprobanteRepositoryPort` directamente.
//
// NOTA DE BATCH: la firma se define en el Batch 2 (sin consumir). El ADAPTER
// (`prisma-cierre-comprobante-writer.adapter.ts`) y el wiring en
// `comprobantes.module.ts` se implementan en el Batch 4 (tasks.md 4.5), cuando
// el módulo `cierre-ejercicio` lo necesite.

import type { Prisma, TipoComprobante } from '@prisma/client';

export const CIERRE_COMPROBANTE_WRITER_PORT = Symbol('CIERRE_COMPROBANTE_WRITER_PORT');

export type CierreOrigenTipo = 'CIERRE_GASTOS' | 'CIERRE_INGRESOS' | 'CIERRE_RESULTADO';

export interface CrearCierreLinea {
  cuentaId: string;
  debito: Prisma.Decimal;
  credito: Prisma.Decimal;
}

export interface CrearCierreData {
  tenantId: string;
  periodoFiscalId: string;
  fechaContable: Date; // @db.Date ya construido vía FechaContable.toDbDate()
  tipo: TipoComprobante; // siempre CIERRE
  glosa: string;
  origenTipo: CierreOrigenTipo;
  origenId: string; // = gestionId (idempotencia vía @@unique origenTipo+origenId)
  // El path-sistema no tiene usuario humano, pero el schema exige createdByUserId
  // no-nulo: se propaga el actor que dispara el cierre (auditoría de autoría).
  createdByUserId: string;
  lineas: CrearCierreLinea[];
}

/**
 * Superficie de escritura de comprobantes de cierre por el path-sistema.
 * El binding concreto (adapter Prisma) se registra en `comprobantes.module.ts`
 * en el Batch 4.
 */
export abstract class CierreComprobanteWriterPort {
  /**
   * Crea un comprobante de cierre en BORRADOR con `generadoPorSistema=true`,
   * sin pasar por la validación de usuario de `ComprobantesService`.
   */
  abstract crearBorradorSistema(
    data: CrearCierreData,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string }>;

  /**
   * Borra un comprobante de cierre en BORRADOR por el path-sistema autorizado
   * (REQ-CMP-SYS-03): NO aplica el bloqueo de `generadoPorSistema` que el flujo
   * de usuario sí aplica. Scoped al tenant (defense in depth §4.2).
   */
  abstract eliminarBorradorSistema(
    comprobanteId: string,
    tenantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}
