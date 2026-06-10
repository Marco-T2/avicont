import { Readable } from 'stream';

export const STORAGE_PORT = 'STORAGE_PORT';

/**
 * Puerto de almacenamiento de objetos binarios (adjuntos de comprobantes).
 * La implementación concreta es MinioStorageAdapter (@aws-sdk/client-s3 apuntado
 * a MinIO). La interface es agnóstica al proveedor — swap a S3/R2 = solo
 * cambiar la configuración del adapter.
 *
 * Convención de storageKey: {tenantId}/{comprobanteId}/{uuid}-{nombreSaneado}
 * El prefijo de tenant garantiza aislamiento defensivo en el storage (CLAUDE.md §4.2).
 */
export interface StoragePort {
  /**
   * Sube un objeto al storage. Si la clave ya existe, la sobreescribe.
   * @param key - Clave única del objeto (storageKey convención).
   * @param buffer - Buffer con el contenido binario.
   * @param contentType - MIME type del objeto.
   */
  put(key: string, buffer: Buffer, contentType: string): Promise<void>;

  /**
   * Devuelve un stream de lectura del objeto.
   * @throws si el objeto no existe.
   */
  getStream(key: string): Promise<Readable>;

  /**
   * Borra un objeto del storage. No lanza error si no existe (idempotente).
   */
  delete(key: string): Promise<void>;

  /**
   * Verifica si un objeto existe en el storage.
   */
  exists(key: string): Promise<boolean>;
}
