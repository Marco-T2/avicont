import { ApiProperty } from '@nestjs/swagger';

import type { OrgPackEntitlementConPack } from '../ports/org-pack.repository.port';
import { PackResponseDto, toPackResponse } from './pack-response.dto';

/**
 * Representación HTTP de un entitlement de pack de una org, con el pack del
 * catálogo embebido. Lo consume el panel super-admin (`GET orgs/:id/packs`):
 * qué packs tiene habilitados la org y cuáles están activos.
 */
export class OrgPackEntitlementResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() packId!: string;
  @ApiProperty({ description: 'Activación embebida: true = el Owner activó el pack.' })
  activo!: boolean;
  @ApiProperty() habilitadoPorUserId!: string;
  @ApiProperty({ type: PackResponseDto }) pack!: PackResponseDto;
}

export function toOrgPackEntitlementResponse(
  entitlement: OrgPackEntitlementConPack,
): OrgPackEntitlementResponseDto {
  return {
    id: entitlement.id,
    organizationId: entitlement.organizationId,
    packId: entitlement.packId,
    activo: entitlement.activo,
    habilitadoPorUserId: entitlement.habilitadoPorUserId,
    pack: toPackResponse(entitlement.pack),
  };
}
