import type { Pack } from '../domain/pack';

export const PACK_CATALOG_READER_PORT = Symbol('PACK_CATALOG_READER_PORT');

/**
 * Puerto de solo-lectura del catálogo global de packs (`Pack`). El catálogo es
 * un recurso compartido sin `organizationId` (excepción §4.2 core, análoga a
 * `CotizacionUfv`): se lee desde cualquier tenant. Ver `docs/disenos/packs-eje2.md` §4.3.
 */
export abstract class PackCatalogReaderPort {
  /** Lista los packs del catálogo. Por defecto solo los `activo = true`. */
  abstract listar(opciones?: { incluirInactivos?: boolean }): Promise<Pack[]>;

  /** Devuelve un pack por su clave, o null si no existe en el catálogo. */
  abstract findByClave(clave: string): Promise<Pack | null>;

  /** Devuelve un pack por su id, o null si no existe en el catálogo. */
  abstract findById(id: string): Promise<Pack | null>;
}
