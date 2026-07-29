// Confronta el catálogo de permisos contra el enforcement REAL del backend, en
// sus TRES puntas:
//   1. Los `@RequirePermissions` de los controllers (guard declarativo).
//   2. Los `rbac.hasPermission(...)` invocados desde services — permisos cuya
//      exigencia depende del estado del recurso (ej. edit-posted, §4.3) y que
//      por eso no viven en un decorator.
//   3. Los templates de rol de `prisma/seed.ts`, que Prisma escribe salteando
//      `custom-roles.service.validatePermissions`.
//
// Es el candado que faltaba: el catálogo vivía como constante y nadie
// verificaba que describiera los permisos que el sistema exige de verdad, así
// que las dos puntas driftearon en silencio (4 drifts encontrados a mano el
// 2026-07-27). La versión original solo escaneaba controllers — y así se
// escapó `contabilidad.asientos.edit-posted`: enforceado desde
// ComprobantesService y otorgado por el seed, pero fuera del catálogo, o sea
// imposible de asignar a un rol creado desde la UI (validatePermissions lo
// rechaza). El seed además arrastraba dos fantasmas que NADIE enforceaba
// (`periodos.create`, `cierre-mensual.create`). Cerrado el 2026-07-28.
//
// Por qué un test y no una migración de BD: mover el catálogo a la base cambia
// un error de compilación por uno de runtime. El problema nunca fue DÓNDE vive
// el catálogo sino que nadie lo confrontaba contra los decoradores.
//
// El escaneo es estático (lee los .ts como texto). Alternativa descartada:
// levantar el AppModule para leer la metadata con Reflect — arrastra Prisma,
// Redis y el SDK de S3 a un test que no necesita infraestructura.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { CATALOGO_PERMISOS, permisoExisteEnCatalogo } from './catalogo';

const SRC = resolve(__dirname, '../..');
const SEED = resolve(__dirname, '../../../prisma/seed.ts');

const listarArchivos = (
  dir: string,
  filtro: (ruta: string) => boolean,
  acc: string[] = [],
): string[] => {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) listarArchivos(ruta, filtro, acc);
    else if (filtro(ruta)) acc.push(ruta);
  }
  return acc;
};

const archivosDeControllers = (): string[] =>
  listarArchivos(SRC, (r) => r.endsWith('.controller.ts'));

// Todo .ts de producción: services, guards, interceptors, adapters. Los specs
// quedan afuera (mockean permisos arbitrarios) igual que este propio archivo.
const archivosDeProduccion = (): string[] =>
  listarArchivos(SRC, (r) => r.endsWith('.ts') && !r.endsWith('.spec.ts'));

// Los comentarios pueden mencionar permisos a modo de explicación (y lo hacen:
// comprobantes.service.ts documenta edit-posted en varios JSDoc) — se los saca
// antes de escanear para que no generen usos falsos.
const sinComentarios = (codigo: string): string =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

interface UsoDePermiso {
  readonly key: string;
  readonly archivo: string;
}

// Un call site cuyos argumentos NO incluyen el permiso como literal string
// (una constante importada, un spread, una interpolación) es invisible para
// este escaneo. En vez de saltearlo en silencio —que haría al test
// sub-reportar y por lo tanto mentir— se lo junta acá y el test falla
// nombrándolo.
interface SitioOpaco {
  readonly fragmento: string;
  readonly archivo: string;
}

interface ResultadoEscaneo {
  readonly usosEnControllers: UsoDePermiso[];
  readonly usosEnServices: UsoDePermiso[];
  readonly opacos: SitioOpaco[];
}

const escanear = (): ResultadoEscaneo => {
  const usosEnControllers: UsoDePermiso[] = [];
  const usosEnServices: UsoDePermiso[] = [];
  const opacos: SitioOpaco[] = [];

  for (const archivo of archivosDeControllers()) {
    const contenido = sinComentarios(readFileSync(archivo, 'utf8'));
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

      for (const key of literales) usosEnControllers.push({ key, archivo: rel });
    }
  }

  // Enforcement imperativo: `<lo-que-sea>.hasPermission(userId, tenantId, 'x.y.z')`.
  // Los dos primeros argumentos son siempre identificadores, así que el único
  // literal string del call ES el permiso. Cero literales = permiso pasado por
  // variable → opaco, el test lo nombra en vez de ignorarlo.
  for (const archivo of archivosDeProduccion()) {
    const contenido = sinComentarios(readFileSync(archivo, 'utf8'));
    const rel = relative(SRC, archivo);

    for (const match of contenido.matchAll(/\.hasPermission\(([^)]*)\)/g)) {
      const args = match[1] ?? '';
      const literales = [...args.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]!);

      if (literales.length === 0) {
        opacos.push({ fragmento: match[0], archivo: rel });
        continue;
      }

      for (const key of literales) usosEnServices.push({ key, archivo: rel });
    }
  }

  return { usosEnControllers, usosEnServices, opacos };
};

// Los templates del seed se escriben con Prisma directo, sin pasar por
// validatePermissions: un permiso inventado ahí no revienta en runtime, solo
// deja al rol sembrado con un string muerto que nada exige y nada otorga.
const permisosDelSeed = (): string[] => {
  const contenido = sinComentarios(readFileSync(SEED, 'utf8'));
  return [
    ...new Set(
      [...contenido.matchAll(/'([a-z][a-z0-9-]*\.[a-z0-9-]+\.[a-z0-9-]+)'/g)].map((m) => m[1]!),
    ),
  ];
};

const { usosEnControllers, usosEnServices, opacos } = escanear();
const usos = [...usosEnControllers, ...usosEnServices];
const keysUsadas = new Set(usos.map((u) => u.key));

// Permisos que el catálogo declara y que NINGÚN endpoint ni service exige hoy.
// La lista es EXACTA en las dos direcciones: si un permiso de acá empieza a
// usarse, el test obliga a sacarlo. Eso es lo que impide que se convierta en un
// depósito que nadie limpia — cuando se construya Ventas/Compras, las 12
// entradas de esos módulos tienen que desaparecer de acá o el test falla.
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
  // Módulo comercial (change `ventas-piloto`): el catálogo se declaró entero
  // en la Fase 1 —schema y RBAC juntos— y los controllers llegan en las
  // fases 4 (ventas) y 5 (cobros). Cada grupo sale de esta lista cuando
  // aterriza SU controller, no antes: la aserción es igualdad exacta en las
  // dos direcciones.
  //
  // `contabilidad.items.*` ya salió: su controller aterrizó en la Fase 3.
  'contabilidad.cobros.read',
  'contabilidad.cobros.create',
  'contabilidad.cobros.update',
  'contabilidad.cobros.delete',
  'contabilidad.cobros.post',
  'contabilidad.cobros.void',
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

describe('catálogo de permisos vs enforcement real (controllers + services + seed)', () => {
  it('escanea al menos un controller (el escaneo mismo no está roto)', () => {
    expect(archivosDeControllers().length).toBeGreaterThan(10);
    expect(usosEnControllers.length).toBeGreaterThan(50);
  });

  it('el escaneo de services encuentra el enforcement imperativo conocido', () => {
    // Canario del escáner, no del catálogo: si esto falla porque el último
    // hasPermission con literal desapareció legítimamente (ej. edit-posted
    // migró a un decorator), actualizalo a conciencia — pero si falla con los
    // call sites intactos, el regex del escaneo se rompió y la suite entera
    // estaría pasando sobre nada.
    expect(archivosDeProduccion().length).toBeGreaterThan(100);
    expect(usosEnServices.length).toBeGreaterThanOrEqual(1);
  });

  it('no hay call sites con argumentos que el escaneo no pueda leer', () => {
    const detalle = opacos.map((o) => `${o.archivo}: ${o.fragmento}`);
    expect(detalle).toEqual([]);
  });

  it('todo permiso exigido (decorator o service) existe en el catálogo', () => {
    // Un permiso fuera del catálogo NO se puede asignar a un rol personalizado
    // (`custom-roles.service.validatePermissions` lo rechaza), así que la
    // operación queda accesible sólo para OWNER/ADMIN vía el wildcard '*' del
    // resolver: indelegable para siempre y sin ningún error visible.
    const huerfanos = usos
      .filter((u) => !permisoExisteEnCatalogo(u.key))
      .map((u) => `${u.key} (exigido en ${u.archivo})`);

    expect(huerfanos).toEqual([]);
  });

  it('todo permiso de los templates del seed existe en el catálogo', () => {
    // Guard de la punta 3: el seed escribe roles salteando validatePermissions,
    // así que un permiso fantasma ahí no lo frena nadie más que este test.
    const declarados = permisosDelSeed();
    expect(declarados.length).toBeGreaterThan(30);

    const fantasmas = declarados.filter((key) => !permisoExisteEnCatalogo(key));
    expect(fantasmas).toEqual([]);
  });

  it('los permisos del catálogo sin endpoint son exactamente los declarados', () => {
    const sinEndpoint = CATALOGO_PERMISOS.map((p) => p.key)
      .filter((key) => !keysUsadas.has(key))
      .sort();

    expect(sinEndpoint).toEqual([...DECLARADOS_SIN_ENDPOINT].sort());
  });
});
