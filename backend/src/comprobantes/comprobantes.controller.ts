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
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { ForbiddenError } from '@/common/errors';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { ComprobantesService } from './comprobantes.service';
import { AnularComprobanteDto } from './dto/anular-comprobante.dto';
import { CreateComprobanteDto } from './dto/create-comprobante.dto';
import { ListarComprobantesQueryDto } from './dto/listar-comprobantes.dto';
import { UpdateComprobanteDto } from './dto/update-comprobante.dto';

// ---- Resolución de tenantId desde JWT + header opcional ----------------
// Mismo patrón que los otros controllers (ver gestiones/cuentas). El header
// X-Tenant-ID lo usa super-admin; para el resto vale activeTenantId del JWT.

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

@ApiTags('Asientos contables')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('comprobantes')
export class ComprobantesController {
  constructor(private readonly service: ComprobantesService) {}

  @Post()
  @RequirePermissions('contabilidad.asientos.create')
  @ApiOperation({
    summary:
      'Crear un comprobante en BORRADOR con sus líneas. No valida partida doble — ese chequeo corre al contabilizar.',
  })
  crear(@Req() req: AuthenticatedRequest, @Body() dto: CreateComprobanteDto) {
    return this.service.crearBorrador(resolveTenantId(req), req.user.sub, dto);
  }

  @Get()
  @RequirePermissions('contabilidad.asientos.read')
  @ApiOperation({
    summary:
      'Listar comprobantes del tenant con paginación y filtros (periodoFiscalId, tipo, estado, rango de fechas, texto libre).',
  })
  listar(@Req() req: AuthenticatedRequest, @Query() query: ListarComprobantesQueryDto) {
    return this.service.listar(resolveTenantId(req), query);
  }

  @Get(':id')
  @RequirePermissions('contabilidad.asientos.read')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Detalle completo del comprobante con sus líneas.' })
  obtener(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.obtener(resolveTenantId(req), id);
  }

  @Patch(':id')
  @RequirePermissions('contabilidad.asientos.update')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Actualizar un BORRADOR. El PATCH es parcial; si `lineas` se envía se reemplazan todas. Rechaza CONTABILIZADO/BLOQUEADO/ANULADO.',
  })
  actualizar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateComprobanteDto,
  ) {
    return this.service.actualizarBorrador(resolveTenantId(req), req.user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('contabilidad.asientos.delete')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Eliminar físicamente un BORRADOR. Un CONTABILIZADO/BLOQUEADO/ANULADO no se borra: se anula con /anular.',
  })
  async eliminar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.service.eliminarBorrador(resolveTenantId(req), id);
  }

  @Post(':id/contabilizar')
  @RequirePermissions('contabilidad.asientos.post')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Transicionar BORRADOR → CONTABILIZADO. Valida partida doble, asigna número atómico {prefijo}{YY}{MM}-{correlativo:6} y registra auditoría.',
  })
  contabilizar(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.contabilizar(resolveTenantId(req), req.user.sub, id);
  }

  @Post(':id/anular')
  @RequirePermissions('contabilidad.asientos.void')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: AnularComprobanteDto })
  @ApiOperation({
    summary:
      'Anular un CONTABILIZADO generando un comprobante AJUSTE con líneas invertidas (FK anulaAId). El número del original se preserva.',
  })
  anular(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AnularComprobanteDto,
  ) {
    return this.service.anular(resolveTenantId(req), req.user.sub, id, dto.motivo);
  }

  @Get(':id/auditoria')
  @RequirePermissions('contabilidad.asientos.read')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Historial de auditoría del comprobante: cada acción (CREADO, EDITADO, CONTABILIZADO, ANULADO, …) con usuario, timestamp y diff.',
  })
  obtenerAuditoria(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.obtenerAuditoria(resolveTenantId(req), id);
  }
}
