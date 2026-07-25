/**
 * Test de arquitectura — REQ-CB-15 escenario 2 (tarea 6.5 del change
 * `conciliacion-bancaria`).
 *
 * Congela la separación entre `conciliacion-bancaria/` y el núcleo contable:
 * el módulo SOLO LEE de `comprobantes/` (vía `LineasCuentaReaderPort`) y NUNCA
 * escribe `Comprobante` ni `LineaComprobante`.
 *
 * Por qué existe: hoy la propiedad se cumple por disciplina, no por
 * construcción — no hay nada que avise si alguien agrega una escritura. El
 * disparador previsible es el slice 6 diferido ("crear el asiento de
 * comisión/ITF desde la conciliación"): la solución correcta es que el
 * frontend navegue al formulario de comprobantes con campos prellenados, NO
 * que este módulo cree el asiento por su cuenta. Sin este test, romper la
 * separación falla en silencio y se descubre meses después, cuando el módulo
 * de lectura ya escribe.
 *
 * Las tres vías por las que podría filtrarse una escritura, y cómo se cierran:
 *   1. Prisma directo sobre los modelos       → chequeo de métodos de escritura
 *   2. SQL crudo sobre sus tablas             → chequeo de `$executeRaw`
 *   3. Un writer-port/servicio de comprobantes → whitelist de imports
 */

import * as fs from 'fs';
import * as path from 'path';

/** Métodos de escritura del cliente Prisma (todo lo que no sea `find*`/`count`). */
const METODOS_ESCRITURA = [
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
] as const;

/** Modelos del núcleo contable que este módulo tiene prohibido escribir. */
const MODELOS_PROHIBIDOS = ['comprobante', 'lineaComprobante'] as const;

/** Tablas (`@@map`) de esos modelos, para el chequeo de SQL crudo. */
const TABLAS_PROHIBIDAS = ['comprobantes', 'lineas_comprobante'] as const;

/**
 * Únicos imports permitidos hacia `comprobantes/`. Ambos son de solo lectura:
 * el port define un reader (sin métodos de escritura) y el módulo es el LEAF
 * que lo provee. Agregar algo acá es una decisión de arquitectura consciente,
 * no un descuido.
 */
const IMPORTS_PERMITIDOS_DE_COMPROBANTES: readonly string[] = [
  '@/comprobantes/ports/lineas-cuenta-reader.port',
  '@/comprobantes/lineas-cuenta-reader.module',
];

const RE_ESCRITURA_PRISMA = new RegExp(
  `\\b(${MODELOS_PROHIBIDOS.join('|')})\\b\\s*\\.\\s*(${METODOS_ESCRITURA.join('|')})\\b`,
  'g',
);

const RE_IMPORT = /(?:from\s*|require\(\s*)['"]([^'"]+)['"]/g;

const RE_IMPORT_DE_COMPROBANTES = /(?:^@\/comprobantes$|(?:^|\/)comprobantes\/)/;

/** Rutas absolutas de todos los `.ts` bajo `dir`, recursivo. */
function walkSync(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkSync(fullPath);
    if (entry.isFile() && entry.name.endsWith('.ts')) return [fullPath];
    return [];
  });
}

/**
 * Archivos de PRODUCCIÓN del módulo. Se excluyen los tests y sus fixtures:
 * los `*.integration.spec.ts` SÍ crean comprobantes con Prisma, y eso es
 * legítimo — necesitan datos contables reales contra los que conciliar.
 */
function archivosDeProduccion(dir: string): string[] {
  return walkSync(dir).filter(
    (f) => !f.endsWith('.spec.ts') && !f.split(path.sep).includes('__fixtures__'),
  );
}

describe('Arquitectura: conciliacion-bancaria solo lee del núcleo contable (REQ-CB-15)', () => {
  // __dirname = src/conciliacion-bancaria. Relativo a __dirname para no
  // depender del cwd desde el que se invoque Jest.
  const moduloDir = __dirname;
  const srcDir = path.resolve(__dirname, '..');

  const archivos = archivosDeProduccion(moduloDir);
  const relativo = (f: string) => path.relative(srcDir, f);

  it('encuentra archivos de producción para analizar', () => {
    // Sin esto, un rename de carpeta dejaría los tres chequeos de abajo
    // pasando en vacío: verdes, inútiles y silenciosos.
    expect(archivos.length).toBeGreaterThan(0);
  });

  it('ningún archivo escribe Comprobante ni LineaComprobante vía Prisma', () => {
    const violaciones = archivos.flatMap((f) => {
      const contenido = fs.readFileSync(f, 'utf-8');
      return [...contenido.matchAll(RE_ESCRITURA_PRISMA)].map(
        (m) => `${relativo(f)}: ${m[1]}.${m[2]}(...)`,
      );
    });

    expect(violaciones).toEqual([]);
  });

  it('ningún archivo toca las tablas del núcleo contable vía SQL crudo', () => {
    // `$queryRaw` también cuenta (D9 del change `verificador-movimientos-
    // bancarios`): un SELECT crudo contra `comprobantes` esquivaría el port
    // de lectura y su filtro de tenant. El módulo SÍ puede usar raw contra
    // sus propias tablas (`movimientos_bancarios`) — lo prohibido es la
    // combinación raw + tabla del núcleo contable.
    const violaciones = archivos
      .map((f) => ({ f, contenido: fs.readFileSync(f, 'utf-8') }))
      .filter(
        ({ contenido }) =>
          (contenido.includes('$executeRaw') || contenido.includes('$queryRaw')) &&
          TABLAS_PROHIBIDAS.some((tabla) => contenido.includes(tabla)),
      )
      .map(({ f }) => relativo(f));

    expect(violaciones).toEqual([]);
  });

  it('solo importa de comprobantes/ los artefactos de lectura permitidos', () => {
    const violaciones = archivos.flatMap((f) => {
      const contenido = fs.readFileSync(f, 'utf-8');
      return [...contenido.matchAll(RE_IMPORT)]
        .map((m) => m[1] as string)
        .filter((spec) => RE_IMPORT_DE_COMPROBANTES.test(spec))
        .filter((spec) => !IMPORTS_PERMITIDOS_DE_COMPROBANTES.includes(spec))
        .map((spec) => `${relativo(f)}: importa '${spec}'`);
    });

    expect(violaciones).toEqual([]);
  });
});
