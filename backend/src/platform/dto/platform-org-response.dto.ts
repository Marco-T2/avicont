import { ApiProperty } from '@nestjs/swagger';
import { OrganizationStatus, Plan } from '@prisma/client';
import type { Organization } from '@prisma/client';

/**
 * Respuesta de la API para las operaciones sobre organizaciones del super-admin.
 * Proyección plana de Organization con los campos relevantes para la UI de plataforma.
 */
export class PlatformOrgResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: OrganizationStatus })
  status!: OrganizationStatus;

  @ApiProperty({ enum: Plan })
  plan!: Plan;

  @ApiProperty()
  contabilidadEnabled!: boolean;

  @ApiProperty()
  granjaEnabled!: boolean;

  @ApiProperty()
  createdAt!: Date;

  static fromOrganization(org: Organization): PlatformOrgResponseDto {
    const dto = new PlatformOrgResponseDto();
    dto.id = org.id;
    dto.name = org.name;
    dto.slug = org.slug;
    dto.status = org.status;
    dto.plan = org.plan;
    dto.contabilidadEnabled = org.contabilidadEnabled;
    dto.granjaEnabled = org.granjaEnabled;
    dto.createdAt = org.createdAt;
    return dto;
  }
}
