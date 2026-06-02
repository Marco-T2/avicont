import { Inject, Injectable } from '@nestjs/common';
import { CustomRole } from '@prisma/client';

import { permisoExisteEnCatalogo } from '@/common/permisos/catalogo';
import { type ContextoAsignable, submoduloEsAsignable } from '@/common/permisos/catalogo-asignable';
import { CatalogoAsignableResolver } from '@/permissions/catalogo-asignable.resolver';
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
  PermisoNoHabilitadoError,
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
    private readonly asignableResolver: CatalogoAsignableResolver,
  ) {}

  list(organizationId: string): Promise<CustomRole[]> {
    return this.repo.list(organizationId);
  }

  async findById(organizationId: string, id: string): Promise<CustomRole> {
    const role = await this.repo.findById(id, organizationId);
    if (!role) {
      throw new CustomRoleNoEncontradoError(id);
    }
    return role;
  }

  async listMembers(organizationId: string, id: string) {
    await this.findById(organizationId, id);
    return this.repo.listMembersWithUsers(id, organizationId);
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateCustomRoleDto,
  ): Promise<CustomRole> {
    await this.validatePermissions(organizationId, dto.permissions);

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

  async update(organizationId: string, id: string, dto: UpdateCustomRoleDto): Promise<CustomRole> {
    const role = await this.findById(organizationId, id);
    if (!role.isEditable) {
      throw new CustomRoleNoEditableError(id);
    }
    if (dto.permissions) {
      await this.validatePermissions(organizationId, dto.permissions);
    }

    const updated = await this.repo.update(id, organizationId, {
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
    const count = await this.repo.countActiveMembers(id, organizationId);
    if (count > 0) {
      throw new CustomRoleConMiembrosActivosError(id, count);
    }
    // Invalidamos cache ANTES del delete por si quedan memberships con FK SetNull.
    await this.rbac.invalidateUsersByCustomRole(id);
    await this.repo.delete(id, organizationId);
  }

  // -------- helpers --------

  // Valida cada permiso pasado al rol, server-authoritative (candado de la
  // deuda RBAC, docs/disenos/packs-eje2.md §7). Para cada permiso:
  //  - Patrón válido (sintaxis de wildcards permitida).
  //  - Si es exacto (sin wildcards): debe existir en el catálogo Y ser asignable
  //    en esta org (su submódulo pertenece al vertical activo y, si es submódulo
  //    de pack, el pack está activo).
  //  - Si es wildcard de submódulo (`modulo.submodulo.*`): su submódulo debe ser
  //    asignable (no se puede colar un pack inactivo vía wildcard).
  //  - Wildcards amplios (`*`, `modulo.*`, `modulo.*.accion`) conservan el
  //    comportamiento existente: se aceptan sin chequear catálogo ni pack (son
  //    el grant amplio estilo OWNER; pueden cubrir permisos futuros).
  //
  // El filtro de asignabilidad es defense in depth con el endpoint del catálogo
  // asignable (permissions.controller): el endpoint es UX, esto es el candado.
  private async validatePermissions(organizationId: string, permissions: string[]): Promise<void> {
    const ctx = await this.asignableResolver.resolver(organizationId);

    for (const p of permissions) {
      try {
        assertValidPermissionPattern(p);
      } catch (e) {
        throw new PermisoInvalidoError(p, (e as Error).message);
      }

      const partes = p.split('.');
      const tieneWildcard = p === '*' || p.includes('*');

      if (!tieneWildcard) {
        if (!permisoExisteEnCatalogo(p)) {
          throw new PermisoDesconocidoError(p);
        }
        // Permiso exacto: existe en el catálogo ⇒ tiene forma modulo.submodulo.accion.
        const modulo = partes[0] ?? '';
        const submodulo = partes[1] ?? '';
        if (!submoduloEsAsignable(modulo, submodulo, ctx)) {
          throw new PermisoNoHabilitadoError(p);
        }
        continue;
      }

      // Wildcard que apunta a un submódulo concreto (`modulo.submodulo.*`): el
      // candado de pack/vertical aplica al submódulo. Los wildcards más amplios
      // (`modulo.*`, `modulo.*.accion`, `*`) no fijan un submódulo → se aceptan.
      this.validarWildcardDeSubmodulo(p, partes, ctx);
    }
  }

  private validarWildcardDeSubmodulo(
    permiso: string,
    partes: string[],
    ctx: ContextoAsignable,
  ): void {
    if (partes.length !== 3) return;
    const modulo = partes[0] ?? '';
    const submodulo = partes[1] ?? '';
    const accion = partes[2] ?? '';
    if (modulo === '*' || submodulo === '*' || accion !== '*') return;
    // Es `modulo.submodulo.*` con modulo y submodulo concretos.
    if (!submoduloEsAsignable(modulo, submodulo, ctx)) {
      throw new PermisoNoHabilitadoError(permiso);
    }
  }
}
