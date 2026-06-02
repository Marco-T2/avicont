import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { ForbiddenError } from '@/common/errors/forbidden.error';
import { RbacService } from '@/rbac/rbac.service';
import { PrismaService } from '@/common/prisma.service';
import { MePermissionsResponseDto, VerticalActivo } from './dto/me-permissions-response.dto';
import { MePlatformResponseDto } from './dto/me-platform-response.dto';

interface JwtUser {
  sub: string;
  email: string;
  activeTenantId?: string;
  isSuperAdmin: boolean;
}

@ApiTags('Me')
@ApiBearerAuth('JWT-auth')
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly rbac: RbacService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('permissions')
  @ApiOkResponse({ type: MePermissionsResponseDto })
  async permissions(@CurrentUser() user: JwtUser): Promise<MePermissionsResponseDto> {
    if (!user.activeTenantId) {
      // Sin tenant activo en el JWT: coherente con PermissionsGuard (403).
      // Ver REQ-MP-06.
      throw new ForbiddenError('ME_PERMISSIONS_SIN_TENANT', 'Se requiere contexto de organización');
    }

    const { activeTenantId } = user;

    // Verificar membresía activa: REQ-MP-08 distingue "miembro sin permisos" (200)
    // de "membresía desactivada" (403). RbacService.getPermissions() devuelve EMPTY
    // para ambos casos; un lookup directo a la tabla de membresías es el costo mínimo
    // para hacer esa distinción correctamente.
    // Los flags de la org se leen en el mismo select para derivar el vertical sin
    // round-trip extra (invariante organizations_vertical_exclusivo_check garantiza
    // que contabilidadEnabled y granjaEnabled no son true simultáneamente).
    const membresia = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: activeTenantId, userId: user.sub } },
      select: {
        deactivatedAt: true,
        organization: { select: { contabilidadEnabled: true, granjaEnabled: true } },
      },
    });

    if (!membresia) {
      // Usuario no miembro del tenant activo — no debería ocurrir si el JWT es válido,
      // pero puede pasar si fue eliminado del tenant tras emitir el token.
      throw new ForbiddenError(
        'ME_PERMISSIONS_MEMBRESIA_INACTIVA',
        'Acceso denegado al tenant activo',
      );
    }

    if (membresia.deactivatedAt) {
      // Membresía desactivada: REQ-MP-08.
      throw new ForbiddenError(
        'ME_PERMISSIONS_MEMBRESIA_INACTIVA',
        'Acceso denegado al tenant activo',
      );
    }

    const resolved = await this.rbac.resolverPermisosConContexto(user.sub, activeTenantId);

    return {
      permissions: resolved.permissions,
      isOwner: resolved.isOwner,
      activeTenantId,
      vertical: derivarVertical(membresia.organization),
    };
  }

  // Org-less por construcción (REQ-PAUI-01): no replica el chequeo de tenant del
  // método permissions(). Un usuario normal recibe 200 { isSuperAdmin: false }.
  @Get('platform')
  platform(@CurrentUser() user: JwtUser): MePlatformResponseDto {
    return { isSuperAdmin: user.isSuperAdmin === true };
  }
}

function derivarVertical(org: {
  contabilidadEnabled: boolean;
  granjaEnabled: boolean;
}): VerticalActivo {
  // Invariante organizations_vertical_exclusivo_check: nunca ambos flags true.
  if (org.contabilidadEnabled) return 'CONTABILIDAD';
  if (org.granjaEnabled) return 'GRANJA';
  return null;
}
