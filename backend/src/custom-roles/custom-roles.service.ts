import { Inject, Injectable } from '@nestjs/common';
import { CustomRole } from '@prisma/client';

import { permisoExisteEnCatalogo } from '@/common/permisos/catalogo';
import { assertValidPermissionPattern } from '@/rbac/domain/permission-matcher';
import {
  PERMISSIONS_CACHE_INVALIDATION_PORT,
  PermissionsCacheInvalidationPort,
} from '@/rbac/ports/permissions-cache-invalidation.port';

import {
  CustomRoleConMiembrosActivosError,
  CustomRoleDelSistemaError,
  CustomRoleNoEditableError,
  CustomRoleNoEncontradoError,
  CustomRoleSlugDuplicadoError,
  PermisoDesconocidoError,
  PermisoInvalidoError,
} from './domain/custom-role-errors';
import { CloneCustomRoleDto } from './dto/clone-custom-role.dto';
import { CreateCustomRoleDto } from './dto/create-custom-role.dto';
import { UpdateCustomRoleDto } from './dto/update-custom-role.dto';
import {
  CUSTOM_ROLE_REPOSITORY_PORT,
  CustomRoleRepositoryPort,
} from './ports/custom-role.repository.port';

@Injectable()
export class CustomRolesService {
  constructor(
    @Inject(CUSTOM_ROLE_REPOSITORY_PORT)
    private readonly repo: CustomRoleRepositoryPort,
    @Inject(PERMISSIONS_CACHE_INVALIDATION_PORT)
    private readonly rbac: PermissionsCacheInvalidationPort,
  ) {}

  list(organizationId: string): Promise<CustomRole[]> {
    return this.repo.list(organizationId);
  }

  async findById(organizationId: string, id: string): Promise<CustomRole> {
    const role = await this.repo.findById(id);
    if (!role || role.organizationId !== organizationId) {
      throw new CustomRoleNoEncontradoError(id);
    }
    return role;
  }

  async listMembers(organizationId: string, id: string) {
    await this.findById(organizationId, id);
    return this.repo.listMembersWithUsers(id);
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateCustomRoleDto,
  ): Promise<CustomRole> {
    this.validatePermissions(dto.permissions);

    const dup = await this.repo.findBySlug(organizationId, dto.slug);
    if (dup) {
      throw new CustomRoleSlugDuplicadoError(dto.slug, organizationId);
    }

    return this.repo.create({
      organizationId,
      slug: dto.slug,
      name: dto.name,
      description: dto.description ?? null,
      permissions: dto.permissions,
      createdById: actorUserId,
      isSystemDefault: false,
      isEditable: true,
    });
  }

  async clone(
    organizationId: string,
    actorUserId: string,
    sourceId: string,
    dto: CloneCustomRoleDto,
  ): Promise<CustomRole> {
    const source = await this.findById(organizationId, sourceId);

    const dup = await this.repo.findBySlug(organizationId, dto.slug);
    if (dup) {
      throw new CustomRoleSlugDuplicadoError(dto.slug, organizationId);
    }

    return this.repo.create({
      organizationId,
      slug: dto.slug,
      name: dto.name ?? `${source.name} (copia)`,
      description: source.description,
      permissions: source.permissions,
      createdById: actorUserId,
      isSystemDefault: false,
      isEditable: true,
    });
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateCustomRoleDto,
  ): Promise<CustomRole> {
    const role = await this.findById(organizationId, id);
    if (!role.isEditable) {
      throw new CustomRoleNoEditableError(id);
    }
    if (dto.permissions) {
      this.validatePermissions(dto.permissions);
    }

    const updated = await this.repo.update(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.permissions !== undefined ? { permissions: dto.permissions } : {}),
    });

    // Invalidación post-commit: si cambiaron los permisos, invalidamos a todos
    // los users con este rol. Si solo cambió name/description no es necesario,
    // pero invalidar igual es trivial y barato.
    if (dto.permissions !== undefined) {
      await this.rbac.invalidateUsersByCustomRole(id);
    }

    return updated;
  }

  async delete(organizationId: string, id: string): Promise<void> {
    const role = await this.findById(organizationId, id);
    if (role.isSystemDefault) {
      throw new CustomRoleDelSistemaError(id);
    }
    const count = await this.repo.countActiveMembers(id);
    if (count > 0) {
      throw new CustomRoleConMiembrosActivosError(id, count);
    }
    // Invalidamos cache ANTES del delete por si quedan memberships con FK SetNull.
    await this.rbac.invalidateUsersByCustomRole(id);
    await this.repo.delete(id);
  }

  // -------- helpers --------

  // Valida cada permiso pasado al rol:
  //  - Patrón válido (sintaxis de wildcards permitida).
  //  - Si es exacto (sin wildcards), debe existir en el catálogo.
  // Patrones con wildcards no se chequean contra el catálogo: pueden cubrir
  // permisos futuros que se agreguen sin romper el rol.
  private validatePermissions(permissions: string[]): void {
    for (const p of permissions) {
      try {
        assertValidPermissionPattern(p);
      } catch (e) {
        throw new PermisoInvalidoError(p, (e as Error).message);
      }
      const tieneWildcard = p === '*' || p.includes('*');
      if (!tieneWildcard && !permisoExisteEnCatalogo(p)) {
        throw new PermisoDesconocidoError(p);
      }
    }
  }
}
