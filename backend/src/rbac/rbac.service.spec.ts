import { RbacService } from './rbac.service';
import type {
  PermissionsResolverPort,
  ResolvedPermissions,
} from './ports/permissions-resolver.port';
import type { PermissionsCachePort } from './ports/permissions-cache.port';
import { CATALOGO_PERMISOS } from '@/common/permisos/catalogo';

// Stubs mínimos para resolver y cache.
function makeResolver(result: ResolvedPermissions | null): PermissionsResolverPort {
  return { resolve: jest.fn().mockResolvedValue(result) };
}

function makeCache(cached: ResolvedPermissions | null = null): PermissionsCachePort {
  return {
    get: jest.fn().mockResolvedValue(cached),
    set: jest.fn().mockResolvedValue(undefined),
    invalidateUser: jest.fn().mockResolvedValue(undefined),
    invalidateUsersByCustomRole: jest.fn().mockResolvedValue(undefined),
    invalidateOrganization: jest.fn().mockResolvedValue(undefined),
  };
}

function buildService(opts: {
  cachedResult?: ResolvedPermissions | null;
  resolvedResult?: ResolvedPermissions | null;
}): RbacService {
  const resolver = makeResolver(opts.resolvedResult ?? null);
  const cache = makeCache(opts.cachedResult ?? null);
  // RbacService espera las instancias directas vía @Inject, pero en unit tests
  // los pasamos directamente al constructor gracias a que TypeScript los acepta.
  return new RbacService(
    resolver as unknown as PermissionsResolverPort,
    cache as unknown as PermissionsCachePort,
  );
}

const TODOS_LOS_PERMISOS = CATALOGO_PERMISOS.map((p) => p.key);

describe('RbacService', () => {
  describe('resolverPermisosConContexto()', () => {
    it('OWNER → isOwner: true y permissions contiene todos los keys del catálogo', async () => {
      const service = buildService({
        resolvedResult: { esOwner: true, esAdmin: false, wildcards: ['*'] },
      });

      const result = await service.resolverPermisosConContexto('user-1', 'org-1');

      expect(result.isOwner).toBe(true);
      expect(result.permissions).toEqual(expect.arrayContaining(TODOS_LOS_PERMISOS));
      expect(result.permissions).toHaveLength(TODOS_LOS_PERMISOS.length);
      // No debe contener el literal '*'
      expect(result.permissions).not.toContain('*');
    });

    it('ADMIN → isOwner: false y permissions contiene todos los keys del catálogo', async () => {
      const service = buildService({
        resolvedResult: { esOwner: false, esAdmin: true, wildcards: ['*'] },
      });

      const result = await service.resolverPermisosConContexto('user-2', 'org-1');

      expect(result.isOwner).toBe(false);
      expect(result.permissions).toEqual(expect.arrayContaining(TODOS_LOS_PERMISOS));
      expect(result.permissions).not.toContain('*');
    });

    it('MEMBER con CustomRole ["contabilidad.*"] → solo permisos con prefijo contabilidad', async () => {
      const service = buildService({
        resolvedResult: { esOwner: false, esAdmin: false, wildcards: ['contabilidad.*'] },
      });

      const result = await service.resolverPermisosConContexto('user-3', 'org-1');

      expect(result.isOwner).toBe(false);
      // Todos los permisos devueltos deben empezar con 'contabilidad.'
      expect(result.permissions.every((p: string) => p.startsWith('contabilidad.'))).toBe(true);
      // No incluye permisos de otros módulos
      expect(result.permissions.some((p: string) => p.startsWith('granja.'))).toBe(false);
      expect(result.permissions.some((p: string) => p.startsWith('organizacion.'))).toBe(false);
      // No contiene wildcards
      expect(result.permissions).not.toContain('contabilidad.*');
    });

    it('MEMBER con CustomRole vacío → permissions: []', async () => {
      const service = buildService({
        resolvedResult: { esOwner: false, esAdmin: false, wildcards: [] },
      });

      const result = await service.resolverPermisosConContexto('user-4', 'org-1');

      expect(result.isOwner).toBe(false);
      expect(result.permissions).toEqual([]);
    });

    it('MEMBER con permisos exactos → devuelve exactamente esos permisos sin duplicados', async () => {
      const permisosExactos = ['contabilidad.libro-diario.read', 'contabilidad.libro-mayor.read'];
      const service = buildService({
        resolvedResult: { esOwner: false, esAdmin: false, wildcards: permisosExactos },
      });

      const result = await service.resolverPermisosConContexto('user-5', 'org-1');

      expect(result.isOwner).toBe(false);
      expect(result.permissions).toHaveLength(2);
      expect(result.permissions).toContain('contabilidad.libro-diario.read');
      expect(result.permissions).toContain('contabilidad.libro-mayor.read');
    });

    it('usuario no miembro (resolver devuelve null) → permissions: [], isOwner: false', async () => {
      const service = buildService({ resolvedResult: null });

      const result = await service.resolverPermisosConContexto('user-99', 'org-1');

      expect(result.isOwner).toBe(false);
      expect(result.permissions).toEqual([]);
    });
  });

  describe('getPermissions() — regresión: firma intacta', () => {
    it('devuelve ResolvedPermissions con wildcards crudos (no expandidos)', async () => {
      const permsEsperados: ResolvedPermissions = {
        esOwner: false,
        esAdmin: false,
        wildcards: ['contabilidad.*'],
      };
      const service = buildService({ resolvedResult: permsEsperados });

      const result = await service.getPermissions('user-1', 'org-1');

      expect(result.esOwner).toBe(false);
      expect(result.esAdmin).toBe(false);
      expect(result.wildcards).toEqual(['contabilidad.*']);
    });

    it('OWNER → devuelve esOwner: true con wildcards ["*"]', async () => {
      const service = buildService({
        resolvedResult: { esOwner: true, esAdmin: false, wildcards: ['*'] },
      });

      const result = await service.getPermissions('owner-1', 'org-1');

      expect(result.esOwner).toBe(true);
      expect(result.wildcards).toEqual(['*']);
    });
  });
});
