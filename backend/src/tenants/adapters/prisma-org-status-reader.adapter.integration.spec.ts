import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaOrgStatusReaderAdapter } from './prisma-org-status-reader.adapter';

/**
 * Integration spec de PrismaOrgStatusReaderAdapter contra Postgres real.
 * Valida que:
 * - getStatus devuelve el status correcto para una org existente.
 * - getStatus devuelve null para un id inexistente.
 */
describe('PrismaOrgStatusReaderAdapter (integration)', () => {
  const SLUG = 'org-status-reader-adapter-test';

  let prisma: PrismaClient;
  let adapter: PrismaOrgStatusReaderAdapter;
  let orgId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaOrgStatusReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.organization.deleteMany({ where: { slug: SLUG } });
    const org = await prisma.organization.create({
      data: { name: 'Test Org Status Reader', slug: SLUG },
    });
    orgId = org.id;
  });

  it('devuelve ACTIVE para una org existente con status por defecto', async () => {
    const status = await adapter.getStatus(orgId);
    expect(status).toBe('ACTIVE');
  });

  it('devuelve SUSPENDED para una org en estado SUSPENDED', async () => {
    await prisma.organization.update({ where: { id: orgId }, data: { status: 'SUSPENDED' } });
    const status = await adapter.getStatus(orgId);
    expect(status).toBe('SUSPENDED');
  });

  it('devuelve null para un id inexistente', async () => {
    const status = await adapter.getStatus('11111111-2222-4333-8444-555555555555');
    expect(status).toBeNull();
  });
});
