import type { OrgConfiguracionContable } from '@prisma/client';

export const CONFIGURACION_CONTABLE_REPOSITORY_PORT = Symbol(
  'CONFIGURACION_CONTABLE_REPOSITORY_PORT',
);

// Datos de actualización — todos los conceptos opcionales.
// Null explícito = desmapear; undefined = dejar como está.
export interface ActualizarConfiguracionData {
  ivaCreditoId?: string | null;
  ivaDebitoId?: string | null;
  ivaCreditoImportacionesId?: string | null;
  itPorPagarId?: string | null;
  iuePorPagarId?: string | null;
  rcIvaRetenidoId?: string | null;
  difCambioGananciaId?: string | null;
  difCambioPerdidaId?: string | null;
  resultadoEjercicioId?: string | null;
  resultadosAcumuladosId?: string | null;
  cajaChicaDefaultId?: string | null;
  ajustePorInflacionId?: string | null;
}

export interface ConfiguracionContableRepositoryPort {
  obtener(tenantId: string): Promise<OrgConfiguracionContable | null>;
  upsert(tenantId: string, data: ActualizarConfiguracionData): Promise<OrgConfiguracionContable>;
}
