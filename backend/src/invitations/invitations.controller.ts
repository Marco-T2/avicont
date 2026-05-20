import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { InvitationStatus } from '@prisma/client';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { AcceptAndRegisterDto } from './dto/accept-and-register.dto';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';

interface AuthenticatedRequest {
  user: { sub: string; activeTenantId?: string };
  headers: Record<string, string | string[] | undefined>;
}

function resolveTenantId(req: AuthenticatedRequest): string {
  const fromHeader = req.headers['x-tenant-id'];
  const tenantId =
    (Array.isArray(fromHeader) ? fromHeader[0] : fromHeader) || req.user.activeTenantId;
  if (!tenantId) throw new ForbiddenException('Se requiere contexto de organización');
  return tenantId;
}

@ApiTags('Invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly service: InvitationsService) {}

  // ----- Endpoints públicos (token = autorización) -----

  @Get('preview')
  @ApiOperation({ summary: 'Preview de una invitación a partir del token (público)' })
  preview(@Query('token') token: string) {
    return this.service.previewByToken(token);
  }

  @Post('accept-and-register')
  @ApiOperation({
    summary: 'Acepta la invitación creando una cuenta nueva (público, autorizado por token)',
  })
  acceptAndRegister(@Body() dto: AcceptAndRegisterDto) {
    return this.service.acceptAndRegister(dto.token, dto.password, dto.displayName);
  }

  // ----- Endpoints autenticados -----

  @Post('accept')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Acepta una invitación con la cuenta logueada' })
  accept(@Req() req: AuthenticatedRequest, @Body() dto: AcceptInvitationDto) {
    return this.service.acceptWithExistingUser(dto.token, req.user.sub);
  }

  @Get()
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions('organizacion.miembros.read')
  @ApiOperation({ summary: 'Listar invitaciones de la organización activa' })
  list(@Req() req: AuthenticatedRequest, @Query('status') status?: InvitationStatus) {
    return this.service.list(resolveTenantId(req), status);
  }

  @Post()
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions('organizacion.miembros.invite')
  @ApiOperation({ summary: 'Crear invitación (envía email)' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateInvitationDto) {
    return this.service.create(resolveTenantId(req), req.user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions('organizacion.miembros.invite')
  @ApiOperation({ summary: 'Revocar una invitación pendiente' })
  async revoke(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.service.revoke(resolveTenantId(req), id);
  }
}
