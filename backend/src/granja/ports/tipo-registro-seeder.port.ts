// Puerto definido por el módulo Granja para que TenantsService siembre los
// 12 tipos de registro fábrica al activar el vertical Granja (§3.7 CLAUDE.md).
//
// Diferencia clave con TipoDocumentoFisicoSeederPort: el parámetro `tx` es
// OPCIONAL aquí. El seeder de granja puede correr dentro de la TX de creación
// de org (si el tenant nace con granjaEnabled=true) o en una TX separada (si
// se activa con updateFeatures OFF→ON, que ocurre fuera de la TX de creación).

export const TIPO_REGISTRO_SEEDER_PORT = Symbol('TIPO_REGISTRO_SEEDER_PORT');

export abstract class TipoRegistroSeederPort {
  /**
   * Siembra los 12 tipos de registro fábrica para el tenant. Idempotente:
   * usa upsert por (organizationId, nombre). Re-correr es no-op.
   *
   * `tx` es OPCIONAL:
   *   - Seed en create() → pasar la TX de creación de org (atómico).
   *   - Seed en updateFeatures OFF→ON → llamar SIN tx (idempotente, fuera de TX).
   */
  abstract seedDefaultsForTenant(
    organizationId: string,
    tx?: import('@prisma/client').Prisma.TransactionClient,
  ): Promise<void>;
}
