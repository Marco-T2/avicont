import { Logger } from '@nestjs/common';
import type { OrganizationStatus } from '@prisma/client';

import { RedisService } from '@/cache/redis.service';
import { PrismaService } from '@/common/prisma.service';
import { UsersReaderPort } from '@/users/ports/users-reader.port';
import { PlanCuentasSeederPort } from '@/cuentas/ports/plan-cuentas-seeder.port';
import { TipoDocumentoFisicoSeederPort } from '@/tipos-documento-fisico/ports/tipos-documento-fisico-seeder.port';
import { TipoRegistroSeederPort } from '@/granja/ports/tipo-registro-seeder.port';
import { MembershipsReaderPort } from '@/memberships/ports/memberships-reader.port';
import { OrgsReaderPort } from './ports/orgs-reader.port';
import { OrgsWriterPort } from './ports/orgs-writer.port';
import { PlatformAdminService } from './platform-admin.service';

function buildService(
  overrides: {
    orgsWriter?: Partial<OrgsWriterPort>;
    redis?: Partial<RedisService>;
  } = {},
): {
  service: PlatformAdminService;
  orgsWriter: jest.Mocked<OrgsWriterPort>;
  redis: jest.Mocked<RedisService>;
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
  const prisma = {
    organization: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  } as unknown as jest.Mocked<PrismaService>;

  const service = new PlatformAdminService(
    orgsReader,
    orgsWriter,
    usersReader,
    planCuentasSeeder,
    tiposDocSeeder,
    tipoRegistroSeeder,
    membershipsReader,
    prisma,
    redis,
  );

  jest.spyOn(Logger.prototype, 'log').mockReturnValue(undefined);

  return { service, orgsWriter, redis };
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
