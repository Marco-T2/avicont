import type { VerticalPack } from '@prisma/client';

export const ORG_VERTICAL_READER_PORT = Symbol('ORG_VERTICAL_READER_PORT');

/**
 * Puerto consumido por `PackService` para validar la frontera packs↔vertical
 * (§8 diseño): un pack solo se habilita si su `verticalAplicable` coincide con
 * el vertical de la org. El módulo `packs/` define el contrato que necesita
 * (core §3.3) y lo implementa con un adapter Prisma propio, sin importar el
 * módulo `tenants`.
 */
export abstract class OrgVerticalReaderPort {
  /**
   * Devuelve el vertical de la organización (`CONTABILIDAD` | `GRANJA`) derivado
   * de los flags de módulo, o null si la org no existe o no tiene vertical activo.
   */
  abstract verticalDe(organizationId: string): Promise<VerticalPack | null>;
}
