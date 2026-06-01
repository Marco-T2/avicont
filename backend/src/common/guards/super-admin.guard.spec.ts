import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';

function buildContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('REQ-SA-05: SuperAdminGuard', () => {
  let guard: SuperAdminGuard;

  beforeEach(() => {
    guard = new SuperAdminGuard();
  });

  it('[+] super-admin con isSuperAdmin === true → pasa el guard', () => {
    const ctx = buildContext({ sub: 'user-1', isSuperAdmin: true });

    const result = guard.canActivate(ctx);

    expect(result).toBe(true);
  });

  it('[-] usuario regular (isSuperAdmin === false) → 403', () => {
    const ctx = buildContext({ sub: 'user-2', isSuperAdmin: false });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('[-] isSuperAdmin truthy pero no === true (ej: 1) → 403 (comparación estricta)', () => {
    // Verificación estricta: 1 es truthy pero no boolean true
    const ctx = buildContext({ sub: 'user-3', isSuperAdmin: 1 });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('[-] isSuperAdmin truthy "true" como string → 403 (comparación estricta)', () => {
    const ctx = buildContext({ sub: 'user-4', isSuperAdmin: 'true' });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('[-] req.user undefined → 403', () => {
    const ctx = buildContext(undefined);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
