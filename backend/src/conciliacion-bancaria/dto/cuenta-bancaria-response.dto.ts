import { ApiProperty } from '@nestjs/swagger';
import type { CuentaBancaria } from '@prisma/client';
import { Moneda, PerfilExtracto } from '@prisma/client';

export class CuentaBancariaResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() cuentaId!: string;
  @ApiProperty() alias!: string;
  @ApiProperty({ enum: PerfilExtracto }) perfilExtracto!: PerfilExtracto;
  @ApiProperty({ type: String, nullable: true }) numeroCuenta!: string | null;
  @ApiProperty({ enum: Moneda }) moneda!: Moneda;
  @ApiProperty() activa!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class ListarCuentasBancariasResponseDto {
  @ApiProperty({ type: () => [CuentaBancariaResponseDto] })
  items!: CuentaBancariaResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export function toCuentaBancariaResponse(cb: CuentaBancaria): CuentaBancariaResponseDto {
  return {
    id: cb.id,
    organizationId: cb.organizationId,
    cuentaId: cb.cuentaId,
    alias: cb.alias,
    perfilExtracto: cb.perfilExtracto,
    numeroCuenta: cb.numeroCuenta,
    moneda: cb.moneda,
    activa: cb.activa,
    createdAt: cb.createdAt.toISOString(),
    updatedAt: cb.updatedAt.toISOString(),
  };
}
