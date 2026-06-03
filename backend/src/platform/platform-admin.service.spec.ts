import { Logger } from '@nestjs/common';
import type { OrganizationStatus } from '@prisma/client';

import { RedisService } from '@/cache/redis.service';
import { PrismaService } from '@/common/prisma.service';
import { ClockPort } from '@/common/clock/clock.port';
import { UsersReaderPort } from '@/users/ports/users-reader.port';
import { PlanCuentasSeederPort } from '@/cuentas/ports/plan-cuentas-seeder.port';
import { TipoDocumentoFisicoSeederPort } from '@/tipos-documento-fisico/ports/tipos-documento-fisico-seeder.port';
import { TipoRegistroSeederPort } from '@/granja/ports/tipo-registro-seeder.port';
import { MembershipsReaderPort } from '@/memberships/ports/memberships-reader.port';
import { PackService } from '@/packs/pack.service';
import type { PlatformDashboardData } from './ports/platform-stats-reader.port';
import { PlatformStatsReaderPort } from './ports/platform-stats-reader.port';
import { PlatformActivityReaderPort } from './ports/platform-activity-reader.port';
import type { PlatformActivityPage } from './ports/platform-activity-reader.port';
import { OrgsReaderPort } from './ports/orgs-reader.port';
import { OrgsWriterPort } from './ports/orgs-writer.port';
import { PlatformAdminService } from './platform-admin.service';
import { ActivityCursor } from './lib/activity-cursor';
import { PlatformActivityCursorInvalidoError } from './domain/platform-errors';

function buildService(
  overrides: {
    orgsWriter?: Partial<OrgsWriterPort>;
    redis?: Partial<RedisService>;
    statsReader?: Partial<PlatformStatsReaderPort>;
    activityReader?: Partial<PlatformActivityReaderPort>;
    clock?: Partial<ClockPort>;
    prisma?: Partial<PrismaService>;
  } = {},
): {
  service: PlatformAdminService;
  orgsWriter: jest.Mocked<OrgsWriterPort>;
  redis: jest.Mocked<RedisService>;
  statsReader: jest.Mocked<PlatformStatsReaderPort>;
  activityReader: jest.Mocked<PlatformActivityReaderPort>;
  clock: jest.Mocked<ClockPort>;
} {
  const orgsWriter = {
    create: jest.fn(),
    updateStatus: jest.fn(),
    updateEntitlement: jest.fn(),
    ...overrides.orgsWriter,
  } as jest.Mocked<OrgsWriterPort>;

  const redis = {
    del: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    ...overrides.redis,
  } as unknown as jest.Mocked<RedisService>;

  const statsReader = {
    readDashboard: jest.fn(),
    ...overrides.statsReader,
  } as jest.Mocked<PlatformStatsReaderPort>;

  const activityReader = {
    findRecent: jest.fn(),
    ...overrides.activityReader,
  } as jest.Mocked<PlatformActivityReaderPort>;

  const fixedNow = new Date('2026-06-02T12:00:00.000Z');
  const clock = {
    now: jest.fn().mockReturnValue(fixedNow),
    currentYearLaPaz: jest.fn().mockReturnValue(2026),
    currentDateLaPaz: jest.fn().mockReturnValue('2026-06-02'),
    ...overrides.clock,
  } as jest.Mocked<ClockPort>;

  const orgsReader = { listAll: jest.fn(), findById: jest.fn() } as jest.Mocked<OrgsReaderPort>;
  const usersReader = { findMinimalByEmail: jest.fn() } as unknown as jest.Mocked<UsersReaderPort>;
  const planCuentasSeeder = {
    seedDefaultsForTenant: jest.fn(),
  } as unknown as jest.Mocked<PlanCuentasSeederPort>;
  const tiposDocSeeder = {
    seedDefaultsForTenant: jest.fn(),
  } as unknown as jest.Mocked<TipoDocumentoFisicoSeederPort>;
  const tipoRegistroSeeder = {
    seedDefaultsForTenant: jest.fn(),
  } as unknown as jest.Mocked<TipoRegistroSeederPort>;
  const membershipsReader = {
    findAllByTenant: jest.fn(),
  } as unknown as jest.Mocked<MembershipsReaderPort>;
  const packs = {
    habilitarParaOrg: jest.fn(),
    revocar: jest.fn(),
    listarEntitlementsDeOrg: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<PackService>;
  const prismaInstance = {
    organization: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { count: jest.fn().mockResolvedValue(42) },
    $transaction: jest.fn(),
    ...overrides.prisma,
  } as unknown as jest.Mocked<PrismaService>;

  const service = new PlatformAdminService(
    orgsReader,
    orgsWriter,
    usersReader,
    planCuentasSeeder,
    tiposDocSeeder,
    tipoRegistroSeeder,
    membershipsReader,
    packs,
    prismaInstance,
    redis,
    statsReader,
    activityReader,
    clock,
  );

  jest.spyOn(Logger.prototype, 'log').mockReturnValue(undefined);

  return { service, orgsWriter, redis, statsReader, activityReader, clock };
}

describe('PlatformAdminService.actualizarStatus', () => {
  afterEach(() => jest.clearAllMocks());

  it('invalida la clave org-status:<orgId> en Redis tras actualizar el status', async () => {
    const orgId = 'org-123';
    const updatedOrg = {
      id: orgId,
      name: 'Test Org',
      slug: 'test-org',
      status: 'SUSPENDED' as OrganizationStatus,
      plan: 'FREE',
      contabilidadEnabled: false,
      granjaEnabled: false,
      tipoEmpresaPrincipal: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { service, orgsWriter, redis } = buildService({
      orgsWriter: { updateStatus: jest.fn().mockResolvedValue(updatedOrg) },
    });

    await service.actualizarStatus(orgId, 'SUSPENDED');

    expect(redis.del).toHaveBeenCalledWith(`org-status:${orgId}`);
    expect(orgsWriter.updateStatus).toHaveBeenCalledWith(orgId, 'SUSPENDED');
  });

  it('llama a del DESPUÉS del update (no antes)', async () => {
    const orgId = 'org-456';
    const callOrder: string[] = [];

    const { service } = buildService({
      orgsWriter: {
        updateStatus: jest.fn().mockImplementation(async () => {
          callOrder.push('updateStatus');
          return {
            id: orgId,
            name: 'Org',
            slug: 'org',
            status: 'ARCHIVED' as OrganizationStatus,
            plan: 'FREE',
            contabilidadEnabled: false,
            granjaEnabled: false,
            tipoEmpresaPrincipal: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }),
      },
      redis: {
        del: jest.fn().mockImplementation(async () => {
          callOrder.push('redis.del');
        }),
      },
    });

    await service.actualizarStatus(orgId, 'ARCHIVED');

    expect(callOrder).toEqual(['updateStatus', 'redis.del']);
  });
});

describe('PlatformAdminService.getDashboard', () => {
  afterEach(() => jest.clearAllMocks());

  it('orquesta statsReader.readDashboard y prisma.user.count, devuelve DTO ensamblado', async () => {
    const dashboardData: PlatformDashboardData = {
      orgsPorStatus: [{ category: 'ACTIVE', count: 5 }],
      orgsPorPlan: [{ category: 'FREE', count: 5 }],
      orgsPorVertical: [{ category: 'contabilidad', count: 3 }],
      altasPorMes: [],
    };

    const { service, statsReader } = buildService({
      statsReader: {
        readDashboard: jest.fn().mockResolvedValue(dashboardData),
      },
      prisma: {
        organization: { findUnique: jest.fn().mockResolvedValue(null) },
        user: { count: jest.fn().mockResolvedValue(42) },
        $transaction: jest.fn(),
      } as unknown as Partial<PrismaService>,
    });

    const result = await service.getDashboard();

    expect(statsReader.readDashboard).toHaveBeenCalledTimes(1);
    // La ventana se calcula desde ClockPort.now() — 11 meses antes
    expect(result.orgsPorStatus[0]?.category).toBe('ACTIVE');
    expect(result.orgsPorStatus[0]?.count).toBe(5);
    expect(result.usuarios.total).toBe(42);
  });

  it('usa ClockPort.now() para calcular la ventana (no new Date())', async () => {
    const fixedDate = new Date('2026-06-02T12:00:00.000Z');
    const dashboardData: PlatformDashboardData = {
      orgsPorStatus: [],
      orgsPorPlan: [],
      orgsPorVertical: [],
      altasPorMes: [],
    };

    const { service, statsReader, clock } = buildService({
      statsReader: {
        readDashboard: jest.fn().mockResolvedValue(dashboardData),
      },
      clock: {
        now: jest.fn().mockReturnValue(fixedDate),
        currentYearLaPaz: jest.fn().mockReturnValue(2026),
        currentDateLaPaz: jest.fn().mockReturnValue('2026-06-02'),
      },
      prisma: {
        organization: { findUnique: jest.fn().mockResolvedValue(null) },
        user: { count: jest.fn().mockResolvedValue(0) },
        $transaction: jest.fn(),
      } as unknown as Partial<PrismaService>,
    });

    await service.getDashboard();

    expect(clock.now).toHaveBeenCalled();
    // La ventana pasada al adapter debe ser ~11 meses antes de fixedDate
    const [windowStart] = statsReader.readDashboard.mock.calls[0]!;
    expect(windowStart.getTime()).toBeLessThan(fixedDate.getTime());
  });
});

describe('PlatformAdminService.getActivity', () => {
  afterEach(() => jest.clearAllMocks());

  it('delega al activityReader con opciones por defecto (limit=20, sin cursor)', async () => {
    const page: PlatformActivityPage = { items: [], nextCursor: null };

    const { service, activityReader } = buildService({
      activityReader: { findRecent: jest.fn().mockResolvedValue(page) },
    });

    const result = await service.getActivity({});

    expect(activityReader.findRecent).toHaveBeenCalledWith({
      limit: 20,
      cursor: undefined,
      orgId: undefined,
    });
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it('decodifica el cursor y lo pasa al activityReader', async () => {
    const date = new Date('2026-06-01T10:00:00.000Z');
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const cursorToken = ActivityCursor.encode(date, id);

    const page: PlatformActivityPage = { items: [], nextCursor: null };

    const { service, activityReader } = buildService({
      activityReader: { findRecent: jest.fn().mockResolvedValue(page) },
    });

    await service.getActivity({ cursor: cursorToken, limit: 10 });

    const callArg = activityReader.findRecent.mock.calls[0]![0];
    expect(callArg.cursor?.id).toBe(id);
    expect(callArg.cursor?.createdAt.toISOString()).toBe(date.toISOString());
    expect(callArg.limit).toBe(10);
  });

  it('cursor inválido → propaga PlatformActivityCursorInvalidoError', async () => {
    const { service } = buildService({
      activityReader: { findRecent: jest.fn() },
    });

    await expect(service.getActivity({ cursor: 'cursor-invalido!!!' })).rejects.toThrow(
      PlatformActivityCursorInvalidoError,
    );
  });

  it('orgId se propaga al activityReader', async () => {
    const orgId = '11111111-2222-4333-8444-555555555555';
    const page: PlatformActivityPage = { items: [], nextCursor: null };

    const { service, activityReader } = buildService({
      activityReader: { findRecent: jest.fn().mockResolvedValue(page) },
    });

    await service.getActivity({ orgId });

    expect(activityReader.findRecent).toHaveBeenCalledWith(expect.objectContaining({ orgId }));
  });
});
