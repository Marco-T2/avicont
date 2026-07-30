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
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { CobrosService, type ListarCobrosInput } from './cobros.service';
import { AnularCobroDto } from './dto/anular-cobro.dto';
import {
  AplicacionCobroResponseDto,
  CobroContabilizadoResponseDto,
  CobroResponseDto,
  ListarCobrosResponseDto,
  toAplicacionResponse,
  toCobroListItem,
  toCobroResponse,
} from './dto/cobro-response.dto';
import { CreateCobroDto } from './dto/create-cobro.dto';
import { CrearAplicacionDto, EditarAplicacionDto } from './dto/crear-aplicacion.dto';
import { LIST_DEFAULT_PAGE_SIZE, ListarCobrosQueryDto } from './dto/listar-cobros.dto';
import { UpdateCobroDto } from './dto/update-cobro.dto';
import { AuthenticatedRequest, resolveTenantId } from './tenant-request';

// El cobro como hecho contable independiente + sus aplicaciones como vínculos
// (REQ-CXC-02/03). FREE, sin pack: el gating es sólo el vertical contabilidad
// (D-01). Los permisos van como LITERALES string porque el test de tres puntas
// escanea los decoradores por texto (REQ-CXC-10).
//
// No existe DELETE de un cobro contabilizado (§4.7): borrar sólo aplica a
// borradores; lo contabilizado se ANULA con motivo. Aplicar y desaplicar van
// bajo `cobros.update`: mutan el vínculo, no crean hecho contable.
@ApiTags('Cobros')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('contabilidad')
@Controller('cobros')
export class CobrosController {
  constructor(private readonly service: CobrosService) {}

  @Post()
  @RequirePermissions('contabilidad.cobros.create')
  @ApiOperation({
    summary:
      'Guardar borrador de cobro. Crea el documento Y su comprobante INGRESO BORRADOR en la misma transacción (REQ-CXC-02): Debe cuenta destino / Haber CxC con el contacto en la línea.',
  })
  @ApiCreatedResponse({ type: CobroResponseDto })
  async crear(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCobroDto,
  ): Promise<CobroResponseDto> {
    const { cobro, comprobanteId } = await this.service.crear(
      resolveTenantId(req),
      req.user.sub,
      dto,
    );
    // El alta SIEMPRE deja un borrador sin número ni aplicaciones: no hace
    // falta re-leer lo recién creado para conocer su estado.
    return toCobroResponse(
      cobro,
      { id: comprobanteId, numero: null, estado: EstadoComprobante.BORRADOR, anulado: false },
      [],
    );
  }

  @Get()
  @RequirePermissions('contabilidad.cobros.read')
  @ApiOperation({
    summary:
      'Listar cobros del tenant con paginación y filtros (contactoId, rango de fechaContable). El estado de cada cobro es el de su comprobante.',
  })
  @ApiOkResponse({ type: ListarCobrosResponseDto })
  async listar(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListarCobrosQueryDto,
  ): Promise<ListarCobrosResponseDto> {
    const input: ListarCobrosInput = {
      limit: query.pageSize ?? LIST_DEFAULT_PAGE_SIZE,
      ...(query.contactoId !== undefined ? { contactoId: query.contactoId } : {}),
      ...(query.fechaDesde !== undefined ? { fechaDesde: query.fechaDesde } : {}),
      ...(query.fechaHasta !== undefined ? { fechaHasta: query.fechaHasta } : {}),
      ...(query.page !== undefined ? { page: query.page } : {}),
    };

    const res = await this.service.listar(resolveTenantId(req), input);
    return {
      cobros: res.cobros.map(({ cobro, comprobante }) => toCobroListItem(cobro, comprobante)),
      total: res.total,
      page: res.page,
      pageSize: res.limit,
    };
  }

  @Get(':id')
  @RequirePermissions('contabilidad.cobros.read')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Detalle del cobro con sus aplicaciones vigentes. Ajeno → 404 (REQ-CXC-08).',
  })
  @ApiOkResponse({ type: CobroResponseDto })
  async obtener(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CobroResponseDto> {
    const { cobro, comprobante, aplicaciones } = await this.service.obtener(
      resolveTenantId(req),
      id,
    );
    return toCobroResponse(cobro, comprobante, aplicaciones);
  }

  @Put(':id')
  @RequirePermissions('contabilidad.cobros.update')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Edición full-state: reemplaza el cobro en bloque y regenera su asiento preservando id y número. Bajar el monto por debajo de lo aplicado rechaza; cambiar el contacto desvincula TODAS las aplicaciones (REQ-CXC-06).',
  })
  @ApiOkResponse({ type: CobroResponseDto })
  async editar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCobroDto,
  ): Promise<CobroResponseDto> {
    const tenantId = resolveTenantId(req);
    await this.service.editar(tenantId, id, req.user.sub, dto);
    // La edición no cambia estado ni número, pero acá no los tenemos a mano:
    // se re-lee para responder el documento completo con su estado derivado.
    const { cobro, comprobante, aplicaciones } = await this.service.obtener(tenantId, id);
    return toCobroResponse(cobro, comprobante, aplicaciones);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('contabilidad.cobros.delete')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Eliminar físicamente un BORRADOR junto con su comprobante. Un CONTABILIZADO no se borra: se anula con /anular (§4.7).',
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
  @RequirePermissions('contabilidad.cobros.post')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Contabilizar el cobro: asigna número de la serie I{YY}{MM}-{correlativo} (D-11) y re-valida la elegibilidad de la cuenta destino.',
  })
  @ApiOkResponse({ type: CobroContabilizadoResponseDto })
  async contabilizar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CobroContabilizadoResponseDto> {
    return this.service.contabilizar(resolveTenantId(req), id, req.user.sub);
  }

  @Post(':id/anular')
  @HttpCode(204)
  @RequirePermissions('contabilidad.cobros.void')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Anular el cobro (§4.7): flag anulado con motivo, comprobante y número preservados para siempre; elimina sus aplicaciones con rastro — las ventas vuelven a quedar pendientes por derivación (REQ-CXC-06).',
  })
  @ApiNoContentResponse()
  async anular(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AnularCobroDto,
  ): Promise<void> {
    await this.service.anular(resolveTenantId(req), id, req.user.sub, dto.motivo);
  }

  // ============================================================
  // Aplicaciones — vínculos, no hechos contables (REQ-CXC-03/04)
  // ============================================================

  @Post(':id/aplicaciones')
  @RequirePermissions('contabilidad.cobros.update')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Aplicar el cobro a una venta abierta del mismo contacto. NO genera asiento ni toca comprobantes (D-03) y queda exenta del period lock (REQ-CXC-03). Invariantes de sobre-aplicación bajo lock (REQ-CXC-04).',
  })
  @ApiCreatedResponse({ type: AplicacionCobroResponseDto })
  async crearAplicacion(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CrearAplicacionDto,
  ): Promise<AplicacionCobroResponseDto> {
    const creada = await this.service.crearAplicacion(resolveTenantId(req), req.user.sub, {
      cobroId: id,
      ventaId: dto.ventaId,
      montoAplicado: dto.montoAplicado,
    });
    return toAplicacionResponse(creada);
  }

  @Put(':id/aplicaciones/:aplicacionId')
  @HttpCode(204)
  @RequirePermissions('contabilidad.cobros.update')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'aplicacionId', format: 'uuid' })
  @ApiOperation({
    summary:
      'Editar el monto de una aplicación (> 0; en 0 se elimina, no se edita). El invariante de sobre-aplicación se re-evalúa excluyendo la fila editada (REQ-CXC-04).',
  })
  @ApiNoContentResponse()
  async editarAplicacion(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('aplicacionId', new ParseUUIDPipe()) aplicacionId: string,
    @Body() dto: EditarAplicacionDto,
  ): Promise<void> {
    await this.service.editarMontoAplicacion(
      resolveTenantId(req),
      id,
      aplicacionId,
      req.user.sub,
      dto.montoAplicado,
    );
  }

  @Delete(':id/aplicaciones/:aplicacionId')
  @HttpCode(204)
  @RequirePermissions('contabilidad.cobros.update')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'aplicacionId', format: 'uuid' })
  @ApiOperation({
    summary:
      'Desaplicar: borra físicamente el vínculo (D-12) sin rastro — es el "reaplicar" normal de D-03, no una desvinculación forzada. La venta vuelve a mostrar saldo por derivación.',
  })
  @ApiNoContentResponse()
  async eliminarAplicacion(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('aplicacionId', new ParseUUIDPipe()) aplicacionId: string,
  ): Promise<void> {
    await this.service.eliminarAplicacion(resolveTenantId(req), id, aplicacionId, req.user.sub);
  }
}
