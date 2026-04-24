import { PrismaClient, SystemRole } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { MembershipsReaderAdapter } from './memberships-reader.adapter';

/**
 * Integration spec del método `findForImpersonation` del
 * `MembershipsReaderAdapter`. El resto de los métodos del reader están
 * cubiertos por los e2e de auth/users; este test puntual asegura que el
 * shape nuevo preserve `deactivatedAt` y `userIsActive` sin filtrar —
 * requisito del consumer `impersonation` (CLAUDE.md §5.6).
 */
describe('MembershipsReaderAdapter.findForImpersonation (integration)', () => {
  const SLUG_A = 'org-test-memb-reader-imp-a';
  const SLUG_B = 'org-test-memb-reader-imp-b';

  let prisma: PrismaClient;
  let adapter: MembershipsReaderAdapter;
  let tenantA: string;
  let tenantB: string;
  let ownerId: string;
  let memberDesactivadoId: string;
  let userCuentaInactivaId: string;
  let userOtroTenantId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new MembershipsReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    const [owner, memberDesactivado, userCuentaInactiva, userOtroTenant] =
      await Promise.all([
        prisma.user.create({
          data: {
            email: 'owner-imp-reader@test.bo',
            hashedPassword: 'x',
            isActive: true,
          },
        }),
        prisma.user.create({
          data: {
            email: 'desact-imp-reader@test.bo',
            hashedPassword: 'x',
            isActive: true,
          },
        }),
        prisma.user.create({
          data: {
            email: 'cuenta-inactiva@test.bo',
            hashedPassword: 'x',
            isActive: false,
          },
        }),
        prisma.user.create({
          data: {
            email: 'other-tenant@test.bo',
            hashedPassword: 'x',
            isActive: true,
          },
        }),
      ]);
    ownerId = owner.id;
    memberDesactivadoId = memberDesactivado.id;
    userCuentaInactivaId = userCuentaInactiva.id;
    userOtroTenantId = userOtroTenant.id;

    const role = await prisma.customRole.create({
      data: {
        organizationId: tenantA,
        slug: 'contador',
        name: 'Contador',
        permissions: ['contabilidad.read'],
      },
    });

    await prisma.membership.createMany({
      data: [
        { organizationId: tenantA, userId: ownerId, systemRole: SystemRole.OWNER },
        {
          organizationId: tenantA,
          userId: memberDesactivadoId,
          customRoleId: role.id,
          deactivatedAt: new Date('2026-01-15T00:00:00Z'),
        },
        {
          organizationId: tenantA,
          userId: userCuentaInactivaId,
          customRoleId: role.id,
        },
        {
          organizationId: tenantB,
          userId: userOtroTenantId,
          systemRole: SystemRole.OWNER,
        },
      ],
    });
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    if (orgs.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: orgs.map((o) => o.id) } },
      });
    }
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'owner-imp-reader@test.bo',
            'desact-imp-reader@test.bo',
            'cuenta-inactiva@test.bo',
            'other-tenant@test.bo',
          ],
        },
      },
    });
  }

  it('retorna shape completo con systemRole OWNER, sin deactivatedAt', async () => {
    const result = await adapter.findForImpersonation(ownerId, tenantA);
    expect(result).toEqual({
      systemRole: SystemRole.OWNER,
      deactivatedAt: null,
      customRoleSlug: null,
      userEmail: 'owner-imp-reader@test.bo',
      userIsActive: true,
    });
  });

  it('retorna deactivatedAt poblado cuando la membership está desactivada', async () => {
    const result = await adapter.findForImpersonation(memberDesactivadoId, tenantA);
    expect(result?.deactivatedAt).toEqual(new Date('2026-01-15T00:00:00Z'));
    expect(result?.customRoleSlug).toBe('contador');
    expect(result?.systemRole).toBeNull();
    expect(result?.userIsActive).toBe(true);
  });

  it('retorna userIsActive=false cuando la cuenta del User está desactivada', async () => {
    const result = await adapter.findForImpersonation(userCuentaInactivaId, tenantA);
    expect(result?.userIsActive).toBe(false);
    expect(result?.deactivatedAt).toBeNull();
    expect(result?.customRoleSlug).toBe('contador');
  });

  it('retorna null para usuario miembro de OTRO tenant (aislamiento cross-tenant)', async () => {
    const result = await adapter.findForImpersonation(userOtroTenantId, tenantA);
    expect(result).toBeNull();
  });

  it('retorna null si el userId no existe en ningún tenant', async () => {
    const result = await adapter.findForImpersonation(
      '00000000-0000-4000-8000-000000000000',
      tenantA,
    );
    expect(result).toBeNull();
  });
});
