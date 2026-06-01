import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { RbacService } from '../rbac.service';
import { Reflector } from '@nestjs/core';

function buildContext(opts: {
  user?: unknown;
  headers?: Record<string, string>;
  handlerMetadata?: string[];
}): ExecutionContext {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(opts.handlerMetadata ?? ['some.permission']),
  } as unknown as Reflector;

  const request = {
    user: opts.user,
    headers: opts.headers ?? {},
  };

  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
    _reflector: reflector,
  } as unknown as ExecutionContext;

  return ctx;
}

function makeRbacSpy(hasAllResult = false): jest.Mocked<Pick<RbacService, 'hasAllPermissions' | 'hasPermission' | 'hasAnyPermission'>> {
  return {
    hasAllPermissions: jest.fn().mockResolvedValue(hasAllResult),
    hasPermission: jest.fn().mockResolvedValue(hasAllResult),
    hasAnyPermission: jest.fn().mockResolvedValue(hasAllResult),
  };
}

describe('REQ-SA-07: short-circuit RBAC para super-admin', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['some.permission']),
    } as unknown as Reflector;
  });

  function buildGuardContext(user: unknown): ExecutionContext {
    const request = {
      user,
      headers: { 'x-tenant-id': 'org-1' },
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('[+] super-admin corto-circuita sin invocar RbacService', async () => {
    const rbac = makeRbacSpy(false);
    const guard = new PermissionsGuard(reflector, rbac as unknown as RbacService);

    const ctx = buildGuardContext({ sub: 'sa-1', isSuperAdmin: true, activeTenantId: 'org-1' });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    // El short-circuit debe hacer que RbacService NUNCA se invoque
    expect(rbac.hasAllPermissions).not.toHaveBeenCalled();
  });

  it('[-] no-super-admin OWNER sigue el flujo normal del resolver', async () => {
    // RbacService devuelve true (simulando que es OWNER con permisos)
    const rbac = makeRbacSpy(true);
    const guard = new PermissionsGuard(reflector, rbac as unknown as RbacService);

    const ctx = buildGuardContext({ sub: 'owner-1', isSuperAdmin: false, activeTenantId: 'org-1' });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    // RbacService SÍ debe haberse llamado
    expect(rbac.hasAllPermissions).toHaveBeenCalled();
  });

  it('[-] no-super-admin sin permisos → ForbiddenException', async () => {
    const rbac = makeRbacSpy(false);
    const guard = new PermissionsGuard(reflector, rbac as unknown as RbacService);

    const ctx = buildGuardContext({ sub: 'user-x', isSuperAdmin: false, activeTenantId: 'org-1' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(rbac.hasAllPermissions).toHaveBeenCalled();
  });

  it('[-] isSuperAdmin truthy pero no === true → NO corto-circuita (sigue el flujo normal)', async () => {
    // isSuperAdmin = 1 (truthy, no boolean true) → no debe hacer short-circuit
    const rbac = makeRbacSpy(false);
    const guard = new PermissionsGuard(reflector, rbac as unknown as RbacService);

    const ctx = buildGuardContext({ sub: 'user-y', isSuperAdmin: 1, activeTenantId: 'org-1' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    // RbacService debe haberse llamado (no hubo short-circuit)
    expect(rbac.hasAllPermissions).toHaveBeenCalled();
  });

  it('[-] sin user → UnauthorizedException', async () => {
    const rbac = makeRbacSpy(false);
    const guard = new PermissionsGuard(reflector, rbac as unknown as RbacService);

    const ctx = buildGuardContext(undefined);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
