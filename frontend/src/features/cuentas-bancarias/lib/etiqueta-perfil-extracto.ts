import type { PerfilExtracto, PerfilExtractoDescriptor } from '@/types/api';

/**
 * Etiqueta user-facing de un perfil de extracto: `"Banco Sol — Excel (.xlsx)"`.
 *
 * Reemplaza al catálogo estático `PERFIL_EXTRACTO_OPTIONS`, que duplicaba en el
 * frontend los nombres de banco que el backend ya deriva del registro de
 * parsers (`GET /api/cuentas-bancarias/perfiles`). Sumar un banco es agregar su
 * dialecto en el backend; acá no hay nada que tocar.
 */
export function etiquetaPerfilExtracto(descriptor: PerfilExtractoDescriptor): string {
  return `${descriptor.banco} — ${descriptor.formato}`;
}

/**
 * Índice `perfil -> etiqueta` para renderizar listados. El fallback al valor
 * crudo del enum lo resuelve el caller: mientras el catálogo carga (o si un
 * perfil quedara sin descriptor) es preferible mostrar `BANCOSOL_XLSX` que una
 * celda vacía.
 */
export function indiceEtiquetasPerfil(
  descriptores: readonly PerfilExtractoDescriptor[] | undefined,
): Partial<Record<PerfilExtracto, string>> {
  const indice: Partial<Record<PerfilExtracto, string>> = {};
  for (const d of descriptores ?? []) {
    indice[d.perfil] = etiquetaPerfilExtracto(d);
  }
  return indice;
}
