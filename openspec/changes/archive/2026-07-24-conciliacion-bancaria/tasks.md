# Tasks: Conciliación bancaria (pack `contabilidad.conciliacion`)

<!-- ============================================================
NOTA DE CIERRE (agregada al archivar, 2026-07-24 — PR #236, main cd8e8b3)

153/166 tareas marcadas. Las 13 sin marcar NO son trabajo olvidado; se
cierran así, de forma explícita:

1. **Slice 6 (6.1–6.5) — DIFERIDO, autorizado.** `proposal.md` permite
   explícitamente diferir el slice 6 (atajo "crear asiento de comisión/ITF")
   sin bloquear el cierre del change. Queda como backlog, no como deuda:
   la v1 no lo necesita.
   Excepción: 6.5 (`[ARCH]` test estático de REQ-CB-15 escenario 2 — que
   ningún controller/service de conciliación escriba `Comprobante`) quedó
   pendiente al archivar: la propiedad SÍ se sostenía, pero por disciplina y
   sin test que la CONGELARA. Era el residual real de este change.
   **CERRADO el 2026-07-24, después del archive**, en
   `backend/src/conciliacion-bancaria/no-escribe-comprobantes.arch.spec.ts`
   (4 chequeos: escrituras Prisma sobre `Comprobante`/`LineaComprobante`,
   SQL crudo sobre sus tablas, whitelist de imports hacia `comprobantes/`, y
   una guarda contra escanear en vacío). Validado por mutación: los tres
   chequeos fallan ante un archivo que viola cada vía. El change ya estaba
   archivado, así que la casilla 6.5 se marca acá sin reabrirlo.

2. **Checklist final (líneas ~812-822) — ejecutado, sin marcar.**
   Verificado al archivar, no asumido:
   - Coverage dominio ≥95%: **CUMPLE** — 99.47% stmts / 100% branch /
     97.87% funcs sobre `domain/**`.
     ⚠️ El comando del propio checklist (`jest src/conciliacion-bancaria/domain
     --coverage`) reporta 77.6% y SUBESTIMA la meta: al acotar el scope a
     `domain/`, deja fuera los specs de adapters/services que ejercitan las
     3 clases de error declarativas (`*-errors.ts`), que aparecen en 0%.
     El comando correcto es `jest src/conciliacion-bancaria --coverage
     --collectCoverageFrom='src/conciliacion-bancaria/domain/**/*.ts'`.
   - Ningún controller expone `detectarHuecos`: **CONFIRMADO** por grep
     (REQ-CB-09 sigue sin endpoint en v1, como manda la spec).
   - `require-pack-tenant-guard.arch.spec.ts` existe y cubre los 3
     controllers nuevos sin modificarse.
   - tsc + lint + vitest + `contract-drift`: **verdes en el CI real** de
     #236 (3 jobs), no solo en local.
============================================================ -->

> Strict TDD ON: toda tarea de implementación está precedida por su tarea de test (RED → GREEN).
> Slices 0–6 tal como los cortó `proposal.md`. `spec.md` = **18 REQ-CB, 61 escenarios** · `design.md`
> = **revisión 5**. Ambos son la verdad viva; este documento se alineó contra ellos en esta ronda.

**Leyenda de capa de test**
`[DOM]` dominio puro, sin DB/NestJS — `pnpm exec jest src/` ·
`[UNIT]` unit backend con mocks de puertos — `pnpm exec jest src/` ·
`[INT]` `*.integration.spec.ts` contra Postgres real — `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec jest src/` ·
`[E2E]` `test/*.e2e-spec.ts` — `DATABASE_URL=... JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... pnpm exec jest test/ --runInBand --forceExit` ·
`[FE]` frontend — `pnpm exec vitest run` (no `--reporter=basic`) ·
`[ARCH]` spec de arquitectura estática ·
`[MIGRATION]` cambio de `schema.prisma`/migración ·
`[OPENAPI]` regenerar `backend/openapi.json` + `frontend/src/types/api.generated.ts` (CI `contract-drift`)

> ✅ **Ronda 3 — revisión adversarial de consistencia (engram `sdd/conciliacion-bancaria/revision-consistencia`,
> 7 CRITICAL) aplicada.** `spec.md` pasó a 18 REQ-CB/61 escenarios (+REQ-CB-17, +REQ-CB-18) y
> `design.md` a revisión 5. Cambios reflejados abajo:
> - **CRITICAL-5** — `CuentaBancaria` NO persiste `banco` como columna; la identidad es
>   `@@unique([organizationId, perfilExtracto, numeroCuenta])`. Corregido en 0.3 y 1.6.
> - **CRITICAL-3** — `Money` no tenía `equalsConTolerancia`/`redondear`/`toFixed`. Se agrega
>   `igualaConTolerancia(other, tol?)` currency-neutral a `common/domain/money.ts` (NUEVO 2.5/2.6);
>   `balanceadoEnBobCon`/`TOLERANCIA_BOB` quedan intactos (son del core contable, semántica BOB).
> - **CRITICAL-2** — el número de cuenta de Económico NO tiene etiqueta `CA:`; la etiqueta es
>   `Cuenta:` (idéntica a BancoSol) y el VALOR viene contaminado (`'CA: 2031262031 (Bs)'`). El
>   dialecto de Económico debe stripear prefijo `CA:` + sufijo `(Bs)` (NUEVO 3.5). Fortaleza/BCP/
>   BMSC/FIE quedan marcados "no verificado etiqueta-vs-valor" para cuando entren en slices futuros.
> - **CRITICAL-1** — checksum de Unión es `DERIVADO`, no `DECLARADO` (ya estaba así en la ronda
>   anterior de este documento — confirmado sin cambios en Slice 4).
> - `LadoContable` es un **5to enum Prisma nuevo** (perspectiva de la EMPRESA, distinto de
>   `LadoBancario` = perspectiva del BANCO); `MatchConciliacion.snapshotTipo` usa `LadoContable`.
>   `MotivoVinculoRoto` sigue siendo **TS-only, NO Prisma**. Corregido en 0.3.
> - `invalidarCacheDeOrg(orgId)` no existe hoy en `pack.service.ts` (solo `private cacheKey()` +
>   `redis.del` inline) — tarea nueva para crearlo (0.7/0.8).
> - **REQ-CB-11** (`EN_TRANSITO` derivado) no tenía tarea RED propia — agregada en 5.7.
> - **REQ-CB-17** (confirmar/deshacer match, 5 escenarios) y **REQ-CB-18** (ignorar/des-ignorar,
>   4 escenarios) — Slice 5 reestructurado con una tarea RED por escenario.
> - **REQ-CB-13** (aislamiento cross-tenant, 4 tablas) — antes solo `CuentaBancaria` tenía test;
>   agregadas tareas para `MovimientoBancario`/`ImportacionExtracto` (Slice 3) y `MatchConciliacion`
>   (Slice 5).
> - **REQ-CB-16 escenario 5** (parser no logra extraer el número aunque el perfil lo expone →
>   advierte, no rechaza) no tenía tarea — agregada en 3.23.
> - Fixture del checksum de BancoSol (`3.275,55 + (−3.040,38) = 235,17`) pertenece al archivo de
>   **20 movimientos** (`BancoSol-Extracto-1191959-000-001-23-07-2026.xlsx`), NO a `bancosol-A`.
>   Se agregó ese 5to archivo a la lista de anonimización (0.2) y el criterio se movió a 3.4.
> - Tasks 2.23/2.24 (cirugía de centavos implícitos de Unión TXT) se **corrigieron**: el caso de
>   prueba pasa a ser Unión **XLSX** con padding+miles+signo (formato real de v1); `insertarPuntoDecimal`
>   deja de implementarse (queda documentado como perfil futuro, design §4.3.2/§8.1).
> - Filas de Unión citadas correctamente (verificadas por el coordinador, NO las 7/15/38/40/44 que
>   el reviewer citó por error leyendo el export descartado): `Cuenta:` **B8**, encabezados **r16**,
>   Total Créditos **fila 39**, Total Débitos **fila 41**, Total **fila 45**. Aplicado en Slice 4.
> - Test de lectura XLSX ampliado a los 3 fixtures de v1 (no solo BancoSol): Económico envuelve TODO
>   en namespace `x:` (`<x:row>`, `<x:c>`, `<x:v>`) — riesgo R4 extendido en 3.3.

---

## Slice 0 — Riel: schema completo + auto-otorgamiento del pack + RBAC + nav gateada

- [x] 0.1 Checkpoint: confirmar que `docs/extractosBancos/` sigue en `.gitignore` (línea 13) y
      `git status --porcelain docs/` vacío (`git check-ignore -v`). Ya resuelto (R-1) — solo verificar
      antes de tocar fixtures.
- [x] 0.2 Anonimizar **preservando la forma** (mismo tipo/largo de dato, nunca `XXX`) los **5**
      extractos fuente — `bancosol-A-mayo-junio.xlsx`, `bancosol-B-junio-julio.xlsx`,
      `BancoSol-Extracto-1191959-000-001-23-07-2026.xlsx` (20 movimientos — es el archivo dueño del
      criterio de checksum `3.275,55 + (−3.040,38) = 235,17`, NO `bancosol-A`), el XLSX de Económico
      y `Extracto_Movimientos (1).xlsx` de Unión (hoja `ExtractoMovimientosFechas`, export por rango)
      — y commitear las copias anonimizadas como fixtures de test del backend (p.ej.
      `backend/src/conciliacion-bancaria/adapters/__fixtures__/`). Los originales reales quedan SOLO
      en `docs/extractosBancos/` (gitignoreada). El export "extendido" de Unión (descartado) NO se
      anonimiza ni se commitea.
      **Nota de implementación**: filenames renombrados sin el número de cuenta real (que era PII
      incluso anonimizado el contenido) — `bancosol-a-mayo-junio.xlsx`, `bancosol-b-junio-julio.xlsx`,
      `bancosol-20-movimientos-checksum.xlsx`, `economico-extracto.xlsx`,
      `union-extracto-por-rango.xlsx`. Anonimización a nivel de `xl/sharedStrings.xml` (+
      `docProps/core.xml` autor) manteniendo `sheet1.xml`/estilos/namespaces BYTE-IDÉNTICOS al
      original (namespace `x:` de Económico y estructura `x:sst`/`x:si`/`x:t` preservados). Se
      anonimizaron nombres reales (titular + contrapartes) y TODOS los números de cuenta; montos,
      saldos, fechas y referencias de transacción se dejaron INTACTOS (preserva checksums y conteos
      de dedup documentados en engram #956/#966 sin recalcular nada). Mapeo real↔ficticio NO
      persistido en ningún lado (ni repo ni engram) — ver reporte del agente para detalle y
      justificación de alcance.
- [x] 0.3 `[MIGRATION]` `schema.prisma`: agregar los 4 modelos (`CuentaBancaria`, `MovimientoBancario`,
      `ImportacionExtracto`, `MatchConciliacion`) + **5 enums** (`PerfilExtracto{BANCOSOL_XLSX,
      ECONOMICO_XLSX,UNION_XLSX}`, `LadoBancario` — perspectiva del BANCO, `EstadoMovimientoBancario`,
      `EstadoVerificacionExtracto`, `LadoContable` — perspectiva de la EMPRESA, tipo NUEVO y DISTINTO
      de `LadoBancario`, usado por `MatchConciliacion.snapshotTipo`) exactamente como en `design.md`
      §9, + `Pack.otorgadoPorDefecto Boolean @default(false)` + relaciones inversas en
      `Cuenta`/`Organization`. `MotivoVinculoRoto` es **TS-only, NO va en `schema.prisma`**.
      **CRITICAL-5**: `CuentaBancaria` NO lleva columna `banco` — la identidad es
      `@@unique([organizationId, perfilExtracto, numeroCuenta])` (NUNCA
      `@@unique([organizationId, banco, numeroCuenta])`); `banco` sale del descriptor del adaptador,
      solo lectura para UI. Una sola migración cubre todo el change (design §12).
      **Desviación técnica menor**: se agregó `@unique` en `CuentaBancaria.cuentaId` y en
      `MatchConciliacion.movimientoBancarioId` (además de los `@@unique` compuestos del design) —
      Prisma exige un FK de campo único del lado que define una relación 1:1 cuando el lado opuesto
      declara un campo singular (`Cuenta.cuentaBancaria?`, `MovimientoBancario.match?`). No cambia
      ningún invariante — documenta el mismo 1↔1 que design.md ya declaraba en comentarios.
- [x] 0.4 `[MIGRATION]` Generar (`prisma migrate dev --name conciliacion_bancaria`); aplicar **protocolo
      §11.6**: `grep -E "^DROP (INDEX|EXTENSION|TYPE)" migration.sql`, remover cualquier `DROP` de los
      objetos raw SQL vivos (`pg_trgm`, índices trigram de `contactos`, uniques parciales,
      `comprobantes_audit`+triggers, `comprobante_documento_fisico_unique_contabilizado`,
      `organizations_vertical_exclusivo_check`); aplicar y verificar con `\d` sobre las 4 tablas
      nuevas.
      **Nota**: `prisma migrate dev` no funciona en modo no-interactivo (el entorno de Claude Code
      bloquea el prompt de confirmación de drift). Se usó `prisma migrate diff --from-url ... --to-schema-datamodel ...
      --script` para generar el SQL, se armó la carpeta de migración a mano
      (`20260723000000_conciliacion_bancaria`) y se aplicó con `prisma migrate deploy`. Migración
      100% aditiva verificada — cero DROP en el archivo final.
- [x] 0.5 RED `[UNIT]` `packs/pack.service.spec.ts`: `otorgarPacksPorDefecto` recibe `vertical` como
      parámetro (no lee `OrgVerticalReaderPort`), llama `habilitar(..., {activo:true, tx})` por cada
      pack `otorgadoPorDefecto=true` del vertical, NO invalida Redis dentro de la función.
- [x] 0.6 GREEN `packs/pack.service.ts`: `otorgarPacksPorDefecto(organizationId, vertical,
      habilitadoPorUserId, tx)` (design §7.2).
- [x] 0.7 RED `[UNIT]` `pack.service.spec.ts`: `invalidarCacheDeOrg(orgId)` llama `redis.del` con la
      clave `org-packs:<orgId>`. **No existe hoy** — solo hay un `private cacheKey()` + `redis.del`
      inline sin método público reusable.
- [x] 0.8 GREEN crear el método público `invalidarCacheDeOrg(orgId)` en `packs/pack.service.ts`.
- [x] 0.9 `packs/ports/pack-catalog.reader.port.ts` + adapter: agregar `listarOtorgadosPorDefecto(vertical)`.
      Incluye integration spec nuevo `prisma-pack-catalog.reader.integration.spec.ts` (no listado
      explícitamente en tasks.md original, agregado por Strict TDD).
- [x] 0.10 `packs/ports/org-pack.repository.port.ts` + adapter: extender `habilitar(...)` con
      `opts?: {activo?, tx?}` retrocompatible (patrón `tx?` de `CierreComprobanteWriterPort`).
- [x] 0.11 RED `[INT]` extender `packs/adapters/prisma-org-pack.repository.integration.spec.ts`:
      `habilitar(..., {activo:true, tx})` dentro de una TX real que hace rollback → no persiste
      entitlement.
- [x] 0.12 GREEN adapter Prisma para 0.9/0.10/0.11.
- [x] 0.13 `prisma/seeds/packs-catalogo.ts`: agregar `contabilidad.conciliacion` (`TipoPack.DOMINIO`,
      `VerticalPack.CONTABILIDAD`, `otorgadoPorDefecto:true`) + script de backfill para orgs
      `contabilidadEnabled=true` existentes (owner vía `Membership.systemRole=OWNER` — `Organization`
      NO tiene `ownerUserId`, C-3; `upsert` idempotente que no pisa un `activo=false` ya elegido).
- [x] 0.14 RED `[E2E]` org nueva vertical CONTABILIDAD nace con `OrgPackEntitlement.activo=true` para
      `contabilidad.conciliacion` en AMBOS entry points (`TenantsService.create` self-serve y
      `PlatformAdminService.crearOrgConOwner`); org GRANJA y org OTROS NO lo reciben.
- [x] 0.15 GREEN `tenants/tenants.service.ts` (`create`) y `platform/platform-admin.service.ts`
      (`crearOrgConOwner`): llamar `otorgarPacksPorDefecto` dentro de la `$transaction` +
      `invalidarCacheDeOrg` (0.8) después del commit (design §7.3).
- [x] 0.16 RED `[E2E]` rollback de la TX de provisión no deja `OrgPackEntitlement` huérfano.
      **Descubrimiento operativo**: los e2e requieren `NODE_OPTIONS="--experimental-vm-modules"` para
      correr en este entorno (Node v24 + AWS SDK dynamic import + ts-jest) — desbloquea el debt W3
      documentado en engram/CLAUDE.md §10.10 ("infra preexistente Node v24+AWS SDK ts-jest"), no
      solo para este change.
- [x] 0.17 `common/permisos/catalogo.ts`: agregar grupo
      `contabilidad.conciliacion.{read,create,update,delete,importar,conciliar}` + corregir el
      comentario desactualizado de la línea 6 sobre "acciones canónicas".
- [x] 0.18 `[ARCH]` Confirmar (test si no existe uno genérico) que `catalogo-asignable.ts` NO requiere
      cambios — el filtro por prefijo `modulo.submodulo` ya cubre el pack (primer pack con permisos
      propios). Confirmado sin cambios de código; se agregó un test con datos reales de
      `contabilidad.conciliacion` en `catalogo-asignable.spec.ts` (el test genérico preexistente
      usaba `contabilidad.adjuntos`, que es un pack placeholder sin permisos propios).
- [x] 0.19 `[FE]` `nav-items.ts`: agregar `NavItem` "Conciliación bancaria" con
      `pack:'contabilidad.conciliacion'`, `requiredPermission:'contabilidad.conciliacion.read'`,
      `vertical:'CONTABILIDAD'`, ruta `/conciliacion` (la página se construye en slice 5).
- [x] 0.20 RED `[FE]` REQ-SB-10 (3 escenarios): pack activo+permiso → visible; pack inactivo → oculto;
      permiso ausente con pack activo → oculto (cascada AND).
- [x] 0.21 GREEN — confirmar verde sin tocar `NavList` (mecanismo genérico ya existe, REQ-SB-05).

## Slice 1 — `CuentaBancaria` CRUD + catálogo de perfiles

> ✅ **Slice 1 COMPLETO** (2026-07-23). **Desviación documentada respecto al texto original de
> 1.10/1.14**: `GET /api/cuentas-bancarias/perfiles` (`registry.descriptores()`) **NO se implementó
> en este slice**. Motivo: `ExtractoParserRegistry` es `@Injectable()` y su constructor es
> fail-fast — exige que TODOS los valores de `PerfilExtracto` (3 en v1) tengan un adapter
> registrado o lanza al construirse (design §4.5, confirmado también por 4.9: "el chequeo de
> bootstrap del registry cubre los 3 valores del enum" recién al cerrar slice 4). Wirear
> `EXTRACTO_PARSERS`/`ExtractoParserRegistry` como provider de `conciliacion-bancaria.module.ts`
> en slice 1 (0 parsers reales — llegan en slices 3-4) haría fallar el bootstrap de TODA la app,
> contradiciendo la propia nota de 1.12 ("wiring inicial, sin los 3 parsers de extracto
> todavía"). Resolución: el registry se construyó y se valida standalone (1.8/1.9, este spec no
> pasa por DI), pero NO se agregó a `conciliacion-bancaria.module.ts` — se difiere a cuando el
> primer/segundo parser real exista (slice 3). El frontend usa un catálogo ESTÁTICO
> (`lib/perfil-extracto-options.ts`) con los mismos 3 valores del enum como selector de
> `perfilExtracto`, documentado como deuda a reemplazar por un hook real cuando el endpoint exista.

- [x] 1.1 RED `[UNIT]` `cuentas-bancarias.service.spec.ts`: crear sobre `cuentaId` ya vinculado →
      `CONCILIACION_CUENTA_BANCARIA_YA_VINCULADA` 409 (REQ-CB-01).
- [x] 1.2 GREEN validación en el service + `@@unique([organizationId, cuentaId])`.
- [x] 1.3 RED `[UNIT]` REQ-CB-02: `cuenta.permiteMultiMoneda=false` + `CuentaBancaria.moneda` distinta
      de `monedaFuncional` → `CONCILIACION_MONEDA_INCOMPATIBLE` 422; `permiteMultiMoneda=true` →
      acepta cualquier moneda.
- [x] 1.4 GREEN validación de moneda.
- [x] 1.5 `ports/cuenta-bancaria.repository.port.ts` + adapter Prisma.
- [x] 1.6 RED `[INT]` `@@unique([organizationId,cuentaId])` y **`@@unique([organizationId,
      perfilExtracto, numeroCuenta])`** (CRITICAL-5 — NUNCA `banco`) enforzados en DB; REQ-CB-13
      (cuenta de otra org → 404, listado acotado al tenant activo).
- [x] 1.7 GREEN adapter.
- [x] 1.8 RED `[UNIT]` `ExtractoParserRegistry`: perfil duplicado en el registro → falla en bootstrap;
      valor del enum `PerfilExtracto` sin adapter → falla en bootstrap (fail-fast, design §4.5).
- [x] 1.9 GREEN `ExtractoParserRegistry` (esqueleto; los 3 parsers reales llegan en slices 3-4).
      Construido y testeado standalone; NO wireado en el módulo NestJS todavía (ver nota arriba).
- [x] 1.10 `cuentas-bancarias.controller.ts`: `GET/POST/PATCH/DELETE /api/cuentas-bancarias[/:id]`,
      guards `Auth→ModuleEnabled('contabilidad')→Permissions→PackEnabled('contabilidad.conciliacion')`
      (los 4 en cadena de clase — el pack gatea el controller COMPLETO). `GET /perfiles` DIFERIDO
      (ver nota de desviación arriba).
- [x] 1.11 RED `[E2E]` CRUD completo + 404 cross-tenant + 403 sin permiso + 404 sin pack activo.
      8/8 verde en `test/cuentas-bancarias.e2e-spec.ts`.
- [x] 1.12 GREEN controller + `conciliacion-bancaria.module.ts` (wiring inicial, sin los 3 parsers de
      extracto todavía).
- [x] 1.13 `[OPENAPI]` Regenerar (`CuentaBancariaResponseDto`, endpoints nuevos). `PerfilResponseDto`
      diferido junto con `GET /perfiles` (ver nota de desviación).
- [x] 1.14 `[FE]` `frontend/src/features/cuentas-bancarias/` (molde CRUD simple existente): página
      `/settings/cuentas-bancarias`, selector de `Cuenta` (`esDetalle=true && activa=true`) +
      `perfilExtracto` (catálogo estático — `GET /perfiles` diferido, ver nota arriba).
- [x] 1.15 RED `[FE]` alta, edición, gating fail-closed por permiso. (Error 409 se muestra vía
      `backendErrorMessage` genérico del hook de mutation — sin test dedicado de contenido del
      mensaje 409, cubierto extremo a extremo por el e2e del backend.)
- [x] 1.16 GREEN implementación de la feature.

## Slice 2 — Dominio puro (Strict TDD, cobertura ≥95%)

> ✅ **Slice 2 COMPLETO** (2026-07-23). 233 tests nuevos/extendidos, todos verdes.
> Cobertura real (`--collectCoverageFrom` sobre los 10 archivos nuevos de `domain/`, los 2 nuevos
> de `adapters/parsing/`, y `money.ts`/`fecha-contable.ts` — excluyendo `cuenta-bancaria-errors.ts`
> del slice 1): **99.66% statements · 96.87% branch · 100% funcs · 100% lines** — todos los 10
> archivos de dominio puro en 100/100/100/100. `tsc --noEmit` limpio. `pnpm run lint` limpio (0
> errores tras `--fix` de formato prettier).
>
> **Desviación documentada — `20260701 slice 4/2/2` (2.27) NO implementada**: ese caso pertenece al
> formato BCP, que NO es uno de los 3 perfiles de v1 (`BANCOSOL_XLSX`/`ECONOMICO_XLSX`/`UNION_XLSX`
> — ver Slice 4). La nota en el texto original de la tarea referenciaba dónde vivirá ese caso en un
> slice futuro, no algo a construir ahora. `leerFechaCelda` implementa únicamente los 3 dialectos de
> v1 (`SERIAL_EXCEL`, `TEXTO_ES_DD_MMM_YYYY`, `DD_MM_YYYY`).
>
> **Hallazgo cerrado en el propio slice — `FechaContable` rechaza año < 1900**: la época de Excel
> (1899-12-30) no se puede construir vía `FechaContable.of(1899, 12, 30)` (CLAUDE.md §4.6 fija el
> rango 1900-2999). `leerSerialExcel` resuelve la aritmética de la época en UTC crudo
> (`Date.UTC(1899, 11, 30) + ent * 86400000`) y solo el resultado FINAL (siempre ≥ 1900 para
> cualquier serial real de un extracto boliviano) pasa por `FechaContable.of`, que sigue siendo la
> única validación de calendario. `serial=1` (→ 1899-12-31) sigue rechazado como defensa en
> profundidad — nunca ocurre con datos reales.

> Orden fijado por el design: el VO adversarial de cuenta bancaria **primero** — es la regla más
> fácil de romper y la única cuyo fallo es silencioso.

- [x] 2.1 RED `[DOM]` `domain/numero-cuenta-bancaria.spec.ts` — **TEST ADVERSARIAL PRIMERO**: los 3
      números reales (`1191959-000-001`, `-002`, `-003`) comparados de a pares dan `false` en los
      **6 pares cruzados**, `true` solo consigo mismos; equivalencias de normalización (guiones,
      espacios, NBSP, puntos); chequeo de superficie de tipo — el VO no expone getter del normalizado
      (un `startsWith` externo no debe compilar contra el tipo).
- [x] 2.2 GREEN `domain/numero-cuenta-bancaria.ts`: `NumeroCuentaBancaria` (`private constructor` +
      `static of(raw)` + único método `equals()`, sin getter del normalizado — design §4.4, REQ-CB-16).
- [x] 2.3 RED `[DOM]` `common/domain/fecha-contable.spec.ts`: `sumarDias`/`restarDias`/
      `diferenciaEnDias` — cruce de mes, cruce de año, bisiesto (28→29 feb 2028), negativos.
- [x] 2.4 GREEN extender `common/domain/fecha-contable.ts` (design §5.4).
- [x] 2.5 RED `[DOM]` `common/domain/money.spec.ts` (**CRITICAL-3**, NUEVO): `igualaConTolerancia`
      — dentro de tolerancia `±0.01` → `true`; borde exacto `0.01` → `true`; fuera → `false`;
      simétrico `a.iguala(b) === b.iguala(a)`; USD y BOB con el mismo `0.01`; caso real BCP
      `4.6500000000000004` vs `4.65` → `true`. NO tocar `balanceadoEnBobCon`/`TOLERANCIA_BOB` (son
      del core contable, semántica BOB).
- [x] 2.6 GREEN `common/domain/money.ts`: agregar `igualaConTolerancia(other, tolerancia =
      Money.of('0.01'))`, currency-neutral (design §8.0). `equalsConTolerancia`/`redondear`/`toFixed`
      NO EXISTEN — no inventarlos.
- [x] 2.7 RED `[DOM]` `domain/normalizar-descripcion.spec.ts`: NFKC, diacríticos, uppercase,
      NBSP/tabs/saltos, truncado a 200 (casos reales #953: `DEPÓSITO`/`DEPOSITO`, NBSP de XLSX).
- [x] 2.8 GREEN `domain/normalizar-descripcion.ts`.
- [x] 2.9 RED `[DOM]` `domain/orden-canonico.spec.ts`: clave total fecha→monto(centavos string,
      zero-padded)→tipo→descripcionNormalizada→referencia(null último); el mismo conjunto en ASC y
      DESC produce igual secuencia (caso real Fortaleza #953: 30 movs DESC vs 73 movs ASC, mismo
      período → mismo orden tras `ordenarCanonico`).
- [x] 2.10 GREEN `domain/orden-canonico.ts` — `ordenarCanonico`.
- [x] 2.11 RED `[DOM]` `domain/ordinal-dia.spec.ts` (REQ-CB-07): dos movimientos idénticos mismo día →
      `ordinalDia=0` y `=1`, ninguno se descarta; grupo recompuesto en distinto orden de entrada da
      mismos ordinales; contar **por grupo de tupla**, no por día completo (un import parcial no debe
      correr los ordinales de otros grupos).
- [x] 2.12 GREEN `domain/ordinal-dia.ts` — `asignarOrdinalDia`.
- [x] 2.13 RED `[DOM]` `domain/hash-dedup.spec.ts`: separador Unit Separator `` evita colisión
      `('AB','C')` vs `('A','BC')`; `montoCentavos = money.toBob()` como string (`"12600.00"`), nunca
      `number`; prefijo de versión `v1`.
- [x] 2.14 GREEN `domain/hash-dedup.ts` — `calcularHashDedup`.
- [x] 2.15 RED `[DOM]` `domain/lado-contable.spec.ts`: `ladoContableEsperado('CREDITO')==='DEBITO'` y
      viceversa (§5.1 — la inversión banco↔empresa, la pieza más fácil de invertir por error;
      `LadoBancario` entra, `LadoContable` sale — son DOS tipos, no el mismo reusado).
- [x] 2.16 GREEN `domain/lado-contable.ts`.
- [x] 2.17 RED `[DOM]` `domain/checksum-extracto.spec.ts`: `DECLARADO` cuadra / no cuadra
      (`DESCUADRE`+`diferencia`, nunca rechaza, vía `Money.igualaConTolerancia`); `DERIVADO` parte de
      la fila más antigua tras `ordenarCanonico`; `IMPOSIBLE`→`SIN_VERIFICAR`. Checksums reales:
      BancoSol XLSX derivado `3.275,55 + (−3.040,38) = 235,17`; Económico XLSX declarado
      `327.520,14 + (−147.762,77) = 179.757,37`.
- [x] 2.18 GREEN `domain/checksum-extracto.ts` — `verificarChecksum`.
- [x] 2.19 RED `[DOM]` `domain/verificar-anclas.spec.ts` (REQ-CB-10, corrección C-1): línea intacta →
      válido; `orden` corrido pero snapshot coincide en los 5 campos (caso benigno) → válido; línea
      inexistente → `LINEA_INEXISTENTE`; comprobante anulado → `COMPROBANTE_ANULADO`; monto distinto
      (vía `Money.igualaConTolerancia`) → `MONTO_CAMBIADO`; `snapshotTipo` (`LadoContable`) invertido
      → `LADO_CAMBIADO`; moneda distinta → `MONEDA_CAMBIADA`; fecha distinta → `FECHA_CAMBIADA`.
      Función pura — no ejecuta ninguna escritura.
- [x] 2.20 GREEN `domain/verificar-anclas.ts`.
- [x] 2.21 RED `[DOM]` `domain/motor-sugerencias.spec.ts` (REQ-CB-12, §5.2): `ALTA` (fecha exacta +
      candidato único en ambas direcciones); `MEDIA` (fecha ±3 días, candidato único); `BAJA`
      (múltiples candidatos de cualquier lado); `l.monto.igualaConTolerancia(p.monto)` para el match
      de monto; orden total de salida (confianza DESC → |diffDias| ASC → comprobanteId ASC → orden
      ASC) determinístico e independiente del orden de entrada; nunca produce un `MatchConciliacion`
      — solo la lista ranqueada.
- [x] 2.22 GREEN `domain/motor-sugerencias.ts` — `sugerir`.
- [x] 2.23 RED `[DOM]` `domain/cobertura-extracto.spec.ts` (REQ-CB-09): dos rangos con hueco entre
      ellos → reporta el tramo no cubierto; rangos contiguos/solapados → sin huecos.
- [x] 2.24 GREEN `domain/cobertura-extracto.ts` — `detectarHuecos` (lógica lista; NO se expone por
      endpoint en v1, proposal "cae de regalo"; confirmar en el cierre transversal que ningún
      controller la cablea).
- [x] 2.25 RED `[DOM]` `adapters/parsing/dinero.spec.ts` (boundary, testeable sin DB): `leerMontoCelda`
      con casos reales #953/design§8.1 — BCP `4.6500000000000004`→`4.65` exacto (nunca `Number()`);
      Fortaleza `Bs.  16,000.00`; **Unión XLSX** `'             12,600.00'`→`12600.00` CREDITO y
      `'               -900.00'`→`900.00` DEBITO (trim + quitar miles, signo determina `tipo`); FIE
      `+50,450.00`/`-31,000.00` (signo determina `tipo`). El caso "Unión TXT centavos implícitos"
      (`1260000`→`12600.00`) NO se implementa — es perfil futuro (design §4.3.2), el XLSX de v1 trae
      decimales explícitos.
- [x] 2.26 GREEN `adapters/parsing/dinero.ts` — `leerMontoCelda` ÚNICAMENTE. `insertarPuntoDecimal`
      NO se implementa en v1 (queda documentado como necesidad de un futuro perfil ancho-fijo).
- [x] 2.27 RED `[DOM]` `adapters/parsing/fechas.spec.ts`: serial Excel BancoSol
      `46224.6478587963` (época 1899-12-30, hora=fracción redondeada, guarda `1≤ent≤60000`);
      Económico `03/Jun/2026` con mapa español sin diacríticos (`SET` alias `SEP`), `new Date(string)`
      PROHIBIDO; Unión XLSX `02/04/2026` (`DD/MM/YYYY` string, split por espacio si trae hora);
      `20260701` slice 4/2/2 — **NO implementado en este slice, ver nota de desviación arriba (BCP
      es slice futuro)**.
- [x] 2.28 GREEN `adapters/parsing/fechas.ts`.
- [x] 2.29 `pnpm exec jest src/conciliacion-bancaria/domain --coverage` — cerrar huecos hasta ≥95%.
      **99.66% stmts / 96.87% branch / 100% funcs / 100% lines** — objetivo superado.

## Slice 3 — Adaptador XLSX core-compartido (BancoSol + Económico)

> ✅ **Slice 3 COMPLETO** (2026-07-23). 44 tests nuevos backend (25 unit/dominio + 9 integración de
> repos + 19 integración de `ExtractoImportadorService` + 8 e2e), todos verdes. `pnpm exec jest
> src/conciliacion-bancaria/` → 22 suites / 231 tests. Regresión completa `src/` → 2615/2622 (los 6
> fallos son el debt preexistente W3 de `MinioStorageAdapter`, no relacionado a este slice — falla
> solo cuando corre sin `NODE_OPTIONS=--experimental-vm-modules`, ver CLAUDE.md §10.10). `tsc
> --noEmit` limpio back+front, `pnpm run lint` limpio. **Criterio literal 60/21+59/81 (REQ-CB-05/07)
> VERIFICADO por un test ejecutado** contra los fixtures reales `bancosol-a-mayo-junio.xlsx` /
> `bancosol-b-junio-julio.xlsx` — ver
> `extracto-importador.service.integration.spec.ts`.
>
> **CRÍTICO — los valores reales de los fixtures NO coinciden con los literales de este documento**
> (esperado — los fixtures fueron anonimizados en el slice 0, ver nota de la tarea del orquestador).
> Se usaron los valores REALES leídos con Python (`zipfile`+`xml.etree`) de cada `.xlsx`, no los de
> `design.md`/`tasks.md`:
> - **BancoSol** — número de cuenta real: `5799375-760-305` (NO `1191959-000-001`). El fixture de 20
>   movimientos (`bancosol-20-movimientos-checksum.xlsx`) SÍ preserva el checksum documentado
>   `3.275,55 + (−3.040,38) = 235,17` — verificado exacto.
> - **Económico** — número de cuenta real: `6484254835` (NO `2031262031`), valor crudo real
>   `'CA: 6484254835 (Bs)'`. Saldo Inicial/Final SÍ coinciden con el documento: `327.520,14` /
>   `179.757,37` — Saldo Inicial en `M4`, Saldo Final en `M5` (no `K4`/`K5` como sugiere una lectura
>   superficial de la tabla del design — esas son las celdas de ETIQUETA, el valor está en `M`).
> - **Fila de encabezados de BancoSol/Económico**: fila **17** (índice 16, 0-based), no una fila sin
>   especificar — verificado abriendo el XML crudo.
>
> **DESCUBRIMIENTO no anticipado por el design — guardado en engram** (`gotcha/read-excel-file-fecha-date-vs-string`):
> `read-excel-file` con `{ parseNumber: (s) => s }` **NO** intercepta la columna `Fecha`/`Hora` de
> BancoSol — esas celdas tienen formato de FECHA real en Excel y la librería las resuelve a `Date`
> nativo ANTES de que `parseNumber` pueda intervenir (parseNumber solo aplica a celdas de formato
> numérico "General"). Económico, en cambio, SÍ trae la fecha como texto plano (`'03/Jun/2026'`),
> confirmando el dialecto `TEXTO_ES_DD_MMM_YYYY` sin sorpresas. Esto es, además, la señal
> ESTRUCTURAL real que permite que `reconoce()` discrimine BancoSol de Económico pese a compartir
> generador y columnas idénticas (el design señala que comparten estructura pero no explicita cómo
> `reconoce()` los distingue) — se usa el TIPO de la celda `Fecha` de la primera fila de datos
> (`Date` nativo vs `string`) como discriminador, verificado con un test de discriminación cruzada.
> Resuelto sin tocar `adapters/parsing/fechas.ts` (slice 2, fuera de alcance): la conversión
> `Date → FechaContable` para BancoSol se hace directo vía los getters UTC del `Date` ya resuelto por
> `read-excel-file` (evita el ruido de precisión de un round-trip float serial↔string), reusando
> `FechaContable.of` como única autoridad de validación de calendario.
>
> **Desviación — `read-excel-file@9.3.3`, no `9.3.4` exacto (task 3.1)**: la política
> `minimumReleaseAge` de pnpm en este entorno (3 días) bloqueó `9.3.4` (publicado 2026-07-21, dentro
> de la ventana desde "hoy" 2026-07-23). Se instaló `9.3.3` (publicado 2026-07-20, la última versión
> MADURA), pineada exacta (sin `^`). No se bypasseó el guardrail de seguridad.
>
> **Desviación — registry de parsers (tasks 3.33/4.9)**: `ports/extracto-parser.registry.ts` (slice
> 1) es fail-fast — exige adapter para los 3 valores de `PerfilExtracto` o revienta el bootstrap.
> Wirearlo con solo 2/3 parsers (Unión llega en slice 4) haría fallar el arranque de TODA la app. Se
> creó `extracto-parser-lookup.service.ts` — lookup LENIENTE (mismo mecanismo, sin fail-fast) — como
> medida INTERINA documentada con TODO explícito para el slice 4. `GET /perfiles` y el service de
> importación usan este lookup; una cuenta `UNION_XLSX` da un 422 de negocio normal
> (`CONCILIACION_ARCHIVO_PERFIL_NO_SOPORTADO`), no un crash.
>
> **Desviación — 3.18/3.20 (parte)**: el "rango sintético que solapa" (3.18) y el "fixture reordenado
> a mano" (3.20) no se implementaron como tests SEPARADOS — el criterio de solapamiento queda
> demostrado con datos REALES (más fuerte que sintético) en el test del criterio literal 3.19, y la
> invarianza ASC/DESC del orden canónico ya tiene su propio test dedicado en slice 2
> (`orden-canonico.spec.ts`, task 2.9); acá se agregó un test de `ordinalDia` con un parser fake para
> el caso "dos movimientos idénticos el mismo día", que es la propiedad puntual que 3.20 pedía
> ejercitar a nivel de integración del service.
>
> **Desviación — 3.27 usa Económico en vez de Unión**: Unión (slice 4) no tiene parser todavía; se
> verificó REQ-CB-03 subiendo el fixture de Económico contra una `CuentaBancaria` `BANCOSOL_XLSX`
> — mismo requisito (perfil no coincide), formato disponible.
>
> **Hallazgo operativo — `test/helpers/test-factory.ts`**: el helper compartido de limpieza de BD
> para e2e ya tenía un comentario previsor de slice 1 ("agregar acá ANTES de esta línea") pero le
> faltaban los `deleteMany` de `movimientoBancario`/`importacionExtracto` (FK `Restrict` hacia
> `CuentaBancaria`) — sin ellos, cualquier e2e con datos importados rompía el cleanup del test
> SIGUIENTE. Completado (2 líneas).
>
> **`GET /perfiles`** cablea correctamente ahora que hay ≥1 parser (2, de hecho) — cierra la
> desviación documentada en el slice 1.

- [x] 3.0 Verificado: `design.md` rev5 usa los códigos `CONCILIACION_ARCHIVO_*` consistentes con
      `spec.md`. Sin desactualizaciones nuevas detectadas más allá de la ya anotada en 3.27.
- [x] 3.1 `package.json`: `read-excel-file` pineada exacta — **`9.3.3`**, no `9.3.4` (ver nota de
      desviación arriba — bloqueo de `minimumReleaseAge`, no se bypasseó el guardrail).
- [x] 3.2 `ports/extracto-parser.port.ts` ya existía (preparado en slice 1) — sin cambios necesarios.
- [x] 3.3 RED+GREEN `[DOM]` `adapters/xlsx/leer-matriz-xlsx.spec.ts`: riesgo R4 verificado contra
      BancoSol y Económico (namespace `x:`) — Económico devuelve sus filas reales, no cero.
- [x] 3.4 RED+GREEN `[DOM]` `adapters/xlsx-core-extracto-parser.spec.ts`: 20 movimientos, checksum
      derivado `3.275,55 + (−3.040,38) = 235,17` (verificado con el valor REAL de cuenta
      `5799375-760-305`, ver nota arriba).
- [x] 3.5 RED+GREEN `[DOM]` `adapters/xlsx/extraer-numero-cuenta.spec.ts` + caso real en
      `xlsx-core-extracto-parser.spec.ts`: strip de `'CA:'`/`'(Bs)'` verificado con el valor real
      `'CA: 6484254835 (Bs)'` → `'6484254835'`; prefijo/sufijo ausente → `ArchivoFormatoNoReconocidoError`.
- [x] 3.6 RED+GREEN `[DOM]` Económico: `reconoce()`→true, fechas texto, saldo declarado real
      `327.520,14`/`179.757,37`, 40 movimientos (conteo real del fixture, no un valor supuesto).
- [x] 3.7 RED+GREEN `[DOM]` renglón dorado: `descripcion` = `Transacción` + `' '` + `Nota` exacto,
      verificado con el texto real del fixture de 20 movimientos.
- [x] 3.8 RED+GREEN `[DOM]` cross-check de discriminación: BancoSol↔Económico (vía tipo de celda
      Fecha) y ambos↔Unión (vía headers, sin adapter de Unión todavía pero el mismatch de etiquetas
      ya se prueba con matrices sintéticas en `escaneo-cabecera.spec.ts`).
- [x] 3.9 GREEN `adapters/xlsx-core-extracto-parser.ts` + `adapters/dialectos/{bancosol,economico}.dialecto.ts`.
- [x] 3.10 RED+GREEN `[DOM]` mapeo por nombre: `escaneo-cabecera.spec.ts` con matriz sintética
      reordenada + verificación adicional contra el layout real de Económico (columnas D/F/G/H/J/K
      vacías intercaladas).
- [x] 3.11 RED+GREEN `[DOM]` `adapters/deteccion-archivo.spec.ts`: magic bytes OLE2 → `OLE2_LEGACY`.
- [x] 3.12 GREEN `adapters/deteccion-archivo.ts` — política propia, NO reusa `mime-whitelist.ts`.
- [x] 3.13 `ports/movimiento-bancario.repository.port.ts` + `ports/importacion-extracto.repository.port.ts`
      + `adapters/prisma-movimiento-bancario.repository.ts` + `adapters/prisma-importacion-extracto.repository.ts`.
- [x] 3.14 RED `[INT]` `adapters/prisma-movimiento-importacion.repository.integration.spec.ts`:
      REQ-CB-13 en las 2 tablas — `findById`/`listarPorCuentaBancaria`/`contarPorCuentaBancaria`
      nunca cruzan tenant.
- [x] 3.15 GREEN — mismo archivo que 3.14 (RED→GREEN en un solo ciclo por método, 6 tests).
- [x] 3.16 `extracto-importador.service.ts`: flujo completo orquestado (design §10).
- [x] 3.17 RED+GREEN `[INT]` reimportar el mismo archivo → `0 nuevos, 20 ya existían` (fixture de
      20 movimientos), nada se modifica.
- [x] 3.18 Cubierto por el criterio real de 3.19 (ver nota de desviación arriba — no hay test
      sintético separado).
- [x] 3.19 RED+GREEN `[INT]` **criterio literal verificado por ejecución**: A → 60 nuevos/0 ya
      existían; B → 21 nuevos/59 ya existían; total `contarPorCuentaBancaria` = **81**.
- [x] 3.20 RED+GREEN `[INT]` dos movimientos idénticos mismo día (parser fake) → ambos persisten,
      `movimientosNuevos=2` (ordinalDia 0/1 internamente, verificado en slice 2 a nivel de dominio).
- [x] 3.21 GREEN — `$transaction` con `createMany({skipDuplicates:true})` + `actualizarContadores`.
- [x] 3.22 RED+GREEN `[INT]` REQ-CB-16 orquestado: coincide → importa; distinta cuenta mismo banco
      (`...-999` vs `...-305` reales) → 422 con AMBOS números, cero filas persistidas.
- [x] 3.23 RED+GREEN `[INT]` escenario 5 (parser fake, `exponeNumeroCuenta=true` pero
      `numeroCuentaDeclarado=null` de ESE archivo) → advertencia `CONCILIACION_ARCHIVO_CUENTA_NO_VERIFICABLE`,
      SIGUE (`movimientosNuevos=1`).
- [x] 3.24 RED+GREEN `[INT]` `numeroCuenta=null` → `{requiereConfirmacionCuenta:true, numeroDetectado}`,
      cero filas persistidas, `CuentaBancaria.numeroCuenta` sigue null.
- [x] 3.25 GREEN — segundo viaje con `confirmarNumeroCuenta:true` persiste el número e importa en la
      MISMA `$transaction`.
- [x] 3.26 RED+GREEN `[INT]` orden de compuertas: tras rechazo por perfil o por cuenta,
      `count(ImportacionExtracto)===0` — nunca "0 nuevos/0 ya existían".
- [x] 3.27 RED+GREEN `[INT]` REQ-CB-03 con fixture de Económico contra `CuentaBancaria BANCOSOL_XLSX`
      (ver nota de desviación — Unión no tiene parser hasta slice 4) → 422 `PERFIL_NO_COINCIDE`.
- [x] 3.28 RED+GREEN `[INT]` DESCUADRE sintético (parser fake, DECLARADO que no cuadra) →
      `estadoVerificacion=DESCUADRE` + `diferencia='3900.00'`, importación completa igual
      (`movimientosNuevos=1`). BancoSol real (DERIVADO) también verificado `VERIFICADO`.
- [x] 3.29 RED+GREEN `[INT]` metadata sin binario: `sha256Archivo` (64 chars), `filasLeidas`,
      contadores persistidos; el service NO tiene ningún `StoragePort` inyectado (estructuralmente
      imposible que invoque uno).
- [x] 3.30 GREEN — cierre de 3.26-3.29 en el mismo archivo de integración del service.
- [x] 3.31 `cuentas-bancarias.controller.ts`: `POST /:id/importaciones` (multipart, `FileInterceptor`+
      `memoryStorage`, `@HttpCode(200)` — ver design §10, incluso el éxito es "resultado de
      operación" no creación de recurso direccionable) + `GET /:id/importaciones`.
- [x] 3.32 RED+GREEN `[E2E]` `test/conciliacion-importaciones.e2e-spec.ts` (8 tests): 403 sin
      `.importar`, 404 sin pack activo, 422 en los 3 rechazos, éxito con contadores (60 nuevos),
      `GET /perfiles`, flujo de confirmación de 2 viajes.
- [x] 3.33 GREEN controller + módulo con los 2 parsers XLSX registrados vía
      `ExtractoParserLookupService` (ver nota de desviación del registry arriba).
- [x] 3.34 `[OPENAPI]` Regenerado `backend/openapi.json` + `frontend/src/types/api.generated.ts`
      (`ImportarExtractoResponseDto`, `ListarImportacionesResponseDto`, `PerfilExtractoResponseDto` y
      afines). `tsc -b` limpio en frontend.

## Slice 4 — Adaptador Unión XLSX

> **Cambio de scope (medido sobre los 2 exports reales de Unión)**: Unión pasa de TXT ancho fijo a
> **XLSX**. Ganador: `Extracto_Movimientos (1).xlsx`, hoja `ExtractoMovimientosFechas`, export **por
> rango** — columnas `[1]Fecha Movimiento [3]AG [7]Descripción [20]Nro Documento [25]Monto [29]Saldo`,
> cabecera `Cuenta:` en **B8** / valor en **E8** = `10000024346492` (limpia, **sin** prefijo `BUNCA`),
> encabezados de columna en **fila 16**, datos en filas 17–37 (21 movimientos), decimales explícitos
> (**sin** centavos implícitos). **Checksum DERIVADO verificado**: saldo inicial derivado `3.143,43` +
> neto `8.765,97` = `11.909,40` = saldo de la última fila ✅. El export "extendido" queda
> **descartado** (sin columna Saldo, topado en 12 movimientos, 3 columnas de contraparte vacías en
> las 12 filas). El adaptador de TXT ancho fijo, el strip del prefijo `BUNCA` y el chequeo de archivo
> mezclado **se caen del corte de v1** — quedan documentados como trabajo diferido (design §4.3.2),
> no se implementan. **Filas verificadas correctas** (no las 7/15/38/40/44 que un reviewer citó por
> error leyendo el export descartado): `Cuenta:` fila **8**, encabezados fila **16**, Total Créditos
> fila **39**, Total Débitos fila **41**, Total fila **45**.
>
> **`UNION_XLSX` es un dialecto PROPIO** — NO comparte generador con BancoSol/Económico (columnas y
> cabecera de otra fuente). Ninguna tarea de abajo reusa el mapeo de columnas ni las etiquetas de
> `bancosol.dialecto.ts`/`economico.dialecto.ts`. Puede instanciarse sobre el mismo motor genérico
> `XlsxCoreExtractoParser` (parametrizado por su propio `DialectoXlsx`) si la abstracción alcanza, o
> como parser propio (`UnionXlsxExtractoParser implements ExtractoParserPort`) si no — a decidir en
> implementación, no es una decisión de esta lista de tareas.

- [x] 4.1 RED `[DOM]` `reconoce()` del dialecto/parser Unión-XLSX (test "anti-reuso de mapeo", design
      §11): `true` solo para el fixture Unión-XLSX anonimizado (hoja `ExtractoMovimientosFechas`,
      cabecera `Cuenta:` sin prefijo, columnas propias); `false` contra los fixtures
      BancoSol/Económico y viceversa — parsear el fixture de Unión con el dialecto de BancoSol debe
      FALLAR por etiquetas ausentes, nunca devolver datos corridos.
- [x] 4.2 RED `[DOM]` la etiqueta de la columna de monto es literalmente `'Monto\n'` — **con salto de
      línea** — en el fixture real; el mapeo por nombre de cabecera (reusa `normalizarDescripcion` de
      2.7/2.8 para normalizar etiquetas, que colapsa saltos/espacios y hace `trim`) debe matchearla;
      un mapeo por índice o un `===` sobre la etiqueta cruda fallaría acá.
      **Nota de apply (slice 4)**: leído a través de `read-excel-file` (`trim` por defecto), la celda
      de este fixture ya llega SIN el salto de línea final (`'Monto'`) — la librería lo recorta antes
      de que nuestro código la vea. El test se escribió a nivel de `normalizarDescripcion('Monto\n')`
      (defensivo, no depende de la librería) porque es la garantía que el design pide: matchea igual
      si algún re-export futuro sí conserva el salto.
- [x] 4.3 GREEN dialecto/parser Unión-XLSX — mapeo de columnas por NOMBRE de cabecera (`Fecha
      Movimiento`, `AG`, `Descripción`, `Nro Documento`, `Monto`, `Saldo`), `columnasDescripcion:
      ['Descripción']`, sin reusar índices ni etiquetas de los otros 2 perfiles.
- [x] 4.4 RED `[DOM]` `parse()` contra el fixture Unión-XLSX anonimizado: 21 movimientos, orden
      ASCENDENTE (02/04–13/07), primer/último movimiento correctos; monto con decimales explícitos
      vía `leerMontoCelda` de slice 2 (padding+miles+signo: `'             12,600.00'`→`12600.00`
      CREDITO, `'               -900.00'`→`900.00` DEBITO) — sin cirugía de centavos implícitos (esa
      es del TXT descartado, fuera de v1).
      **Bug real encontrado y arreglado (slice 4)**: el motor compartido `xlsx-core-extracto-parser.ts`
      leía TODAS las filas tras el header hasta EOF, saltando (`continue`) las filas en blanco de la
      columna Fecha. El bloque de totales de Unión reutiliza esa misma columna para sus etiquetas
      ("Total Créditos:", "Tránsito", …) — el parser intentaba leerlas como fecha y reventaba. Fix:
      `continue` → `break` en la primera fila en blanco (fin real de la tabla). Verificado sin impacto
      en BancoSol/Económico: sus 4 fixtures reales NO tienen filas en blanco tras el header (datos
      corridos hasta EOF) — el codepath nunca se ejercitaba para ellos, cero cambio de conducta
      (231→247 tests del módulo, mismo verde).
- [x] 4.5 RED `[DOM]` REQ-CB-08 checksum — **ANCLA** (define la estrategia `DERIVADO`): saldo inicial
      derivado = `saldo(primer movimiento) − monto(primer movimiento)` = `3.143,43`; neto de los 21
      montos = `8.765,97`; `3.143,43 + 8.765,97 = 11.909,40` == saldo de la última fila.
- [x] 4.6 RED `[DOM]` REQ-CB-08 **verificación ADICIONAL** del adaptador (no es la estrategia, no
      cambia la clasificación `DERIVADO`): Total Créditos declarado fila **39** = `12.618,94` ==
      Σ montos > 0; Total Débitos declarado fila **41** = `3.852,97` == Σ|montos < 0|; Total/
      Disponible declarado fila **45** = `11.909,40` == saldo final; saldo corrido coherente fila a
      fila (`saldoᵢ₋₁ + montoᵢ = saldoᵢ`) en las 21 filas.
- [x] 4.7 RED `[DOM]` extracción de `numeroCuentaDeclarado`: etiqueta `'Cuenta:'` en **B8**, valor en
      **E8** — limpio, sin prefijo `BUNCA` (a diferencia del TXT descartado); solo separadores del VO;
      `descriptor.exponeNumeroCuenta = true` confirmado con evidencia real.
      **Corrección de apply (slice 4, fixture manda)**: el valor REAL del fixture anonimizado (slice 0)
      es `'86698879426068'`, NO `'10000024346492'` como citan design/esta lista — ese último
      corresponde al documento original antes de anonimizar. Verificado abriendo el `.xlsx` real;
      checksums y fechas SÍ coinciden con lo documentado.
- [x] 4.8 GREEN wiring completo del parser/dialecto Unión-XLSX + `descriptor`
      (`estrategiaChecksum:'DERIVADO'`, `exponeNumeroCuenta:true`).
- [x] 4.9 `conciliacion-bancaria.module.ts`: registrar el parser Unión-XLSX en `EXTRACTO_PARSERS` bajo
      `PerfilExtracto.UNION_XLSX` — el chequeo de bootstrap del registry cubre los 3 valores del enum.
      **Decisión de apply**: se agregó `ExtractoParserRegistry` como provider (Nest lo instancia eager
      → su fail-fast corre en cada boot) SIN reemplazar `ExtractoParserLookupService` en los call sites
      (`ExtractoImportadorService`, `CuentasBancariasController`) — cierra el TODO del slice 3 con cero
      blast radius sobre código/specs ya probados. Verificado con e2e real: bootstrap no crashea y
      `GET /perfiles` devuelve los 3 perfiles.
- [x] 4.10 RED `[INT]` REQ-CB-16 aplicado a Unión-XLSX: mismo contrato que BancoSol/Económico — número
      coincide (con o sin formateo distinto) → pasa; número de otra cuenta → 422
      `CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE` con ambos números, cero filas persistidas.
- [x] 4.11 GREEN ajustes finales del service de importación para el 3er perfil.
- [x] 4.12 RED `[E2E]` regresión: los 3 perfiles (`BANCOSOL_XLSX`, `ECONOMICO_XLSX`, `UNION_XLSX`)
      conviven sin colisión en `GET /api/cuentas-bancarias/perfiles`.
- [x] 4.13 `[OPENAPI]` Regenerar si `descriptor` agregó campos al DTO de perfiles. **No aplica**: el
      descriptor de Unión no agregó campos nuevos al DTO; `git diff` de `openapi.json` tras
      `openapi:dump` es vacío (`UNION_XLSX` ya estaba en el enum Prisma regenerado en slice 0/3).

> ⚠️ **Riesgo del change (R14, confirmado en design rev5 §13 — registrar en `proposal.md` por quien
> lo mantiene)**: v1 queda con **tres adaptadores XLSX y ningún formato no-Excel** (Unión pasó de TXT
> a XLSX). Se pierde la validación temprana de que el puerto `ExtractoParserPort` aguanta un formato
> estructuralmente distinto. Costo aceptado conscientemente (design): entregar peor calidad de dato
> solo para ejercitar la abstracción está al revés. La firma del puerto (`parse(buffer: Buffer)`,
> `ExtractoParseado` sin nada que presuponga celdas) es la mitigación de diseño; la validación real
> llega con `UNION_TXT` o MT940 en un slice futuro.

## Slice 5 — Workspace `/conciliacion`

> ✅ **Slice 5 BACKEND (5.1-5.35) COMPLETO** (2026-07-23). Las tareas 5.36-5.39 (frontend) quedan
> deliberadamente fuera de esta tanda — se hacen con el usuario presente para smokear la UI.
>
> **Verde real**: `pnpm exec jest src/` → **199 suites / 2682 tests** (+1 todo). Módulo
> `conciliacion-bancaria` → 25 suites / 285 tests (37 nuevos de slice 5: 8 del adapter de
> `LineasCuentaReaderPort` + 15 del workspace + 15 del match service + 8 de ignorar/des-ignorar;
> el conteo total del módulo no incluye el adapter, que vive en `comprobantes/`). E2E completo
> `test/` → **45 suites / 592 tests** verdes (incl. 10 nuevos en `conciliacion-workspace.e2e-spec.ts`;
> `auth-logout-all` NO falló esta corrida). `tsc --noEmit` limpio, `pnpm run lint` limpio.
> Frontend: `tsc -b` limpio, 215 files / 1642 tests verdes. `openapi:dump` + `gen:api-types`
> regenerados y determinísticos.
>
> **Decisión de código de error NO prevista por el spec (5.16)**: REQ-CB-17 escenario 2 ("confirmar
> contra un movimiento que YA tiene match") no fija código en `spec.md`. Reusar
> `CONCILIACION_MOVIMIENTO_YA_CONCILIADO` habría hecho que UN código estable viajara con DOS status
> HTTP distintos (409 acá, 422 en REQ-CB-18) — inaceptable para un contrato público (§6.3). Se creó
> `CONCILIACION_MOVIMIENTO_YA_TIENE_MATCH` (409, `ConflictError`) propio.
>
> **Implicación de diseño encontrada al implementar 5.18 (reemplazo de match roto)**: al borrar el
> match roto para poner el nuevo, el movimiento del match VIEJO queda con `estado=CONCILIADO` y sin
> match — viola la invariante `estado==='CONCILIADO' ⟺ existe MatchConciliacion` (design §2.3). El
> `crearMatch` lo devuelve explícitamente a `PENDIENTE` dentro de la MISMA `$transaction`. El design
> describe el reemplazo pero no menciona este efecto sobre el movimiento huérfano. Cubierto por test.
>
> **Borde de REQ-CB-18 resuelto por lectura literal del spec**: un movimiento con match de vínculo
> ROTO **sí** puede ignorarse (el spec solo prohíbe la transición cuando el match es *válido*), y el
> match roto **no** se borra (el preámbulo de REQ-CB-18 dice que ignorar "NUNCA crea o borra ningún
> `MatchConciliacion`"). Queda entonces `estado=IGNORADO` con un match roto vivo: es coherente en
> pantalla (`estadoEfectivo=IGNORADO`) y no bloquea nada, porque `crearMatch` sabe reemplazar un
> match roto que ocupa el ancla (§2.4). Test dedicado: `5.30bis`.
>
> **`LineasCuentaReaderModule` necesita `TenantContextService` como provider local**, no solo
> `PrismaService` — `PrismaService` lo inyecta en su constructor. El molde
> `periodos-reader.module.ts` ya lo listaba; omitirlo revienta el bootstrap de TODA la app con
> `Nest can't resolve dependencies of the PrismaService`. Cazado por el e2e (los tests de
> integración construyen los adapters a mano y no pasan por DI, así que NO lo detectan).
>
> **Refactor de boundary (no estaba en las tareas)**: `mapeo-linea-contable.ts` en la raíz del
> módulo — `claveAncla`/`ladoYMonto`/`aLineaContableActual`/`aSnapshot` compartidos por
> `ConciliacionService` (lectura) y `MatchConciliacionService` (escritura). Si divergieran, un match
> podría verse roto en el panel y sano al confirmar contra él. Vive FUERA de `domain/` porque conoce
> el shape del puerto `LineaCuentaRow` (y para no ensuciar la métrica de cobertura de `domain/`).
>
> **`tenant-request.ts` (nuevo, raíz del módulo)**: `resolveTenantId` + `AuthenticatedRequest` se
> extrajeron de `cuentas-bancarias.controller.ts` (slice 1) para que los 3 controllers compartan UNA
> implementación. Único archivo de slice 1-4 tocado en lógica, y el cambio es mecánico (mismo código,
> movido); cubierto por los 8 e2e preexistentes de `cuentas-bancarias`, que siguen verdes.
>
> **`test/helpers/test-factory.ts`**: se agregó `matchConciliacion.deleteMany({})` al cleanup, en el
> lugar exacto que el comentario previsor de slice 3 dejaba marcado ("MatchConciliacion llega en
> slice 5: agregar su limpieza ACÁ").
>
> **Contrato del workspace**: `GET /api/conciliacion` exige rango (`desde`/`hasta`, `YYYY-MM-DD`) —
> sin acotar, la lectura crece sin techo. `CONCILIACION_RANGO_INVALIDO` (422) si `desde > hasta`.
> El `estadoEfectivo` del movimiento se resuelve con vínculo-válido > `IGNORADO` > `PENDIENTE`: un
> match SANO manda sobre la columna, y uno ROTO devuelve el movimiento al pool en la misma respuesta.

- [x] 5.1 `backend/src/comprobantes/ports/lineas-cuenta-reader.port.ts`: crear `LineasCuentaReaderPort`
      (design §3) con `listarPorCuentaEnRango` + `listarPorAnclas`.
- [x] 5.2 RED `[INT]` `backend/src/comprobantes/adapters/prisma-lineas-cuenta-reader.adapter.integration.spec.ts`:
      solo `CONTABILIZADO`/`BLOQUEADO` + `anulado=false`; orden determinístico `fechaContable ASC,
      numero ASC NULLS LAST, comprobanteId ASC, orden ASC`; aislamiento por tenant (Anti-31);
      `listarPorAnclas` resuelve anclas puntuales SIN filtrar por anulado/estado (diagnóstico).
- [x] 5.3 GREEN `prisma-lineas-cuenta-reader.adapter.ts` (query builder Prisma, NO `$queryRaw` —
      design §3).
- [x] 5.4 `backend/src/comprobantes/lineas-cuenta-reader.module.ts`: módulo-puerto leaf calcado de
      `periodos-reader.module.ts` (cero imports de módulos, imposible cerrar ciclo CJS).
- [x] 5.5 `ports/match-conciliacion.repository.port.ts` + adapter Prisma (último de los 4 repos del
      módulo).
- [x] 5.6 `conciliacion.service.ts` (workspace) — esqueleto: orquesta `A` (movimientos propios) + `B`
      (`LineasCuentaReaderPort`) + `M` (matches) → `verificarAnclas` (dominio, slice 2) →
      `estadoEfectivo`, `EN_TRANSITO` derivado, `sugerir(...)` (design §10, flujo Workspace).
- [x] 5.7 RED `[INT]` **REQ-CB-11 (gap cerrado — no tenía tarea propia)**: una línea contable de la
      cuenta banco, dentro del rango consultado, sin `MatchConciliacion` con vínculo válido → aparece
      en la respuesta marcada `EN_TRANSITO`; **NINGUNA fila persistida representa ese estado** — el
      enum Prisma `EstadoMovimientoBancario` ni siquiera admite el valor `EN_TRANSITO`; el test
      confirma explícitamente que `movimientos_bancarios`/`matches_conciliacion` no cambiaron tras la
      consulta. Antes lo implementaban de pasada 5.6/5.11 sin test propio.
- [x] 5.8 RED `[INT]` REQ-CB-10/11: movimiento con match roto → columna DB `estado=CONCILIADO`,
      respuesta `estadoEfectivo=PENDIENTE` con motivo, **cero** `UPDATE` ejecutado en la lectura.
- [x] 5.9 RED `[INT]` caso benigno (design §2.4 / spec escenario): `orden` corrido tras editar el
      comprobante pero la línea que ocupa ese `orden` coincide en los 5 campos del snapshot → vínculo
      válido, sigue `CONCILIADO`.
- [x] 5.10 RED `[INT]` **test dedicado obligatorio del riesgo C-1**: editar el CONJUNTO de líneas de
      un comprobante conciliado (insertar línea al principio, corre los `orden`) → el ancla que
      terminó apuntando a otro contenido rompe → `estadoEfectivo=PENDIENTE` con motivo correcto
      (`MONTO_CAMBIADO`/`CUENTA_CAMBIADA` según el caso).
- [x] 5.11 RED `[INT]` anular el comprobante → `COMPROBANTE_ANULADO`; mover `fechaContable` fuera del
      rango consultado → línea ausente de `B`, ancla huérfana resuelta vía `listarPorAnclas` (1 query
      acotada, solo si hay huérfanas).
- [x] 5.12 GREEN `conciliacion.service.ts` — `obtenerWorkspace` (cierra 5.7-5.11).
- [x] 5.13 `conciliacion.controller.ts`: `GET /api/conciliacion?cuentaBancariaId&desde&hasta`.
- [x] 5.14 `match-conciliacion.service.ts` — esqueleto: `crearMatch` / `borrarMatch` (REQ-CB-17, **la
      acción central del producto**).
- [x] 5.15 RED `[INT]` **REQ-CB-17 escenario 1**: confirmar una sugerencia (cualquier confianza) entre
      un movimiento `PENDIENTE` sin match y una línea `EN_TRANSITO` sin match → crea
      `MatchConciliacion` con snapshot de los 5 campos de la línea en ese instante +
      `MovimientoBancario.estado` pasa a `CONCILIADO`.
- [x] 5.16 RED `[INT]` **REQ-CB-17 escenario 2**: confirmar contra un movimiento que YA tiene un match
      válido → rechaza — la constraint `@@unique([organizationId, movimientoBancarioId])` no permite
      un segundo match para el mismo movimiento.
- [x] 5.17 RED `[INT]` **REQ-CB-17 escenario 3**: confirmar contra una línea `(comprobanteId, orden)`
      con un `MatchConciliacion` existente cuyo vínculo está SANO → `409
      CONCILIACION_LINEA_YA_CONCILIADA`, el match existente permanece intacto.
- [x] 5.18 RED `[INT]` **REQ-CB-17 escenario 4**: confirmar contra una línea cuyo `MatchConciliacion`
      previo está ROTO (design §2.4) → el sistema borra el match roto (escritura explícita disparada
      por la confirmación del usuario) y crea el nuevo en su lugar — sin match huérfano.
- [x] 5.19 GREEN `crearMatch` (cierra 5.15-5.18).
- [x] 5.20 RED `[INT]` invariante: `crearMatch`→columna `estado=CONCILIADO`
      (`estado==='CONCILIADO' ⟺ existe MatchConciliacion`, design §2.3).
- [x] 5.21 RED `[INT]` **REQ-CB-17 escenario 5**: deshacer un match → `MatchConciliacion` se borra y
      `MovimientoBancario.estado` vuelve a `PENDIENTE`; el comprobante y sus líneas contables NO se
      modifican (decisión 3, REQ-CB-15) — operación exclusiva de la tabla de conciliación.
- [x] 5.22 GREEN `borrarMatch` (cierra 5.20/5.21).
- [x] 5.23 RED `[INT]` REQ-CB-13: aislamiento cross-tenant para `MatchConciliacion` (confirmar o
      deshacer un match de otro tenant por id → 404, nunca expone ni permite operar datos de otra
      org).
- [x] 5.24 GREEN cierre de 5.23 en `match-conciliacion.service.ts`.
- [x] 5.25 `conciliacion.controller.ts`: `POST`/`DELETE /api/conciliacion/matches[/:id]` (wiring de
      5.14-5.24).
- [x] 5.26 `movimientos-bancarios.controller.ts` — esqueleto: `PATCH
      /api/movimientos-bancarios/:id/estado` (REQ-CB-18, ignorar / des-ignorar).
- [x] 5.27 RED `[INT]` **REQ-CB-18 escenario 1**: ignorar un `MovimientoBancario` con
      `estado=PENDIENTE` → `estado` pasa a `IGNORADO`.
- [x] 5.28 RED `[INT]` **REQ-CB-18 escenario 2**: des-ignorar un movimiento `IGNORADO` → `estado`
      vuelve a `PENDIENTE`.
- [x] 5.29 RED `[INT]` **REQ-CB-18 escenario 3**: ignorar un movimiento `PENDIENTE` sin match no crea
      ni borra ningún `MatchConciliacion`; el movimiento no se borra, solo cambia su `estado`.
- [x] 5.30 RED `[INT]` **REQ-CB-18 escenario 4**: ignorar un movimiento con `estado=CONCILIADO` y
      vínculo SANO → rechaza con `422 CONCILIACION_MOVIMIENTO_YA_CONCILIADO`, exige deshacer el match
      primero (REQ-CB-17) — nunca queda simultáneamente "conciliado" e "ignorado".
- [x] 5.31 GREEN implementación de ignorar/des-ignorar (cierra 5.27-5.30).
- [x] 5.32 RED `[E2E]` REQ-CB-12: sugerencias ALTA/MEDIA/BAJA calculadas sobre el workspace real;
      ninguna sugerencia crea un `MatchConciliacion` sin acción explícita del usuario.
- [x] 5.33 RED `[E2E]` REQ-CB-14 fail-closed: usuario solo `.read` → endpoints de escritura devuelven
      403; usuario `.read`+`.conciliar` → acciones permitidas.
- [x] 5.34 GREEN guards/permisos finales en los 3 controllers del módulo.
- [x] 5.35 `[OPENAPI]` Regenerar (workspace + matches + estado de movimiento).
> ✅ **Slice 5B FRONTEND (5.36-5.39) COMPLETO** (2026-07-23). Strict TDD, RED→GREEN por unidad.
>
> **Verde real**: `pnpm exec vitest run` → **226 archivos / 1767 tests** (baseline previa 215/1642 →
> **+11 archivos, +125 tests**), corrido DOS veces para descartar flakiness. `pnpm exec tsc -b`
> limpio, `pnpm run lint` limpio. Backend NO tocado; `openapi.json` y `api.generated.ts` NO tocados
> (contract-drift safe) — lo único que se agregó en tipos es `src/types/api.ts`, la fachada escrita
> a mano (aliases de importaciones de extracto, que faltaban).
>
> **Gating = "modo consulta" a nivel PANTALLA (decisión de producto FIRMADA por Marco)**: REQ-CB-14
> dice que las acciones quedan "ocultas" y cita `frontend/CLAUDE.md §14.7` como respaldo, pero §14.7
> dice lo CONTRARIO para botones ("deshabilitar + tooltip, NO ocultar"). Resolución: sin
> `contabilidad.conciliacion.conciliar` la pantalla muestra UN banner de "Modo consulta" arriba y las
> acciones por fila NO se renderizan. Motivo: `<PermissionButton>` por fila llenaría 2 paneles de
> decenas de botones grises repitiendo el mismo tooltip — la afordancia deja de informar por
> saturación. Es **excepción documentada a §14.7 para pantallas densas en acciones repetidas por
> fila**, NO generalizable. La ruta y el ítem de sidebar siguen ocultándose/bloqueándose fail-closed
> sin `.read` (ahí §14.7 sí manda ocultar). Está escrito en el JSDoc de `ModoConsultaBanner`.
> **PENDIENTE para el PR final**: reflejar esta excepción en el texto de `REQ-CB-14` del spec.
>
> **La UI renderiza `estadoEfectivo`, NUNCA la columna `estado`**. `EstadoMovimientoBadge` recibe el
> movimiento ENTERO a propósito (no un `estado: string`): así es imposible pasarle la columna
> persistida por error. Test dedicado: columna `CONCILIADO` + `vinculo.roto` → la pantalla muestra
> "Pendiente" y NUNCA "Conciliado", más el motivo de ruptura legible en español (los 7 motivos
> traducidos, no se traga ninguno).
>
> **UI de importación de extracto construida aunque NINGUNA tarea la pedía** (hueco del plan: hay
> tareas FE para el CRUD de cuentas (1.14-1.16) y para el workspace (5.36-5.39), pero ninguna para
> `POST /:id/importaciones`). Sin ella no hay forma de meter un movimiento desde el navegador y el
> workspace es incontrasteable. Vive en `ImportacionesDrawer` junto al historial, incluye el flujo
> de DOS viajes de REQ-CB-16 (número de cuenta detectado → confirmación explícita del usuario → recién
> ahí importa) y muestra contadores, checksum y advertencias sin tragárselos.
>
> **`ImportacionesDrawer` vive en `features/cuentas-bancarias/`** (el endpoint es sub-recurso de la
> cuenta) y el workspace lo importa cross-feature con el comentario de §14.6. Su prop es
> `CuentaBancariaResumen {id, alias}` y no `CuentaBancaria`, porque el workspace devuelve una
> proyección más chica (`CuentaBancariaWorkspaceDto`) y ambas calzan estructuralmente. Precedente de
> import cross-feature de componentes: 10 casos ya en el repo (`topbar`, `dashboard-shell`, etc.).
>
> **Match MANUAL incluido además del de sugerencias**: el motor solo sugiere con monto exacto, así
> que sin selección manual un movimiento sin candidato exacto solo podría ignorarse. Radios en ambos
> paneles + barra "Conciliar seleccionados"; el manual va SIN `confianzaSugerida` (no salió del motor).
>
> **Secciones con `aria-label`** (`role="region"`): la pantalla es densa y el mismo movimiento aparece
> en el panel de sugerencias Y en el de movimientos. Sin nombre accesible por panel, ni el usuario de
> lector de pantalla ni los tests pueden distinguirlos.
>
> **Test del router con timeout explícito de 60s**: importar `@/routes/router` arrastra TODAS las
> páginas (incluido `@react-pdf/renderer`) y con la suite completa en paralelo supera los 5s por
> defecto. Es costo de import, no de lógica — se cazó porque el test pasaba aislado y fallaba en la
> corrida completa.

- [x] 5.36 `[FE]` `frontend/src/features/conciliacion/` (molde `features/libro-mayor/`): 2 paneles
      (movimientos bancarios / líneas en tránsito), badges de `estadoEfectivo`+motivo de vínculo roto,
      panel de sugerencias por confianza, drawer de historial de importaciones (`GET
      /:id/importaciones`), toggle "modo consulta".
- [x] 5.37 RED `[FE]` confirmar match, deshacer, ignorar/des-ignorar; REQ-CB-14 escenario 1 (botones
      ocultos en modo `.read`-only); REQ-CB-14 escenario 2 (ruta bloqueada sin `.read`, ítem ausente
      del sidebar). El ítem de sidebar ya estaba cubierto por `nav-list.test.tsx` (REQ-SB-10, tareas
      0.20-0.21); la ruta se cubrió con `conciliacion-route.test.tsx`.
- [x] 5.38 GREEN implementación de la feature.
- [x] 5.39 `[FE]` cablear el acceso al drawer de historial de importaciones desde
      `/settings/cuentas-bancarias` si no quedó resuelto en 1.14-1.16. NO estaba resuelto: se agregó
      botón "Extractos" por fila (gateado por `.read`, porque el historial es LECTURA; `importar` se
      gatea aparte dentro del drawer).

## Slice 6 — Atajo "crear asiento de comisión/ITF"

- [ ] 6.1 Verificar si el formulario `/comprobantes/nuevo` acepta precarga vía query params/estado de
      navegación (REQ-CB-15). Si NO la acepta hoy → diferir esta tarea documentando el motivo en
      engram, sin bloquear el cierre del change (`proposal.md` lo permite explícitamente para el
      slice 6).
- [ ] 6.2 Si la acepta: `frontend/src/features/conciliacion/lib/armar-precarga-comision.ts` — arma la
      URL/estado con fecha, monto y cuenta banco desde un movimiento `EN_TRANSITO` sospechoso de
      comisión/ITF (heurística sobre `descripcionNormalizada`).
- [ ] 6.3 RED `[FE]` botón "crear asiento" en un movimiento `EN_TRANSITO` navega a `/comprobantes/nuevo`
      con los campos prellenados; el comprobante NO se crea hasta que el usuario confirma el
      formulario existente (REQ-CB-15 escenario 1).
- [ ] 6.4 GREEN implementación del atajo.
- [x] 6.5 `[ARCH]` REQ-CB-15 escenario 2: test estático que recorre los controllers/services de
      `conciliacion-bancaria/` y falla si alguno invoca creación/edición/anulación de
      `Comprobante`/`LineaComprobante` — confirma que NO existe ningún writer-port hacia
      `comprobantes/`. Cerrado post-archive (2026-07-24) en
      `src/conciliacion-bancaria/no-escribe-comprobantes.arch.spec.ts` — ver nota de cierre arriba.

## Matriz de cobertura REQ-CB → tareas (verificación final, pedida por el coordinador)

Cada uno de los 18 requisitos tiene al menos 1 tarea de test y 1 de implementación:

| Requisito | Tareas de test (RED) | Tareas de implementación (GREEN) |
|---|---|---|
| REQ-CB-01 | 1.1 | 1.2 |
| REQ-CB-02 | 1.3 | 1.4 |
| REQ-CB-03 | 3.8, 3.27 | 3.9 |
| REQ-CB-04 | 3.11 | 3.12 |
| REQ-CB-05 | 3.17, 3.18, 3.19, 3.26 | 3.21, 3.30 |
| REQ-CB-06 | 3.29 | 3.21 |
| REQ-CB-07 | 2.11, 3.20 | 2.12, 3.21 |
| REQ-CB-08 | 2.17, 3.28, 4.5, 4.6 | 2.18 |
| REQ-CB-09 | 2.23 | 2.24 |
| REQ-CB-10 | 2.19, 5.8, 5.9, 5.10, 5.11 | 2.20, 5.12 |
| REQ-CB-11 | 5.7 | 5.12 |
| REQ-CB-12 | 2.21, 5.32 | 2.22 |
| REQ-CB-13 | 1.6, 3.14, 5.23 | 1.7, 3.15, 5.24 |
| REQ-CB-14 | 5.33, 5.37 | 5.34, 5.38 |
| REQ-CB-15 | 6.3, 6.5 | 6.4 |
| REQ-CB-16 | 2.1, 3.5, 3.22, 3.23, 3.24, 4.10 | 2.2, 3.9, 3.25 |
| REQ-CB-17 | 5.15, 5.16, 5.17, 5.18, 5.21 | 5.19, 5.22 |
| REQ-CB-18 | 5.27, 5.28, 5.29, 5.30 | 5.31 |

## Cierre transversal (checklist final, no es slice propio)

- [ ] `pnpm exec jest src/conciliacion-bancaria/domain --coverage` ≥95% (meta del design §11).
- [ ] `require-pack-tenant-guard.arch.spec.ts` cubre los 3 controllers nuevos sin modificarlo (ya
      genérico — confirmar, no reescribir).
- [ ] Confirmar que ningún controller expone `detectarHuecos` (REQ-CB-09 sigue sin endpoint en v1,
      `proposal.md` lo deja fuera explícitamente).
- [ ] Backend: `pnpm exec tsc --noEmit -p tsconfig.json` + `pnpm run lint` limpios.
- [ ] Frontend: `pnpm exec tsc -b` + `pnpm exec vitest run` limpios.
- [ ] CI `contract-drift` verde tras la regeneración final de `openapi.json` + `api.generated.ts`.
- [ ] Verificar uno a uno los 8 "Success Criteria" de `proposal.md` (incl. el checksum literal de BCP
      `4.6500000000000004`) antes de invocar `sdd-verify`.
- [ ] Verificar la matriz de cobertura de arriba contra el `tasks.md` final una vez aplicadas todas
      las tareas — cada REQ-CB-01..18 con ≥1 test y ≥1 implementación, sin huecos.
