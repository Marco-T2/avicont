import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
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
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
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

import { CuentasBancariasService } from './cuentas-bancarias.service';
import { CreateCuentaBancariaDto } from './dto/create-cuenta-bancaria.dto';
import {
  CuentaBancariaResponseDto,
  ListarCuentasBancariasResponseDto,
  toCuentaBancariaResponse,
} from './dto/cuenta-bancaria-response.dto';
import {
  ImportarExtractoResponseDto,
  ListarImportacionesResponseDto,
  toImportacionExtractoListItem,
  toImportarExtractoResponse,
} from './dto/importacion-extracto-response.dto';
import { ImportarExtractoDto } from './dto/importar-extracto.dto';
import {
  PerfilExtractoResponseDto,
  toPerfilExtractoResponse,
} from './dto/perfil-extracto-response.dto';
import { UpdateCuentaBancariaDto } from './dto/update-cuenta-bancaria.dto';
import { ExtractoImportadorService } from './extracto-importador.service';
import { ExtractoParserLookupService } from './extracto-parser-lookup.service';
import {
  ImportacionExtractoRepositoryPort,
  IMPORTACION_EXTRACTO_REPOSITORY_PORT,
} from './ports/importacion-extracto.repository.port';

// REQ-CB-06: v1 no persiste el binario del archivo (R-2) — el tope solo
// protege memoria del request, no hay storage detrás.
const EXTRACTO_LIMITE_BYTES = 10 * 1024 * 1024;

// Mismo resolver que el resto de controllers (tipos-documento-fisico, comprobantes).
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

// Todo el módulo vive detrás del pack `contabilidad.conciliacion` (riel del
// eje 2, slice 0 ya implementado). El pack gatea el controller COMPLETO —
// a diferencia de `contabilidad.adjuntos` (endpoints sueltos dentro de
// ComprobantesController), acá el módulo entero es el pack.
//
// Cadena de guards documentada en design.md §10: Auth → ModuleEnabled →
// Permissions → PackEnabled. `require-pack-tenant-guard.arch.spec.ts` exige
// TenantGuard o PermissionsGuard junto a @RequirePack — PermissionsGuard ya
// está en la cadena de clase.
@ApiTags('Conciliación bancaria — Cuentas bancarias')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard, PackEnabledGuard)
@RequireModule('contabilidad')
@RequirePack('contabilidad.conciliacion')
@Controller('cuentas-bancarias')
export class CuentasBancariasController {
  constructor(
    private readonly service: CuentasBancariasService,
    private readonly importador: ExtractoImportadorService,
    private readonly parserLookup: ExtractoParserLookupService,
    @Inject(IMPORTACION_EXTRACTO_REPOSITORY_PORT)
    private readonly importacionRepo: ImportacionExtractoRepositoryPort,
  ) {}

  // ================================================================
  // Catálogo de perfiles — GET /perfiles (retomado del slice 1, design §4.5)
  // ================================================================
  //
  // DEBE declararse ANTES de `GET /:id` — 'perfiles' es un segmento
  // literal, no debe matchear el parámetro `:id`.

  @Get('perfiles')
  @RequirePermissions('contabilidad.conciliacion.read')
  @ApiOperation({
    summary:
      'Catálogo de perfiles de extracto soportados (banco/formato, instructivo, checksum). Única fuente de verdad para la UI.',
  })
  @ApiOkResponse({ type: [PerfilExtractoResponseDto] })
  listarPerfiles(): PerfilExtractoResponseDto[] {
    return this.parserLookup.descriptores().map(toPerfilExtractoResponse);
  }

  @Post()
  @RequirePermissions('contabilidad.conciliacion.create')
  @ApiOperation({
    summary:
      'Vincula una cuenta del plan (elegida por el usuario) a una cuenta bancaria (REQ-CB-01).',
  })
  @ApiOkResponse({ type: CuentaBancariaResponseDto })
  async crear(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCuentaBancariaDto,
  ): Promise<CuentaBancariaResponseDto> {
    const cb = await this.service.create(resolveTenantId(req), {
      cuentaId: dto.cuentaId,
      alias: dto.alias,
      perfilExtracto: dto.perfilExtracto,
      numeroCuenta: dto.numeroCuenta ?? null,
      moneda: dto.moneda,
    });
    return toCuentaBancariaResponse(cb);
  }

  @Get()
  @RequirePermissions('contabilidad.conciliacion.read')
  @ApiOperation({ summary: 'Lista las cuentas bancarias del tenant activo.' })
  @ApiQuery({
    name: 'activa',
    required: false,
    type: Boolean,
    description: 'Filtrar por estado activo. Omitir para listar solo activas.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiOkResponse({ type: ListarCuentasBancariasResponseDto })
  async listar(
    @Req() req: AuthenticatedRequest,
    @Query('activa') activa?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ListarCuentasBancariasResponseDto> {
    const tenantId = resolveTenantId(req);

    const activaFiltro: boolean | 'all' | undefined =
      activa === 'all' ? 'all' : activa === 'true' ? true : activa === 'false' ? false : undefined;

    const paginaActual = page !== undefined ? parseInt(page, 10) : LIST_DEFAULT_PAGE;
    const tamanioPagina = pageSize !== undefined ? parseInt(pageSize, 10) : LIST_DEFAULT_PAGE_SIZE;

    const res = await this.service.listar(
      tenantId,
      { ...(activaFiltro !== undefined ? { activa: activaFiltro } : {}) },
      { page: paginaActual, limit: tamanioPagina },
    );

    return {
      items: res.items.map(toCuentaBancariaResponse),
      total: res.total,
      page: paginaActual,
      pageSize: tamanioPagina,
    };
  }

  @Get(':id')
  @RequirePermissions('contabilidad.conciliacion.read')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Obtiene una cuenta bancaria por id.' })
  @ApiOkResponse({ type: CuentaBancariaResponseDto })
  async obtener(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CuentaBancariaResponseDto> {
    const cb = await this.service.findById(resolveTenantId(req), id);
    return toCuentaBancariaResponse(cb);
  }

  @Patch(':id')
  @RequirePermissions('contabilidad.conciliacion.update')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'PATCH de la cuenta bancaria. cuentaId y perfilExtracto son inmutables — no se exponen acá.',
  })
  @ApiOkResponse({ type: CuentaBancariaResponseDto })
  async actualizar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCuentaBancariaDto,
  ): Promise<CuentaBancariaResponseDto> {
    const tenantId = resolveTenantId(req);

    // exactOptionalPropertyTypes: spread condicional (CLAUDE.md §2.5.1).
    const cb = await this.service.update(tenantId, id, {
      ...(dto.alias !== undefined ? { alias: dto.alias } : {}),
      ...(dto.numeroCuenta !== undefined ? { numeroCuenta: dto.numeroCuenta } : {}),
      ...(dto.moneda !== undefined ? { moneda: dto.moneda } : {}),
      ...(dto.activa !== undefined ? { activa: dto.activa } : {}),
    });

    return toCuentaBancariaResponse(cb);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('contabilidad.conciliacion.delete')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Elimina una cuenta bancaria. Falla con 409 si tiene movimientos o importaciones asociadas.',
  })
  async eliminar(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.service.eliminar(resolveTenantId(req), id);
  }

  // ================================================================
  // Importación de extractos — REQ-CB-03/04/05/06/07/08/16
  // ================================================================

  @Post(':id/importaciones')
  // design §10 — SIEMPRE 200: incluso el resultado exitoso es "un resultado
  // de operación" (contadores/checksum), no la creación de un recurso que el
  // cliente vaya a direccionar; el caso de confirmación pendiente (REQ-CB-16)
  // tampoco crea nada, así que 201 sería engañoso en ese camino.
  @HttpCode(200)
  @RequirePermissions('contabilidad.conciliacion.importar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: EXTRACTO_LIMITE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Importa un extracto bancario (design §10). Ver REQ-CB-16 para el flujo de confirmación de número de cuenta.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        confirmarNumeroCuenta: { type: 'string', enum: ['true', 'false'] },
      },
    },
  })
  @ApiOkResponse({ type: ImportarExtractoResponseDto })
  async importarExtracto(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportarExtractoDto,
  ): Promise<ImportarExtractoResponseDto> {
    const resultado = await this.importador.importar(
      resolveTenantId(req),
      id,
      req.user.sub,
      {
        buffer: file.buffer,
        nombreOriginal: file.originalname,
        tamanioBytes: file.size,
      },
      {
        confirmarNumeroCuenta: dto.confirmarNumeroCuenta === 'true',
      },
    );
    return toImportarExtractoResponse(resultado);
  }

  @Get(':id/importaciones')
  @RequirePermissions('contabilidad.conciliacion.read')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Lista las importaciones de una cuenta bancaria, más reciente primero.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiOkResponse({ type: ListarImportacionesResponseDto })
  async listarImportaciones(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ListarImportacionesResponseDto> {
    const tenantId = resolveTenantId(req);
    // REQ-CB-13: 404 si la cuenta bancaria no existe o es de otro tenant.
    await this.service.findById(tenantId, id);

    const paginaActual = page !== undefined ? parseInt(page, 10) : LIST_DEFAULT_PAGE;
    const tamanioPagina = pageSize !== undefined ? parseInt(pageSize, 10) : LIST_DEFAULT_PAGE_SIZE;

    const { items, total } = await this.importacionRepo.listarPorCuentaBancaria(tenantId, id, {
      page: paginaActual,
      limit: tamanioPagina,
    });

    return {
      items: items.map(toImportacionExtractoListItem),
      total,
      page: paginaActual,
      pageSize: tamanioPagina,
    };
  }
}
