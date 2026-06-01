import { CustomRole } from '@prisma/client';

export const CUSTOM_ROLE_REPOSITORY_PORT = Symbol('CUSTOM_ROLE_REPOSITORY_PORT');

export interface CreateCustomRoleData {
  organizationId: string;
  slug: string;
  name: string;
  description?: string | null;
  permissions: string[];
  createdById?: string | null;
  isSystemDefault?: boolean;
  isEditable?: boolean;
}

export interface UpdateCustomRoleData {
  name?: string;
  description?: string | null;
  permissions?: string[];
}

export interface CustomRoleRepositoryPort {
  list(organizationId: string): Promise<CustomRole[]>;
  findById(id: string, organizationId: string): Promise<CustomRole | null>;
  findBySlug(organizationId: string, slug: string): Promise<CustomRole | null>;

  create(data: CreateCustomRoleData): Promise<CustomRole>;
  update(id: string, organizationId: string, data: UpdateCustomRoleData): Promise<CustomRole>;
  delete(id: string, organizationId: string): Promise<void>;

  // Cuántos memberships ACTIVOS (deactivatedAt = null) usan este rol dentro del tenant.
  countActiveMembers(customRoleId: string, organizationId: string): Promise<number>;

  // Lista de userIds afectados por una invalidación de cache, scoped al tenant.
  listAffectedUserIds(customRoleId: string, organizationId: string): Promise<string[]>;

  // Listado de members con datos básicos del user, para el endpoint
  // GET /api/custom-roles/:id/members, scoped al tenant.
  listMembersWithUsers(
    customRoleId: string,
    organizationId: string,
  ): Promise<
    Array<{
      membershipId: string;
      deactivatedAt: Date | null;
      user: { id: string; email: string; displayName: string | null };
    }>
  >;
}
