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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { ForbiddenError } from '@/common/errors';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { EstadoLote } from './domain/enums';
import { CreateLoteDto } from './dto/create-lote.dto';
import { CreateMovimientoCantidadDto } from './dto/create-movimiento-cantidad.dto';
import { CreateMovimientoInversionDto } from './dto/create-movimiento-inversion.dto';
import {
  LoteResponseDto,
  ListarLotesResponseDto,
  toLoteListItem,
  toLoteResponse,
} from './dto/lote-response.dto';
import { UpdateLoteDto } from './dto/update-lote.dto';
import {
  MovimientoCantidadResponseDto,
  MovimientoInversionResponseDto,
  toMovimientoCantidadResponse,
  toMovimientoInversionResponse,
} from './dto/movimiento-response.dto';
import { DashboardService } from './dashboard.service';
import { LoteService } from './lote.service';
import { MovimientoService } from './movimiento.service';

// Mismo resolver que el resto de controllers (contactos, comprobantes, etc.).
// El header X-Tenant-ID lo usa super-admin; para el resto vale activeTenantId del JWT.
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

const LIST_DEFAULT_PAGE = 1;
const LIST_DEFAULT_PAGE_SIZE = 50;

@ApiTags('Granja — Lotes')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('granja')
@Controller('granja/lotes')
export class LotesController {
  constructor(
    private readonly loteService: LoteService,
    private readonly movimientoService: MovimientoService,
    private readonly dashboardService: DashboardService,
  ) {}

  @Post()
  @RequirePermissions('granja.lotes.create')
  @ApiOperation({ summary: 'Crea un lote ACTIVO en el tenant activo.' })
  async crear(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateLoteDto,
  ): Promise<LoteResponseDto> {
    const tenantId = resolveTenantId(req);
    const lote = await this.loteService.create(tenantId, {
      cantidadInicial: dto.cantidadInicial,
      fechaIngreso: new Date(dto.fechaIngreso),
      ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
      ...(dto.galpon !== undefined ? { galpon: dto.galpon } : {}),
      ...(dto.detalle !== undefined ? { detalle: dto.detalle } : {}),
      ...(dto.fechaEstimadaSaca !== undefined
        ? { fechaEstimadaSaca: new Date(dto.fechaEstimadaSaca) }
        : {}),
    });
    const { resumen, edadDias } = await this.dashboardService.informeLote(tenantId, lote);
    return toLoteResponse(lote, resumen, edadDias);
  }

  @Get()
  @RequirePermissions('granja.lotes.read')
  @ApiOperation({ summary: 'Lista lotes del tenant. Orden: fechaIngreso DESC.' })
  async listar(
    @Req() req: AuthenticatedRequest,
    @Query('estado') estado?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ListarLotesResponseDto> {
    const tenantId = resolveTenantId(req);
    const pageNum = page !== undefined ? parseInt(page, 10) : LIST_DEFAULT_PAGE;
    const limit = pageSize !== undefined ? parseInt(pageSize, 10) : LIST_DEFAULT_PAGE_SIZE;

    const estadoFiltro =
      estado === EstadoLote.ACTIVO || estado === EstadoLote.CERRADO ? estado : undefined;

    const res = await this.loteService.listar(
      tenantId,
      { ...(estadoFiltro !== undefined ? { estado: estadoFiltro } : {}) },
      { page: pageNum, limit },
    );

    return {
      items: res.items.map(toLoteListItem),
      total: res.total,
      page: pageNum,
      pageSize: limit,
    };
  }

  @Get(':id')
  @RequirePermissions('granja.lotes.read')
  @ApiOperation({ summary: 'Detalle de un lote con su resumen (costo por pollo vivo).' })
  async detalle(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LoteResponseDto> {
    const tenantId = resolveTenantId(req);
    const lote = await this.loteService.findById(tenantId, id);
    const { resumen, edadDias } = await this.dashboardService.informeLote(tenantId, lote);
    return toLoteResponse(lote, resumen, edadDias);
  }

  @Patch(':id')
  @RequirePermissions('granja.lotes.update')
  @ApiOperation({
    summary: 'Edita campos mutables del lote. cantidadInicial es inmutable (se rechaza).',
  })
  async editar(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLoteDto,
  ): Promise<LoteResponseDto> {
    const tenantId = resolveTenantId(req);
    const lote = await this.loteService.update(tenantId, id, {
      ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
      ...(dto.galpon !== undefined ? { galpon: dto.galpon } : {}),
      ...(dto.detalle !== undefined ? { detalle: dto.detalle } : {}),
      ...(dto.fechaIngreso !== undefined ? { fechaIngreso: new Date(dto.fechaIngreso) } : {}),
      ...(dto.fechaEstimadaSaca !== undefined
        ? { fechaEstimadaSaca: new Date(dto.fechaEstimadaSaca) }
        : {}),
      // cantidadInicial se pasa CRUDO para que el validator de dominio lo rechace.
      ...(dto.cantidadInicial !== undefined ? { cantidadInicial: dto.cantidadInicial } : {}),
    });
    const { resumen, edadDias } = await this.dashboardService.informeLote(tenantId, lote);
    return toLoteResponse(lote, resumen, edadDias);
  }

  @Post(':id/cerrar')
  @RequirePermissions('granja.lotes.update')
  @ApiOperation({ summary: 'Cierra un lote ACTIVO (transición ACTIVO → CERRADO).' })
  async cerrar(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LoteResponseDto> {
    const tenantId = resolveTenantId(req);
    const lote = await this.loteService.cerrar(tenantId, id);
    const { resumen, edadDias } = await this.dashboardService.informeLote(tenantId, lote);
    return toLoteResponse(lote, resumen, edadDias);
  }

  // --------------------------------------------------------------------------
  // Movimientos del lote
  // --------------------------------------------------------------------------

  @Post(':id/movimientos/inversion')
  @RequirePermissions('granja.movimientos.create')
  @ApiOperation({ summary: 'Registra un movimiento de inversión (costo) en el lote.' })
  async registrarInversion(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) loteId: string,
    @Body() dto: CreateMovimientoInversionDto,
  ): Promise<MovimientoInversionResponseDto> {
    const tenantId = resolveTenantId(req);
    const mov = await this.movimientoService.registrarInversion(tenantId, loteId, {
      tipoRegistroId: dto.tipoRegistroId,
      monto: dto.monto,
      fecha: new Date(dto.fecha),
      detalle: dto.detalle ?? null,
    });
    return toMovimientoInversionResponse(mov);
  }

  @Post(':id/movimientos/cantidad')
  @RequirePermissions('granja.movimientos.create')
  @ApiOperation({ summary: 'Registra un movimiento de cantidad (mortalidad) en el lote.' })
  async registrarCantidad(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) loteId: string,
    @Body() dto: CreateMovimientoCantidadDto,
  ): Promise<MovimientoCantidadResponseDto> {
    const tenantId = resolveTenantId(req);
    const mov = await this.movimientoService.registrarCantidad(tenantId, loteId, {
      tipoRegistroId: dto.tipoRegistroId,
      cantidad: dto.cantidad,
      fecha: new Date(dto.fecha),
      detalle: dto.detalle ?? null,
    });
    return toMovimientoCantidadResponse(mov);
  }

  @Get(':id/movimientos')
  @RequirePermissions('granja.movimientos.read')
  @ApiOperation({ summary: 'Lista los movimientos (inversión y cantidad) del lote.' })
  async listarMovimientos(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) loteId: string,
  ): Promise<{
    inversiones: MovimientoInversionResponseDto[];
    cantidades: MovimientoCantidadResponseDto[];
  }> {
    const tenantId = resolveTenantId(req);
    const [inversiones, cantidades] = await Promise.all([
      this.movimientoService.listarInversiones(tenantId, loteId),
      this.movimientoService.listarCantidades(tenantId, loteId),
    ]);
    return {
      inversiones: inversiones.map(toMovimientoInversionResponse),
      cantidades: cantidades.map(toMovimientoCantidadResponse),
    };
  }

  @Delete(':id/movimientos/inversion/:movId')
  @HttpCode(204)
  @RequirePermissions('granja.movimientos.delete')
  @ApiOperation({ summary: 'Elimina un movimiento de inversión (lote ACTIVO).' })
  async eliminarInversion(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) loteId: string,
    @Param('movId', ParseUUIDPipe) movId: string,
  ): Promise<void> {
    const tenantId = resolveTenantId(req);
    await this.movimientoService.eliminarInversion(tenantId, loteId, movId);
  }

  @Delete(':id/movimientos/cantidad/:movId')
  @HttpCode(204)
  @RequirePermissions('granja.movimientos.delete')
  @ApiOperation({ summary: 'Elimina un movimiento de cantidad (lote ACTIVO).' })
  async eliminarCantidad(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) loteId: string,
    @Param('movId', ParseUUIDPipe) movId: string,
  ): Promise<void> {
    const tenantId = resolveTenantId(req);
    await this.movimientoService.eliminarCantidad(tenantId, loteId, movId);
  }
}
