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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { ForbiddenError } from '@/common/errors';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { NaturalezaRegistro } from './domain/enums';
import { CreateTipoRegistroDto } from './dto/create-tipo-registro.dto';
import { TipoRegistroResponseDto, toTipoRegistroResponse } from './dto/tipo-registro-response.dto';
import { UpdateTipoRegistroDto } from './dto/update-tipo-registro.dto';
import { TipoRegistroService } from './tipo-registro.service';

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

@ApiTags('Granja — Tipos de Registro')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('granja')
@Controller('granja/tipos-registro')
export class TiposRegistroController {
  constructor(private readonly service: TipoRegistroService) {}

  @Get()
  @RequirePermissions('granja.tipos-registro.read')
  @ApiOperation({ summary: 'Lista los tipos de registro. Orden: sistema primero, luego nombre.' })
  @ApiQuery({ name: 'activo', required: false, description: 'true | false | all' })
  @ApiQuery({ name: 'naturaleza', required: false, enum: NaturalezaRegistro })
  async listar(
    @Req() req: AuthenticatedRequest,
    @Query('activo') activo?: string,
    @Query('naturaleza') naturaleza?: string,
  ): Promise<TipoRegistroResponseDto[]> {
    const tenantId = resolveTenantId(req);

    const activoFiltro: boolean | 'all' | undefined =
      activo === 'all' ? 'all' : activo === 'true' ? true : activo === 'false' ? false : undefined;
    const naturalezaFiltro =
      naturaleza === NaturalezaRegistro.INVERSION || naturaleza === NaturalezaRegistro.CANTIDAD
        ? naturaleza
        : undefined;

    const tipos = await this.service.listar(tenantId, {
      ...(activoFiltro !== undefined ? { activo: activoFiltro } : {}),
      ...(naturalezaFiltro !== undefined ? { naturaleza: naturalezaFiltro } : {}),
    });
    return tipos.map(toTipoRegistroResponse);
  }

  @Post()
  @RequirePermissions('granja.tipos-registro.create')
  @ApiOperation({ summary: 'Crea un tipo de registro propio (esSistema=false).' })
  async crear(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateTipoRegistroDto,
  ): Promise<TipoRegistroResponseDto> {
    const tenantId = resolveTenantId(req);
    const tipo = await this.service.create(tenantId, {
      nombre: dto.nombre,
      naturaleza: dto.naturaleza,
    });
    return toTipoRegistroResponse(tipo);
  }

  @Patch(':id')
  @RequirePermissions('granja.tipos-registro.update')
  @ApiOperation({ summary: 'Edita un tipo de registro (nombre, activo). naturaleza es inmutable.' })
  async editar(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTipoRegistroDto,
  ): Promise<TipoRegistroResponseDto> {
    const tenantId = resolveTenantId(req);
    const tipo = await this.service.update(tenantId, id, {
      ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
      ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
    });
    return toTipoRegistroResponse(tipo);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('granja.tipos-registro.delete')
  @ApiOperation({ summary: 'Elimina un tipo propio sin movimientos. Los de sistema no se borran.' })
  async eliminar(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const tenantId = resolveTenantId(req);
    await this.service.eliminar(tenantId, id);
  }
}
