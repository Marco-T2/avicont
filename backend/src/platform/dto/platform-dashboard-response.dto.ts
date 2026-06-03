import { ApiProperty } from '@nestjs/swagger';

import type {
  AltasPorMes,
  CategoryCount,
  PlatformDashboardData,
} from '../ports/platform-stats-reader.port';

export class OrgStatusCountDto {
  @ApiProperty({ description: 'Valor del status (ACTIVE, SUSPENDED, ARCHIVED)' })
  category!: string;

  @ApiProperty({ description: 'Cantidad de orgs con ese status' })
  count!: number;
}

export class OrgPlanCountDto {
  @ApiProperty({ description: 'Valor del plan (FREE, PRO)' })
  category!: string;

  @ApiProperty({ description: 'Cantidad de orgs con ese plan' })
  count!: number;
}

export class OrgVerticalCountDto {
  @ApiProperty({ description: 'Vertical (contabilidad, granja, otros)' })
  category!: string;

  @ApiProperty({ description: 'Cantidad de orgs en ese vertical' })
  count!: number;
}

export class AltasPorMesDto {
  @ApiProperty({ description: 'Año (4 dígitos)' })
  year!: number;

  @ApiProperty({ description: 'Mes (1-12)' })
  month!: number;

  @ApiProperty({ description: 'Cantidad de orgs dadas de alta en ese mes' })
  count!: number;
}

export class UsuariosStatsDto {
  @ApiProperty({ description: 'Total de usuarios registrados en la plataforma' })
  total!: number;
}

export class PlatformDashboardResponseDto {
  @ApiProperty({ type: [OrgStatusCountDto], description: 'Conteo de orgs por status' })
  orgsPorStatus!: OrgStatusCountDto[];

  @ApiProperty({ type: [OrgPlanCountDto], description: 'Conteo de orgs por plan' })
  orgsPorPlan!: OrgPlanCountDto[];

  @ApiProperty({ type: [OrgVerticalCountDto], description: 'Conteo de orgs por vertical activo' })
  orgsPorVertical!: OrgVerticalCountDto[];

  @ApiProperty({ type: UsuariosStatsDto, description: 'Totales de usuarios' })
  usuarios!: UsuariosStatsDto;

  @ApiProperty({
    type: [AltasPorMesDto],
    description: 'Serie de altas de orgs por mes (últimos 12 meses)',
  })
  altasPorMes!: AltasPorMesDto[];

  static fromData(
    data: PlatformDashboardData,
    totalUsuarios: number,
  ): PlatformDashboardResponseDto {
    const dto = new PlatformDashboardResponseDto();
    dto.orgsPorStatus = data.orgsPorStatus.map((c: CategoryCount) => {
      const d = new OrgStatusCountDto();
      d.category = c.category;
      d.count = c.count;
      return d;
    });
    dto.orgsPorPlan = data.orgsPorPlan.map((c: CategoryCount) => {
      const d = new OrgPlanCountDto();
      d.category = c.category;
      d.count = c.count;
      return d;
    });
    dto.orgsPorVertical = data.orgsPorVertical.map((c: CategoryCount) => {
      const d = new OrgVerticalCountDto();
      d.category = c.category;
      d.count = c.count;
      return d;
    });
    dto.usuarios = new UsuariosStatsDto();
    dto.usuarios.total = totalUsuarios;
    dto.altasPorMes = data.altasPorMes.map((a: AltasPorMes) => {
      const d = new AltasPorMesDto();
      d.year = a.year;
      d.month = a.month;
      d.count = a.count;
      return d;
    });
    return dto;
  }
}
