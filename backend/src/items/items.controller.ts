import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { ForbiddenError } from '@/common/errors';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { CreateItemDto } from './dto/create-item.dto';
import { ItemResponseDto, ListarItemsResponseDto, toItemResponse } from './dto/item-response.dto';
import { LIST_DEFAULT_PAGE_SIZE, ListarItemsQueryDto } from './dto/listar-items.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemsService } from './items.service';

interface AuthenticatedRequest {
  user: { sub: string; activeTenantId?: string };
  headers: Record<string, string | string[] | undefined>;
}

function resolveTenantId(req: AuthenticatedRequest): string {
  const fromHeader = req.headers['x-tenant-id'];
  const tenantId =
    (Array.isArray(fromHeader) ? fromHeader[0] : fromHeader) || req.user.activeTenantId;
  if (tenantId === undefined || tenantId === '') {
    throw new ForbiddenError('TENANT_CONTEXT_REQUIRED', 'Se requiere contexto de organización');
  }
  return tenantId;
}

// Catálogo de ítems vendibles. FREE, sin pack: el gating es sólo el vertical
// contabilidad (D-01). Los permisos van como LITERALES string porque el test
// de tres puntas escanea los decoradores por texto.
@ApiTags('Ítems')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('contabilidad')
@Controller('items')
export class ItemsController {
  constructor(private readonly service: ItemsService) {}

  @Post()
  @RequirePermissions('contabilidad.items.create')
  @ApiOperation({
    summary:
      'Crea un ítem. Sólo `nombre` y `tipo` son obligatorios (D-24): no se le pide nomenclatura a quien sólo quiere cobrar.',
  })
  @ApiOkResponse({ type: ItemResponseDto })
  async crear(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateItemDto,
  ): Promise<ItemResponseDto> {
    const item = await this.service.crear(resolveTenantId(req), req.user.sub, dto);
    return toItemResponse(item);
  }

  @Get()
  @RequirePermissions('contabilidad.items.read')
  @ApiOperation({ summary: 'Lista ítems del tenant con paginación y filtros (q, tipo, activo).' })
  @ApiOkResponse({ type: ListarItemsResponseDto })
  async listar(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListarItemsQueryDto,
  ): Promise<ListarItemsResponseDto> {
    const input: Parameters<ItemsService['listar']>[1] = {
      limit: query.pageSize ?? LIST_DEFAULT_PAGE_SIZE,
    };
    if (query.q !== undefined) input.q = query.q;
    if (query.tipo !== undefined) input.tipo = query.tipo;
    if (query.activo !== undefined) input.activo = query.activo;
    if (query.page !== undefined) input.page = query.page;

    const res = await this.service.listar(resolveTenantId(req), input);
    return {
      items: res.items.map(toItemResponse),
      total: res.total,
      page: res.page,
      pageSize: res.limit,
    };
  }

  @Get(':id')
  @RequirePermissions('contabilidad.items.read')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Detalle del ítem.' })
  @ApiOkResponse({ type: ItemResponseDto })
  async obtener(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ItemResponseDto> {
    const item = await this.service.obtener(resolveTenantId(req), id);
    return toItemResponse(item);
  }

  @Patch(':id')
  @RequirePermissions('contabilidad.items.update')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'PATCH del ítem. Sólo toca los campos presentes. El toggle activo/inactivo vive en endpoints dedicados.',
  })
  @ApiOkResponse({ type: ItemResponseDto })
  async actualizar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateItemDto,
  ): Promise<ItemResponseDto> {
    const item = await this.service.actualizar(resolveTenantId(req), id, dto);
    return toItemResponse(item);
  }

  @Post(':id/reactivar')
  @HttpCode(200)
  @RequirePermissions('contabilidad.items.update')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Reactiva un ítem inactivo. Idempotente.' })
  @ApiOkResponse({ type: ItemResponseDto })
  async reactivar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ItemResponseDto> {
    const item = await this.service.reactivar(resolveTenantId(req), id);
    return toItemResponse(item);
  }

  // DELETE en el verbo HTTP, DESACTIVAR en la semántica: un ítem no se borra
  // nunca (REQ-ITM-01), porque las ventas existentes conservan su itemId y sus
  // snapshots. Devuelve el ítem para que el cliente vea `activo: false` sin
  // re-consultar.
  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('contabilidad.items.delete')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Desactiva el ítem (soft-delete). Idempotente. Deja de ofrecerse para ventas nuevas; las existentes no se tocan.',
  })
  @ApiOkResponse({ type: ItemResponseDto })
  async desactivar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ItemResponseDto> {
    const item = await this.service.desactivar(resolveTenantId(req), id);
    return toItemResponse(item);
  }
}
