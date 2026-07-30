import 'reflect-metadata';

import { REQUIRE_MODULE_KEY } from '@/common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { PERMISSIONS_KEY } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { VentasController } from './ventas.controller';

// Gating declarativo de REQ-VTA-11 congelado por metadata: el spec de tres
// puntas (catalogo-vs-controllers) verifica que cada permiso del catálogo se
// use en ALGÚN lado, pero no ata cada endpoint a SU verbo — sacar el
// decorador de UN handler cuyo permiso también usa otro (read está en lista y
// detalle) pasaría invisible sin esto.
describe('VentasController — gating declarativo (REQ-VTA-11)', () => {
  it("la clase exige @RequireModule('contabilidad') — SIN pack (D-01)", () => {
    expect(Reflect.getMetadata(REQUIRE_MODULE_KEY, VentasController)).toBe('contabilidad');
  });

  it('la clase monta los guards de auth, módulo y permisos', () => {
    const guards: unknown[] = Reflect.getMetadata('__guards__', VentasController) ?? [];
    expect(guards).toHaveLength(3);
    expect(guards).toContain(ModuleEnabledGuard);
    expect(guards).toContain(PermissionsGuard);
  });

  it.each([
    ['crear', 'contabilidad.ventas.create'],
    ['listar', 'contabilidad.ventas.read'],
    ['obtener', 'contabilidad.ventas.read'],
    ['editar', 'contabilidad.ventas.update'],
    ['eliminarBorrador', 'contabilidad.ventas.delete'],
    ['contabilizar', 'contabilidad.ventas.post'],
    ['anular', 'contabilidad.ventas.void'],
  ])('%s exige %s', (metodo, permiso) => {
    const handler = (VentasController.prototype as unknown as Record<string, unknown>)[metodo];
    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler as object)).toEqual([permiso]);
  });
});
