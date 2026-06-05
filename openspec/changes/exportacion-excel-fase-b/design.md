# Design: Exportación a Excel — Fase B

> Artifact store: hybrid
> Topic key: `sdd/exportacion-excel-fase-b/design`
> Fecha: 2026-06-05

## 1. Contexto y principio rector

La Fase A dejó una infra cerrada y probada en `frontend/src/lib/export-excel/`:

| Pieza | Firma | Reuso en Fase B |
|-------|-------|-----------------|
| `armarCabeceraFiscal(perfil: EmpresaPerfil): CeldaTexto[][]` | tolera campos null | **sin cambios** |
| `construirHoja(filas: Celda[][]): Promise<Blob>` | `columns` hardcodeado a 7 cols | **se parametriza `columns`** |
| `descargarBlob(blob, nombre): void` | — | **sin cambios** |
| `generarNombreArchivo(informe, rango): string` | — | **sin cambios** |
| `formatearFechaCelda(iso): string` | split de string, sin Date | **sin cambios** (Mayor) |
| `parsearMontoCelda(monto): number` | boundary string→Number | **sin cambios** |
| `Celda` = `CeldaTexto \| CeldaNumero` | — | **sin cambios** |

**Principio rector:** Fase B NO reinventa nada de la infra. Solo agrega (a) UN concepto nuevo
(el aplanado de árbol jerárquico), (b) tres mapeos `informe → Celda[][]` y (c) tres botones,
todos espejando exactamente la estructura del Libro Diario de la Fase A
(`lib/exportar-libro-diario.ts` + `components/boton-exportar-libro-diario.tsx`).

## 2. Decisión clave: el helper de aplanado de árbol

### 2.1 Por qué un helper, y qué NO es

Balance General y Estado de Resultados comparten la **forma estructural** `Sección → Subsección
→ Cuenta` (3 niveles). Pero NO son el mismo response:

| | Balance | Estado de Resultados |
|---|---|---|
| Secciones | `activo`, `pasivo`, `patrimonio` (3, nombradas) | `ingreso`, `egreso` (2, nombradas) |
| Cuenta: `cuentaId` | `string \| null` (línea sintética) | `string` (non-null) |
| Cuenta: `esSintetica` | **sí** existe | **no** existe |
| Cuenta: `esContraria` | sí | sí |
| Pie del informe | cuadre: `cuadra`/`diferenciaBob`/totales A/P/Pat | resultado: `resultadoEjercicioBob`/`esGanancia`/totales I/E |

Conclusión: el helper aplana **una lista de secciones homogéneas** (`SeccionArbol[]`), NO el
response entero. Cada informe (a) extrae sus secciones a esa forma común, (b) llama al helper
para las filas de detalle, (c) arma su propio **pie** (cuadre o resultado) FUERA del helper.
Así el helper queda agnóstico de las diferencias y no hay `if (esBalance)` adentro.

### 2.2 Tipos del helper (estructura común mínima)

El helper define tipos estructurales propios (NO importa los DTOs de feature — invierte la
dependencia: las features adaptan sus DTOs a estos tipos). Esto evita que `lib/` dependa de
`features/`.

```ts
// frontend/src/lib/export-excel/aplanar-arbol.ts

/** Cuenta hoja del árbol. codigoInterno nullable (línea sintética del Balance). */
export interface CuentaArbol {
  nombre: string;
  codigoInterno: string | null;
  saldoBob: string;          // string decimal del backend (§4.5)
  esContraria?: boolean;     // opcional: Balance/Resultados lo traen; default false
}

export interface SubseccionArbol {
  titulo: string;
  totalBob: string;          // subtotal DEL BACKEND (§4.5, no recalcular)
  cuentas: CuentaArbol[];
}

export interface SeccionArbol {
  titulo: string;
  totalBob: string;          // subtotal DEL BACKEND
  subsecciones: SubseccionArbol[];
}

/**
 * Aplana N secciones (Sección → Subsección → Cuenta) a filas de celdas.
 * Representa la jerarquía por nivel (columna "Nivel"/indentación en la 1ª columna de texto).
 * Emite filas de subtotal de sección y subsección con los totalBob del backend.
 * NO recalcula totales ni saldos.
 */
export function aplanarArbol(secciones: SeccionArbol[]): Celda[][];
```

### 2.3 Representación de la jerarquía en la hoja

Decisión: **indentación por prefijo de texto en la columna "Concepto"** + columna "Saldo (BOB)".
Es lo más simple y portable (write-excel-file no necesita merges ni outline). Formato de cada fila:

| Nivel | Columna "Concepto" | Columna "Saldo (BOB)" | Tipo |
|-------|--------------------|-----------------------|------|
| Sección | `ACTIVO` (sin sangría, mayúscula) | `totalBob` sección | numero |
| Subsección | `  Activo Corriente` (1 sangría) | `totalBob` subsección | numero |
| Cuenta | `    1101 Caja` (2 sangrías; código + nombre; `(contraria)` si aplica) | `saldoBob` cuenta | numero |

- La sangría se hace con espacios (`'  '.repeat(nivel)`), determinística, no depende de Excel.
- Si `codigoInterno` es null (línea sintética), se omite el código: `    Caja` sin código.
- Si `esContraria`, se anexa el sufijo de texto `(contraria)` al nombre (el signo lo da el backend en `saldoBob`).
- **Alternativa descartada:** una columna numérica "Nivel" (1/2/3). Más pobre para el contador que lee la hoja; la indentación textual es la convención de los estados financieros impresos.

### 2.4 Por qué el helper NO arma cabecera de columnas ni cabecera fiscal ni pie

Single responsibility: `aplanarArbol` devuelve SOLO las filas de detalle del árbol. El mapeo de
cada informe arma: `[...armarCabeceraFiscal(perfil), filaEncabezadosColumna, ...aplanarArbol(secciones), filaPie]`.
Igual que el Diario compone cabecera fiscal + encabezados + detalle + totales en su mapeo.

## 3. Mapeo por informe

### 3.1 Libro Mayor — `features/libro-mayor/lib/exportar-libro-mayor.ts`

Patrón del Diario (aplanar lo anidado), **sin** el helper de árbol (es 2 niveles: cuenta →
movimientos). Columnas: `Fecha | Comprobante | Glosa | Debe | Haber | Saldo corriente`.

```ts
export function mapearLibroMayorAFilas(
  response: LibroMayorResponse,
  perfil: EmpresaPerfil,
): Celda[][]
```

Estructura de salida:
1. Cabecera fiscal (`armarCabeceraFiscal`).
2. Fila de encabezados de columna.
3. Por cada `cuenta`:
   - Una **fila de cabecera de cuenta**: `código + nombre + naturaleza` en texto; `saldoInicialBob`, `totalDebeBob`, `totalHaberBob`, `saldoFinalBob` como celdas numéricas (todos del backend).
   - Por cada `movimiento`: fecha (`formatearFechaCelda(m.fechaContable)`), `numeroComprobante ?? ''`, `glosaLinea ?? glosa ?? ''`, `debeBob`, `haberBob`, `saldoCorrienteBob` (numérico, del backend), + marca `"Anulado"` si `m.anulado`.
4. Fila de **total general**: `totalDebeBob`/`totalHaberBob` del response (sin recálculo).

Notas:
- `saldoCorrienteBob` SE ESCRIBE TAL CUAL (§4.5) — NUNCA se acumula debe/haber en cliente.
- Anulados: misma marca textual que el Diario.

### 3.2 Balance General — `features/balance-general/lib/exportar-balance-general.ts`

```ts
export function mapearBalanceGeneralAFilas(
  response: BalanceGeneralResponse,
  perfil: EmpresaPerfil,
): Celda[][]
```

1. Cabecera fiscal.
2. Encabezados de columna (`Concepto | Saldo (BOB)`).
3. `aplanarArbol(adaptarSeccionesBalance(response))` donde `adaptarSeccionesBalance` mapea
   `[response.activo, response.pasivo, response.patrimonio]` a `SeccionArbol[]` (los campos ya
   casan: `titulo`, `totalBob`, `subsecciones[].{titulo,totalBob,cuentas}`, `cuentas[].{nombre,codigoInterno,saldoBob,esContraria}`).
4. Fila(s) de **cuadre**: `Total Activo` = `totalActivoBob`; `Total Pasivo + Patrimonio` =
   `totalPasivoBob`/`totalPatrimonioBob`; estado `cuadra ? 'El balance cuadra' : 'No cuadra · diferencia <diferenciaBob>'`.
   **No se suma Pasivo + Patrimonio en el archivo** — se escriben los totales y el `cuadra`/`diferenciaBob` del backend.

Edge: `CuentaBalance.cuentaId` puede ser null y `esSintetica` true. El helper NO usa `cuentaId`
ni `esSintetica` (solo `nombre`/`codigoInterno`/`saldoBob`/`esContraria`), así que la línea
sintética se aplana sin problema (código null → se omite).

### 3.3 Estado de Resultados — `features/estado-resultados/lib/exportar-estado-resultados.ts`

```ts
export function mapearEstadoResultadosAFilas(
  response: EstadoResultadosResponse,
  perfil: EmpresaPerfil,
): Celda[][]
```

1. Cabecera fiscal.
2. Encabezados de columna (`Concepto | Saldo (BOB)`).
3. `aplanarArbol(adaptarSeccionesResultados(response))` con `[response.ingreso, response.egreso]`.
   `CuentaResultados` NO tiene `esSintetica` ni `codigoInterno` nullable, pero SÍ tiene
   `codigoInterno: string` y `esContraria`. El adaptador pasa `codigoInterno` (string) y
   `esContraria`; encaja en `CuentaArbol` sin fricción.
4. Fila de **Resultado del Ejercicio**: `Total Ingreso` = `totalIngresoBob`; `Total Egreso` =
   `totalEgresoBob`; `Resultado del Ejercicio` = `resultadoEjercicioBob` con texto
   `esGanancia ? 'Ganancia' : 'Pérdida'`. Sin recálculo Ingreso − Egreso en cliente.

## 4. Parametrización de `construirHoja`

`construirHoja` hoy:
```ts
export async function construirHoja(filas: Celda[][]): Promise<Blob> {
  // ... columns: [ {width:14}, ... 7 entradas Diario ]
}
```

Cambio retrocompatible:
```ts
const COLUMNS_LIBRO_DIARIO: ColumnaHoja[] = [ /* las 7 actuales */ ];

export interface ColumnaHoja { width: number }

export async function construirHoja(
  filas: Celda[][],
  columns: ColumnaHoja[] = COLUMNS_LIBRO_DIARIO,
): Promise<Blob>
```

- El Diario sigue llamando `construirHoja(filas)` → mismo comportamiento, test Fase A intacto.
- Mayor: 6 columnas. Balance/Resultados: 2 columnas (Concepto ancho + Saldo). Cada botón pasa sus widths.
- `write-excel-file` tolera que `columns.length` no coincida exactamente con el nº de celdas
  por fila (las que faltan toman default). Aun así, cada informe pasa el array correcto.

## 5. Botones (3, idénticos en forma al Diario)

`components/boton-exportar-<informe>.tsx`, copia exacta del `boton-exportar-libro-diario.tsx`:
- Props: `{ data: <Response> | undefined; perfil: EmpresaPerfil | null | undefined; rango: string }`.
- `useState` para `generando`; texto "Generando…" / "Exportar a Excel" (Anti-F-07).
- Fallback de perfil null → objeto con 6 campos null (igual que el Diario).
- `PermissionButton` con el permiso correcto:
  - Libro Mayor → `PERMISSIONS.contabilidad.libroMayor.read`
  - Balance General → `PERMISSIONS.contabilidad.eeff.read`
  - Estado de Resultados → `PERMISSIONS.contabilidad.eeff.read` (mismo permiso, ambos son EEFF)
- `disabled={!data || generando}`.
- Handler: `mapear<Informe>AFilas(data, perfilFiscal)` → `construirHoja(filas, columnsDelInforme)` → `descargarBlob(blob, generarNombreArchivo('<slug>', rango))`.

Slugs de archivo: `libro-mayor`, `balance-general`, `estado-resultados`.

Rango para el nombre:
- Libro Mayor: igual que el Diario (`fechaDesde_fechaHasta` o `periodoFiscalId`).
- Balance General: `response.fechaCorte` (o el `fecha` del filtro).
- Estado de Resultados: `fechaDesde_fechaHasta` del filtro/response.

## 6. Páginas (montaje del botón)

Las 3 páginas montan el botón en el header (espejo de `LibroDiarioPage`):
- Agregar `import { useEmpresa }` y `const { data: empresa } = useEmpresa();`.
- Derivar `rango` (string) según el informe.
- Pasar `data` (ya cargada) + `empresa` + `rango` al botón.

`LibroMayorPage` ya tiene `data` del hook. `BalanceGeneralPage`/`EstadoResultadosPage` también
(`data` del hook). Solo se agrega el botón + `useEmpresa` + el `rango`. El render de las tablas
NO se toca.

> **Gating: nota honesta.** `LibroMayorPage`/`BalanceGeneralPage`/`EstadoResultadosPage` hoy NO
> gatean a nivel de página por permiso (deuda aceptada, igual que el Diario). El botón de export
> SÍ se gatea con `PermissionButton` (UX honesta, §14.7). El candado real sigue siendo el backend.

## 7. Estructura de archivos resultante

```
frontend/src/lib/export-excel/
├── aplanar-arbol.ts            NEW  helper de aplanado 3 niveles
├── aplanar-arbol.test.ts       NEW
├── construir-hoja.ts           MOD  columns opcional
├── index.ts                    MOD  re-exporta aplanarArbol + tipos *Arbol + ColumnaHoja
└── (resto Fase A sin cambios)

frontend/src/features/libro-mayor/
├── lib/exportar-libro-mayor.ts          NEW
├── lib/exportar-libro-mayor.test.ts     NEW
├── components/boton-exportar-libro-mayor.tsx       NEW
└── pages/libro-mayor-page.tsx           MOD

frontend/src/features/balance-general/
├── lib/exportar-balance-general.ts      NEW
├── lib/exportar-balance-general.test.ts NEW
├── components/boton-exportar-balance-general.tsx   NEW
└── pages/balance-general-page.tsx       MOD

frontend/src/features/estado-resultados/
├── lib/exportar-estado-resultados.ts        NEW
├── lib/exportar-estado-resultados.test.ts   NEW
├── components/boton-exportar-estado-resultados.tsx NEW
└── pages/estado-resultados-page.tsx     MOD
```

## 8. Invariantes de dominio que el diseño respeta

- **§4.5**: todo monto (saldos, subtotales, saldo corriente, totales, cuadre, resultado) viene del backend como string y se escribe como celda numérica vía `parsearMontoCelda` — boundary único, sin aritmética. El helper de árbol y los 3 mapeos NUNCA suman columnas.
- **§4.6**: las fechas (solo el Mayor las tiene por fila) usan `formatearFechaCelda` (split de string, sin `Date`/UTC), escritas como texto.
- **§4.7**: los movimientos anulados del Mayor se marcan textualmente; Balance/Resultados usan la `data` ya filtrada por `incluirAnulados` del fetch.
- **§1**: textos, marcas y nombres de archivo en español.

## 9. Estrategia de tests (TDD, Vitest, describe/it en español)

Cada unidad pura primero: helper de aplanado (es compartido → se testea primero), luego cada
mapeo de informe, luego cada botón (gating + disabled). Detalle en `tasks.md`. Patrón de test
calcado del `exportar-libro-diario.test.ts` de la Fase A: factories `crearResponse<Informe>`,
`perfilCompleto`/`perfilTodoNull`, asserts de `toEqual({ type, value })` sobre celdas e índices
de fila conocidos.

## 10. Riesgos de diseño y cómo se neutralizan

| Riesgo de diseño | Neutralización |
|------------------|----------------|
| Acoplar `lib/` a DTOs de `features/` al tipar el helper | El helper define `CuentaArbol`/`SubseccionArbol`/`SeccionArbol` propios; las features ADAPTAN sus DTOs a esos tipos. Dependencia invertida (features → lib), nunca al revés. |
| Meter `if (esBalance)` dentro del helper | El pie (cuadre vs resultado) se arma FUERA del helper, en cada mapeo. El helper solo aplana secciones homogéneas. |
| `esSintetica`/`cuentaId` null de Balance rompen el helper genérico | El helper no usa esos campos; solo `nombre`/`codigoInterno`/`saldoBob`/`esContraria`. Test con código null. |
| Romper el contrato de `construirHoja` de Fase A | `columns` es parámetro OPCIONAL con default = los 7 widths actuales; el test de Fase A no cambia. |
| Confundir el permiso de los EEFF | Balance y Resultados comparten `contabilidad.eeff.read` (verificado en `permissions.ts`); el Mayor usa `contabilidad.libro-mayor.read`. Keys vía `PERMISSIONS.*`. |
