import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SystemRole } from '@prisma/client';

import { ForbiddenError } from '@/common/errors';

import { SystemRolesGuard } from './system-roles.guard';

function makeContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function makeReflector(roles: SystemRole[] | undefined): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(roles),
  } as unknown as Reflector;
}

describe('SystemRolesGuard', () => {
  it('pasa transparente cuando el endpoint no declara @RequireSystemRole', () => {
    const guard = new SystemRolesGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext({ roles: [] }))).toBe(true);
  });

  it('permite a un OWNER cuando el endpoint exige OWNER o ADMIN', () => {
    const guard = new SystemRolesGuard(makeReflector(['OWNER', 'ADMIN']));
    expect(guard.canActivate(makeContext({ roles: ['OWNER'] }))).toBe(true);
  });

  it('permite a un ADMIN cuando el endpoint exige OWNER o ADMIN', () => {
    const guard = new SystemRolesGuard(makeReflector(['OWNER', 'ADMIN']));
    expect(guard.canActivate(makeContext({ roles: ['ADMIN'] }))).toBe(true);
  });

  it('rechaza con 403 a un miembro con custom role (sin SystemRole) — ej "contador"', () => {
    const guard = new SystemRolesGuard(makeReflector(['OWNER', 'ADMIN']));
    expect(() => guard.canActivate(makeContext({ roles: ['contador'] }))).toThrow(ForbiddenError);
  });

  it('rechaza con 403 cuando el usuario no tiene roles en la org', () => {
    const guard = new SystemRolesGuard(makeReflector(['OWNER', 'ADMIN']));
    expect(() => guard.canActivate(makeContext({ roles: [] }))).toThrow(ForbiddenError);
  });

  it('rechaza con 403 cuando el request no tiene user (no autenticado)', () => {
    const guard = new SystemRolesGuard(makeReflector(['OWNER', 'ADMIN']));
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenError);
  });

  it('rechaza con 403 cuando exige solo OWNER y el usuario es ADMIN', () => {
    const guard = new SystemRolesGuard(makeReflector(['OWNER']));
    expect(() => guard.canActivate(makeContext({ roles: ['ADMIN'] }))).toThrow(ForbiddenError);
  });
});
