import 'reflect-metadata';

import { REQUIRE_MODULE_KEY } from '@/common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { PERMISSIONS_KEY } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { CobrosController } from './cobros.controller';
import { EstadoCuentaController } from './estado-cuenta.controller';

// Gating declarativo de REQ-CXC-10 congelado por metadata: el spec de tres
// puntas (catalogo-vs-controllers) verifica que cada permiso del catálogo se
// use en ALGÚN lado, pero no ata cada endpoint a SU verbo — `read` gatea tres
// handlers y `update` gatea cuatro, así que intercambiar dos decoradores
// pasaría invisible sin esto (lección de la Fase 4, ventas.controller.spec).
describe('CobrosController — gating declarativo (REQ-CXC-10)', () => {
  it("la clase exige @RequireModule('contabilidad') — SIN pack (D-01)", () => {
    expect(Reflect.getMetadata(REQUIRE_MODULE_KEY, CobrosController)).toBe('contabilidad');
  });

  it('la clase monta los guards de auth, módulo y permisos', () => {
    const guards: unknown[] = Reflect.getMetadata('__guards__', CobrosController) ?? [];
    expect(guards).toHaveLength(3);
    expect(guards).toContain(ModuleEnabledGuard);
    expect(guards).toContain(PermissionsGuard);
  });

  it.each([
    ['crear', 'contabilidad.cobros.create'],
    ['listar', 'contabilidad.cobros.read'],
    ['obtener', 'contabilidad.cobros.read'],
    ['editar', 'contabilidad.cobros.update'],
    ['eliminarBorrador', 'contabilidad.cobros.delete'],
    ['contabilizar', 'contabilidad.cobros.post'],
    ['anular', 'contabilidad.cobros.void'],
    // Aplicar y desaplicar mutan el VÍNCULO, no crean hecho contable →
    // `update`, nunca `create`/`delete` (REQ-CXC-10).
    ['crearAplicacion', 'contabilidad.cobros.update'],
    ['editarAplicacion', 'contabilidad.cobros.update'],
    ['eliminarAplicacion', 'contabilidad.cobros.update'],
  ])('%s exige %s', (metodo, permiso) => {
    const handler = (CobrosController.prototype as unknown as Record<string, unknown>)[metodo];
    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler as object)).toEqual([permiso]);
  });
});

describe('EstadoCuentaController — gating declarativo (REQ-CXC-10)', () => {
  it("la clase exige @RequireModule('contabilidad') — SIN pack (D-01)", () => {
    expect(Reflect.getMetadata(REQUIRE_MODULE_KEY, EstadoCuentaController)).toBe('contabilidad');
  });

  it('la clase monta los guards de auth, módulo y permisos', () => {
    const guards: unknown[] = Reflect.getMetadata('__guards__', EstadoCuentaController) ?? [];
    expect(guards).toHaveLength(3);
    expect(guards).toContain(ModuleEnabledGuard);
    expect(guards).toContain(PermissionsGuard);
  });

  it('obtener exige contabilidad.cobros.read — con sólo read SE VE el estado de cuenta (REQ-CXC-10)', () => {
    const handler = (EstadoCuentaController.prototype as unknown as Record<string, unknown>)[
      'obtener'
    ];
    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler as object)).toEqual([
      'contabilidad.cobros.read',
    ]);
  });
});
