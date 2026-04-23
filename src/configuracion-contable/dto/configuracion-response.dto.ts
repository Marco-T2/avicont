import type { OrgConfiguracionContable } from '@prisma/client';

// Respuesta mínima: los 12 IDs (o null). El frontend puede hacer un segundo
// request a /api/cuentas/:id si necesita el detalle de la cuenta. Si más
// adelante el frontend quiere una sola llamada, extendemos con objetos
// populados, pero empezamos simple.
export interface ConfiguracionContableResponseDto {
  organizationId: string;
  ivaCreditoId: string | null;
  ivaDebitoId: string | null;
  ivaCreditoImportacionesId: string | null;
  itPorPagarId: string | null;
  iuePorPagarId: string | null;
  rcIvaRetenidoId: string | null;
  difCambioGananciaId: string | null;
  difCambioPerdidaId: string | null;
  resultadoEjercicioId: string | null;
  resultadosAcumuladosId: string | null;
  cajaChicaDefaultId: string | null;
  ajustePorInflacionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toConfiguracionResponse(
  c: OrgConfiguracionContable,
): ConfiguracionContableResponseDto {
  return {
    organizationId: c.organizationId,
    ivaCreditoId: c.ivaCreditoId,
    ivaDebitoId: c.ivaDebitoId,
    ivaCreditoImportacionesId: c.ivaCreditoImportacionesId,
    itPorPagarId: c.itPorPagarId,
    iuePorPagarId: c.iuePorPagarId,
    rcIvaRetenidoId: c.rcIvaRetenidoId,
    difCambioGananciaId: c.difCambioGananciaId,
    difCambioPerdidaId: c.difCambioPerdidaId,
    resultadoEjercicioId: c.resultadoEjercicioId,
    resultadosAcumuladosId: c.resultadosAcumuladosId,
    cajaChicaDefaultId: c.cajaChicaDefaultId,
    ajustePorInflacionId: c.ajustePorInflacionId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function configuracionVacia(organizationId: string): ConfiguracionContableResponseDto {
  const now = new Date(0);
  return {
    organizationId,
    ivaCreditoId: null,
    ivaDebitoId: null,
    ivaCreditoImportacionesId: null,
    itPorPagarId: null,
    iuePorPagarId: null,
    rcIvaRetenidoId: null,
    difCambioGananciaId: null,
    difCambioPerdidaId: null,
    resultadoEjercicioId: null,
    resultadosAcumuladosId: null,
    cajaChicaDefaultId: null,
    ajustePorInflacionId: null,
    createdAt: now,
    updatedAt: now,
  };
}
