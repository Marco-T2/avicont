import { ApiProperty } from '@nestjs/swagger';

import type { OrgPackEntitlementRow } from '../ports/org-pack.repository.port';

/** Resultado del `PATCH /packs/:clave`: el entitlement con su activación tras el cambio. */
export class ActivacionPackResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() packId!: string;
  @ApiProperty({ description: 'Estado de activación tras el cambio.' })
  activo!: boolean;
}

export function toActivacionPackResponse(
  entitlement: OrgPackEntitlementRow,
): ActivacionPackResponseDto {
  return {
    id: entitlement.id,
    organizationId: entitlement.organizationId,
    packId: entitlement.packId,
    activo: entitlement.activo,
  };
}
