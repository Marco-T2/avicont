/**
 * Test de arquitectura: todo controller de producción que use @RequirePack
 * debe incluir también TenantGuard o PermissionsGuard en su cadena de @UseGuards.
 *
 * Razón: PackEnabledGuard solo decide visibilidad del pack (404 si apagado),
 * pero NO valida que el caller pertenezca al tenant activo — eso lo aportan
 * TenantGuard o PermissionsGuard. Sin uno de ellos, un usuario autenticado en
 * otro tenant podría (en principio) activar/consumir packs de una org ajena.
 *
 * HOY este test pasa vacío (cero controllers de producción en src/ usan @RequirePack
 * directamente — los controllers actuales con packs usan SystemRolesGuard, que ya
 * exige activeTenantId del JWT). El test actúa como guard rail preventivo: cuando
 * se enchufe el primer pack concreto con su propio controller, si el dev olvida el
 * guard de pertenencia al tenant, este test falla antes de que el código llegue a
 * main.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Busca recursivamente todos los archivos con la extensión indicada dentro de
 * un directorio, devolviendo sus rutas absolutas.
 */
function walkSync(dir: string, ext: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkSync(fullPath, ext);
    if (entry.isFile() && entry.name.endsWith(ext)) return [fullPath];
    return [];
  });
}

describe('Arquitectura: @RequirePack exige guard de pertenencia al tenant', () => {
  // src/ se resuelve relativo a __dirname para robustez independiente del cwd.
  // __dirname = src/common/guards → '../..' = src/ (no escanear node_modules ni test/).
  const srcDir = path.resolve(__dirname, '../..');

  it('todo controller de producción con @RequirePack también referencia TenantGuard o PermissionsGuard', () => {
    const controllers = walkSync(srcDir, '.controller.ts');

    const violaciones: string[] = [];

    for (const filePath of controllers) {
      const contenido = fs.readFileSync(filePath, 'utf-8');

      if (!contenido.includes('@RequirePack(')) continue;

      const tieneTenantGuard = contenido.includes('TenantGuard');
      const tienePermissionsGuard = contenido.includes('PermissionsGuard');

      if (!tieneTenantGuard && !tienePermissionsGuard) {
        violaciones.push(path.relative(srcDir, filePath));
      }
    }

    expect(violaciones).toHaveLength(0);
  });
});
