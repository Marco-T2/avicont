/**
 * Espera activa (polling) para escrituras ASÍNCRONAS fire-and-forget.
 *
 * ## Por qué existe
 *
 * `PlatformAuditInterceptor` escribe `platform_audit` con `void` — devuelve la
 * respuesta HTTP sin esperar el INSERT. Lo mismo hace el tap de
 * `ImpersonationAction`. Un test que consulta la fila justo después del request
 * corre contra una carrera: si la escritura no aterrizó todavía, el `findFirst`
 * devuelve `null` y el test falla **sin que haya nada roto**.
 *
 * El patrón que había en su lugar era un sleep fijo:
 *
 * ```ts
 * await new Promise((r) => setTimeout(r, 150));   // ❌
 * ```
 *
 * Eso es flaky por construcción: 150 ms alcanzan en una laptop ociosa y no
 * alcanzan en un runner de CI cargado. Falló de verdad el 2026-07-29 en
 * `packs-entitlement-admin.e2e-spec.ts`, sobre un PR que sólo tocaba
 * documentos — el mismo commit re-corrido dio verde.
 *
 * Y el falso rojo no es el peor efecto: una fila que aterriza **después** de la
 * consulta queda viva para el `beforeEach` siguiente y contamina al test
 * vecino, que es un fallo mucho más difícil de leer.
 *
 * ## Por qué polling y no "esperar más"
 *
 * Subir el sleep a 2 s cambiaría el flake por lentitud garantizada: **todos**
 * los tests pagarían el peor caso. El polling paga el caso real (en la práctica
 * uno o dos intentos) y sólo se estira cuando la máquina está cargada, que es
 * exactamente cuando hace falta.
 *
 * ## Contrato deliberado: NO lanza
 *
 * Al agotar los intentos devuelve `null` / `[]` en vez de tirar. Así el
 * `expect(fila).not.toBeNull()` del test sigue siendo quien falla, con el mismo
 * mensaje de antes: el helper cambia **cuánto se espera**, nunca **qué se
 * afirma**. Un helper que lanzara su propio error convertiría un fallo de
 * aserción legible en un stack trace del helper.
 *
 * Precedente: `src/audit/platform-audit.interceptor.spec.ts` ya resolvió esto
 * con un `waitForAuditRows` local; esto lo generaliza para los e2e.
 */

/** 100 × 20 ms = 2 s de techo. Mismo presupuesto que el precedente. */
const INTENTOS_DEFAULT = 100;
const INTERVALO_MS_DEFAULT = 20;

export interface WaitForOpts {
  attempts?: number;
  intervalMs?: number;
}

/**
 * Ejecuta `find` hasta que devuelva algo distinto de `null`/`undefined`.
 *
 * @returns la fila encontrada, o `null` si se agotaron los intentos.
 */
export async function waitForRow<T>(
  find: () => Promise<T | null>,
  { attempts = INTENTOS_DEFAULT, intervalMs = INTERVALO_MS_DEFAULT }: WaitForOpts = {},
): Promise<T | null> {
  for (let intento = 0; intento < attempts; intento++) {
    const fila = await find();
    if (fila !== null && fila !== undefined) return fila;
    await esperar(intervalMs);
  }
  return null;
}

/**
 * Ejecuta `find` hasta que devuelva al menos `minCount` filas.
 *
 * @returns las filas encontradas; si se agotaron los intentos devuelve el
 * último resultado (posiblemente corto), para que el `expect` del test informe
 * cuántas llegaron de verdad en vez de un array vacío engañoso.
 */
export async function waitForRows<T>(
  find: () => Promise<T[]>,
  minCount: number,
  { attempts = INTENTOS_DEFAULT, intervalMs = INTERVALO_MS_DEFAULT }: WaitForOpts = {},
): Promise<T[]> {
  let ultimo: T[] = [];
  for (let intento = 0; intento < attempts; intento++) {
    ultimo = await find();
    if (ultimo.length >= minCount) return ultimo;
    await esperar(intervalMs);
  }
  return ultimo;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
