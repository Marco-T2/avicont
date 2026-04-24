import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import {
  CUSTOM_ROLES_READER_PORT,
  CustomRolesReaderPort,
} from '@/custom-roles/ports/custom-roles-reader.port';
import {
  PERMISSIONS_CACHE_INVALIDATION_PORT,
  PermissionsCacheInvalidationPort,
} from '@/rbac/ports/permissions-cache-invalidation.port';

import {
  AutoDegradacionOwnerError,
  CustomRoleInvalidoParaTenantError,
  MembershipNoEncontradoError,
  TenantContextRequeridoError,
  UltimoOwnerError,
  UsuarioNoRegistradoParaInviteError,
  UsuarioYaEsMiembroError,
} from './domain/membership-errors';
import { MembershipRole } from './domain/membership-role';
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
    // TODO(deudas §2.1 remanente): la inyección de PrismaService se va
    // cuando USERS_READER_PORT gane `findMinimalByEmail`. Mientras tanto,
    // el único uso de `prisma` en este service es el lookup de User por
    // email en `invite()`. Cuando esa extensión aterrice, dropear la
    // inyección y este comentario.
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    @Inject(PERMISSIONS_CACHE_INVALIDATION_PORT)
    private readonly rbac: PermissionsCacheInvalidationPort,
  ) {}

  async invite(dto: InviteUserDto) {
    const tenantId = this.getTenantId();
    const role = MembershipRole.parse(dto);
    const email = dto.email.toLowerCase().trim();

    // TODO(deudas §2.1 remanente): reemplazar por
    // USERS_READER_PORT.findMinimalByEmail(email). La extensión del reader
    // cae fuera del scope de §3.2 memberships — cuando se agregue el método
    // al port de users, dropeamos la inyección de PrismaService.
    const user = await this.prisma.user.findUnique({ where: { email } });
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
      systemRole: role.systemRole,
      customRoleId: role.customRoleId,
    });
    // Invalidar el cache RBAC del nuevo miembro: su primera consulta
    // post-invite debe resolver permisos frescos desde BD, no un EMPTY cacheado.
    await this.rbac.invalidateUser(user.id, tenantId);
    return created;
  }

  async updateRole(
    membershipId: string,
    dto: UpdateMembershipDto,
    actorUserId: string,
  ) {
    const tenantId = this.getTenantId();
    const role = MembershipRole.parse(dto);

    const membership = await this.repo.findById(tenantId, membershipId);
    if (!membership) {
      throw new MembershipNoEncontradoError(membershipId);
    }

    // No permitir auto-degradación desde OWNER: el último OWNER debe
    // transferir ownership antes de cambiar su propio rol.
    if (
      membership.userId === actorUserId &&
      membership.systemRole === 'OWNER' &&
      !role.isOwner()
    ) {
      throw new AutoDegradacionOwnerError(actorUserId);
    }

    if (role.customRoleId) {
      await this.assertCustomRoleBelongsToTenant(role.customRoleId, tenantId);
    }

    const updated = await this.repo.updateRol(tenantId, membershipId, {
      systemRole: role.systemRole,
      customRoleId: role.customRoleId,
    });
    // Cambio de rol → permisos cambian → invalidar cache RBAC del miembro.
    await this.rbac.invalidateUser(membership.userId, tenantId);
    return updated;
  }

  async remove(membershipId: string, _actorUserId: string) {
    const tenantId = this.getTenantId();

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

  // ---------- helpers privados ----------

  private getTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new TenantContextRequeridoError();
    }
    return tenantId;
  }

  private async assertCustomRoleBelongsToTenant(
    customRoleId: string,
    tenantId: string,
  ) {
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
}
