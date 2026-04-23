// Puerto para leer el catálogo oficial PUCT (RND-101800000004).
// El catálogo es compartido entre tenants — no tiene organizationId.

export const CATALOGO_PUCT_READER_PORT = Symbol('CATALOGO_PUCT_READER_PORT');

export interface PuctEntry {
  codigo: string;
  nivel: number; // 1..4
  nombre: string;
  versionPuct: string;
}

export interface CatalogoPuctReaderPort {
  findByCodigo(codigo: string): Promise<PuctEntry | null>;
}
