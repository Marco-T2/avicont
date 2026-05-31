export const CUENTAS_READER_LOOKUP_PORT = Symbol('CUENTAS_READER_LOOKUP_PORT');

/** Resultado del lookup puntual de cuenta por id (existencia + esDetalle). */
export interface CuentaLookupResult {
  id: string;
  esDetalle: boolean;
}

export abstract class CuentasReaderLookupPort {
  /**
   * Busca una cuenta por id dentro del tenant (defense in depth §4.2).
   * Filtra por organizationId — una cuenta de otro tenant devuelve `null`,
   * misma respuesta que inexistente (Anti-31: no enumera ids ajenos).
   *
   * @param tenantId - organizationId del JWT activo
   * @param cuentaId - UUID de la cuenta a verificar
   */
  abstract obtenerCuentaDetalle(
    tenantId: string,
    cuentaId: string,
  ): Promise<CuentaLookupResult | null>;
}
