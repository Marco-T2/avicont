import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CATALOGO_PERMISOS, catalogoAgrupado } from '../common/permisos/catalogo';

@ApiTags('Permissions')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('permissions')
export class PermissionsController {
  // Endpoint disponible para todo usuario autenticado (no requiere permiso
  // específico): el frontend lo necesita para construir la UI de asignación
  // de permisos a un CustomRole.

  @Get()
  @ApiOperation({ summary: 'Catálogo plano de permisos finos' })
  list() {
    return CATALOGO_PERMISOS;
  }

  @Get('grouped')
  @ApiOperation({ summary: 'Catálogo agrupado por módulo y submódulo (vista UI)' })
  grouped() {
    return catalogoAgrupado();
  }
}
