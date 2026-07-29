/**
 * Normalizadores puros del módulo `items`. Sin efectos — no tocan BD, no
 * inyectan nada — para que el service y los tests compartan las mismas
 * reglas (CLAUDE.md §3.5).
 *
 * La unicidad del código requiere BD y vive en `items.service.ts`.
 */

/**
 * Normaliza el código del ítem. Corre ANTES de persistir Y antes de comparar
 * (B-15): si sólo corriera al persistir, el guard de unicidad compararía el
 * string crudo del cliente contra el normalizado de la BD, no encontraría el
 * duplicado, y el choque llegaría al constraint como un 500 en vez del 409
 * amigable.
 *
 * 1. `trim`; si queda vacío (o viene null/undefined) → `null`. El null es lo
 *    que hace que el UNIQUE PARCIAL deje convivir N ítems sin código —
 *    Postgres no agrupa NULLs, pero sí agruparía strings vacíos.
 * 2. Mayúsculas. Divergencia DELIBERADA respecto de `normalizarDocumento` de
 *    contactos, que no toca el case porque un documento son dígitos: un
 *    código alfanumérico donde `"P-01"` y `"p-01 "` fueran dos ítems
 *    distintos es una trampa para el usuario, no una feature.
 *
 * Lo que NO hace: tocar espacios internos ni separadores. Normalizar de más
 * fusionaría códigos genuinamente distintos y el rechazo sería inexplicable.
 */
export function normalizarCodigo(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  return trimmed.length === 0 ? null : trimmed.toUpperCase();
}

/**
 * Trimea strings opcionales sin tocar el case. Para `unidadMedida`, que es
 * texto que el usuario lee — "kg" no se muestra como "KG".
 */
export function normalizarOpcional(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  return trimmed.length === 0 ? null : trimmed;
}
