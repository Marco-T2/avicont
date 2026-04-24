import type { Contacto } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ContactoResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() razonSocial!: string;
  @ApiPropertyOptional({ nullable: true }) nombreComercial!: string | null;
  @ApiPropertyOptional({ nullable: true }) documento!: string | null;
  @ApiProperty() esCliente!: boolean;
  @ApiProperty() esProveedor!: boolean;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) telefono!: string | null;
  @ApiPropertyOptional({ nullable: true }) direccion!: string | null;
  @ApiProperty() activo!: boolean;
  @ApiProperty() createdByUserId!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export interface ListarContactosResponseDto {
  items: ContactoResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}

export function toContactoResponse(c: Contacto): ContactoResponseDto {
  return {
    id: c.id,
    razonSocial: c.razonSocial,
    nombreComercial: c.nombreComercial,
    documento: c.documento,
    esCliente: c.esCliente,
    esProveedor: c.esProveedor,
    email: c.email,
    telefono: c.telefono,
    direccion: c.direccion,
    activo: c.activo,
    createdByUserId: c.createdByUserId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
