import { ApiProperty } from '@nestjs/swagger';

export type VerticalActivo = 'CONTABILIDAD' | 'GRANJA' | null;

export class MePermissionsResponseDto {
  @ApiProperty({ type: [String] }) readonly permissions!: string[];
  @ApiProperty() readonly isOwner!: boolean;
  @ApiProperty() readonly activeTenantId!: string;
  @ApiProperty({ enum: ['CONTABILIDAD', 'GRANJA'], nullable: true })
  readonly vertical!: VerticalActivo;
}
