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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { ForbiddenError } from '@/common/errors';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { ContactosService } from './contactos.service';
import {
  ContactoResponseDto,
  ListarContactosResponseDto,
  toContactoResponse,
} from './dto/contacto-response.dto';
import { CreateContactoDto } from './dto/create-contacto.dto';
import { LIST_DEFAULT_PAGE_SIZE, ListarContactosQueryDto } from './dto/listar-contactos.dto';
import { UpdateContactoDto } from './dto/update-contacto.dto';

// Mismo resolver que el resto de controllers (gestiones, cuentas,
// comprobantes). El header X-Tenant-ID lo usa super-admin; para el resto
// vale activeTenantId del JWT.

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

@ApiTags('Contactos')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('contactos')
export class ContactosController {
  constructor(private readonly service: ContactosService) {}

  @Post()
  @RequirePermissions('contabilidad.contactos.create')
  @ApiOperation({
    summary: 'Crea un contacto (cliente, proveedor, o ambos) dentro de la organización activa.',
  })
  async crear(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateContactoDto,
  ): Promise<ContactoResponseDto> {
    const contacto = await this.service.crear(resolveTenantId(req), req.user.sub, dto);
    return toContactoResponse(contacto);
  }

  @Get()
  @RequirePermissions('contabilidad.contactos.read')
  @ApiOperation({
    summary:
      'Lista contactos del tenant con paginación y filtros (q, documento, esCliente, esProveedor, activo).',
  })
  async listar(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListarContactosQueryDto,
  ): Promise<ListarContactosResponseDto> {
    const pageSize = query.pageSize ?? LIST_DEFAULT_PAGE_SIZE;
    const serviceInput: Parameters<ContactosService['listar']>[1] = {
      limit: pageSize,
    };
    if (query.q !== undefined) serviceInput.q = query.q;
    if (query.documento !== undefined) serviceInput.documento = query.documento;
    if (query.esCliente !== undefined) serviceInput.esCliente = query.esCliente;
    if (query.esProveedor !== undefined) serviceInput.esProveedor = query.esProveedor;
    if (query.activo !== undefined) serviceInput.activo = query.activo;
    if (query.page !== undefined) serviceInput.page = query.page;

    const res = await this.service.listar(resolveTenantId(req), serviceInput);
    return {
      items: res.items.map(toContactoResponse),
      total: res.total,
      page: res.page,
      pageSize: res.limit,
    };
  }

  @Get(':id')
  @RequirePermissions('contabilidad.contactos.read')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Detalle del contacto.' })
  async obtener(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ContactoResponseDto> {
    const contacto = await this.service.obtener(resolveTenantId(req), id);
    return toContactoResponse(contacto);
  }

  @Patch(':id')
  @RequirePermissions('contabilidad.contactos.update')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'PATCH del contacto. Campos opcionales; sólo toca los que vienen. El toggle activo/inactivo vive en endpoints dedicados.',
  })
  async actualizar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateContactoDto,
  ): Promise<ContactoResponseDto> {
    const contacto = await this.service.actualizar(resolveTenantId(req), id, dto);
    return toContactoResponse(contacto);
  }

  @Post(':id/desactivar')
  @HttpCode(200)
  @RequirePermissions('contabilidad.contactos.update')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Marca el contacto como inactivo. Idempotente. Los comprobantes históricos siguen refiriéndolo; los nuevos no pueden usarlo.',
  })
  async desactivar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ContactoResponseDto> {
    const contacto = await this.service.desactivar(resolveTenantId(req), id);
    return toContactoResponse(contacto);
  }

  @Post(':id/reactivar')
  @HttpCode(200)
  @RequirePermissions('contabilidad.contactos.update')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Reactiva un contacto inactivo. Idempotente.' })
  async reactivar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ContactoResponseDto> {
    const contacto = await this.service.reactivar(resolveTenantId(req), id);
    return toContactoResponse(contacto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('contabilidad.contactos.delete')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Elimina un contacto. Falla con 409 si alguna línea de comprobante lo referencia (usar desactivar en ese caso).',
  })
  async eliminar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.service.eliminar(resolveTenantId(req), id);
  }
}
