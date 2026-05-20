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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { ForbiddenError } from '@/common/errors';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import {
  ListarTiposDocumentoFisicoResponseDto,
  TipoDocumentoFisicoResponseDto,
  toTipoDocumentoFisicoResponse,
} from './dto/tipo-documento-fisico-response.dto';
import { CreateTipoDocumentoFisicoDto } from './dto/create-tipo-documento-fisico.dto';
import { UpdateTipoDocumentoFisicoDto } from './dto/update-tipo-documento-fisico.dto';
import { TiposDocumentoFisicoService } from './tipos-documento-fisico.service';

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

const LIST_DEFAULT_PAGE_SIZE = 50;
const LIST_DEFAULT_PAGE = 1;

@ApiTags('Tipos de Documento Físico')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('tipos-documento-fisico')
export class TiposDocumentoFisicoController {
  constructor(private readonly service: TiposDocumentoFisicoService) {}

  @Get()
  @RequirePermissions('contabilidad.tipos-documento-fisico.read')
  @ApiOperation({
    summary: 'Lista los tipos de documento físico del tenant activo. Orden: tributarios primero, luego por nombre.',
  })
  @ApiQuery({ name: 'activo', required: false, type: Boolean, description: 'Filtrar por estado activo. Omitir para listar solo activos.' })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Búsqueda parcial sobre nombre.' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async listar(
    @Req() req: AuthenticatedRequest,
    @Query('activo') activo?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ListarTiposDocumentoFisicoResponseDto> {
    const tenantId = resolveTenantId(req);

    const activoFiltro: boolean | 'all' | undefined =
      activo === 'all' ? 'all' : activo === 'true' ? true : activo === 'false' ? false : undefined;

    const res = await this.service.listar(
      tenantId,
      {
        ...(activoFiltro !== undefined ? { activo: activoFiltro } : {}),
        ...(q !== undefined ? { q } : {}),
      },
      {
        page: page !== undefined ? parseInt(page, 10) : LIST_DEFAULT_PAGE,
        limit: pageSize !== undefined ? parseInt(pageSize, 10) : LIST_DEFAULT_PAGE_SIZE,
      },
    );

    return {
      items: res.items.map(toTipoDocumentoFisicoResponse),
      total: res.total,
      page: page !== undefined ? parseInt(page, 10) : LIST_DEFAULT_PAGE,
      pageSize: pageSize !== undefined ? parseInt(pageSize, 10) : LIST_DEFAULT_PAGE_SIZE,
    };
  }

  @Post()
  @RequirePermissions('contabilidad.tipos-documento-fisico.create')
  @ApiOperation({ summary: 'Crea un tipo de documento físico en el tenant activo.' })
  async crear(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateTipoDocumentoFisicoDto,
  ): Promise<TipoDocumentoFisicoResponseDto> {
    const tipo = await this.service.create(resolveTenantId(req), {
      nombre: dto.nombre,
      codigo: dto.codigo,
      esTributario: dto.esTributario,
      tiposComprobanteAplicables: dto.tiposComprobanteAplicables,
      createdByUserId: req.user.sub,
    });
    return toTipoDocumentoFisicoResponse(tipo);
  }

  @Patch(':id')
  @RequirePermissions('contabilidad.tipos-documento-fisico.update')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'PATCH del tipo. Campos opcionales; solo toca los que vienen. El campo `codigo` es inmutable y se ignora si se envía.',
  })
  async actualizar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTipoDocumentoFisicoDto,
  ): Promise<TipoDocumentoFisicoResponseDto> {
    const tenantId = resolveTenantId(req);

    // Si viene activo, primero aplicamos el toggle, luego el resto del PATCH.
    // Orden: toggle primero para no perder el estado si update falla.
    if (dto.activo !== undefined) {
      await this.service.setActivo(tenantId, id, dto.activo);
    }

    const tipo = await this.service.update(tenantId, id, {
      ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
      ...(dto.esTributario !== undefined ? { esTributario: dto.esTributario } : {}),
      ...(dto.tiposComprobanteAplicables !== undefined
        ? { tiposComprobanteAplicables: dto.tiposComprobanteAplicables }
        : {}),
    });

    return toTipoDocumentoFisicoResponse(tipo);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('contabilidad.tipos-documento-fisico.delete')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Elimina un tipo de documento físico. Falla con 409 si tiene documentos físicos asociados (usar desactivar en ese caso).',
  })
  async eliminar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.service.eliminar(resolveTenantId(req), id);
  }
}
