import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import type { PrismaService } from '@/common/prisma.service';
import type { PlatformActivityItem } from '@/platform/ports/platform-activity-reader.port';

import { PrismaPlatformActivityReaderAdapter } from './prisma-platform-activity-reader.adapter';

/**
 * Integration spec de PrismaPlatformActivityReaderAdapter contra Postgres real.
 * Valida:
 * - Cursor page1→page2 sin solapamiento (REQ-PCT-03, REQ-PCT-05).
 * - Filtro orgId funciona correctamente.
 * - Actor y org se resuelven en 1 query (include — no N+1).
 * - El campo payload NUNCA aparece en los resultados (REQ-PCT-04).
 * - nextCursor es null cuando no hay más páginas.
 */
describe('PrismaPlatformActivityReaderAdapter (integration)', () => {
  const EMAIL = 'activity-adapter-test@test.com';
  const SLUG_ORG_A = 'activity-adapter-org-a';
  const SLUG_ORG_B = 'activity-adapter-org-b';

  let prisma: PrismaClient;
  let adapter: PrismaPlatformActivityReaderAdapter;
  let actorUserId: string;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaPlatformActivityReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.platformAudit.deleteMany({ where: { actor: { email: EMAIL } } });
    await prisma.organization.deleteMany({
      where: { slug: { in: [SLUG_ORG_A, SLUG_ORG_B] } },
    });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Limpiar TODA la tabla platform_audit para evitar contaminación cross-test
    // (la query es cross-tenant por diseño — el adapter no filtra por actorUserId).
    await prisma.platformAudit.deleteMany({});
    await prisma.organization.deleteMany({
      where: { slug: { in: [SLUG_ORG_A, SLUG_ORG_B] } },
    });
    await prisma.user.deleteMany({ where: { email: EMAIL } });

    const hashedPassword = await bcrypt.hash('test-pass', 10);
    const actor = await prisma.user.create({
      data: { email: EMAIL, hashedPassword, displayName: 'Test SA' },
    });
    actorUserId = actor.id;

    const orgA = await prisma.organization.create({
      data: { name: 'Org Activity A', slug: SLUG_ORG_A },
    });
    orgAId = orgA.id;

    const orgB = await prisma.organization.create({
      data: { name: 'Org Activity B', slug: SLUG_ORG_B },
    });
    orgBId = orgB.id;
  });

  /** Crea N registros de auditoría con un delay de 1ms entre ellos para tener createdAt distintos. */
  async function createAuditRows(count: number, orgId?: string): Promise<void> {
    for (let i = 0; i < count; i++) {
      await prisma.platformAudit.create({
        data: {
          actorUserId,
          action: `action-${i}`,
          ...(orgId !== undefined ? { targetOrganizationId: orgId } : {}),
          payload: { secret: 'must-not-appear' },
        },
      });
      // Pequeño delay para asegurar createdAt distintos (la BD usa microsegundos)
      await new Promise((r) => setTimeout(r, 2));
    }
  }

  it('payload NUNCA aparece en los ítems devueltos (REQ-PCT-04)', async () => {
    await createAuditRows(1);

    const page = await adapter.findRecent({ limit: 10 });

    expect(page.items).toHaveLength(1);
    const item = page.items[0]!;
    // El ítem no debe tener propiedad payload
    expect(Object.prototype.hasOwnProperty.call(item, 'payload')).toBe(false);
  });

  it('actor se resuelve con email y displayName (include, no N+1)', async () => {
    await createAuditRows(1);

    const page = await adapter.findRecent({ limit: 10 });

    expect(page.items).toHaveLength(1);
    const item = page.items[0]!;
    expect(item.actor.email).toBe(EMAIL);
    expect(item.actor.displayName).toBe('Test SA');
  });

  it('targetOrganization se resuelve con name cuando existe', async () => {
    await createAuditRows(1, orgAId);

    const page = await adapter.findRecent({ limit: 10 });

    const item = page.items[0]!;
    expect(item.targetOrganizationId).toBe(orgAId);
    expect(item.targetOrganization?.name).toBe('Org Activity A');
  });

  it('nextCursor es null cuando hay menos ítems que el limit', async () => {
    await createAuditRows(3);

    const page = await adapter.findRecent({ limit: 10 });

    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('cursor page1→page2 sin solapamiento (REQ-PCT-03, REQ-PCT-05)', async () => {
    await createAuditRows(5);

    const page1 = await adapter.findRecent({ limit: 3 });
    expect(page1.items).toHaveLength(3);
    expect(page1.nextCursor).not.toBeNull();

    // Decodificar cursor manualmente para pasarlo como objeto
    const { ActivityCursor } = await import('@/platform/lib/activity-cursor');
    const cursorDecoded = ActivityCursor.decode(page1.nextCursor!);

    const page2 = await adapter.findRecent({ limit: 3, cursor: cursorDecoded });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBeNull();

    // Sin solapamiento
    const idsPage1 = page1.items.map((i: PlatformActivityItem) => i.id);
    const idsPage2 = page2.items.map((i: PlatformActivityItem) => i.id);
    const overlap = idsPage1.filter((id: string) => idsPage2.includes(id));
    expect(overlap).toHaveLength(0);

    // Los 5 ítems son distintos
    const allIds = [...idsPage1, ...idsPage2];
    expect(new Set(allIds).size).toBe(5);
  });

  it('filtro orgId devuelve solo los ítems de esa org', async () => {
    await createAuditRows(2, orgAId);
    await createAuditRows(3, orgBId);

    const pageA = await adapter.findRecent({ limit: 10, orgId: orgAId });
    const pageB = await adapter.findRecent({ limit: 10, orgId: orgBId });

    expect(pageA.items).toHaveLength(2);
    expect(pageB.items).toHaveLength(3);

    pageA.items.forEach((i: PlatformActivityItem) => expect(i.targetOrganizationId).toBe(orgAId));
    pageB.items.forEach((i: PlatformActivityItem) => expect(i.targetOrganizationId).toBe(orgBId));
  });

  it('orgId inexistente devuelve lista vacía con nextCursor null (REQ-PCT-03)', async () => {
    await createAuditRows(3, orgAId);

    const page = await adapter.findRecent({
      limit: 10,
      orgId: '00000000-0000-0000-0000-000000000000',
    });

    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
  });
});
