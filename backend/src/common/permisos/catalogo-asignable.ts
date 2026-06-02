// Filtrado del catálogo de permisos ASIGNABLE por vertical + packs (eje 2).
//
// El catálogo plano (`CATALOGO_PERMISOS`) lista TODOS los permisos del producto.
// Pero a una org solo se le pueden asignar los permisos que su vertical activo
// y sus packs activos habilitan. Este módulo es PURO (sin Prisma, sin NestJS):
// recibe el contexto resuelto de la org y filtra. El candado real (validación
// en `custom-roles.service`) y la UX (endpoint `permissions`) comparten esta
// lógica. Ver `docs/disenos/packs-eje2.md` §7.
//
// CONVENCIÓN pack → submódulo: la clave del pack ES el prefijo `{modulo}.{submodulo}`
// de sus permisos (ej. pack `contabilidad.adjuntos` → submódulo `adjuntos` →
// permisos `contabilidad.adjuntos.*`). Un submódulo que es clave de un pack solo
// es asignable si ese pack está activo; un submódulo que NO es clave de ningún
// pack es core del vertical (siempre asignable dentro de su vertical).

import type { VerticalPack } from '@prisma/client';

import {
  CATALOGO_PERMISOS,
  catalogoAgrupado,
  type CatalogoAgrupado,
  type PermisoCatalogado,
} from './catalogo';

// Módulos cross-vertical: existen para CUALQUIER org, sin importar el vertical.
const MODULOS_CROSS_VERTICAL = new Set(['organizacion', 'sistema']);

// Mapeo VerticalPack (enum, mayúsculas) → módulo del catálogo (string, minúsculas).
const VERTICAL_A_MODULO: Record<VerticalPack, string> = {
  CONTABILIDAD: 'contabilidad',
  GRANJA: 'granja',
};

export interface ContextoAsignable {
  /** Vertical activo de la org (derivado de los flags de módulo), o null. */
  readonly vertical: VerticalPack | null;
  /** Claves de TODOS los packs del catálogo (la tabla `Pack`). */
  readonly packsCatalogo: readonly string[];
  /** Claves de los packs ACTIVOS de la org. */
  readonly packsActivos: readonly string[];
}

/**
 * Decide si un submódulo `{modulo}.{submodulo}` es asignable en el contexto de
 * una org (su vertical activo + sus packs activos).
 *
 * Reglas (en orden):
 *  1. `organizacion.*` y `sistema.*` → siempre asignables (cross-vertical).
 *  2. Submódulo de OTRO vertical → nunca asignable.
 *  3. Submódulo del vertical activo que es CLAVE de un pack → solo si el pack
 *     está activo.
 *  4. Submódulo del vertical activo que NO es clave de pack → core, siempre.
 */
export function submoduloEsAsignable(
  modulo: string,
  submodulo: string,
  ctx: ContextoAsignable,
): boolean {
  if (MODULOS_CROSS_VERTICAL.has(modulo)) {
    return true;
  }

  const moduloDelVertical = ctx.vertical !== null ? VERTICAL_A_MODULO[ctx.vertical] : null;
  if (modulo !== moduloDelVertical) {
    // Submódulo de otro vertical (o la org no tiene vertical activo).
    return false;
  }

  const clave = `${modulo}.${submodulo}`;
  const esClaveDePack = ctx.packsCatalogo.includes(clave);
  if (esClaveDePack) {
    return ctx.packsActivos.includes(clave);
  }

  // Core del vertical activo: no asociado a ningún pack → siempre asignable.
  return true;
}

/**
 * Filtra el catálogo plano de permisos dejando solo los asignables en el
 * contexto de la org. Usado por el endpoint asignable (UX) y por la validación
 * de `custom-roles` (candado).
 */
export function filtrarCatalogoAsignable(
  catalogo: readonly PermisoCatalogado[],
  ctx: ContextoAsignable,
): PermisoCatalogado[] {
  return catalogo.filter((p) => submoduloEsAsignable(p.modulo, p.submodulo, ctx));
}

/**
 * Conjunto O(1) de claves de permiso asignables en el contexto. Lo consume el
 * candado de `validatePermissions`.
 */
export function clavesAsignables(ctx: ContextoAsignable): Set<string> {
  return new Set(filtrarCatalogoAsignable(CATALOGO_PERMISOS, ctx).map((p) => p.key));
}

/**
 * Vista agrupada (módulo → submódulo) ya filtrada por el contexto de la org.
 * Es lo que sirve el endpoint que alimenta el picker del frontend. Reusa el
 * agrupador existente y descarta módulos/submódulos no asignables (sin dejar
 * grupos vacíos).
 */
export function filtrarCatalogoAgrupadoAsignable(ctx: ContextoAsignable): CatalogoAgrupado[] {
  return catalogoAgrupado()
    .map((grupo) => ({
      modulo: grupo.modulo,
      submodulos: grupo.submodulos.filter((sub) =>
        submoduloEsAsignable(grupo.modulo, sub.submodulo, ctx),
      ),
    }))
    .filter((grupo) => grupo.submodulos.length > 0);
}
