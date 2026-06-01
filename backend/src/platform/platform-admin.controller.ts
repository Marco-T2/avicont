import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '@/common/guards/super-admin.guard';
import { PlatformAuditInterceptor } from '@/audit/platform-audit.interceptor';

import { CreateOrgDto } from './dto/create-org.dto';
import { PlatformOrgResponseDto } from './dto/platform-org-response.dto';
import { PlatformAdminService } from './platform-admin.service';

/**
 * Controller de administración de plataforma (REQ-SA-12, REQ-SA-13).
 *
 * Endpoints org-less: NO usan TenantGuard porque el super-admin opera sobre
 * todas las orgs y no tiene un tenant activo en estas rutas (CLAUDE.md §4.2).
 *
 * Guards aplicados en orden:
 * 1. JwtAuthGuard — autentica el JWT y popula req.user.
 * 2. SuperAdminGuard — rechaza con 403 si req.user.isSuperAdmin !== true.
 * 3. PlatformAuditInterceptor — registra mutaciones en platform_audit (REQ-SA-08).
 *
 * docs/disenos/super-admin-plataforma.md §4
 */
@ApiTags('Platform Admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin/platform')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@UseInterceptors(PlatformAuditInterceptor)
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  /**
   * REQ-SA-12: Lista todas las organizaciones de la plataforma.
   * Endpoint org-less — sin TenantGuard.
   */
  @Get('orgs')
  @ApiOperation({ summary: 'Listar todas las organizaciones (super-admin)' })
  @ApiResponse({ status: 200, description: 'Lista de organizaciones', type: [PlatformOrgResponseDto] })
  @ApiResponse({ status: 403, description: 'No es super-admin de plataforma' })
  async listarOrgs(): Promise<PlatformOrgResponseDto[]> {
    return this.platformAdminService.listarOrgs();
  }

  /**
   * REQ-SA-13: Crea una organización con el OWNER designado por email.
   * Endpoint org-less — sin TenantGuard.
   * El ownerEmail debe corresponder a un usuario ya registrado en el sistema.
   */
  @Post('orgs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear organización con OWNER designado (super-admin)' })
  @ApiResponse({ status: 201, description: 'Organización creada', type: PlatformOrgResponseDto })
  @ApiResponse({ status: 403, description: 'No es super-admin de plataforma' })
  @ApiResponse({ status: 422, description: 'El ownerEmail no corresponde a ningún usuario registrado' })
  async crearOrg(@Body() dto: CreateOrgDto): Promise<PlatformOrgResponseDto> {
    return this.platformAdminService.crearOrgConOwner(dto);
  }
}
