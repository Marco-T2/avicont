import type { Cuenta, CuentaTreeNode } from '@/types/api';

/**
 * Sugiere el siguiente código consecutivo al máximo existente bajo el padre.
 *
 * REGLA DEL DOMINIO (ver CLAUDE.md §4.1):
 * - SIEMPRE usa max(último_segmento) + 1. Nunca rellena huecos intencionales.
 * - Las cuentas INACTIVAS también cuentan para el cálculo del máximo — no
 *   reusamos códigos de cuentas desactivadas porque pueden tener movimientos
 *   históricos asociados y el auditor espera ver el código cronológicamente.
 * - Ejemplo: padre 1.1.1 con hijas 001, 002, 005 (inactiva) → sugiere 006,
 *   no 003 ni 004. Los huecos son deliberados (reservas del contador o
 *   códigos de cuentas desactivadas que se respetan).
 *
 * Padding del último segmento: copia la longitud del segmento mayor de las
 * hijas existentes. Si el padre no tiene hijas aún, usa padding 3 por
 * default (convención típica del plan de cuentas boliviano).
 */
export function sugerirCodigoHijo(
  padre: Pick<Cuenta, 'codigoInterno'>,
  hijas: ReadonlyArray<Pick<Cuenta, 'codigoInterno'>>,
): string {
  const prefijo = `${padre.codigoInterno}.`;
  const ultimos = hijas
    .map((h) => {
      if (!h.codigoInterno.startsWith(prefijo)) return null;
      const sufijo = h.codigoInterno.slice(prefijo.length);
      // Solo consideramos las hijas DIRECTAS (sufijo sin puntos). Si una
      // hija tiene su propio árbol (1.1.1.001.05), no cuenta — es nieta.
      if (sufijo.includes('.')) return null;
      const n = parseInt(sufijo, 10);
      if (Number.isNaN(n)) return null;
      return { n, padding: sufijo.length };
    })
    .filter((x): x is { n: number; padding: number } => x !== null);

  if (ultimos.length === 0) {
    // Padre sin hijas directas todavía → primera hija con padding 3 (convención).
    return `${prefijo}001`;
  }

  const maxN = Math.max(...ultimos.map((u) => u.n));
  const maxPadding = Math.max(...ultimos.map((u) => u.padding));
  const next = maxN + 1;
  return `${prefijo}${String(next).padStart(maxPadding, '0')}`;
}

/**
 * Helper: encuentra un nodo en el árbol por id. Usado al preparar el
 * prefill desde el callback del botón "+" — en ese momento solo tenemos
 * la ref del padre, pero si necesitamos sus hijas directas, las sacamos
 * del mismo nodo (CuentaTreeNode.hijas).
 */
export function findNodeById(
  nodes: CuentaTreeNode[],
  id: string,
): CuentaTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNodeById(n.hijas, id);
    if (hit !== null) return hit;
  }
  return null;
}
