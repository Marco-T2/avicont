import type { Prisma, PrismaClient, SystemRole } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaTenantRepository } from './prisma-tenant.repository';
import { TenantCreateData } from '../ports/tenant.repository.port';

/**
 * Unit specs del `PrismaTenantRepository` para el soporte de `tx?` y de
 * los flags `contabilidadEnabled`/`granjaEnabled`.
 * Usa mocks del cliente Prisma: no toca Postgres.
 */
describe('PrismaTenantRepository (unit — tx y flags)', () => {
  const OWNER_ID = 'user-uuid-1111';
  const ORG_ID = 'org-uuid-2222';

  function mkPrismaClientMock() {
    return {
      organization: {
        create: jest.fn().mockResolvedValue({
          id: ORG_ID,
          slug: 'test-slug',
          name: 'Test Org',
          contabilidadEnabled: true,
          granjaEnabled: false,
          memberships: [{ id: 'm1', userId: OWNER_ID, systemRole: 'OWNER' as SystemRole }],
        }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    } as unknown as PrismaClient;
  }

  function mkTransactionClientMock() {
    return {
      organization: {
        create: jest.fn().mockResolvedValue({
          id: ORG_ID,
          slug: 'tx-slug',
          name: 'TX Org',
          contabilidadEnabled: false,
          granjaEnabled: true,
          memberships: [{ id: 'm2', userId: OWNER_ID, systemRole: 'OWNER' as SystemRole }],
        }),
      },
    } as unknown as Prisma.TransactionClient;
  }

  const baseData: TenantCreateData = {
    slug: 'test-slug',
    name: 'Test Org',
    ownerUserId: OWNER_ID,
    contabilidadEnabled: true,
    granjaEnabled: false,
  };

  describe('create sin tx', () => {
    it('usa this.prisma cuando tx es undefined', async () => {
      const prismaMock = mkPrismaClientMock();
      const repo = new PrismaTenantRepository(prismaMock as unknown as PrismaService);

      await repo.create(baseData, undefined);

      expect(prismaMock.organization.create).toHaveBeenCalledTimes(1);
    });

    it('pasa contabilidadEnabled y granjaEnabled al create cuando tx es undefined', async () => {
      const prismaMock = mkPrismaClientMock();
      const repo = new PrismaTenantRepository(prismaMock as unknown as PrismaService);

      await repo.create(baseData, undefined);

      const callArg = (prismaMock.organization.create as jest.Mock).mock.calls[0][0] as {
        data: { contabilidadEnabled: boolean; granjaEnabled: boolean };
      };
      expect(callArg.data.contabilidadEnabled).toBe(true);
      expect(callArg.data.granjaEnabled).toBe(false);
    });
  });

  describe('create con tx', () => {
    it('usa el TransactionClient cuando se provee tx', async () => {
      const prismaMock = mkPrismaClientMock();
      const txMock = mkTransactionClientMock();
      const repo = new PrismaTenantRepository(prismaMock as unknown as PrismaService);

      await repo.create({ ...baseData, contabilidadEnabled: false, granjaEnabled: true }, txMock);

      // El TransactionClient fue usado
      expect(txMock.organization.create).toHaveBeenCalledTimes(1);
      // El PrismaClient NO fue usado
      expect(prismaMock.organization.create).not.toHaveBeenCalled();
    });

    it('pasa contabilidadEnabled y granjaEnabled al create con tx', async () => {
      const prismaMock = mkPrismaClientMock();
      const txMock = mkTransactionClientMock();
      const repo = new PrismaTenantRepository(prismaMock as unknown as PrismaService);

      const data: TenantCreateData = {
        ...baseData,
        contabilidadEnabled: false,
        granjaEnabled: true,
      };
      await repo.create(data, txMock);

      const callArg = (txMock.organization.create as jest.Mock).mock.calls[0][0] as {
        data: { contabilidadEnabled: boolean; granjaEnabled: boolean };
      };
      expect(callArg.data.contabilidadEnabled).toBe(false);
      expect(callArg.data.granjaEnabled).toBe(true);
    });
  });
});
