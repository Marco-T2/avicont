import type { Contacto } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class ContactoResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() razonSocial!: string;
  @ApiProperty({ type: String, nullable: true }) nombreComercial!: string | null;
  @ApiProperty({ type: String, nullable: true }) documento!: string | null;
  @ApiProperty() esCliente!: boolean;
  @ApiProperty() esProveedor!: boolean;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) telefono!: string | null;
  @ApiProperty({ type: String, nullable: true }) direccion!: string | null;
  @ApiProperty() activo!: boolean;
  @ApiProperty() createdByUserId!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class ListarContactosResponseDto {
  @ApiProperty({ type: () => [ContactoResponseDto] }) items!: ContactoResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
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
