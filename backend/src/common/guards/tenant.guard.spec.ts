import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';

// Simula el PrismaService mínimo que necesita TenantGuard
function makePrismaSpy(membershipResult: object | null) {
  return {
    membership: {
      findUnique: jest.fn().mockResolvedValue(membershipResult),
    },
  };
}

function buildContext(opts: {
  user?: unknown;
  headers?: Record<string, string>;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: opts.user,
        headers: opts.headers ?? {},
        tenantId: undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('REQ-SA-06: TenantGuard bypass para super-admin', () => {
  it('[+] super-admin con X-Tenant-ID sin membresía → pasa y setea req.tenantId', async () => {
    // Prisma no debe consultarse en absoluto para el super-admin
    const prisma = makePrismaSpy(null);
    const guard = new TenantGuard({} as never, prisma as never);

    const request = {
      user: { sub: 'sa-1', isSuperAdmin: true, activeTenantId: undefined },
      headers: { 'x-tenant-id': 'org-ajena' },
      tenantId: undefined as string | undefined,
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(request.tenantId).toBe('org-ajena');
    // El bypass NO debe haber consultado Prisma
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('[-] NO-super-admin sin membresía en la org → 403 (invariante §4.2 intacto)', async () => {
    // membership.findUnique devuelve null → usuario no es miembro
    const prisma = makePrismaSpy(null);
    const guard = new TenantGuard({} as never, prisma as never);

    const ctx = buildContext({
      user: { sub: 'user-no-member', isSuperAdmin: false, activeTenantId: 'org-1' },
      headers: {},
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('[-] super-admin SIN X-Tenant-ID y sin activeTenantId → error (no hay tenant destino válido)', async () => {
    const prisma = makePrismaSpy(null);
    const guard = new TenantGuard({} as never, prisma as never);

    const ctx = buildContext({
      user: { sub: 'sa-2', isSuperAdmin: true, activeTenantId: undefined },
      headers: {},
    });

    // Sin tenantId resolvible, el guard debe lanzar ForbiddenException
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('[-] req.user.isSuperAdmin truthy pero no === true → bypass NO se activa', async () => {
    // isSuperAdmin = 1 es truthy pero no boolean true → Prisma se consulta y devuelve null → 403
    const prisma = makePrismaSpy(null);
    const guard = new TenantGuard({} as never, prisma as never);

    const ctx = buildContext({
      user: { sub: 'user-x', isSuperAdmin: 1, activeTenantId: 'org-1' },
      headers: {},
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    // Prisma SÍ debe haberse consultado (no hubo bypass)
    expect(prisma.membership.findUnique).toHaveBeenCalled();
  });

  it('[+] usuario regular MIEMBRO activo en la org → pasa', async () => {
    const membershipActiva = { organizationId: 'org-1', userId: 'user-m', deactivatedAt: null };
    const prisma = makePrismaSpy(membershipActiva);
    const guard = new TenantGuard({} as never, prisma as never);

    const ctx = buildContext({
      user: { sub: 'user-m', isSuperAdmin: false, activeTenantId: 'org-1' },
      headers: {},
    });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
  });
});
