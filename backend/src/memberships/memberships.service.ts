import { Inject, Injectable } from '@nestjs/common';

import {
  CUSTOM_ROLES_READER_PORT,
  CustomRolesReaderPort,
} from '@/custom-roles/ports/custom-roles-reader.port';
import {
  PERMISSIONS_CACHE_INVALIDATION_PORT,
  PermissionsCacheInvalidationPort,
} from '@/rbac/ports/permissions-cache-invalidation.port';
import { RbacService } from '@/rbac/rbac.service';
import { USERS_READER_PORT, UsersReaderPort } from '@/users/ports/users-reader.port';

import { toDominioSystemRole, toPrismaSystemRole } from './adapters/enum-mappers';
import {
  AutoDegradacionOwnerError,
  CustomRoleInvalidoParaTenantError,
  MembershipNoEncontradoError,
  UltimoOwnerError,
  UsuarioNoRegistradoParaInviteError,
  UsuarioYaEsMiembroError,
} from './domain/membership-errors';
import { MembershipRole } from './domain/membership-role';
import { AssignableRoleDto } from './dto/assignable-role.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import {
  MEMBERSHIP_REPOSITORY_PORT,
  MembershipRepositoryPort,
} from './ports/membership.repository.port';

@Injectable()
export class MembershipsService {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY_PORT)
    private readonly repo: MembershipRepositoryPort,
    @Inject(CUSTOM_ROLES_READER_PORT)
    private readonly customRoles: CustomRolesReaderPort,
    @Inject(USERS_READER_PORT)
    private readonly users: UsersReaderPort,
    @Inject(PERMISSIONS_CACHE_INVALIDATION_PORT)
    private readonly rbac: PermissionsCacheInvalidationPort,
    private readonly rbacService: RbacService,
  ) {}

  async invite(tenantId: string, dto: InviteUserDto) {
    const role = MembershipRole.parse({
      ...(dto.customRoleId != null ? { customRoleId: dto.customRoleId } : {}),
      ...(dto.systemRole != null ? { systemRole: toDominioSystemRole(dto.systemRole) } : {}),
    });
    const email = dto.email.toLowerCase().trim();

    const user = await this.users.findMinimalByEmail(email);
    if (!user) {
      throw new UsuarioNoRegistradoParaInviteError(email);
    }

    const existing = await this.repo.findByUserAndTenant(tenantId, user.id);
    if (existing) {
      throw new UsuarioYaEsMiembroError(email, tenantId);
    }

    if (role.customRoleId) {
      await this.assertCustomRoleBelongsToTenant(role.customRoleId, tenantId);
    }

    const created = await this.repo.create(tenantId, {
      userId: user.id,
      systemRole: role.systemRole === null ? null : toPrismaSystemRole(role.systemRole),
      customRoleId: role.customRoleId,
    });
    // Invalidar el cache RBAC del nuevo miembro: su primera consulta
    // post-invite debe resolver permisos frescos desde BD, no un EMPTY cacheado.
    await this.rbac.invalidateUser(user.id, tenantId);
    return created;
  }

  async updateRole(
    tenantId: string,
    membershipId: string,
    dto: UpdateMembershipDto,
    actorUserId: string,
  ) {
    const role = MembershipRole.parse({
      ...(dto.customRoleId != null ? { customRoleId: dto.customRoleId } : {}),
      ...(dto.systemRole != null ? { systemRole: toDominioSystemRole(dto.systemRole) } : {}),
    });

    const membership = await this.repo.findById(tenantId, membershipId);
    if (!membership) {
      throw new MembershipNoEncontradoError(membershipId);
    }

    // No permitir auto-degradación desde OWNER: el último OWNER debe
    // transferir ownership antes de cambiar su propio rol.
    if (membership.userId === actorUserId && membership.systemRole === 'OWNER' && !role.isOwner()) {
      throw new AutoDegradacionOwnerError(actorUserId);
    }

    if (role.customRoleId) {
      await this.assertCustomRoleBelongsToTenant(role.customRoleId, tenantId);
    }

    const updated = await this.repo.updateRol(tenantId, membershipId, {
      systemRole: role.systemRole === null ? null : toPrismaSystemRole(role.systemRole),
      customRoleId: role.customRoleId,
    });
    // Cambio de rol → permisos cambian → invalidar cache RBAC del miembro.
    await this.rbac.invalidateUser(membership.userId, tenantId);
    return updated;
  }

  async remove(tenantId: string, membershipId: string, _actorUserId: string) {
    const membership = await this.repo.findById(tenantId, membershipId);
    if (!membership) {
      throw new MembershipNoEncontradoError(membershipId);
    }

    if (membership.systemRole === 'OWNER') {
      await this.assertNotLastOwner(tenantId);
    }

    const deleted = await this.repo.deleteById(tenantId, membershipId);
    // Ex-miembro → quitar cualquier cache de permisos que haya quedado.
    await this.rbac.invalidateUser(membership.userId, tenantId);
    return deleted;
  }

  async leave(tenantId: string, userId: string) {
    const membership = await this.repo.findByUserAndTenant(tenantId, userId);
    if (!membership) {
      throw new MembershipNoEncontradoError(userId);
    }

    if (membership.systemRole === 'OWNER') {
      await this.assertNotLastOwner(tenantId);
    }

    const deleted = await this.repo.deleteByUserAndTenant(tenantId, userId);
    await this.rbac.invalidateUser(userId, tenantId);
    return deleted;
  }

  async listarRolesAsignables(orgId: string, userId: string): Promise<AssignableRoleDto[]> {
    const { isOwner } = await this.rbacService.resolverPermisosConContexto(userId, orgId);
    const systemRoles: AssignableRoleDto[] = [
      ...(isOwner
        ? [
            {
              id: 'OWNER',
              name: 'Propietario',
              kind: 'system' as const,
              description: 'Control total — puede agregar/quitar owners',
            },
          ]
        : []),
      {
        id: 'ADMIN',
        name: 'Administrador',
        kind: 'system' as const,
        description: 'Todos los permisos excepto transferir ownership',
      },
    ];
    const rawCustom = await this.customRoles.listarAsignablesPorOrg(orgId);
    const customRoles: AssignableRoleDto[] = rawCustom.map((r) => ({
      id: r.id,
      name: r.name,
      kind: 'custom' as const,
    }));
    return this.filtrarPorVerticalYPacks([...systemRoles, ...customRoles]);
  }

  // ---------- helpers privados ----------

  private async assertCustomRoleBelongsToTenant(customRoleId: string, tenantId: string) {
    const ok = await this.customRoles.belongsToTenant(customRoleId, tenantId);
    if (!ok) {
      throw new CustomRoleInvalidoParaTenantError(customRoleId, tenantId);
    }
  }

  private async assertNotLastOwner(tenantId: string) {
    const ownerCount = await this.repo.countOwners(tenantId);
    if (ownerCount <= 1) {
      throw new UltimoOwnerError(tenantId);
    }
  }

  private filtrarPorVerticalYPacks(roles: AssignableRoleDto[]): AssignableRoleDto[] {
    // Seam para filtro por vertical + packs cuando llegue módulo Granja.
    // Hoy solo existe el vertical Contabilidad — retorna sin filtrar.
    return roles;
  }
}
