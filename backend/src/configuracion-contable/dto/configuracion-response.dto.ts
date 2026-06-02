import { ApiProperty } from '@nestjs/swagger';
import type { OrgConfiguracionContable } from '@prisma/client';

// Respuesta mínima: los 12 IDs (o null). El frontend puede hacer un segundo
// request a /api/cuentas/:id si necesita el detalle de la cuenta. Si más
// adelante el frontend quiere una sola llamada, extendemos con objetos
// populados, pero empezamos simple.
export class ConfiguracionContableResponseDto {
  @ApiProperty() organizationId!: string;
  @ApiProperty({ type: String, nullable: true }) ivaCreditoId!: string | null;
  @ApiProperty({ type: String, nullable: true }) ivaDebitoId!: string | null;
  @ApiProperty({ type: String, nullable: true })
  ivaCreditoImportacionesId!: string | null;
  @ApiProperty({ type: String, nullable: true }) itPorPagarId!: string | null;
  @ApiProperty({ type: String, nullable: true }) iuePorPagarId!: string | null;
  @ApiProperty({ type: String, nullable: true }) rcIvaRetenidoId!: string | null;
  @ApiProperty({ type: String, nullable: true }) difCambioGananciaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) difCambioPerdidaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) resultadoEjercicioId!: string | null;
  @ApiProperty({ type: String, nullable: true }) resultadosAcumuladosId!: string | null;
  @ApiProperty({ type: String, nullable: true }) cajaChicaDefaultId!: string | null;
  @ApiProperty({ type: String, nullable: true }) ajustePorInflacionId!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
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
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function configuracionVacia(organizationId: string): ConfiguracionContableResponseDto {
  const now = new Date(0).toISOString();
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
