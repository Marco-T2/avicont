import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EstadoComprobante } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { ForbiddenError } from '@/common/errors';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { AnularVentaDto } from './dto/anular-venta.dto';
import { CreateVentaDto } from './dto/create-venta.dto';
import { LIST_DEFAULT_PAGE_SIZE, ListarVentasQueryDto } from './dto/listar-ventas.dto';
import { UpdateVentaDto } from './dto/update-venta.dto';
import {
  ListarVentasResponseDto,
  VentaContabilizadaResponseDto,
  VentaResponseDto,
  toVentaListItem,
  toVentaResponse,
} from './dto/venta-response.dto';
import { VentasService, type ListarVentasInput } from './ventas.service';

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

// Documento comercial de venta (REQ-VTA). FREE, sin pack: el gating es sólo el
// vertical contabilidad (D-01). Los permisos van como LITERALES string porque
// el test de tres puntas escanea los decoradores por texto.
//
// No existe DELETE de una venta contabilizada (matriz fila 5, §4.7): borrar
// sólo aplica a borradores; lo contabilizado se ANULA con motivo.
@ApiTags('Ventas')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('contabilidad')
@Controller('ventas')
export class VentasController {
  constructor(private readonly service: VentasService) {}

  @Post()
  @RequirePermissions('contabilidad.ventas.create')
  @ApiOperation({
    summary:
      'Guardar borrador de venta. Crea el documento Y su comprobante BORRADOR en la misma transacción (REQ-VTA-01). Los totales los calcula el backend (REQ-VTA-03).',
  })
  @ApiCreatedResponse({ type: VentaResponseDto })
  async crear(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateVentaDto,
  ): Promise<VentaResponseDto> {
    const { venta, comprobanteId } = await this.service.crear(
      resolveTenantId(req),
      req.user.sub,
      dto,
    );
    // El alta SIEMPRE deja un borrador sin número (REQ-VTA-01): no hace falta
    // re-leer el comprobante recién creado para conocer su estado.
    return toVentaResponse(venta, {
      id: comprobanteId,
      numero: null,
      estado: EstadoComprobante.BORRADOR,
      anulado: false,
    });
  }

  @Get()
  @RequirePermissions('contabilidad.ventas.read')
  @ApiOperation({
    summary:
      'Listar ventas del tenant con paginación y filtros (contactoId, rango de fechaContable). El estado de cada venta es el de su comprobante.',
  })
  @ApiOkResponse({ type: ListarVentasResponseDto })
  async listar(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListarVentasQueryDto,
  ): Promise<ListarVentasResponseDto> {
    const input: ListarVentasInput = {
      limit: query.pageSize ?? LIST_DEFAULT_PAGE_SIZE,
      ...(query.contactoId !== undefined ? { contactoId: query.contactoId } : {}),
      ...(query.fechaDesde !== undefined ? { fechaDesde: query.fechaDesde } : {}),
      ...(query.fechaHasta !== undefined ? { fechaHasta: query.fechaHasta } : {}),
      ...(query.page !== undefined ? { page: query.page } : {}),
    };

    const res = await this.service.listar(resolveTenantId(req), input);
    return {
      ventas: res.ventas.map(({ venta, comprobante }) => toVentaListItem(venta, comprobante)),
      total: res.total,
      page: res.page,
      pageSize: res.limit,
    };
  }

  @Get(':id')
  @RequirePermissions('contabilidad.ventas.read')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Detalle de la venta con sus líneas. Ajena → 404 (REQ-VTA-08).' })
  @ApiOkResponse({ type: VentaResponseDto })
  async obtener(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<VentaResponseDto> {
    const { venta, comprobante } = await this.service.obtener(resolveTenantId(req), id);
    return toVentaResponse(venta, comprobante);
  }

  @Put(':id')
  @RequirePermissions('contabilidad.ventas.update')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Edición full-state (D-17): reemplaza la venta en bloque y regenera el asiento preservando id y número. Aplica a BORRADOR y a CONTABILIZADO en período abierto (REQ-VTA-06).',
  })
  @ApiOkResponse({ type: VentaResponseDto })
  async editar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateVentaDto,
  ): Promise<VentaResponseDto> {
    const tenantId = resolveTenantId(req);
    await this.service.editar(tenantId, id, req.user.sub, dto);
    // La edición no cambia estado ni número, pero acá no los tenemos a mano:
    // se re-lee para responder el documento completo con su estado derivado.
    const { venta, comprobante } = await this.service.obtener(tenantId, id);
    return toVentaResponse(venta, comprobante);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('contabilidad.ventas.delete')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Eliminar físicamente un BORRADOR junto con su comprobante (REQ-VTA-01). Un CONTABILIZADO no se borra: se anula con /anular (§4.7).',
  })
  @ApiNoContentResponse()
  async eliminarBorrador(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.service.eliminarBorrador(resolveTenantId(req), id, req.user.sub);
  }

  @Post(':id/contabilizar')
  @HttpCode(200)
  @RequirePermissions('contabilidad.ventas.post')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Contabilizar la venta: asigna número de la serie propia V{YY}{MM}-{correlativo} y re-valida snapshots y cuenta destino (REQ-VTA-05).',
  })
  @ApiOkResponse({ type: VentaContabilizadaResponseDto })
  async contabilizar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<VentaContabilizadaResponseDto> {
    return this.service.contabilizar(resolveTenantId(req), id, req.user.sub);
  }

  @Post(':id/anular')
  @HttpCode(204)
  @RequirePermissions('contabilidad.ventas.void')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Anular la venta (§4.7): flag anulado con motivo, comprobante y número preservados para siempre; desvincula todas las aplicaciones de cobros (REQ-VTA-07).',
  })
  @ApiNoContentResponse()
  async anular(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AnularVentaDto,
  ): Promise<void> {
    await this.service.anular(resolveTenantId(req), id, req.user.sub, dto.motivo);
  }
}
