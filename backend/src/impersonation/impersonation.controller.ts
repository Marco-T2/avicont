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
    summary: 'Iniciar sesión de impersonation (solo OWNER)',
    description:
      'Devuelve un access token especial (vida 30 min, no refrescable) que actúa como el target. Toda acción durante la sesión queda auditada en ImpersonationAction.',
  })
  start(@Req() req: AuthenticatedRequest, @Body() dto: StartImpersonationDto) {
    if (req.user.impersonationId) {
      throw new ForbiddenException(
        'No se puede iniciar impersonation mientras ya estás dentro de otra',
      );
    }
    // REQ-SA-17: el super-admin puede impersonar en org donde no es miembro.
    // isSuperAdmin viene del JWT validado por JwtStrategy (Slice 2).
    const callerEsSuperAdmin = req.user.isSuperAdmin === true;
    return this.service.start(req.user.sub, resolveTenantId(req), dto, callerEsSuperAdmin);
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
