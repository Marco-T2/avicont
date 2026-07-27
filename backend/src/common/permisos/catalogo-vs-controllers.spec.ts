// Confronta el catálogo de permisos contra los `@RequirePermissions` REALES de
// los controllers. Es el candado que faltaba: el catálogo vivía como constante
// y nadie verificaba que describiera los permisos que el sistema exige de
// verdad, así que las dos puntas driftearon en silencio (4 drifts encontrados
// a mano el 2026-07-27).
//
// Por qué un test y no una migración de BD: mover el catálogo a la base cambia
// un error de compilación por uno de runtime. El problema nunca fue DÓNDE vive
// el catálogo sino que nadie lo confrontaba contra los decoradores.
//
// El escaneo es estático (lee los .controller.ts). Alternativa descartada:
// levantar el AppModule para leer la metadata con Reflect — arrastra Prisma,
// Redis y el SDK de S3 a un test que no necesita infraestructura.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { CATALOGO_PERMISOS, permisoExisteEnCatalogo } from './catalogo';

const SRC = resolve(__dirname, '../..');

const archivosDeControllers = (dir: string, acc: string[] = []): string[] => {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) archivosDeControllers(ruta, acc);
    else if (ruta.endsWith('.controller.ts')) acc.push(ruta);
  }
  return acc;
};

interface UsoDePermiso {
  readonly key: string;
  readonly archivo: string;
}

// Un decorador cuyos argumentos NO son todos literales string (una constante
// importada, un spread, una interpolación) es invisible para este escaneo. En
// vez de saltearlo en silencio —que haría al test sub-reportar y por lo tanto
// mentir— se lo junta acá y el test falla nombrándolo.
interface DecoradorOpaco {
  readonly fragmento: string;
  readonly archivo: string;
}

const escanear = (): { usos: UsoDePermiso[]; opacos: DecoradorOpaco[] } => {
  const usos: UsoDePermiso[] = [];
  const opacos: DecoradorOpaco[] = [];

  for (const archivo of archivosDeControllers(SRC)) {
    const contenido = readFileSync(archivo, 'utf8');
    const rel = relative(SRC, archivo);

    for (const match of contenido.matchAll(/@RequirePermissions\(([^)]*)\)/g)) {
      const args = match[1] ?? '';
      const literales = [...args.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]!);

      // Si al sacar los literales queda algo que no sea separador, hay un
      // argumento que el escaneo no puede leer.
      const resto = args.replace(/['"][^'"]+['"]/g, '').trim();
      if (resto.replace(/,/g, '').trim() !== '') {
        opacos.push({ fragmento: match[0], archivo: rel });
        continue;
      }

      for (const key of literales) usos.push({ key, archivo: rel });
    }
  }

  return { usos, opacos };
};

const { usos, opacos } = escanear();
const keysUsadas = new Set(usos.map((u) => u.key));

// Permisos que el catálogo declara y que NINGÚN endpoint exige hoy. La lista es
// EXACTA en las dos direcciones: si un permiso de acá empieza a usarse, el test
// obliga a sacarlo. Eso es lo que impide que se convierta en un depósito que
// nadie limpia — cuando se construya Ventas/Compras, las 12 entradas de esos
// módulos tienen que desaparecer de acá o el test falla.
const DECLARADOS_SIN_ENDPOINT: readonly string[] = [
  // --- Gate exclusivo del frontend (no hay endpoint que lo exija) ---
  // Gatea el ítem de menú y la ruta /settings/empresa. La lectura del backend
  // (`GET /tenants/current`) no está gateada por permiso.
  'organizacion.configuracion.read',

  // --- Módulos adelantados: el permiso existe, el módulo todavía no ---
  'contabilidad.dashboard.read',
  'contabilidad.ventas.read',
  'contabilidad.ventas.create',
  'contabilidad.ventas.update',
  'contabilidad.ventas.delete',
  'contabilidad.ventas.post',
  'contabilidad.ventas.void',
  'contabilidad.compras.read',
  'contabilidad.compras.create',
  'contabilidad.compras.update',
  'contabilidad.compras.delete',
  'contabilidad.compras.post',
  'contabilidad.compras.void',
  // El cierre mensual se ejecuta hoy vía `contabilidad.periodos.cerrar`; estos
  // dos quedaron de un diseño anterior y no los exige ningún endpoint.
  'contabilidad.cierre-mensual.read',
  'contabilidad.cierre-mensual.execute',

  // --- Operaciones que el producto decidió NO tener ---
  // Granja no expone borrado de lotes ni edición de movimientos (el flujo es
  // borrar y volver a cargar).
  'granja.lotes.delete',
  'granja.movimientos.update',
  // El asistente IA de granja todavía no tiene endpoint.
  'granja.chat.interact',
];

describe('catálogo de permisos vs @RequirePermissions de los controllers', () => {
  it('escanea al menos un controller (el escaneo mismo no está roto)', () => {
    expect(archivosDeControllers(SRC).length).toBeGreaterThan(10);
    expect(usos.length).toBeGreaterThan(50);
  });

  it('no hay decoradores con argumentos que el escaneo no pueda leer', () => {
    const detalle = opacos.map((o) => `${o.archivo}: ${o.fragmento}`);
    expect(detalle).toEqual([]);
  });

  it('todo permiso exigido por un controller existe en el catálogo', () => {
    // Un permiso fuera del catálogo NO se puede asignar a un rol personalizado
    // (`custom-roles.service.validatePermissions` lo rechaza), así que el
    // endpoint queda accesible sólo para OWNER/ADMIN vía el wildcard '*' del
    // resolver: indelegable para siempre y sin ningún error visible.
    const huerfanos = usos
      .filter((u) => !permisoExisteEnCatalogo(u.key))
      .map((u) => `${u.key} (exigido en ${u.archivo})`);

    expect(huerfanos).toEqual([]);
  });

  it('los permisos del catálogo sin endpoint son exactamente los declarados', () => {
    const sinEndpoint = CATALOGO_PERMISOS.map((p) => p.key)
      .filter((key) => !keysUsadas.has(key))
      .sort();

    expect(sinEndpoint).toEqual([...DECLARADOS_SIN_ENDPOINT].sort());
  });
});
