import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { PlatformActivityItem } from '../ports/platform-activity-reader.port';

export class ActivityActorDto {
  @ApiProperty({ description: 'Email del actor (super-admin)' })
  email!: string;

  @ApiPropertyOptional({ description: 'Nombre para mostrar del actor', nullable: true, type: 'string' })
  displayName!: string | null;
}

export class ActivityTargetOrgDto {
  @ApiProperty({ description: 'Nombre de la organización objetivo' })
  name!: string;
}

export class PlatformActivityItemDto {
  @ApiProperty({ description: 'ID único del registro de auditoría' })
  id!: string;

  @ApiProperty({ description: 'Descriptor de la acción ejecutada' })
  action!: string;

  @ApiProperty({ description: 'ID del actor (super-admin)' })
  actorUserId!: string;

  @ApiProperty({ type: ActivityActorDto })
  actor!: ActivityActorDto;

  @ApiPropertyOptional({
    description: 'ID de la organización afectada',
    nullable: true,
    type: 'string',
  })
  targetOrganizationId!: string | null;

  @ApiPropertyOptional({
    type: ActivityTargetOrgDto,
    description: 'Organización afectada resuelta',
    nullable: true,
  })
  targetOrganization!: ActivityTargetOrgDto | null;

  @ApiProperty({ description: 'Timestamp UTC del registro de auditoría' })
  createdAt!: Date;

  static fromItem(item: PlatformActivityItem): PlatformActivityItemDto {
    const dto = new PlatformActivityItemDto();
    dto.id = item.id;
    dto.action = item.action;
    dto.actorUserId = item.actorUserId;
    dto.actor = { email: item.actor.email, displayName: item.actor.displayName };
    dto.targetOrganizationId = item.targetOrganizationId;
    dto.targetOrganization =
      item.targetOrganization !== null ? { name: item.targetOrganization.name } : null;
    dto.createdAt = item.createdAt;
    return dto;
  }
}

export class PlatformActivityResponseDto {
  @ApiProperty({ type: [PlatformActivityItemDto] })
  items!: PlatformActivityItemDto[];

  @ApiPropertyOptional({
    description: 'Cursor opaco para obtener la siguiente página; null si no hay más',
    nullable: true,
    type: String,
  })
  nextCursor!: string | null;
}
