import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ImpersonationService } from './impersonation.service';
import { StartImpersonationDto } from './dto/start-impersonation.dto';

interface AuthenticatedRequest {
  user: { sub: string; activeTenantId?: string; impersonationId?: string; isSuperAdmin?: boolean };
  headers: Record<string, string | string[] | undefined>;
}

function resolveTenantId(req: AuthenticatedRequest): string {
  const fromHeader = req.headers['x-tenant-id'];
  const tenantId =
    (Array.isArray(fromHeader) ? fromHeader[0] : fromHeader) || req.user.activeTenantId;
  if (!tenantId) throw new ForbiddenException('Se requiere contexto de organización');
  return tenantId;
}

@ApiTags('Impersonation')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('admin/impersonate')
export class ImpersonationController {
  constructor(private readonly service: ImpersonationService) {}

  @Post()
  @ApiOperation({
    summary: 'Iniciar sesión de impersonation (OWNER o super-admin)',
    description:
      'Devuelve un access token especial (vida 30 min, no refrescable) que actúa como el target. ' +
      'Toda acción durante la sesión queda auditada en ImpersonationAction. ' +
      'El super-admin org-less puede especificar la organización target en el body (organizationId). ' +
      'Un OWNER usa el tenant de su contexto (header X-Tenant-ID o JWT.activeTenantId).',
  })
  start(@Req() req: AuthenticatedRequest, @Body() dto: StartImpersonationDto) {
    if (req.user.impersonationId) {
      throw new ForbiddenException(
        'No se puede iniciar impersonation mientras ya estás dentro de otra',
      );
    }
    // REQ-SA-17 delta: el super-admin org-less pasa la org target en el body.
    // El OWNER sigue usando resolveTenantId(req) (header/JWT) — retrocompatible.
    // `exactOptionalPropertyTypes`: nunca pasar undefined; el ternario lo garantiza.
    const callerEsSuperAdmin = req.user.isSuperAdmin === true;
    const organizationId =
      callerEsSuperAdmin && dto.organizationId !== undefined
        ? dto.organizationId
        : resolveTenantId(req);
    return this.service.start(req.user.sub, organizationId, dto, callerEsSuperAdmin);
  }

  @Post('end')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Cerrar la sesión de impersonation activa',
    description:
      'Llamado con el access token de impersonation. Marca endedAt en el log; el token expira solo a los 30 min pero el server lo trata como cerrada.',
  })
  async end(@Req() req: AuthenticatedRequest) {
    const impersonationId = req.user.impersonationId;
    if (!impersonationId) {
      throw new ForbiddenException('Este endpoint requiere un token de impersonation activo');
    }
    await this.service.end(impersonationId, req.user.sub);
  }
}
