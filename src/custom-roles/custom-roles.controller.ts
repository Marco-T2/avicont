import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CustomRolesService } from './custom-roles.service';
import { CreateCustomRoleDto } from './dto/create-custom-role.dto';
import { UpdateCustomRoleDto } from './dto/update-custom-role.dto';
import { CloneCustomRoleDto } from './dto/clone-custom-role.dto';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';

interface AuthenticatedRequest {
  user: { sub: string; activeTenantId?: string };
  headers: Record<string, string | string[] | undefined>;
}

function resolveTenantId(req: AuthenticatedRequest): string {
  const fromHeader = req.headers['x-tenant-id'];
  const tenantId = (Array.isArray(fromHeader) ? fromHeader[0] : fromHeader) || req.user.activeTenantId;
  if (!tenantId) throw new ForbiddenException('Se requiere contexto de organización');
  return tenantId;
}

@ApiTags('CustomRoles')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('custom-roles')
export class CustomRolesController {
  constructor(private readonly service: CustomRolesService) {}

  @Get()
  @RequirePermissions('organizacion.roles.read')
  @ApiOperation({ summary: 'Listar roles personalizados de la organización activa' })
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(resolveTenantId(req));
  }

  @Get(':id')
  @RequirePermissions('organizacion.roles.read')
  findById(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.findById(resolveTenantId(req), id);
  }

  @Get(':id/members')
  @RequirePermissions('organizacion.roles.read')
  @ApiOperation({ summary: 'Listar miembros que tienen asignado el rol' })
  listMembers(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.listMembers(resolveTenantId(req), id);
  }

  @Post()
  @RequirePermissions('organizacion.roles.create')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateCustomRoleDto) {
    return this.service.create(resolveTenantId(req), req.user.sub, dto);
  }

  @Post(':id/clone')
  @RequirePermissions('organizacion.roles.create')
  clone(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CloneCustomRoleDto,
  ) {
    return this.service.clone(resolveTenantId(req), req.user.sub, id, dto);
  }

  @Patch(':id')
  @RequirePermissions('organizacion.roles.update')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateCustomRoleDto,
  ) {
    return this.service.update(resolveTenantId(req), id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('organizacion.roles.delete')
  delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.delete(resolveTenantId(req), id);
  }
}
