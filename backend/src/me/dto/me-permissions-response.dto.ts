export interface MePermissionsResponseDto {
  readonly permissions: string[];
  readonly isOwner: boolean;
  readonly activeTenantId: string;
}
