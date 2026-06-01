export type VerticalActivo = 'CONTABILIDAD' | 'GRANJA' | null;

export interface MePermissionsResponseDto {
  readonly permissions: string[];
  readonly isOwner: boolean;
  readonly activeTenantId: string;
  readonly vertical: VerticalActivo;
}
