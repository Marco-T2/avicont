/**
 * Puerto consumido por el módulo `tenants` para validar la inmutabilidad de
 * `Organization.tipoEmpresaPrincipal` (ver CLAUDE.md v3 §2.1).
 *
 * Si devuelve true, `tenants.service` rechaza el cambio del tipo de empresa
 * con `TENANT_EMPRESA_INMUTABLE` (409).
 */
export abstract class GestionesReaderPort {
  abstract existeAlgunaGestion(organizationId: string): Promise<boolean>;
}

export const GESTIONES_READER_PORT = Symbol('GESTIONES_READER_PORT');
