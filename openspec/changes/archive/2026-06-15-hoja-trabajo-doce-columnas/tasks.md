# Tasks — Hoja de Trabajo de 12 columnas (`hoja-trabajo-doce-columnas`)

> Artifact store: hybrid  
> Strict TDD mode: ON — cada test se escribe ROJO antes del código que lo verde.  
> Regresión bloqueante: `domain/balance-comprobacion.spec.ts`, `*.integration.spec.ts` del adapter y `test/balance-comprobacion.e2e-spec.ts` deben permanecer verdes ANTES de avanzar a la tarea siguiente en la que el refactor toca `obtenerSaldosEnRango`.

---

## Área 1 — Domain builder (unit, puro)

> Archivo de spec primero. Implementación solo tras ver el test rojo. Objetivo: 100% cobertura del builder.

- [x] **1.1 [RED] Escribir `domain/hoja-trabajo.spec.ts` — scaffolding y test Par 1 (Sumas)**  
  `describe('construirHojaTrabajo')` en español. Importar el tipo `construirHojaTrabajo` (que aún no existe → compile error = rojo). Caso: cuenta con `debitoOrdinarioBob=1200`, `creditoOrdinarioBob=400` → `sumasDebe="1200.00"`, `sumasHaber="400.00"`. (REQ-HT-03)

- [x] **1.2 [RED] Tests Par 2 — Saldos (mecánica universal)**  
  Tres casos en `hoja-trabajo.spec.ts`: (a) debe > haber → solo `saldoDeudor`; (b) haber > debe → solo `saldoAcreedor`; (c) iguales → ambos `"0.00"`. Verificar que `saldoDeudor` y `saldoAcreedor` nunca son ambos > 0. (REQ-HT-04)

- [x] **1.3 [RED] Tests Par 3 — Ajustes**  
  Caso: cuenta con `debitoAjusteBob=200`, `creditoAjusteBob=0` → `ajustesDebe="200.00"`, `ajustesHaber="0.00"`. Caso: sin AJUSTE → ambas `"0.00"`. (REQ-HT-05)

- [x] **1.4 [RED] Tests Par 4 — Saldos Ajustados**  
  Caso A: sumas dan deudor 800, ajuste debe +100 → `saldoAjustadoDeudor="900.00"`. Caso B: ajuste invierte saldo (deudor 100, ajuste haber 200) → `saldoAjustadoDeudor="0.00"`, `saldoAjustadoAcreedor="100.00"`. Mutuamente excluyentes. (REQ-HT-06)

- [x] **1.5 [RED] Test cuenta solo-ajuste**  
  `sumasDebe=0`, `sumasHaber=0`, `debitoAjusteBob=0`, `creditoAjusteBob=350` → fila presente, `saldoAjustadoAcreedor="350.00"`, columnas Sumas y Saldos en `"0.00"`. (REQ-HT-06, REQ-HT-12)

- [x] **1.6 [RED] Tests routing ER — EGRESO e INGRESO**  
  EGRESO con `saldoAjustadoDeudor=3000` → `erPerdidas="3000.00"`, `erGanancias="0.00"`, BG en `"0.00"`. INGRESO con `saldoAjustadoAcreedor=8000` → `erGanancias="8000.00"`, `erPerdidas="0.00"`, BG en `"0.00"`. (REQ-HT-07)

- [x] **1.7 [RED] Tests routing BG — ACTIVO, PASIVO, PATRIMONIO**  
  ACTIVO normal, `saldoAjustadoDeudor=5000` → `bgActivo="5000.00"`, ER en `"0.00"`. PASIVO, `saldoAjustadoAcreedor=2000` → `bgPasPat="2000.00"`. PATRIMONIO → también `bgPasPat`. Ninguno aporta al ER. (REQ-HT-08)

- [x] **1.8 [RED] Test `esContraria` ACTIVO (D-05)**  
  Cuenta `claseCuenta=ACTIVO`, `naturaleza=ACREEDORA`, `esContraria=true`, `saldoAjustadoAcreedor=1500` → `bgActivo="-1500.00"`, `bgPasPat="0.00"`. Verificar que al totalizar la columna `bgActivo`, el total baja en 1500. (REQ-HT-08)

- [x] **1.9 [RED] Test `esContraria` INGRESO (D-05, ER)**  
  Cuenta `claseCuenta=INGRESO`, `naturaleza=DEUDORA`, `esContraria=true`, `saldoAjustadoDeudor=500` → `erGanancias="-500.00"`. (REQ-HT-07, D-05)

- [x] **1.10 [RED] Test carry-over utilidad**  
  `Σerganancia=10000`, `Σerperdidas=7000` → fila sintética con `erPerdidas="3000.00"`, `bgPasPat="3000.00"`, `erGanancias="0.00"`, `bgActivo="0.00"`. Post carry-over: `ΣerPerdidas=ΣerGanancias=10000`, BG cuadra. `esSintetica=true`, `cuentaId=null`, `codigoInterno=null`, `nombre="Utilidad del Ejercicio"`. (REQ-HT-09)

- [x] **1.11 [RED] Test carry-over pérdida**  
  `Σerperdidas=9000`, `Σerganancia=5000` → fila con `erGanancias="4000.00"`, `bgActivo="4000.00"`. Post carry-over: `ΣerPerdidas=ΣerGanancias=9000`, BG cuadra. `nombre="Pérdida del Ejercicio"`. (REQ-HT-09)

- [x] **1.12 [RED] Test carry-over cero omitido**  
  `Σerganancia=Σerperdidas` → fila sintética OMITIDA. `lineas` contiene solo las de detalle. (REQ-HT-09, §4.6 design)

- [x] **1.13 [RED] Tests 6 cuadres (REQ-HT-10)**  
  Caso balanceado → los 6 `cuadra*=true`, `cuadra=true`, diferencias `"0.00"`. Caso desbalanceado artificial (introducir un saldo huérfano de 100 en sumasDebe sin contraparte) → `cuadraSumas=false`, `cuadra=false`, `diferenciaSumas="100.00"`.

- [x] **1.14 [RED] Test tolerancia ±0.01**  
  Diferencia de 0.01 entre lados → `cuadraSumas=true`. Diferencia 0.02 → `cuadraSumas=false`. (REQ-HT-10, §4.1)

- [x] **1.15 [RED] Test `cuentasNaturalezaOpuesta` sobre saldo ajustado**  
  Cuenta `naturaleza=DEUDORA` con `saldoAjustadoAcreedor=200` → aparece en `cuentasNaturalezaOpuesta`; totales sin cambio. Todas normales → lista vacía. (REQ-HT-18)

- [x] **1.16 [RED] Tests robustez**  
  Cuenta huérfana (no está en estructura) → ignorada, sin error. Los 4 agregados en cero → fila descartada. `saldosSeparados=[]` → `lineas=[]`, totales `"0.00"`, `cuadra=true`. (REQ-HT-12, REQ-HT-19, REQ-HT-20)

- [x] **1.17 [RED] Test orden por `codigoInterno` ASC + carry-over al final**  
  Cuentas desordenadas `5101`, `1101`, `2101` → salen `1101`, `2101`, `5101`, fila sintética al final. (REQ-HT-13)

- [x] **1.18 [GREEN] Crear `domain/hoja-trabajo-errors.ts`** con las 4 clases de error (`extends InvalidStateError`) y sus codes `REPORTES_HOJA_TRABAJO_*` (RANGO_REQUERIDO, RANGO_AMBIGUO, RANGO_INVALIDO, PERIODO_NO_ENCONTRADO). Spec `domain/hoja-trabajo-errors.spec.ts` (espejo de `balance-comprobacion-errors.spec.ts`). (D-06, REQ-HT-01, REQ-HT-02)

- [x] **1.19 [GREEN] Implementar `domain/hoja-trabajo.ts`** — función `construirHojaTrabajo(params: ConstruirHojaTrabajoParams): HojaTrabajoResult` + todos los tipos de salida (`LineaHojaTrabajoCalculada`, `HojaTrabajoResult`, `TotalesHojaTrabajoCalculada`, `CuadresHojaTrabajo`). Incluir helper privado `clasificarParaSecciones(cuenta, saldoAjDeudor, saldoAjAcreedor)` que centraliza §4.4 + D-05. Todos los tests del área 1 deben pasar verde. (D-04, D-05)

---

## Área 2 — Port (extensión sin romper contratos existentes)

- [x] **2.1 Añadir `SaldoCuentaSeparadoRow` a `ports/eeff-saldos-reader.port.ts`**  
  Interfaz con 5 campos (`cuentaId: string`, `debitoOrdinarioBob: Decimal`, `creditoOrdinarioBob: Decimal`, `debitoAjusteBob: Decimal`, `creditoAjusteBob: Decimal`). Copiar el JSDoc completo del design §2.1. (D-01, REQ-HT-21)

- [x] **2.2 Añadir método abstracto `obtenerSaldosEnRangoSeparandoAjustes` al port**  
  Firma: `abstract obtenerSaldosEnRangoSeparandoAjustes(tenantId: string, desde: Date, hasta: Date, incluirAnulados: boolean): Promise<SaldoCuentaSeparadoRow[]>`. Copiar el JSDoc completo del design §2.2. Las 3 firmas existentes NO cambian. (D-02, REQ-HT-21)

  **Punto de regresión**: tras este paso `PrismaEeffSaldosReaderAdapter` no compilará (falta implementar el método abstracto). El paso 3.1 lo resuelve. NO avanzar a 3.x sin antes tener el adapter compilando.

---

## Área 3 — Adapter (refactor + método nuevo)

> **Prerrequisito**: la regresión de `obtenerSaldosEnRango` (balance-comprobacion, balance-general, estado-resultados integration specs) debe quedar verde al final de 3.2. Si se rompe, revertir el refactor antes de continuar.

- [x] **3.1 [RED] Extender `prisma-eeff-saldos-reader.adapter.integration.spec.ts`** con tests del split  
  En el spec existente, agregar `describe('obtenerSaldosEnRangoSeparandoAjustes')` con los 6 casos de §3.4 del design:  
  1. Split correcto: tipos mixtos → ordinario vs ajuste separados.  
  2. Reconciliación SIN CIERRE: `ordinario+ajuste === obtenerSaldosEnRango.total` por cuenta.  
  3. CIERRE excluido: con CIERRE en rango, split lo excluye → diferencia exacta en reconciliación.  
  4. Solo-ajuste: cuenta con únicamente AJUSTE aparece con ordinario 0.  
  5. Toggle anulados: anulado contado solo con `incluirAnulados=true`.  
  6. Anti-31: dos tenants, sin fuga entre ellos.  
  (D-03 §3.4, REQ-HT-14, REQ-HT-15, REQ-HT-21)

- [x] **3.2 [GREEN] Extraer helper `whereBaseRango` y refactorizar `obtenerSaldosEnRango`**  
  Método privado `private whereBaseRango(tenantId, desde, hasta, incluirAnulados): Prisma.Sql` con exactamente el WHERE base del design §3.2. Reemplazar el SQL ramificado actual de `obtenerSaldosEnRango` usando el helper. Los tests existentes del adapter Y los specs de integración de balance-comprobacion/balance-general deben seguir verdes. (D-03 §3.2)

- [x] **3.3 [GREEN] Implementar `obtenerSaldosEnRangoSeparandoAjustes` en el adapter**  
  `$queryRaw` con `SUM(...) FILTER (WHERE c.tipo NOT IN ('AJUSTE','CIERRE'))` + `SUM(...) FILTER (WHERE c.tipo = 'AJUSTE')`. WHERE base vía `this.whereBaseRango(...)`. Mapeo `new Decimal(row.<campo>)` para los 4 agregados. Todos los tests de integración nuevos (3.1) deben pasar verde. (D-03 §3.1, §3.3)

---

## Área 4 — DTO, mapper y service

- [x] **4.1 Crear `dto/hoja-trabajo-query.dto.ts`**  
  Clon exacto de `balance-comprobacion-query.dto.ts`: `desde?`, `hasta?` (`@Matches YYYY-MM-DD`), `periodoFiscalId?` (`@IsUUID('4')`), `incluirAnulados?` (`@Transform` bool + `@IsBoolean`). Sin lógica de negocio (solo forma). (REQ-HT-01, REQ-HT-02)

- [x] **4.2 [RED] Escribir spec del mapper — `dto/hoja-trabajo-response.dto.spec.ts`**  
  Casos: (a) resultado con utilidad → `esSintetica=true` en la última fila, montos string, fechas YYYY-MM-DD, `cuentaId: null`, `codigoInterno: null` en fila sintética; (b) `cuentasNaturalezaOpuesta` correctamente mapeada; (c) totales 12 columnas string; (d) `cuadra` + 6 `cuadra*` booleans + 6 diferencias string; (e) campos nullable con `null` explícito (no `undefined`). (REQ-HT-17)

- [x] **4.3 [GREEN] Crear `dto/hoja-trabajo-response.dto.ts`** con:  
  - Tipos internos: `LineaHojaTrabajoCalculada`, `HojaTrabajoResult`, `TotalesHojaTrabajoCalculada`, `CuadresHojaTrabajo` (copiados desde `domain/hoja-trabajo.ts` vía re-export o inline).  
  - Clases `@ApiProperty` con strings: `LineaHojaTrabajoDto` (12 columnas + nullable `cuentaId`/`codigoInterno` con `@ApiProperty({ nullable: true, type: String })`), `TotalesHojaTrabajoDto`, `CuadresHojaTrabajoDto` (6 bools + `cuadra` + 6 diferencias string), `HojaTrabajoResponseDto`.  
  - Reusar/importar `CuentaNaturalezaOpuestaDto` de `balance-comprobacion-response.dto.ts` (no duplicar).  
  - Mapper `toHojaTrabajoResponse(result, { desde, hasta })`: montos vía `.toBob()`, fechas vía `formatFechaContable`. (D-07 §6.2, REQ-HT-17)

- [x] **4.4 [RED] Escribir `hoja-trabajo.service.spec.ts`**  
  Mock de `EeffSaldosReaderPort` y `PeriodosReaderPort`. Casos: XOR RANGO_AMBIGUO; XOR RANGO_REQUERIDO; rango inválido (`desde > hasta`, modo incompleto); período no encontrado; happy path rango → llama `obtenerSaldosEnRangoSeparandoAjustes` + `obtenerEstructuraCuentas` en paralelo; happy path período → resuelve rango primero; `incluirAnulados` propagado al port. Verificar que NUNCA llama `obtenerSaldosEnRango` ni `obtenerSaldosHasta`. (REQ-HT-01, REQ-HT-02)

- [x] **4.5 [GREEN] Crear `hoja-trabajo.service.ts`**  
  Espejo de `balance-comprobacion.service.ts`. Inyecta `EEFF_SALDOS_READER_PORT` + `PERIODOS_READER_PORT`. Pasos 1–5 idénticos al service de BC pero: importa errores `REPORTES_HOJA_TRABAJO_*`; paso 3 llama `obtenerSaldosEnRangoSeparandoAjustes` + `obtenerEstructuraCuentas`; paso 4 llama `construirHojaTrabajo`; paso 5 llama `toHojaTrabajoResponse`. `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` activos: spread condicional para opcionales. Cero `any`. (D-07 §6.3, REQ-HT-01, REQ-HT-02)

---

## Área 5 — Controller y módulo

- [x] **5.1 Registrar `HojaTrabajoService` en `reportes.module.ts`**  
  Agregar al array `providers`. Sin provider nuevo de adapter (el método nuevo está en `PrismaEeffSaldosReaderAdapter` ya registrado bajo `EEFF_SALDOS_READER_PORT`). Actualizar el comentario del módulo. (D-07 §6.5)

- [x] **5.2 Añadir `GET hoja-trabajo` en `eeff.controller.ts`**  
  Inyectar `HojaTrabajoService` en el constructor (4.º service). Nuevo `@Get('hoja-trabajo')` con `@RequirePermissions('contabilidad.eeff.read')`, `@ApiOperation` con REQ-HT-01..21, `@ApiOkResponse({ type: HojaTrabajoResponseDto })`. Spread condicional para todos los campos opcionales del query. (D-07 §6.4, REQ-HT-16)

---

## Área 6 — E2E

- [x] **6.1 [RED] Crear `test/eeff-hoja-trabajo.e2e-spec.ts`** (Supertest + AppModule + Postgres, `--runInBand --forceExit`)  
  Scaffold: seed de tenant con comprobantes DIARIO, INGRESO, EGRESO, AJUSTE, TRASPASO en el rango. SIN comprobantes CIERRE en el seed principal (para que el cross-check sea exacto). `describe`/`it` en español.  
  Tests (todos rojos antes de existir el endpoint):  
  1. Happy path modo rango → 200, estructura de respuesta con 12 columnas string, totales, cuadres, fila sintética cuando hay resultado. (REQ-HT-01, REQ-HT-17)  
  2. Happy path modo período → 200 equivalente. (REQ-HT-01)  
  3. XOR RANGO_AMBIGUO → 422 `REPORTES_HOJA_TRABAJO_RANGO_AMBIGUO`. (REQ-HT-01)  
  4. Sin ningún modo → 422 `REPORTES_HOJA_TRABAJO_RANGO_REQUERIDO`. (REQ-HT-01)  
  5. `desde > hasta` → 422 `REPORTES_HOJA_TRABAJO_RANGO_INVALIDO`. (REQ-HT-02)  
  6. `periodoFiscalId` inexistente → 422 `REPORTES_HOJA_TRABAJO_PERIODO_NO_ENCONTRADO`. (REQ-HT-02)  
  7. Usuario sin `contabilidad.eeff.read` → 403. (REQ-HT-16)  
  8. Módulo contabilidad deshabilitado → 403. (REQ-HT-16)  
  9. **Cross-check REQ-HT-11**: mismo tenant+rango, comparar `saldoAjustadoDeudor`/`saldoAjustadoAcreedor` de la Hoja con `saldoDeudor`/`saldoAcreedor` del Balance de Comprobación → iguales (±0.01) por cuenta. (REQ-HT-11)  
  10. Toggle `incluirAnulados=true`: anulado sí suma. (REQ-HT-14)

- [x] **6.2 [GREEN] Verde del E2E** — todos los tests de `eeff-hoja-trabajo.e2e-spec.ts` pasan tras las implementaciones anteriores.

---

## Área 7 — OpenAPI regen

- [x] **7.1 Regenerar `backend/openapi.json`**  
  `cd backend && pnpm openapi:dump`. Verificar que `HojaTrabajoResponseDto` aparece en el schema, incluyendo los campos nullable `cuentaId`/`codigoInterno` como `string | null` (no `Record<string,never>` — cicatriz §10.10).

- [x] **7.2 Regenerar `frontend/src/types/api.generated.ts`**  
  `cd frontend && pnpm gen:api-types`. Commitear ambos artefactos juntos. (§10.10 CLAUDE.md — job `contract-drift` rompería CI si se omite)

---

## Área 8 — Gate verde completa (regresión)

- [x] **8.1 Typecheck — `pnpm exec tsc --noEmit`** desde `backend/`. Cero errores.

- [x] **8.2 Lint — `pnpm run lint`** desde `backend/`. Cero warnings ni errores.

- [x] **8.3 Unit + integración completa**  
  `DATABASE_URL=... pnpm exec jest src/` desde `backend/`. Verde completo incluyendo:  
  - Los specs del builder `domain/hoja-trabajo.spec.ts` (área 1).  
  - Los specs de integración del adapter (área 3).  
  - La regresión de los reportes existentes: `domain/balance-comprobacion.spec.ts`, `domain/balance-arbol.spec.ts`, `domain/resultados-arbol.spec.ts`, `adapters/prisma-eeff-saldos-reader.adapter.integration.spec.ts` (parte vieja), specs de service de BG/ER/BC.

- [x] **8.4 E2E completa**  
  `DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh pnpm exec jest test/ --runInBand --forceExit` desde `backend/`. Verde incluyendo el nuevo `eeff-hoja-trabajo.e2e-spec.ts` Y la regresión `balance-comprobacion.e2e-spec.ts`, `balance-general.e2e-spec.ts`.

---

## Notas de orden y dependencias

```
Área 1 (domain builder unit)
  → puede empezarse en paralelo con Área 2 (port)
  → 1.19 debe completarse antes de 4.5 (service usa construirHojaTrabajo)

Área 2 (port)
  → debe completarse antes de 3.x (el adapter extiende el port)
  → agregar SaldoCuentaSeparadoRow antes que el método abstracto (evita error de tipo en la firma)

Área 3 (adapter)
  → 3.2 (refactor whereBaseRango) PRIMERO, regresión verde, LUEGO 3.3 (método nuevo)
  → si el refactor 3.2 rompe specs existentes, no avanzar hasta que vuelvan a verde

Áreas 4 y 5 (DTO / service / controller / módulo)
  → orden interno: 4.1 → 4.2 (RED) → 4.3 (GREEN) → 4.4 (RED) → 4.5 (GREEN) → 5.1 → 5.2
  → 5.2 requiere que 4.5, 4.3 y 1.18 estén completas (tipos de error, DTO de respuesta)

Área 6 (E2E)
  → 6.1 (RED) puede escribirse con scaffold + tests rojos antes de que el endpoint exista
  → 6.2 (GREEN) requiere Áreas 1–5 completas

Área 7 (OpenAPI regen)
  → después de 4.3 y 5.2 (DTOs y controller con @ApiOkResponse)

Área 8 (gate verde)
  → último, verificación holística
```
