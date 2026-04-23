import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomRole } from '@prisma/client';
import {
  CUSTOM_ROLE_REPOSITORY_PORT,
  CustomRoleRepositoryPort,
} from './ports/custom-role.repository.port';
import { CreateCustomRoleDto } from './dto/create-custom-role.dto';
import { UpdateCustomRoleDto } from './dto/update-custom-role.dto';
import { CloneCustomRoleDto } from './dto/clone-custom-role.dto';
import { assertValidPermissionPattern } from '../rbac/domain/permission-matcher';
import { permisoExisteEnCatalogo } from '../common/permisos/catalogo';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class CustomRolesService {
  constructor(
    @Inject(CUSTOM_ROLE_REPOSITORY_PORT)
    private readonly repo: CustomRoleRepositoryPort,
    private readonly rbac: RbacService,
  ) {}

  list(organizationId: string): Promise<CustomRole[]> {
    return this.repo.list(organizationId);
  }

  async findById(organizationId: string, id: string): Promise<CustomRole> {
    const role = await this.repo.findById(id);
    if (!role || role.organizationId !== organizationId) {
      throw new NotFoundException('Rol no encontrado');
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
      throw new ConflictException(`Ya existe un rol con slug "${dto.slug}"`);
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
      throw new ConflictException(`Ya existe un rol con slug "${dto.slug}"`);
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
      throw new ForbiddenException('Este rol está marcado como no editable');
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
      throw new ForbiddenException('No se pueden eliminar roles del sistema');
    }
    const count = await this.repo.countActiveMembers(id);
    if (count > 0) {
      throw new ConflictException(
        `No se puede eliminar: ${count} miembro(s) activo(s) tienen este rol`,
      );
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
        throw new BadRequestException((e as Error).message);
      }
      const tieneWildcard = p === '*' || p.includes('*');
      if (!tieneWildcard && !permisoExisteEnCatalogo(p)) {
        throw new BadRequestException(`Permiso desconocido: "${p}"`);
      }
    }
  }
}
