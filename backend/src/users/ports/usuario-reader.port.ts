/**
 * Puerto de lectura cross-módulo de la IDENTIDAD PRESENTABLE de un usuario.
 *
 * Vive en `users/` porque el módulo dueño del dominio es quien define qué
 * puede leerse de él (CLAUDE.md §3.7). Se registra en el módulo-puerto leaf
 * `usuario-reader.module.ts` (molde `lineas-cuenta-reader.module.ts`) para que
 * el consumidor lo importe sin tirar del require de `users.module.ts` (ciclo
 * de carga CJS).
 *
 * POR QUÉ existe: los actos atribuidos del sistema persisten un
 * `*PorUserId` y hasta ahora lo devolvían CRUDO al cliente. Un UUID no
 * atribuye nada a una persona — `REQ-ICB-04` pide un acto "atribuido a un
 * usuario", y un contador mirando el papel de trabajo necesita un nombre, no
 * `9f3a…`. Este port es la superficie mínima para resolverlo.
 *
 * Superficie mínima DELIBERADA: resolver ids → nombre. No expone listar, ni
 * buscar, ni filtrar. Un consumidor que necesite más pide una ampliación
 * explícita, como hizo `informe-conciliacion-bancaria` con
 * `LineasCuentaReaderPort`.
 */

export const USUARIO_READER_PORT = Symbol('USUARIO_READER_PORT');

/** Proyección presentable — nunca la entidad `User` (jamás sale el hash). */
export interface UsuarioResumenRow {
  id: string;
  /** `null` si el usuario nunca cargó su nombre: el consumidor decide el fallback. */
  displayName: string | null;
  email: string;
}

export abstract class UsuarioReaderPort {
  /**
   * Resuelve ids → identidad presentable, ACOTADO a los miembros del tenant.
   *
   * Multi-tenant: el filtro por membresía NO es cosmético (§4.2 core). Un id
   * de otra organización simplemente no vuelve — así un dato atribuido que
   * quedó apuntando fuera del tenant se degrada a "sin resolver" en vez de
   * filtrar el nombre o el email de alguien ajeno.
   *
   * Los ids que no resuelvan no vienen: el resultado puede ser más corto que
   * la entrada, y eso es información, no error.
   */
  abstract listarPorIds(tenantId: string, ids: readonly string[]): Promise<UsuarioResumenRow[]>;
}
