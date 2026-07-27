// Tipos de `rutas-gate.mjs`.
//
// El módulo es `.mjs` a propósito: lo consume `gate-ui.mjs`, que corre en Node
// pelado sin bundler ni loader de TS. Pero también lo importa el guard anti-drift
// (`src/routes/rutas-gate.test.ts`), que sí pasa por `tsc -b` en el build.
// Sin estas declaraciones ese import entra como `any` implícito y rompe el build
// con TS7016 — que es exactamente lo que pasó al escribirlo.

export declare const VIEWPORTS: readonly number[];

export declare const RUTAS_GATE: readonly string[];

/** Ruta excluida → motivo por el que el gate no puede evaluarla. */
export declare const RUTAS_EXCLUIDAS: Readonly<Record<string, string>>;
