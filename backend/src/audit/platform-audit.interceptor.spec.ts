import { ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';
import { FakeClockAdapter } from '@/common/clock/fake-clock.adapter';
import { PlatformAuditInterceptor } from './platform-audit.interceptor';
import { PrismaPlatformAuditRepository } from '@/platform/adapters/prisma-platform-audit.repository';

/**
 * Integration spec del `PlatformAuditInterceptor` contra Postgres real.
 * REQ-SA-08/09: el interceptor registra acciones de super-admin y no registra
 * acciones de usuarios normales ni reads.
 *
 * Usa PrismaClient directo (patrón del proyecto) y FakeClockAdapter para
 * timestamps deterministas (CLAUDE.md §4.6 — NUNCA new Date() en tests de audit).
 */
describe('REQ-SA-08/09: PlatformAuditInterceptor', () => {
  const FROZEN_DATE = new Date('2026-06-01T12:00:00.000Z');
  const SUPER_ADMIN_ID = 'sa-interceptor-test-user';
  const REGULAR_USER_ID = 'regular-interceptor-test-user';
  const TARGET_ORG_ID = 'target-org-interceptor-test';

  let prisma: PrismaClient;
  let fakeClock: FakeClockAdapter;
  let repo: PrismaPlatformAuditRepository;
  let interceptor: PlatformAuditInterceptor;

  function buildMockContext(opts: {
    method: string;
    path: string;
    url: string;
    isSuperAdmin: boolean;
    userId: string;
    activeTenantId?: string;
    tenantId?: string;
    body?: unknown;
    xTenantId?: string;
  }): ExecutionContext {
    const req = {
      method: opts.method,
      path: opts.path,
      url: opts.url,
      route: { path: opts.path },
      user: {
        sub: opts.userId,
        isSuperAdmin: opts.isSuperAdmin,
        ...(opts.activeTenantId !== undefined ? { activeTenantId: opts.activeTenantId } : {}),
      },
      tenantId: opts.tenantId,
      body: opts.body ?? {},
      headers: {
        ...(opts.xTenantId !== undefined ? { 'x-tenant-id': opts.xTenantId } : {}),
      },
    };
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  }

  function buildCallHandler() {
    return { handle: () => of({ ok: true }) };
  }

  async function waitForAudit(): Promise<void> {
    // El interceptor usa `void` para el write (best-effort).
    // Esperamos varios ticks para dar tiempo al async de Prisma de completar.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    // Crear datos de soporte: usuario super-admin y org destino
    await prisma.user.upsert({
      where: { id: SUPER_ADMIN_ID },
      create: {
        id: SUPER_ADMIN_ID,
        email: 'sa-interceptor@test.com',
        hashedPassword: 'hash',
        displayName: 'SA Interceptor',
        isSuperAdmin: true,
      },
      update: { isSuperAdmin: true },
    });
    await prisma.user.upsert({
      where: { id: REGULAR_USER_ID },
      create: {
        id: REGULAR_USER_ID,
        email: 'regular-interceptor@test.com',
        hashedPassword: 'hash',
        displayName: 'Regular Interceptor',
      },
      update: {},
    });
    await prisma.organization.upsert({
      where: { id: TARGET_ORG_ID },
      create: { id: TARGET_ORG_ID, slug: 'target-org-interceptor', name: 'Target Org Interceptor' },
      update: {},
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    fakeClock = new FakeClockAdapter();
    fakeClock.setTo(FROZEN_DATE);

    repo = new PrismaPlatformAuditRepository(prisma as unknown as PrismaService);
    interceptor = new PlatformAuditInterceptor(repo, fakeClock);
  });

  async function cleanup() {
    await prisma.platformAudit.deleteMany({
      where: {
        actorUserId: { in: [SUPER_ADMIN_ID, REGULAR_USER_ID, 'seed', 'cli'] },
      },
    });
  }

  it('[+] POST con isSuperAdmin === true → crea fila en platform_audit con actorUserId, action y timestamp del ClockPort', async () => {
    const ctx = buildMockContext({
      method: 'POST',
      path: '/admin/platform/orgs',
      url: '/admin/platform/orgs',
      isSuperAdmin: true,
      userId: SUPER_ADMIN_ID,
    });

    const result$ = interceptor.intercept(ctx, buildCallHandler());
    await new Promise<void>((resolve) => result$.subscribe({ complete: resolve }));
    await waitForAudit();

    const filas = await prisma.platformAudit.findMany({
      where: { actorUserId: SUPER_ADMIN_ID },
    });
    expect(filas).toHaveLength(1);
    const fila = filas[0]!;
    expect(fila.actorUserId).toBe(SUPER_ADMIN_ID);
    expect(fila.action).toBe('POST /admin/platform/orgs');
    expect(fila.createdAt.toISOString()).toBe(FROZEN_DATE.toISOString());
  });

  it('[+] PATCH con isSuperAdmin === true y X-Tenant-ID → incluye targetOrganizationId', async () => {
    const ctx = buildMockContext({
      method: 'PATCH',
      path: '/admin/platform/orgs/:id/status',
      url: `/admin/platform/orgs/${TARGET_ORG_ID}/status`,
      isSuperAdmin: true,
      userId: SUPER_ADMIN_ID,
      tenantId: TARGET_ORG_ID,
      xTenantId: TARGET_ORG_ID,
    });

    const result$ = interceptor.intercept(ctx, buildCallHandler());
    await new Promise<void>((resolve) => result$.subscribe({ complete: resolve }));
    await waitForAudit();

    const filas = await prisma.platformAudit.findMany({
      where: { actorUserId: SUPER_ADMIN_ID },
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]!.targetOrganizationId).toBe(TARGET_ORG_ID);
  });

  it('[-] GET read-only con isSuperAdmin === true → NO crea fila', async () => {
    const ctx = buildMockContext({
      method: 'GET',
      path: '/admin/platform/orgs',
      url: '/admin/platform/orgs',
      isSuperAdmin: true,
      userId: SUPER_ADMIN_ID,
    });

    const result$ = interceptor.intercept(ctx, buildCallHandler());
    await new Promise<void>((resolve) => result$.subscribe({ complete: resolve }));
    await waitForAudit();

    const filas = await prisma.platformAudit.findMany({
      where: { actorUserId: SUPER_ADMIN_ID },
    });
    expect(filas).toHaveLength(0);
  });

  it('[-] request de usuario regular (isSuperAdmin === false) → NO crea fila', async () => {
    const ctx = buildMockContext({
      method: 'POST',
      path: '/comprobantes',
      url: '/comprobantes',
      isSuperAdmin: false,
      userId: REGULAR_USER_ID,
    });

    const result$ = interceptor.intercept(ctx, buildCallHandler());
    await new Promise<void>((resolve) => result$.subscribe({ complete: resolve }));
    await waitForAudit();

    const filas = await prisma.platformAudit.findMany({
      where: { actorUserId: REGULAR_USER_ID },
    });
    expect(filas).toHaveLength(0);
  });

  it('[+] payload sensible es redactado antes de guardarlo', async () => {
    const ctx = buildMockContext({
      method: 'POST',
      path: '/admin/platform/orgs',
      url: '/admin/platform/orgs',
      isSuperAdmin: true,
      userId: SUPER_ADMIN_ID,
      body: {
        name: 'Mi Org',
        password: 'super-secret',
        token: 'bearer-xyz',
        authorization: 'Bearer abc',
        otrosCampos: 'visible',
      },
    });

    const result$ = interceptor.intercept(ctx, buildCallHandler());
    await new Promise<void>((resolve) => result$.subscribe({ complete: resolve }));
    await waitForAudit();

    const filas = await prisma.platformAudit.findMany({
      where: { actorUserId: SUPER_ADMIN_ID },
    });
    expect(filas).toHaveLength(1);
    const payload = filas[0]!.payload as Record<string, unknown>;
    expect(payload['name']).toBe('Mi Org');
    expect(payload['otrosCampos']).toBe('visible');
    // Los campos sensibles deben estar redactados
    expect(payload['password']).toBe('[REDACTED]');
    expect(payload['token']).toBe('[REDACTED]');
    expect(payload['authorization']).toBe('[REDACTED]');
  });
});
