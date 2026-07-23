# Tasks: Conciliación bancaria (pack `contabilidad.conciliacion`)

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

> Orden fijado por el design: el VO adversarial de cuenta bancaria **primero** — es la regla más
> fácil de romper y la única cuyo fallo es silencioso.

- [ ] 2.1 RED `[DOM]` `domain/numero-cuenta-bancaria.spec.ts` — **TEST ADVERSARIAL PRIMERO**: los 3
      números reales (`1191959-000-001`, `-002`, `-003`) comparados de a pares dan `false` en los
      **6 pares cruzados**, `true` solo consigo mismos; equivalencias de normalización (guiones,
      espacios, NBSP, puntos); chequeo de superficie de tipo — el VO no expone getter del normalizado
      (un `startsWith` externo no debe compilar contra el tipo).
- [ ] 2.2 GREEN `domain/numero-cuenta-bancaria.ts`: `NumeroCuentaBancaria` (`private constructor` +
      `static of(raw)` + único método `equals()`, sin getter del normalizado — design §4.4, REQ-CB-16).
- [ ] 2.3 RED `[DOM]` `common/domain/fecha-contable.spec.ts`: `sumarDias`/`restarDias`/
      `diferenciaEnDias` — cruce de mes, cruce de año, bisiesto (28→29 feb 2028), negativos.
- [ ] 2.4 GREEN extender `common/domain/fecha-contable.ts` (design §5.4).
- [ ] 2.5 RED `[DOM]` `common/domain/money.spec.ts` (**CRITICAL-3**, NUEVO): `igualaConTolerancia`
      — dentro de tolerancia `±0.01` → `true`; borde exacto `0.01` → `true`; fuera → `false`;
      simétrico `a.iguala(b) === b.iguala(a)`; USD y BOB con el mismo `0.01`; caso real BCP
      `4.6500000000000004` vs `4.65` → `true`. NO tocar `balanceadoEnBobCon`/`TOLERANCIA_BOB` (son
      del core contable, semántica BOB).
- [ ] 2.6 GREEN `common/domain/money.ts`: agregar `igualaConTolerancia(other, tolerancia =
      Money.of('0.01'))`, currency-neutral (design §8.0). `equalsConTolerancia`/`redondear`/`toFixed`
      NO EXISTEN — no inventarlos.
- [ ] 2.7 RED `[DOM]` `domain/normalizar-descripcion.spec.ts`: NFKC, diacríticos, uppercase,
      NBSP/tabs/saltos, truncado a 200 (casos reales #953: `DEPÓSITO`/`DEPOSITO`, NBSP de XLSX).
- [ ] 2.8 GREEN `domain/normalizar-descripcion.ts`.
- [ ] 2.9 RED `[DOM]` `domain/orden-canonico.spec.ts`: clave total fecha→monto(centavos string,
      zero-padded)→tipo→descripcionNormalizada→referencia(null último); el mismo conjunto en ASC y
      DESC produce igual secuencia (caso real Fortaleza #953: 30 movs DESC vs 73 movs ASC, mismo
      período → mismo orden tras `ordenarCanonico`).
- [ ] 2.10 GREEN `domain/orden-canonico.ts` — `ordenarCanonico`.
- [ ] 2.11 RED `[DOM]` `domain/ordinal-dia.spec.ts` (REQ-CB-07): dos movimientos idénticos mismo día →
      `ordinalDia=0` y `=1`, ninguno se descarta; grupo recompuesto en distinto orden de entrada da
      mismos ordinales; contar **por grupo de tupla**, no por día completo (un import parcial no debe
      correr los ordinales de otros grupos).
- [ ] 2.12 GREEN `domain/ordinal-dia.ts` — `asignarOrdinalDia`.
- [ ] 2.13 RED `[DOM]` `domain/hash-dedup.spec.ts`: separador Unit Separator `` evita colisión
      `('AB','C')` vs `('A','BC')`; `montoCentavos = money.toBob()` como string (`"12600.00"`), nunca
      `number`; prefijo de versión `v1`.
- [ ] 2.14 GREEN `domain/hash-dedup.ts` — `calcularHashDedup`.
- [ ] 2.15 RED `[DOM]` `domain/lado-contable.spec.ts`: `ladoContableEsperado('CREDITO')==='DEBITO'` y
      viceversa (§5.1 — la inversión banco↔empresa, la pieza más fácil de invertir por error;
      `LadoBancario` entra, `LadoContable` sale — son DOS tipos, no el mismo reusado).
- [ ] 2.16 GREEN `domain/lado-contable.ts`.
- [ ] 2.17 RED `[DOM]` `domain/checksum-extracto.spec.ts`: `DECLARADO` cuadra / no cuadra
      (`DESCUADRE`+`diferencia`, nunca rechaza, vía `Money.igualaConTolerancia`); `DERIVADO` parte de
      la fila más antigua tras `ordenarCanonico`; `IMPOSIBLE`→`SIN_VERIFICAR`. Checksums reales:
      BancoSol XLSX derivado `3.275,55 + (−3.040,38) = 235,17`; Económico XLSX declarado
      `327.520,14 + (−147.762,77) = 179.757,37`.
- [ ] 2.18 GREEN `domain/checksum-extracto.ts` — `verificarChecksum`.
- [ ] 2.19 RED `[DOM]` `domain/verificar-anclas.spec.ts` (REQ-CB-10, corrección C-1): línea intacta →
      válido; `orden` corrido pero snapshot coincide en los 5 campos (caso benigno) → válido; línea
      inexistente → `LINEA_INEXISTENTE`; comprobante anulado → `COMPROBANTE_ANULADO`; monto distinto
      (vía `Money.igualaConTolerancia`) → `MONTO_CAMBIADO`; `snapshotTipo` (`LadoContable`) invertido
      → `LADO_CAMBIADO`; moneda distinta → `MONEDA_CAMBIADA`; fecha distinta → `FECHA_CAMBIADA`.
      Función pura — no ejecuta ninguna escritura.
- [ ] 2.20 GREEN `domain/verificar-anclas.ts`.
- [ ] 2.21 RED `[DOM]` `domain/motor-sugerencias.spec.ts` (REQ-CB-12, §5.2): `ALTA` (fecha exacta +
      candidato único en ambas direcciones); `MEDIA` (fecha ±3 días, candidato único); `BAJA`
      (múltiples candidatos de cualquier lado); `l.monto.igualaConTolerancia(p.monto)` para el match
      de monto; orden total de salida (confianza DESC → |diffDias| ASC → comprobanteId ASC → orden
      ASC) determinístico e independiente del orden de entrada; nunca produce un `MatchConciliacion`
      — solo la lista ranqueada.
- [ ] 2.22 GREEN `domain/motor-sugerencias.ts` — `sugerir`.
- [ ] 2.23 RED `[DOM]` `domain/cobertura-extracto.spec.ts` (REQ-CB-09): dos rangos con hueco entre
      ellos → reporta el tramo no cubierto; rangos contiguos/solapados → sin huecos.
- [ ] 2.24 GREEN `domain/cobertura-extracto.ts` — `detectarHuecos` (lógica lista; NO se expone por
      endpoint en v1, proposal "cae de regalo"; confirmar en el cierre transversal que ningún
      controller la cablea).
- [ ] 2.25 RED `[DOM]` `adapters/parsing/dinero.spec.ts` (boundary, testeable sin DB): `leerMontoCelda`
      con casos reales #953/design§8.1 — BCP `4.6500000000000004`→`4.65` exacto (nunca `Number()`);
      Fortaleza `Bs.  16,000.00`; **Unión XLSX** `'             12,600.00'`→`12600.00` CREDITO y
      `'               -900.00'`→`900.00` DEBITO (trim + quitar miles, signo determina `tipo`); FIE
      `+50,450.00`/`-31,000.00` (signo determina `tipo`). El caso "Unión TXT centavos implícitos"
      (`1260000`→`12600.00`) NO se implementa — es perfil futuro (design §4.3.2), el XLSX de v1 trae
      decimales explícitos.
- [ ] 2.26 GREEN `adapters/parsing/dinero.ts` — `leerMontoCelda` ÚNICAMENTE. `insertarPuntoDecimal`
      NO se implementa en v1 (queda documentado como necesidad de un futuro perfil ancho-fijo).
- [ ] 2.27 RED `[DOM]` `adapters/parsing/fechas.spec.ts`: serial Excel BancoSol
      `46224.6478587963` (época 1899-12-30, hora=fracción redondeada, guarda `1≤ent≤60000`);
      Económico `03/Jun/2026` con mapa español sin diacríticos (`SET` alias `SEP`), `new Date(string)`
      PROHIBIDO; Unión XLSX `02/04/2026` (`DD/MM/YYYY` string, split por espacio si trae hora);
      `20260701` slice 4/2/2.
- [ ] 2.28 GREEN `adapters/parsing/fechas.ts`.
- [ ] 2.29 `pnpm exec jest src/conciliacion-bancaria/domain --coverage` — cerrar huecos hasta ≥95%.

## Slice 3 — Adaptador XLSX core-compartido (BancoSol + Económico)

- [ ] 3.0 Verificar (no decidir — ya resuelto por el coordinador) que `design.md` **revisión 5** usa
      los códigos `CONCILIACION_ARCHIVO_*` de `spec.md` para las compuertas de extracto
      (`PERFIL_NO_COINCIDE`, `XLS_LEGACY`, `CUENTA_NO_COINCIDE`, `CUENTA_NO_VERIFICABLE`,
      `FORMATO_NO_RECONOCIDO`, `MEZCLADO`). Si alguna mención quedó desactualizada, reportarlo — no
      editar `design.md` desde este change (lo mantiene otro agente).
- [ ] 3.1 `package.json`: fijar `read-excel-file` en versión **exacta** `9.3.4` (no `^9.x`).
- [ ] 3.2 `ports/extracto-parser.port.ts`: `ExtractoParserPort` abstracto + `DescriptorPerfilExtracto`,
      `MovimientoParseado`, `ExtractoParseado` (design §4.1).
- [ ] 3.3 RED `[DOM]` riesgo R4 **ampliado a los 3 fixtures de v1** (design rev5): `parseNumber`
      recibe TODA celda como string en BancoSol, Económico y Unión; **Económico debe devolver sus
      movimientos reales, NO cero filas** — su XLSX envuelve todos los elementos en el prefijo de
      namespace `x:` (`<x:worksheet>`, `<x:row>`, `<x:c>`, `<x:v>`) y un lector que matchee
      `row`/`c`/`v` sin contemplar el namespace fallaría en silencio devolviendo una lista vacía.
- [ ] 3.4 RED `[DOM]` contra el fixture BancoSol de **20 movimientos**
      (`BancoSol-Extracto-1191959-000-001-23-07-2026.xlsx`, anonimizado en 0.2 — el criterio de
      checksum pertenece a ESTE archivo, no a `bancosol-A`): `reconoce()`→`true`; `parse()` con 20
      movimientos, checksum derivado `3.275,55 + (−3.040,38) = 235,17`; `numeroCuentaDeclarado`
      extraído de la etiqueta `Cuenta:` (celda `E4`) / valor (celda `G4`) = `'1191959-000-001'` —
      solo separadores del VO, sin prefijo/sufijo que limpiar.
- [ ] 3.5 RED `[DOM]` **CRITICAL-2** — Económico: `numeroCuentaDeclarado === '2031262031'` extraído
      del crudo `'CA: 2031262031 (Bs)'` (etiqueta `E4` = `'Cuenta:'`, IDÉNTICA a BancoSol; el VALOR en
      `G4` viene CON prefijo de producto `'CA:'` y sufijo de moneda `'(Bs)'` — el dialecto debe
      stripearlos); si el crudo NO arranca con `'CA:'` → 422 `CONCILIACION_ARCHIVO_FORMATO_NO_RECONOCIDO`,
      nunca un strip silencioso. Caza el bug que habría rechazado el 100% de las importaciones de
      Económico.
- [ ] 3.6 RED `[DOM]` contra fixture Económico anonimizado: `reconoce()` → `true`; `parse()` con
      fechas string `DD/Mmm/YYYY`, saldo inicial/final DECLARADO en cabecera (`Saldo Inicial` `M4` =
      `327.520,14` / `Saldo Final` `M5` = `179.757,37`), conteo de movimientos del fixture correcto.
- [ ] 3.7 RED `[DOM]` "renglón dorado" (design §4.5, WARNING cerrado): sobre una fila real conocida de
      BancoSol y de Económico, `descripcion === 'Transacción' + ' ' + 'Nota'` exacto
      (`columnasDescripcion` fijo por dialecto — el fixture de dedup R-1 NO discrimina esta elección
      con ningún resultado distinto, así que este es el único test que la fija; cambiarla después
      cambia el `hashDedup` de todo el histórico de la cuenta).
- [ ] 3.8 RED `[DOM]` cross-check: `reconoce()` del parser BancoSol → `false` contra el fixture
      Económico y viceversa; ambos → `false` contra el fixture Unión.
- [ ] 3.9 GREEN `adapters/xlsx-core-extracto-parser.ts` (`XlsxCoreExtractoParser` parametrizada por
      `DialectoXlsx`) + `adapters/dialectos/{bancosol,economico}.dialecto.ts` (incluye extracción y
      limpieza de número de cuenta por dialecto — `ExtraccionNumeroCuenta` design §4.3 — y
      `columnasDescripcion`).
- [ ] 3.10 RED `[DOM]` mapeo de columnas por NOMBRE de cabecera, nunca índice — reordenar columnas del
      fixture y seguir reconociendo/parseando igual.
- [ ] 3.11 RED `[DOM]` REQ-CB-04: `.xls` legacy con extensión renombrada a `.xlsx` (magic bytes OLE2
      `D0 CF 11 E0 A1 B1 1A E1`) → `CONCILIACION_ARCHIVO_XLS_LEGACY` (422), mensaje accionable
      ("Abrilo en Excel y guardalo como .xlsx"), NUNCA llega a `read-excel-file`.
- [ ] 3.12 GREEN detección de magic bytes con `file-type` antes del parseo (política propia — NO
      reusa `mime-whitelist.ts` de adjuntos).
- [ ] 3.13 `ports/{movimiento-bancario,importacion-extracto}.repository.port.ts` + adapters Prisma.
- [ ] 3.14 RED `[INT]` REQ-CB-13: aislamiento cross-tenant para `MovimientoBancario` e
      `ImportacionExtracto` (404 por id de otro tenant; listado siempre acotado al tenant activo,
      cualquiera sea el filtro aplicado).
- [ ] 3.15 GREEN adapters Prisma (cierra 3.13/3.14).
- [ ] 3.16 `extracto-importador.service.ts`: orquestar el flujo completo (design §10 — magic bytes →
      sha256 → `reconoce()` → `parse()` → `validarCuentaDestino` → `ordenarCanonico` →
      `asignarOrdinalDia` → `calcularHashDedup` → `verificarChecksum` → `$transaction`).
- [ ] 3.17 RED `[INT]` REQ-CB-05 "reimportar el mismo archivo" → `0 nuevos, N ya existían`, ningún
      `MovimientoBancario` existente se modifica ni se borra.
- [ ] 3.18 RED `[INT]` REQ-CB-05 "rango que solapa" (sintético, 2 sub-rangos) → unión sin huecos ni
      duplicados.
- [ ] 3.19 RED `[INT]` **Fixture real R-1, criterio de aceptación literal** (REQ-CB-05/07, fixtures
      `bancosol-A`/`bancosol-B` de 0.2 — dedicados a este criterio de dedup, NO al de checksum de
      3.4): importar A → **60 nuevos, 0 ya existían**; importar B después → **21 nuevos, 59 ya
      existían**; total distinto para la `CuentaBancaria` → **81**.
- [ ] 3.20 RED `[INT]` REQ-CB-07: dos movimientos idénticos el mismo día (comisiones ITF) → ambos
      persisten con `ordinalDia=0`/`=1`; reimportar el mismo archivo con las filas en orden inverso
      (fixture reordenado a mano) → mismos hashes, cero duplicados nuevos.
- [ ] 3.21 GREEN implementación completa del service + `$transaction` con
      `createMany({skipDuplicates:true})`.
- [ ] 3.22 RED `[INT]` REQ-CB-16 (orquestación del service — el VO ya se probó en 2.1/2.2, el strip de
      dialecto en 3.5): número coincide → importa; formato distinto, mismo número normalizado →
      importa; número de OTRA cuenta del mismo banco (`-002` contra `-001`) → 422
      `CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE`, mensaje con AMBOS números, **cero** filas de
      `ImportacionExtracto`/`MovimientoBancario` persistidas.
- [ ] 3.23 RED `[INT]` **REQ-CB-16 escenario 5 (NUEVO, sin tarea previa)**: perfil con
      `descriptor.exponeNumeroCuenta=true` pero el parser NO logra extraer el número de un archivo
      concreto (ej. cabecera dañada o etiqueta ausente en esa fila) → advertencia visible
      `CONCILIACION_ARCHIVO_CUENTA_NO_VERIFICABLE`, la importación CONTINÚA — es la única rama de
      R-5 que no rechaza; distinta del caso `exponeNumeroCuenta=false` a nivel de descriptor (que
      también advierte, pero por una razón estructural, no puntual del archivo).
- [ ] 3.24 RED `[INT]` `CuentaBancaria.numeroCuenta=null` en la primera importación → `200
      {requiereConfirmacionCuenta:true, numeroDetectado}`, NO persiste nada; segundo viaje con
      `confirmarNumeroCuenta:true` → persiste `numeroCuenta` e importa, misma TX.
- [ ] 3.25 GREEN flujo de confirmación en dos viajes + escenario 5 de 3.23.
- [ ] 3.26 RED `[INT]` **Orden de compuertas (REQ-CB-05, riesgo R12)**: tras un rechazo por perfil
      (REQ-CB-03) o por cuenta (REQ-CB-16), `count(ImportacionExtracto)===0` y la respuesta NUNCA es
      "0 nuevos / 0 ya existían" — es un 422 explícito.
- [ ] 3.27 RED `[INT]` REQ-CB-03: subir el fixture XLSX de Unión (columnas/cabecera propias, slice 4)
      contra una `CuentaBancaria` `BANCOSOL_XLSX` → 422 `CONCILIACION_ARCHIVO_PERFIL_NO_COINCIDE`,
      mensaje con perfil esperado vs detectado. Nota: `spec.md` REQ-CB-03 redactó este escenario de
      ejemplo con el `.txt` de `UNION_TXT` (formato ya fuera del corte de v1 tras el cambio de scope
      de Slice 4) — el REQUISITO normativo no depende del formato concreto, solo el ejemplo de la
      spec quedó desactualizado; no bloquea esta tarea, se deja anotado para quien mantenga `spec.md`.
- [ ] 3.28 RED `[INT]` REQ-CB-08: perfil DECLARADO no cuadra → `estadoVerificacion=DESCUADRE` +
      `diferencia`, la importación se completa igual.
- [ ] 3.29 RED `[INT]` REQ-CB-06: importación exitosa registra metadata (`sha256Archivo`, rango,
      `filasLeidas`, contadores) sin persistir el binario en ningún storage — confirmar que no se
      invoca ningún `StoragePort`.
- [ ] 3.30 GREEN cierre de las compuertas 3.26-3.29.
- [ ] 3.31 `cuentas-bancarias.controller.ts`: `POST /:id/importaciones` (multipart, `FileInterceptor` +
      `memoryStorage`, patrón `comprobantes.controller.ts:277-296`) + `GET /:id/importaciones`.
- [ ] 3.32 RED `[E2E]` flujo de importación vía HTTP: 403 sin `.importar`, 404 sin pack activo, 422 en
      cada rechazo, éxito con contadores correctos.
- [ ] 3.33 GREEN controller + módulo con los 2 parsers XLSX registrados.
- [ ] 3.34 `[OPENAPI]` Regenerar (`ImportacionExtractoResponseDto` y afines).

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

- [ ] 4.1 RED `[DOM]` `reconoce()` del dialecto/parser Unión-XLSX (test "anti-reuso de mapeo", design
      §11): `true` solo para el fixture Unión-XLSX anonimizado (hoja `ExtractoMovimientosFechas`,
      cabecera `Cuenta:` sin prefijo, columnas propias); `false` contra los fixtures
      BancoSol/Económico y viceversa — parsear el fixture de Unión con el dialecto de BancoSol debe
      FALLAR por etiquetas ausentes, nunca devolver datos corridos.
- [ ] 4.2 RED `[DOM]` la etiqueta de la columna de monto es literalmente `'Monto\n'` — **con salto de
      línea** — en el fixture real; el mapeo por nombre de cabecera (reusa `normalizarDescripcion` de
      2.7/2.8 para normalizar etiquetas, que colapsa saltos/espacios y hace `trim`) debe matchearla;
      un mapeo por índice o un `===` sobre la etiqueta cruda fallaría acá.
- [ ] 4.3 GREEN dialecto/parser Unión-XLSX — mapeo de columnas por NOMBRE de cabecera (`Fecha
      Movimiento`, `AG`, `Descripción`, `Nro Documento`, `Monto`, `Saldo`), `columnasDescripcion:
      ['Descripción']`, sin reusar índices ni etiquetas de los otros 2 perfiles.
- [ ] 4.4 RED `[DOM]` `parse()` contra el fixture Unión-XLSX anonimizado: 21 movimientos, orden
      ASCENDENTE (02/04–13/07), primer/último movimiento correctos; monto con decimales explícitos
      vía `leerMontoCelda` de slice 2 (padding+miles+signo: `'             12,600.00'`→`12600.00`
      CREDITO, `'               -900.00'`→`900.00` DEBITO) — sin cirugía de centavos implícitos (esa
      es del TXT descartado, fuera de v1).
- [ ] 4.5 RED `[DOM]` REQ-CB-08 checksum — **ANCLA** (define la estrategia `DERIVADO`): saldo inicial
      derivado = `saldo(primer movimiento) − monto(primer movimiento)` = `3.143,43`; neto de los 21
      montos = `8.765,97`; `3.143,43 + 8.765,97 = 11.909,40` == saldo de la última fila.
- [ ] 4.6 RED `[DOM]` REQ-CB-08 **verificación ADICIONAL** del adaptador (no es la estrategia, no
      cambia la clasificación `DERIVADO`): Total Créditos declarado fila **39** = `12.618,94` ==
      Σ montos > 0; Total Débitos declarado fila **41** = `3.852,97` == Σ|montos < 0|; Total/
      Disponible declarado fila **45** = `11.909,40` == saldo final; saldo corrido coherente fila a
      fila (`saldoᵢ₋₁ + montoᵢ = saldoᵢ`) en las 21 filas.
- [ ] 4.7 RED `[DOM]` extracción de `numeroCuentaDeclarado`: etiqueta `'Cuenta:'` en **B8**, valor en
      **E8** = `'10000024346492'` — limpio, sin prefijo `BUNCA` (a diferencia del TXT descartado);
      solo separadores del VO; `descriptor.exponeNumeroCuenta = true` confirmado con evidencia real.
- [ ] 4.8 GREEN wiring completo del parser/dialecto Unión-XLSX + `descriptor`
      (`estrategiaChecksum:'DERIVADO'`, `exponeNumeroCuenta:true`).
- [ ] 4.9 `conciliacion-bancaria.module.ts`: registrar el parser Unión-XLSX en `EXTRACTO_PARSERS` bajo
      `PerfilExtracto.UNION_XLSX` — el chequeo de bootstrap del registry cubre los 3 valores del enum.
- [ ] 4.10 RED `[INT]` REQ-CB-16 aplicado a Unión-XLSX: mismo contrato que BancoSol/Económico — número
      coincide (con o sin formateo distinto) → pasa; número de otra cuenta → 422
      `CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE` con ambos números, cero filas persistidas.
- [ ] 4.11 GREEN ajustes finales del service de importación para el 3er perfil.
- [ ] 4.12 RED `[E2E]` regresión: los 3 perfiles (`BANCOSOL_XLSX`, `ECONOMICO_XLSX`, `UNION_XLSX`)
      conviven sin colisión en `GET /api/cuentas-bancarias/perfiles`.
- [ ] 4.13 `[OPENAPI]` Regenerar si `descriptor` agregó campos al DTO de perfiles.

> ⚠️ **Riesgo del change (R14, confirmado en design rev5 §13 — registrar en `proposal.md` por quien
> lo mantiene)**: v1 queda con **tres adaptadores XLSX y ningún formato no-Excel** (Unión pasó de TXT
> a XLSX). Se pierde la validación temprana de que el puerto `ExtractoParserPort` aguanta un formato
> estructuralmente distinto. Costo aceptado conscientemente (design): entregar peor calidad de dato
> solo para ejercitar la abstracción está al revés. La firma del puerto (`parse(buffer: Buffer)`,
> `ExtractoParseado` sin nada que presuponga celdas) es la mitigación de diseño; la validación real
> llega con `UNION_TXT` o MT940 en un slice futuro.

## Slice 5 — Workspace `/conciliacion`

- [ ] 5.1 `backend/src/comprobantes/ports/lineas-cuenta-reader.port.ts`: crear `LineasCuentaReaderPort`
      (design §3) con `listarPorCuentaEnRango` + `listarPorAnclas`.
- [ ] 5.2 RED `[INT]` `backend/src/comprobantes/adapters/prisma-lineas-cuenta-reader.adapter.integration.spec.ts`:
      solo `CONTABILIZADO`/`BLOQUEADO` + `anulado=false`; orden determinístico `fechaContable ASC,
      numero ASC NULLS LAST, comprobanteId ASC, orden ASC`; aislamiento por tenant (Anti-31);
      `listarPorAnclas` resuelve anclas puntuales SIN filtrar por anulado/estado (diagnóstico).
- [ ] 5.3 GREEN `prisma-lineas-cuenta-reader.adapter.ts` (query builder Prisma, NO `$queryRaw` —
      design §3).
- [ ] 5.4 `backend/src/comprobantes/lineas-cuenta-reader.module.ts`: módulo-puerto leaf calcado de
      `periodos-reader.module.ts` (cero imports de módulos, imposible cerrar ciclo CJS).
- [ ] 5.5 `ports/match-conciliacion.repository.port.ts` + adapter Prisma (último de los 4 repos del
      módulo).
- [ ] 5.6 `conciliacion.service.ts` (workspace) — esqueleto: orquesta `A` (movimientos propios) + `B`
      (`LineasCuentaReaderPort`) + `M` (matches) → `verificarAnclas` (dominio, slice 2) →
      `estadoEfectivo`, `EN_TRANSITO` derivado, `sugerir(...)` (design §10, flujo Workspace).
- [ ] 5.7 RED `[INT]` **REQ-CB-11 (gap cerrado — no tenía tarea propia)**: una línea contable de la
      cuenta banco, dentro del rango consultado, sin `MatchConciliacion` con vínculo válido → aparece
      en la respuesta marcada `EN_TRANSITO`; **NINGUNA fila persistida representa ese estado** — el
      enum Prisma `EstadoMovimientoBancario` ni siquiera admite el valor `EN_TRANSITO`; el test
      confirma explícitamente que `movimientos_bancarios`/`matches_conciliacion` no cambiaron tras la
      consulta. Antes lo implementaban de pasada 5.6/5.11 sin test propio.
- [ ] 5.8 RED `[INT]` REQ-CB-10/11: movimiento con match roto → columna DB `estado=CONCILIADO`,
      respuesta `estadoEfectivo=PENDIENTE` con motivo, **cero** `UPDATE` ejecutado en la lectura.
- [ ] 5.9 RED `[INT]` caso benigno (design §2.4 / spec escenario): `orden` corrido tras editar el
      comprobante pero la línea que ocupa ese `orden` coincide en los 5 campos del snapshot → vínculo
      válido, sigue `CONCILIADO`.
- [ ] 5.10 RED `[INT]` **test dedicado obligatorio del riesgo C-1**: editar el CONJUNTO de líneas de
      un comprobante conciliado (insertar línea al principio, corre los `orden`) → el ancla que
      terminó apuntando a otro contenido rompe → `estadoEfectivo=PENDIENTE` con motivo correcto
      (`MONTO_CAMBIADO`/`CUENTA_CAMBIADA` según el caso).
- [ ] 5.11 RED `[INT]` anular el comprobante → `COMPROBANTE_ANULADO`; mover `fechaContable` fuera del
      rango consultado → línea ausente de `B`, ancla huérfana resuelta vía `listarPorAnclas` (1 query
      acotada, solo si hay huérfanas).
- [ ] 5.12 GREEN `conciliacion.service.ts` — `obtenerWorkspace` (cierra 5.7-5.11).
- [ ] 5.13 `conciliacion.controller.ts`: `GET /api/conciliacion?cuentaBancariaId&desde&hasta`.
- [ ] 5.14 `match-conciliacion.service.ts` — esqueleto: `crearMatch` / `borrarMatch` (REQ-CB-17, **la
      acción central del producto**).
- [ ] 5.15 RED `[INT]` **REQ-CB-17 escenario 1**: confirmar una sugerencia (cualquier confianza) entre
      un movimiento `PENDIENTE` sin match y una línea `EN_TRANSITO` sin match → crea
      `MatchConciliacion` con snapshot de los 5 campos de la línea en ese instante +
      `MovimientoBancario.estado` pasa a `CONCILIADO`.
- [ ] 5.16 RED `[INT]` **REQ-CB-17 escenario 2**: confirmar contra un movimiento que YA tiene un match
      válido → rechaza — la constraint `@@unique([organizationId, movimientoBancarioId])` no permite
      un segundo match para el mismo movimiento.
- [ ] 5.17 RED `[INT]` **REQ-CB-17 escenario 3**: confirmar contra una línea `(comprobanteId, orden)`
      con un `MatchConciliacion` existente cuyo vínculo está SANO → `409
      CONCILIACION_LINEA_YA_CONCILIADA`, el match existente permanece intacto.
- [ ] 5.18 RED `[INT]` **REQ-CB-17 escenario 4**: confirmar contra una línea cuyo `MatchConciliacion`
      previo está ROTO (design §2.4) → el sistema borra el match roto (escritura explícita disparada
      por la confirmación del usuario) y crea el nuevo en su lugar — sin match huérfano.
- [ ] 5.19 GREEN `crearMatch` (cierra 5.15-5.18).
- [ ] 5.20 RED `[INT]` invariante: `crearMatch`→columna `estado=CONCILIADO`
      (`estado==='CONCILIADO' ⟺ existe MatchConciliacion`, design §2.3).
- [ ] 5.21 RED `[INT]` **REQ-CB-17 escenario 5**: deshacer un match → `MatchConciliacion` se borra y
      `MovimientoBancario.estado` vuelve a `PENDIENTE`; el comprobante y sus líneas contables NO se
      modifican (decisión 3, REQ-CB-15) — operación exclusiva de la tabla de conciliación.
- [ ] 5.22 GREEN `borrarMatch` (cierra 5.20/5.21).
- [ ] 5.23 RED `[INT]` REQ-CB-13: aislamiento cross-tenant para `MatchConciliacion` (confirmar o
      deshacer un match de otro tenant por id → 404, nunca expone ni permite operar datos de otra
      org).
- [ ] 5.24 GREEN cierre de 5.23 en `match-conciliacion.service.ts`.
- [ ] 5.25 `conciliacion.controller.ts`: `POST`/`DELETE /api/conciliacion/matches[/:id]` (wiring de
      5.14-5.24).
- [ ] 5.26 `movimientos-bancarios.controller.ts` — esqueleto: `PATCH
      /api/movimientos-bancarios/:id/estado` (REQ-CB-18, ignorar / des-ignorar).
- [ ] 5.27 RED `[INT]` **REQ-CB-18 escenario 1**: ignorar un `MovimientoBancario` con
      `estado=PENDIENTE` → `estado` pasa a `IGNORADO`.
- [ ] 5.28 RED `[INT]` **REQ-CB-18 escenario 2**: des-ignorar un movimiento `IGNORADO` → `estado`
      vuelve a `PENDIENTE`.
- [ ] 5.29 RED `[INT]` **REQ-CB-18 escenario 3**: ignorar un movimiento `PENDIENTE` sin match no crea
      ni borra ningún `MatchConciliacion`; el movimiento no se borra, solo cambia su `estado`.
- [ ] 5.30 RED `[INT]` **REQ-CB-18 escenario 4**: ignorar un movimiento con `estado=CONCILIADO` y
      vínculo SANO → rechaza con `422 CONCILIACION_MOVIMIENTO_YA_CONCILIADO`, exige deshacer el match
      primero (REQ-CB-17) — nunca queda simultáneamente "conciliado" e "ignorado".
- [ ] 5.31 GREEN implementación de ignorar/des-ignorar (cierra 5.27-5.30).
- [ ] 5.32 RED `[E2E]` REQ-CB-12: sugerencias ALTA/MEDIA/BAJA calculadas sobre el workspace real;
      ninguna sugerencia crea un `MatchConciliacion` sin acción explícita del usuario.
- [ ] 5.33 RED `[E2E]` REQ-CB-14 fail-closed: usuario solo `.read` → endpoints de escritura devuelven
      403; usuario `.read`+`.conciliar` → acciones permitidas.
- [ ] 5.34 GREEN guards/permisos finales en los 3 controllers del módulo.
- [ ] 5.35 `[OPENAPI]` Regenerar (workspace + matches + estado de movimiento).
- [ ] 5.36 `[FE]` `frontend/src/features/conciliacion/` (molde `features/libro-mayor/`): 2 paneles
      (movimientos bancarios / líneas en tránsito), badges de `estadoEfectivo`+motivo de vínculo roto,
      panel de sugerencias por confianza, drawer de historial de importaciones (`GET
      /:id/importaciones`), toggle "modo consulta".
- [ ] 5.37 RED `[FE]` confirmar match, deshacer, ignorar/des-ignorar; REQ-CB-14 escenario 1 (botones
      ocultos en modo `.read`-only); REQ-CB-14 escenario 2 (ruta bloqueada sin `.read`, ítem ausente
      del sidebar).
- [ ] 5.38 GREEN implementación de la feature.
- [ ] 5.39 `[FE]` cablear el acceso al drawer de historial de importaciones desde
      `/settings/cuentas-bancarias` si no quedó resuelto en 1.14-1.16.

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
- [ ] 6.5 `[ARCH]` REQ-CB-15 escenario 2: test estático que recorre los controllers/services de
      `conciliacion-bancaria/` y falla si alguno invoca creación/edición/anulación de
      `Comprobante`/`LineaComprobante` — confirma que NO existe ningún writer-port hacia
      `comprobantes/`.

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
