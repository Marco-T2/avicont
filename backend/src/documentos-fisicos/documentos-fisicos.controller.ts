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

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { ForbiddenError } from '@/common/errors';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { CreateDocumentoFisicoDto } from './dto/create-documento-fisico.dto';
import {
  DocumentoFisicoDetalleDto,
  DocumentoFisicoDto,
  ListarDocumentosFisicosResponseDto,
  toDocumentoFisicoDetalleDto,
  toDocumentoFisicoDto,
} from './dto/documento-fisico-response.dto';
import {
  EstadoAsociacion,
  LIST_DEFAULT_PAGE_SIZE,
  ListarDocumentosFisicosQueryDto,
} from './dto/listar-documentos-fisicos.dto';
import { UpdateDocumentoFisicoDto } from './dto/update-documento-fisico.dto';
import { DocumentosFisicosService } from './documentos-fisicos.service';
import { DocumentoFisicoListarFiltros } from './ports/documento-fisico.repository.port';

// Mismo patrón que el resto de controllers (contactos, comprobantes, gestiones, cuentas).
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

// Mapeo del filtro de estado de la query → valor del port
function mapEstadoAsociacion(
  estadoAsociacion: EstadoAsociacion | undefined,
): DocumentoFisicoListarFiltros['estado'] {
  if (estadoAsociacion === undefined) return undefined;
  const map: Record<EstadoAsociacion, DocumentoFisicoListarFiltros['estado']> = {
    [EstadoAsociacion.SUELTO]: 'libre',
    [EstadoAsociacion.EN_BORRADOR]: 'asociado',
    [EstadoAsociacion.CONTABILIZADO]: 'contabilizado',
  };
  return map[estadoAsociacion];
}

@ApiTags('Documentos físicos')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('contabilidad')
@Controller('documentos-fisicos')
export class DocumentosFisicosController {
  constructor(private readonly service: DocumentosFisicosService) {}

  @Post()
  @RequirePermissions('contabilidad.documentos-fisicos.create')
  @ApiOperation({
    summary: 'Crea un documento físico en el tenant activo.',
  })
  async crear(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateDocumentoFisicoDto,
  ): Promise<DocumentoFisicoDto> {
    const tenantId = resolveTenantId(req);

    const doc = await this.service.create(tenantId, {
      tipoDocumentoFisicoId: dto.tipoDocumentoFisicoId,
      numero: dto.numero,
      fechaEmision: new Date(dto.fechaEmision),
      monto: dto.monto ?? null,
      moneda: dto.moneda ?? null,
      glosa: dto.glosa ?? null,
      contactoId: dto.contactoId ?? null,
      createdByUserId: req.user.sub,
    });

    const enriquecido = await this.service.obtenerConRelaciones(tenantId, doc.id);
    return toDocumentoFisicoDto(enriquecido);
  }

  @Get()
  @RequirePermissions('contabilidad.documentos-fisicos.read')
  @ApiOperation({
    summary:
      'Lista documentos físicos del tenant con paginación y filtros (tipo, fechas, contacto, estado de asociación, número).',
  })
  async listar(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListarDocumentosFisicosQueryDto,
  ): Promise<ListarDocumentosFisicosResponseDto> {
    const tenantId = resolveTenantId(req);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? LIST_DEFAULT_PAGE_SIZE;

    const estadoMapeado = mapEstadoAsociacion(query.estadoAsociacion);

    const filtros: DocumentoFisicoListarFiltros = {
      ...(query.tipoDocumentoFisicoId !== undefined
        ? { tipoDocumentoFisicoId: query.tipoDocumentoFisicoId }
        : {}),
      ...(query.fechaDesde !== undefined ? { fechaDesde: new Date(query.fechaDesde) } : {}),
      ...(query.fechaHasta !== undefined ? { fechaHasta: new Date(query.fechaHasta) } : {}),
      ...(query.contactoId !== undefined ? { contactoId: query.contactoId } : {}),
      ...(estadoMapeado !== undefined ? { estado: estadoMapeado } : {}),
      ...(query.numero !== undefined ? { q: query.numero } : {}),
    };

    const { items, total } = await this.service.listarConRelaciones(tenantId, filtros, {
      page,
      limit: pageSize,
      orderBy: 'fechaEmision',
      orderDir: 'desc',
    });

    return {
      items: items.map(toDocumentoFisicoDto),
      total,
      page,
      pageSize,
    };
  }

  @Get(':id')
  @RequirePermissions('contabilidad.documentos-fisicos.read')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Detalle del documento físico con sus comprobantes asociados.',
  })
  async obtener(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DocumentoFisicoDetalleDto> {
    const tenantId = resolveTenantId(req);

    // El service valida existencia + pertenencia al tenant y trae el detalle
    // completo (tipo + contacto + comprobantes asociados).
    const detalle = await this.service.obtenerDetalle(tenantId, id);
    return toDocumentoFisicoDetalleDto(detalle);
  }

  @Patch(':id')
  @RequirePermissions('contabilidad.documentos-fisicos.update')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'PATCH parcial del documento físico. Solo toca los campos presentes. Falla con 409 si hay asociaciones a comprobantes contabilizados.',
  })
  async actualizar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDocumentoFisicoDto,
  ): Promise<DocumentoFisicoDto> {
    const tenantId = resolveTenantId(req);

    await this.service.update(tenantId, id, {
      ...(dto.tipoDocumentoFisicoId !== undefined
        ? { tipoDocumentoFisicoId: dto.tipoDocumentoFisicoId }
        : {}),
      ...(dto.numero !== undefined ? { numero: dto.numero } : {}),
      ...(dto.fechaEmision !== undefined ? { fechaEmision: new Date(dto.fechaEmision) } : {}),
      ...(dto.glosa !== undefined ? { glosa: dto.glosa } : {}),
      ...(dto.contactoId !== undefined ? { contactoId: dto.contactoId } : {}),
      ...(dto.monto !== undefined ? { monto: dto.monto } : {}),
      ...(dto.moneda !== undefined ? { moneda: dto.moneda } : {}),
    });

    const enriquecido = await this.service.obtenerConRelaciones(tenantId, id);
    return toDocumentoFisicoDto(enriquecido);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('contabilidad.documentos-fisicos.delete')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Elimina un documento físico. Falla con 409 si tiene asociaciones activas (usar desasociar primero).',
  })
  async eliminar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.service.eliminar(resolveTenantId(req), id);
  }
}
