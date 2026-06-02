import { ApiProperty } from '@nestjs/swagger';

export type VerticalActivo = 'CONTABILIDAD' | 'GRANJA' | null;

export class MePermissionsResponseDto {
  @ApiProperty({ type: [String] }) readonly permissions!: string[];
  @ApiProperty() readonly isOwner!: boolean;
  @ApiProperty() readonly activeTenantId!: string;
  @ApiProperty({ enum: ['CONTABILIDAD', 'GRANJA'], nullable: true })
  readonly vertical!: VerticalActivo;
  // Claves de los packs activos (eje 2) de la org del tenant. Aditivo; org sin
  // packs activos → []. Se lee vía OrgPacksReaderPort en el mismo handler (cero
  // round-trip extra desde el frontend).
  @ApiProperty({ type: [String] }) readonly packsActivos!: string[];
}
