import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '@/common/guards/super-admin.guard';
import { PlatformAuditInterceptor } from '@/audit/platform-audit.interceptor';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { HabilitarPackDto } from '@/packs/dto/habilitar-pack.dto';
import { OrgPackEntitlementResponseDto } from '@/packs/dto/org-pack-entitlement-response.dto';
import { PackResponseDto } from '@/packs/dto/pack-response.dto';

import { CreateOrgDto } from './dto/create-org.dto';
import { UpdateOrgStatusDto } from './dto/update-org-status.dto';
import { UpdateEntitlementDto } from './dto/update-entitlement.dto';
import { PlatformOrgResponseDto } from './dto/platform-org-response.dto';
import { PlatformOrgMemberResponseDto } from './dto/platform-org-member-response.dto';
import { PlatformDashboardResponseDto } from './dto/platform-dashboard-response.dto';
import { PlatformActivityResponseDto } from './dto/platform-activity-response.dto';
import { PlatformActivityQueryDto } from './dto/platform-activity-query.dto';
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
   * Catálogo global de packs vendibles (eje 2) para el panel super-admin.
   *
   * Endpoint org-less: el catálogo no pertenece a ninguna org. Sin TenantGuard.
   * El super-admin lo consulta para saber qué packs puede habilitar a una org
   * (POST orgs/:id/packs). El filtro por vertical de la org se hace en el cliente
   * (UX); el backend valida el vertical al habilitar (PackService.habilitar §8).
   */
  @Get('packs')
  @ApiOperation({ summary: 'Listar el catálogo global de packs (super-admin)' })
  @ApiOkResponse({ description: 'Catálogo de packs vendibles', type: [PackResponseDto] })
  @ApiResponse({ status: 403, description: 'No es super-admin de plataforma' })
  async listarCatalogoPacks(): Promise<PackResponseDto[]> {
    return this.platformAdminService.listarCatalogoPacks();
  }

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

  /**
   * Riel de packs §5.4: el super-admin habilita un pack (eje 2) a una org. Crea
   * el entitlement con `activo=false` (habilitar ≠ activar). Valida que el pack
   * pertenezca al vertical de la org (§8) y audita la mutación.
   *
   * `req.tenantId = id` se popula para que el interceptor capture
   * `targetOrganizationId` (sin TenantGuard, mismo patrón que status/entitlement).
   */
  @Post('orgs/:id/packs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Habilitar un pack a una organización (super-admin)' })
  @ApiResponse({
    status: 201,
    description: 'Entitlement creado (activo=false)',
    type: OrgPackEntitlementResponseDto,
  })
  @ApiResponse({ status: 400, description: 'El pack no aplica al vertical de la organización' })
  @ApiResponse({ status: 403, description: 'No es super-admin de plataforma' })
  @ApiResponse({ status: 404, description: 'Organización o pack no encontrado' })
  async habilitarPack(
    @Param('id') id: string,
    @Body() dto: HabilitarPackDto,
    @CurrentUser() user: { sub: string },
    @Req() req: Request,
  ): Promise<OrgPackEntitlementResponseDto> {
    (req as unknown as Record<string, unknown>)['tenantId'] = id;
    return this.platformAdminService.habilitarPack(
      id,
      {
        ...(dto.packId !== undefined ? { packId: dto.packId } : {}),
        ...(dto.clave !== undefined ? { clave: dto.clave } : {}),
      },
      user.sub,
    );
  }

  /**
   * Riel de packs §5.4: el super-admin revoca el entitlement de un pack (borra la
   * fila → cae la activación). Invalida el cache `org-packs:<id>` y audita.
   */
  @Delete('orgs/:id/packs/:packId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revocar el entitlement de un pack de una organización (super-admin)' })
  @ApiResponse({ status: 204, description: 'Entitlement revocado' })
  @ApiResponse({ status: 403, description: 'No es super-admin de plataforma' })
  @ApiResponse({ status: 404, description: 'Organización no encontrada' })
  async revocarPack(
    @Param('id') id: string,
    @Param('packId') packId: string,
    @Req() req: Request,
  ): Promise<void> {
    (req as unknown as Record<string, unknown>)['tenantId'] = id;
    await this.platformAdminService.revocarPack(id, packId);
  }

  /**
   * Riel de packs §5.4: lista los entitlements de packs de una org (habilitados +
   * estado de activación) para el panel super-admin. GET cross-tenant auditado.
   */
  @Get('orgs/:id/packs')
  @ApiOperation({ summary: 'Listar entitlements de packs de una organización (super-admin)' })
  @ApiResponse({
    status: 200,
    description: 'Lista de entitlements con su pack y estado de activación',
    type: [OrgPackEntitlementResponseDto],
  })
  @ApiResponse({ status: 403, description: 'No es super-admin de plataforma' })
  @ApiResponse({ status: 404, description: 'Organización no encontrada' })
  async listarPacks(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<OrgPackEntitlementResponseDto[]> {
    (req as unknown as Record<string, unknown>)['tenantId'] = id;
    return this.platformAdminService.listarPacks(id);
  }

  /**
   * REQ-PCT-01: KPIs del dashboard de plataforma.
   *
   * Endpoint org-less, cross-tenant: agrega datos de TODAS las orgs sin filtrar
   * por tenantId. El enforcement está en SuperAdminGuard (excepción Anti-31
   * deliberada — CLAUDE.md §10.1).
   */
  @Get('dashboard')
  @ApiOperation({ summary: 'KPIs del dashboard de plataforma (super-admin)' })
  @ApiOkResponse({
    description: 'Estadísticas globales de plataforma',
    type: PlatformDashboardResponseDto,
  })
  @ApiResponse({ status: 403, description: 'No es super-admin de plataforma' })
  async getDashboard(): Promise<PlatformDashboardResponseDto> {
    return this.platformAdminService.getDashboard();
  }

  /**
   * REQ-PCT-03: Timeline de actividad de plataforma paginado por cursor.
   *
   * Endpoint org-less, cross-tenant: lee platform_audit sin filtrar por tenantId.
   * El enforcement está en SuperAdminGuard (excepción Anti-31 deliberada).
   *
   * El campo `payload` NUNCA se expone (REQ-PCT-04 — dato sensible).
   */
  @Get('activity')
  @ApiOperation({ summary: 'Timeline de actividad de plataforma (super-admin)' })
  @ApiOkResponse({
    description: 'Página de actividad de plataforma con cursor de paginación',
    type: PlatformActivityResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cursor inválido (PLATFORM_ACTIVITY_CURSOR_INVALIDO)' })
  @ApiResponse({ status: 403, description: 'No es super-admin de plataforma' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Ítems por página (1-100, default 20)',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Cursor opaco de paginación',
  })
  @ApiQuery({
    name: 'orgId',
    required: false,
    type: String,
    description: 'Filtrar por organización (UUID)',
  })
  async getActivity(
    @Query() query: PlatformActivityQueryDto,
  ): Promise<PlatformActivityResponseDto> {
    return this.platformAdminService.getActivity(query);
  }
}
