import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '@/common/guards/super-admin.guard';
import { PlatformAuditInterceptor } from '@/audit/platform-audit.interceptor';

import { CreateOrgDto } from './dto/create-org.dto';
import { UpdateOrgStatusDto } from './dto/update-org-status.dto';
import { UpdateEntitlementDto } from './dto/update-entitlement.dto';
import { PlatformOrgResponseDto } from './dto/platform-org-response.dto';
import { PlatformOrgMemberResponseDto } from './dto/platform-org-member-response.dto';
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
  @ApiResponse({
    status: 200,
    description: 'Lista de organizaciones',
    type: [PlatformOrgResponseDto],
  })
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
  @ApiResponse({
    status: 422,
    description: 'El ownerEmail no corresponde a ningún usuario registrado',
  })
  async crearOrg(@Body() dto: CreateOrgDto): Promise<PlatformOrgResponseDto> {
    return this.platformAdminService.crearOrgConOwner(dto);
  }

  /**
   * REQ-PM-01: Lista los miembros de una organización (activos + desactivados).
   *
   * El SA opera cross-tenant: no usa TenantGuard. Se inyecta `req['tenantId'] = id`
   * antes del interceptor para que PlatformAuditInterceptor registre
   * targetOrganizationId (idéntico al patrón de actualizarStatus/actualizarEntitlement).
   *
   * Incluye activos Y desactivados (design §3.1 — el SA necesita ver toda la historia).
   */
  @Get('orgs/:id/members')
  @ApiOperation({ summary: 'Listar miembros de una organización (super-admin)' })
  @ApiResponse({
    status: 200,
    description: 'Lista de miembros (activos + desactivados)',
    type: [PlatformOrgMemberResponseDto],
  })
  @ApiResponse({ status: 403, description: 'No es super-admin de plataforma' })
  @ApiResponse({ status: 404, description: 'Organización no encontrada' })
  async listarMiembros(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<PlatformOrgMemberResponseDto[]> {
    // El interceptor usa req.tenantId para registrar targetOrganizationId.
    // Como no usamos TenantGuard aquí, lo poblamos manualmente con el path id.
    (req as unknown as Record<string, unknown>)['tenantId'] = id;
    return this.platformAdminService.listarMiembros(id);
  }

  /**
   * REQ-SA-14: Suspende, reactiva o archiva una organización.
   *
   * El `:id` viene del path — el super-admin opera cross-tenant sin TenantGuard.
   * Se inyecta `req['tenantId'] = id` para que el PlatformAuditInterceptor
   * capture `targetOrganizationId` correctamente (el interceptor lee req.tenantId).
   */
  @Patch('orgs/:id/status')
  @ApiOperation({ summary: 'Cambiar status de organización (super-admin)' })
  @ApiResponse({ status: 200, description: 'Status actualizado', type: PlatformOrgResponseDto })
  @ApiResponse({ status: 403, description: 'No es super-admin de plataforma' })
  @ApiResponse({ status: 404, description: 'Organización no encontrada' })
  async actualizarStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrgStatusDto,
    @Req() req: Request,
  ): Promise<PlatformOrgResponseDto> {
    // El interceptor usa req.tenantId para registrar targetOrganizationId.
    // Como no usamos TenantGuard aquí, lo poblamos manualmente con el path id.
    (req as unknown as Record<string, unknown>)['tenantId'] = id;
    return this.platformAdminService.actualizarStatus(id, dto.status);
  }

  /**
   * REQ-SA-15: Actualiza el plan (FREE/PRO) y/o verticales de una organización.
   *
   * Valida exclusividad de vertical: si el estado resultante tiene ambas verticales
   * en true, devuelve 422 (defense in depth con el CHECK constraint de la BD).
   *
   * El `:id` viene del path — sin TenantGuard, req.tenantId se popula manualmente
   * para que el interceptor de auditoría capture targetOrganizationId.
   */
  @Patch('orgs/:id/entitlement')
  @ApiOperation({ summary: 'Actualizar plan y verticales de organización (super-admin)' })
  @ApiResponse({
    status: 200,
    description: 'Entitlement actualizado',
    type: PlatformOrgResponseDto,
  })
  @ApiResponse({ status: 403, description: 'No es super-admin de plataforma' })
  @ApiResponse({ status: 404, description: 'Organización no encontrada' })
  @ApiResponse({
    status: 422,
    description: 'Ambos verticales no pueden estar activos simultáneamente',
  })
  async actualizarEntitlement(
    @Param('id') id: string,
    @Body() dto: UpdateEntitlementDto,
    @Req() req: Request,
  ): Promise<PlatformOrgResponseDto> {
    (req as unknown as Record<string, unknown>)['tenantId'] = id;
    return this.platformAdminService.actualizarEntitlement(id, dto);
  }
}
