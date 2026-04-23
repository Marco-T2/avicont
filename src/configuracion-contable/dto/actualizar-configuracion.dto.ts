import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

// DTO de actualización. Cualquier campo puede ser UUID (mapear) o null (desmapear).
// Para aceptar ambos con class-validator usamos ValidateIf cuando el valor no sea null.
const uuidOrNull = () => [
  ApiPropertyOptional({ nullable: true, format: 'uuid' }),
  IsOptional(),
  ValidateIf((_o, v) => v !== null),
  IsUUID(),
];

const decorate = (target: object, prop: string, decorators: PropertyDecorator[]): void => {
  for (const d of decorators) d(target, prop);
};

export class ActualizarConfiguracionDto {
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

// Aplica los decoradores a cada campo sin repetir la cascada a mano.
for (const field of [
  'ivaCreditoId',
  'ivaDebitoId',
  'ivaCreditoImportacionesId',
  'itPorPagarId',
  'iuePorPagarId',
  'rcIvaRetenidoId',
  'difCambioGananciaId',
  'difCambioPerdidaId',
  'resultadoEjercicioId',
  'resultadosAcumuladosId',
  'cajaChicaDefaultId',
  'ajustePorInflacionId',
] as const) {
  decorate(ActualizarConfiguracionDto.prototype, field, uuidOrNull() as PropertyDecorator[]);
}
