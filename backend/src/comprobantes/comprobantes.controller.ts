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
  Put,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { RequirePack } from '@/common/decorators/require-pack.decorator';
import { ForbiddenError } from '@/common/errors';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { PackEnabledGuard } from '@/common/guards/pack-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { AsociarDocumentosDto } from '@/documentos-fisicos/dto/asociar-documentos.dto';

import { ComprobantesService } from './comprobantes.service';
import { AnularComprobanteDto } from './dto/anular-comprobante.dto';
import { CreateComprobanteDto } from './dto/create-comprobante.dto';
import { EditarContabilizadoDto } from './dto/editar-contabilizado.dto';
import {
  ExportarComprobantesResponseDto,
  ListarComprobantesResponseDto,
} from './dto/comprobante-response.dto';
import {
  ExportarComprobantesQueryDto,
  ListarComprobantesQueryDto,
} from './dto/listar-comprobantes.dto';
import { AdjuntoResponseDto } from './dto/adjunto-response.dto';
import { ADJUNTO_LIMITE_BYTES } from './comprobantes.service';

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
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('contabilidad')
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
  @ApiOkResponse({ type: ListarComprobantesResponseDto })
  listar(@Req() req: AuthenticatedRequest, @Query() query: ListarComprobantesQueryDto) {
    return this.service.listar(resolveTenantId(req), query);
  }

  @Get('export')
  @RequirePermissions('contabilidad.asientos.read')
  @ApiOperation({
    summary:
      'Exportar todos los comprobantes que coincidan con los filtros, sin paginar. ' +
      'Devuelve hasta COMPROBANTES_EXPORT_MAX (default 1000) comprobantes ordenados ASC. ' +
      'Si el rango supera el límite, devuelve 422 con code COMPROBANTE_EXPORT_RANGO_EXCEDIDO.',
  })
  @ApiOkResponse({ type: ExportarComprobantesResponseDto })
  exportar(@Req() req: AuthenticatedRequest, @Query() query: ExportarComprobantesQueryDto) {
    return this.service.exportar(resolveTenantId(req), query);
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
      'Actualizar un comprobante. Si está en BORRADOR, actualiza parcialmente (todos los campos opcionales). ' +
      'Si está CONTABILIZADO y el período está abierto, edita cabecera y/o líneas — requiere permiso adicional ' +
      '`contabilidad.asientos.edit-posted` (§4.3 CLAUDE.md). El número correlativo es INMUTABLE. ' +
      'Rechaza BLOQUEADO o anulados.',
  })
  actualizar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EditarContabilizadoDto,
  ) {
    return this.service.patch(resolveTenantId(req), req.user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('contabilidad.asientos.delete')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Eliminar físicamente un BORRADOR. Un CONTABILIZADO/BLOQUEADO no se borra: se anula con /anular.',
  })
  async eliminar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.service.eliminarBorrador(resolveTenantId(req), req.user.sub, id);
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
      'Anular un CONTABILIZADO con flag anulado=true (CLAUDE.md §4.7). No genera contra-asiento. El número del original se preserva.',
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
    summary: 'Historial de auditoría del comprobante: cada acción con usuario, timestamp y diff.',
  })
  obtenerAuditoria(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.obtenerAuditoria(resolveTenantId(req), id);
  }

  // ============================================================
  // Documentos físicos asociados (sub-recurso) — task 6.3
  // ============================================================

  @Get(':comprobanteId/documentos-fisicos')
  @RequirePermissions('contabilidad.documentos-fisicos.read')
  @ApiParam({ name: 'comprobanteId', format: 'uuid' })
  @ApiOperation({
    summary: 'Listar los documentos físicos asociados al comprobante (REQ-A-09).',
  })
  listarDocumentosFisicos(
    @Req() req: AuthenticatedRequest,
    @Param('comprobanteId', new ParseUUIDPipe()) comprobanteId: string,
  ) {
    return this.service.listarDocumentosAsociados(resolveTenantId(req), comprobanteId);
  }

  @Post(':comprobanteId/documentos-fisicos')
  @RequirePermissions('contabilidad.documentos-fisicos.update', 'contabilidad.asientos.update')
  @ApiParam({ name: 'comprobanteId', format: 'uuid' })
  @ApiBody({ type: AsociarDocumentosDto })
  @ApiOperation({
    summary:
      'Asociar uno o más documentos físicos a un comprobante. Aditiva e idempotente (REQ-A-01). ' +
      'En BORRADOR no exige permisos extra. En CONTABILIZADO con período abierto edita la asociación ' +
      '(§4.3 CLAUDE.md) — requiere permiso adicional `contabilidad.asientos.edit-posted`. ' +
      'Rechaza período cerrado/bloqueado y comprobantes anulados.',
  })
  asociarDocumentosFisicos(
    @Req() req: AuthenticatedRequest,
    @Param('comprobanteId', new ParseUUIDPipe()) comprobanteId: string,
    @Body() dto: AsociarDocumentosDto,
  ) {
    return this.service.asociarDocumentos(
      resolveTenantId(req),
      req.user.sub,
      comprobanteId,
      dto.documentoFisicoIds,
    );
  }

  @Delete(':comprobanteId/documentos-fisicos/:documentoFisicoId')
  @HttpCode(204)
  @RequirePermissions('contabilidad.documentos-fisicos.update', 'contabilidad.asientos.update')
  @ApiParam({ name: 'comprobanteId', format: 'uuid' })
  @ApiParam({ name: 'documentoFisicoId', format: 'uuid' })
  @ApiOperation({
    summary:
      'Desasociar un documento físico de un comprobante. En BORRADOR no exige permisos extra. ' +
      'En CONTABILIZADO con período abierto (§4.3 CLAUDE.md) requiere `contabilidad.asientos.edit-posted`. ' +
      'Rechaza período cerrado/bloqueado y comprobantes anulados (REQ-A-02/03).',
  })
  async desasociarDocumentoFisico(
    @Req() req: AuthenticatedRequest,
    @Param('comprobanteId', new ParseUUIDPipe()) comprobanteId: string,
    @Param('documentoFisicoId', new ParseUUIDPipe()) documentoFisicoId: string,
  ): Promise<void> {
    await this.service.desasociarDocumento(
      resolveTenantId(req),
      req.user.sub,
      comprobanteId,
      documentoFisicoId,
    );
  }

  // ================================================================
  // Adjuntos — Pack "contabilidad.adjuntos"
  // ================================================================
  //
  // Todos los endpoints de adjuntos están gateados por PackEnabledGuard con
  // la clave 'contabilidad.adjuntos'. El guard responde con 404 deliberado
  // cuando el pack no está activo para la org (CLAUDE.md §10.1 — riel packs).
  //
  // PermissionsGuard ya está activo a nivel de clase. La arquitectura:
  //   AuthGuard → ModuleEnabledGuard → PermissionsGuard → PackEnabledGuard
  //
  // Spec de arquitectura (require-pack-tenant-guard.arch.spec.ts): todo
  // controller que use @RequirePack también debe referenciar TenantGuard o
  // PermissionsGuard. PermissionsGuard está presente a nivel de clase ✅.

  @Post(':comprobanteId/adjuntos')
  @UseGuards(PackEnabledGuard)
  @RequirePack('contabilidad.adjuntos')
  @RequirePermissions('contabilidad.asientos.update')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: ADJUNTO_LIMITE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'comprobanteId', format: 'uuid' })
  @ApiOperation({ summary: 'Subir un adjunto al comprobante (Pack contabilidad.adjuntos).' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: AdjuntoResponseDto })
  async subirAdjunto(
    @Req() req: AuthenticatedRequest,
    @Param('comprobanteId', new ParseUUIDPipe()) comprobanteId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.subirAdjunto(resolveTenantId(req), comprobanteId, req.user.sub, {
      buffer: file.buffer,
      nombreOriginal: file.originalname,
      tamanoBytes: file.size,
    });
  }

  @Get(':comprobanteId/adjuntos')
  @UseGuards(PackEnabledGuard)
  @RequirePack('contabilidad.adjuntos')
  @RequirePermissions('contabilidad.asientos.read')
  @ApiParam({ name: 'comprobanteId', format: 'uuid' })
  @ApiOperation({ summary: 'Listar los adjuntos de un comprobante (Pack contabilidad.adjuntos).' })
  @ApiOkResponse({ type: [AdjuntoResponseDto] })
  async listarAdjuntos(
    @Req() req: AuthenticatedRequest,
    @Param('comprobanteId', new ParseUUIDPipe()) comprobanteId: string,
  ) {
    return this.service.listarAdjuntos(resolveTenantId(req), comprobanteId);
  }

  @Get(':comprobanteId/adjuntos/:adjuntoId/download')
  @UseGuards(PackEnabledGuard)
  @RequirePack('contabilidad.adjuntos')
  @RequirePermissions('contabilidad.asientos.read')
  @ApiParam({ name: 'comprobanteId', format: 'uuid' })
  @ApiParam({ name: 'adjuntoId', format: 'uuid' })
  @ApiOperation({
    summary: 'Descargar el contenido binario de un adjunto (Pack contabilidad.adjuntos).',
  })
  async descargarAdjunto(
    @Req() req: AuthenticatedRequest,
    @Param('comprobanteId', new ParseUUIDPipe()) comprobanteId: string,
    @Param('adjuntoId', new ParseUUIDPipe()) adjuntoId: string,
  ): Promise<StreamableFile> {
    const { stream, adjunto } = await this.service.obtenerStreamAdjunto(
      resolveTenantId(req),
      comprobanteId,
      adjuntoId,
    );
    return new StreamableFile(stream, {
      type: adjunto.mimeType,
      // RFC 5987: filename*=UTF-8''<percent-encoded> para soportar tildes y ñ.
      // filename= como fallback ASCII para clientes que no soporten RFC 5987.
      disposition: `attachment; filename="${encodeURIComponent(adjunto.nombreOriginal)}"; filename*=UTF-8''${encodeURIComponent(adjunto.nombreOriginal)}`,
    });
  }

  @Put(':comprobanteId/adjuntos/:adjuntoId')
  @UseGuards(PackEnabledGuard)
  @RequirePack('contabilidad.adjuntos')
  @RequirePermissions('contabilidad.asientos.update')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: ADJUNTO_LIMITE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'comprobanteId', format: 'uuid' })
  @ApiParam({ name: 'adjuntoId', format: 'uuid' })
  @ApiOperation({
    summary: 'Reemplazar el archivo de un adjunto existente (Pack contabilidad.adjuntos).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: AdjuntoResponseDto })
  async reemplazarAdjunto(
    @Req() req: AuthenticatedRequest,
    @Param('comprobanteId', new ParseUUIDPipe()) comprobanteId: string,
    @Param('adjuntoId', new ParseUUIDPipe()) adjuntoId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.reemplazarAdjunto(resolveTenantId(req), comprobanteId, adjuntoId, {
      buffer: file.buffer,
      nombreOriginal: file.originalname,
      tamanoBytes: file.size,
    });
  }

  @Delete(':comprobanteId/adjuntos/:adjuntoId')
  @UseGuards(PackEnabledGuard)
  @RequirePack('contabilidad.adjuntos')
  @RequirePermissions('contabilidad.asientos.update')
  @HttpCode(204)
  @ApiParam({ name: 'comprobanteId', format: 'uuid' })
  @ApiParam({ name: 'adjuntoId', format: 'uuid' })
  @ApiOperation({ summary: 'Eliminar un adjunto de un comprobante (Pack contabilidad.adjuntos).' })
  @ApiNoContentResponse({ description: 'Adjunto eliminado.' })
  async eliminarAdjunto(
    @Req() req: AuthenticatedRequest,
    @Param('comprobanteId', new ParseUUIDPipe()) comprobanteId: string,
    @Param('adjuntoId', new ParseUUIDPipe()) adjuntoId: string,
  ): Promise<void> {
    await this.service.eliminarAdjunto(resolveTenantId(req), comprobanteId, adjuntoId);
  }
}
