# Exploración: conciliación bancaria

> Contexto previo (NO se re-litiga): decisiones firmadas en engram
> `architecture/conciliacion-bancaria` (#952) y análisis de formatos reales en
> `architecture/conciliacion-formatos-bancos` (#953). Este documento investiga
> el CÓDIGO para determinar cómo implementarlas.

## 1. `LibroMayorReaderPort` — ¿alcanza para conciliación?

**NO alcanza.** `backend/src/reportes/ports/libro-mayor-reader.port.ts:37-52`
(`MovimientoMayorRow`) solo trae `debitoBob`/`creditoBob` — el adapter
(`prisma-libro-mayor-reader.adapter.ts:114-220`) hace `$queryRaw` seleccionando
únicamente `lc."debitoBob", lc."creditoBob"`, nunca `lc.moneda`, `lc.debito`,
`lc.credito`. La decisión firmada #6 (USD desde v1) exige moneda original.

Además el port está diseñado para RANGO GLOBAL (histórico + rango), no para
"líneas de UNA cuenta con match/sin-match" — no expone `orden` como filtro ni
el `comprobanteId+orden` como par de identidad de retorno útil para anclar
(sí trae `orden` y `comprobanteId` en la fila, eso sirve).

**Conclusión**: hace falta un **port nuevo**, dueño-owned por `reportes/`
(mismo patrón, §3.3 CLAUDE.md: el módulo que tiene el JOIN lineas↔comprobantes
es quien expone el contrato) o por un módulo `conciliacion-bancaria/` que haga
su propio `$queryRaw` (más simple, evita que `reportes/` acumule superficie que
no es "reporte"). Recomendación: **puerto propio del módulo nuevo**, adapter
Prisma propio con su propio `$queryRaw` — clonando el ESTILO defense-in-depth
(`organizationId` primer predicado) de `prisma-libro-mayor-reader.adapter.ts`,
pero seleccionando `lc.moneda, lc.debito, lc.credito, lc.debitoBob, lc.creditoBob`
además de `comprobanteId, orden` (el ancla de la decisión #4). Evita acoplar
`reportes/` (que ya tiene su propia identidad como "capability de reportes
oficiales") a un dominio operativo de conciliación.

## 2. `CierreComprobanteWriterPort` — precedente de escritura cross-módulo

Archivos: `backend/src/comprobantes/ports/cierre-comprobante-writer.port.ts`,
`backend/src/comprobantes/adapters/prisma-cierre-comprobante-writer.adapter.ts`,
wiring en `backend/src/comprobantes/comprobantes.module.ts:22,89-92`. Consumido
por `backend/src/cierre-ejercicio/cierre-ejercicio.module.ts:23` (import
`ComprobantesModule`, no `forwardRef`).

**Patrón exacto** (para clonar SI conciliación necesita crear comprobantes por
un path-sistema):
- `abstract class XxxWriterPort` con métodos `crearBorradorSistema(data, tx?)`
  / `eliminarBorradorSistema(id, tenantId, tx?)` — acepta `Prisma.TransactionClient`
  opcional para componer con la TX del caller.
- El adapter escribe DIRECTO a `prisma.comprobante.create` (bypassa
  `ComprobantesService` y su validación de usuario) porque el comprobante de
  sistema lleva campos que el flujo de usuario no expone
  (`generadoPorSistema=true`, `origenTipo`/`origenId` para idempotencia vía
  `@@unique([organizationId, origenTipo, origenId])`).
- Las líneas nacen SIEMPRE en BOB con `tipoCambio=1` en el adapter de cierre
  (`prisma-cierre-comprobante-writer.adapter.ts:60-65`) — **esto es específico
  de cierre-ejercicio**, no una regla general del patrón.
- El port se define y se posee en `comprobantes/` (dueño del agregado), el
  módulo consumidor (`cierre-ejercicio/`) solo importa `ComprobantesModule` y
  usa el token exportado.

**Matiz importante para conciliación — NO aplica 1:1**: `CierreComprobanteWriterPort`
existe porque el cierre necesita **crear sin usuario humano** (`createdByUserId`
se propaga del actor que dispara el cierre, pero el flujo entero es
automático/regenerable). Conciliación, por decisión firmada #2 y #3
("el usuario SIEMPRE confirma", "NO hay conciliación cerrada/inmutable"), el
asiento de comisión/ITF prellenado es un **borrador editable de usuario
normal** — el propio memory de decisiones dice "Asiento prellenado = reusa
`/comprobantes/nuevo`". Eso apunta a que la creación real pasa por el flujo de
usuario (`ComprobantesService.create` con un DTO prellenado desde el frontend),
**no** por un nuevo writer-port de sistema. Ver "Preguntas abiertas".

## 3. Riel de packs

`backend/src/packs/` completo: `domain/pack.ts`, `ports/{org-pack.repository,
org-vertical.reader, pack-catalog.reader, org-packs.reader}.port.ts`,
`adapters/prisma-*`, `pack.service.ts`, `pack.controller.ts`, `pack.module.ts`.

- `PackEnabledGuard` (`backend/src/common/guards/pack-enabled.guard.ts:26-80`):
  lee `@RequirePack` metadata, resuelve `tenantId` de `activeTenantId`/header,
  cache Redis `org-packs:<tenantId>` TTL 300 (`pack-enabled.guard.ts:11,62-80`),
  fallback a `OrgPacksReaderPort.packsActivos` si cache falla — **no fail-open**.
  404 (`PackNoEncontradoError`) si el pack no está activo — no 403, deliberado.
- `@RequirePack(clave)` (`require-pack.decorator.ts:18`) — `SetMetadata`.
- `OrgPacksReaderPort` (`ports/org-packs.reader.port.ts:11-19`): superficie
  mínima `packsActivos(orgId)` / `estaActivo(orgId, clave)`.
- **Orden de guards** confirmado en `comprobantes.controller.ts:275-278`:
  `AuthGuard → ModuleEnabledGuard → PermissionsGuard → PackEnabledGuard`
  (nivel-clase) con `@UseGuards(PackEnabledGuard)` + `@RequirePack(...)` +
  `@RequirePermissions(...)` por endpoint.

**Provisión de organización nueva** — DOS entry points, AMBOS con el mismo
switch-by-módulo, NINGUNO otorga packs hoy:
- `backend/src/tenants/tenants.service.ts:83-117` (`TenantsService.create`,
  self-serve register).
- `backend/src/platform/platform-admin.service.ts:102-146`
  (`PlatformAdminService.crearOrgConOwner`, super-admin).

Ambos hacen `$transaction` → `orgsWriter/repo.create(...)` → `switch (dto.modulo)`
→ siembra plan de cuentas / tipos de documento / tipos de registro. **Ninguno
llama a `PackService.habilitar`/`activar`.** Confirma el hallazgo de la
memoria: falta el paso de auto-otorgamiento.

**Schema** (`prisma/schema.prisma:1226-1268`):
```
model Pack {
  clave String @unique   // ej "contabilidad.adjuntos"
  verticalAplicable VerticalPack
  tipo TipoPack           // DOMINIO | CAPACIDAD
  activo Boolean @default(true)  // catálogo, no entitlement
}
model OrgPackEntitlement {
  activo Boolean @default(false)          // activación embebida
  habilitadoPorUserId String              // NO-NULO
  @@unique([organizationId, packId])
}
```

**No existe `Pack.otorgadoPorDefecto`.** `habilitadoPorUserId` es `String` no
nulo — un auto-otorgamiento en la TX de creación de org no tiene un
super-admin humano detrás (mismo problema ya documentado para
`createdByUserId` en cierre-ejercicio). Confirmado: es necesaria una migración
aditiva (`Pack.otorgadoPorDefecto Boolean @default(false)`) + uno de:
  (a) columna `habilitadoPorUserId` pasa a nullable con comentario explicando
      el caso sistema, o
  (b) un sentinel de "actor sistema" (sin usuario real) documentado, o
  (c) propagar el `ownerUserId`/`createdByUserId` de la org como
      `habilitadoPorUserId` (defendible: "el dueño de la org habilitó su
      propio pack de prueba", semánticamente distinto de un super-admin pero
      no rompe el NOT NULL).
La opción (c) es la más barata y NO requiere migración de nullability — sólo
`Pack.otorgadoPorDefecto` + lógica en los dos entry points de provisión que
lea el catálogo, filtre `otorgadoPorDefecto=true AND verticalAplicable=vertical`,
y llame `PackService.habilitar(...)` + `PackService.activar(...,activo=true)`
dentro de la misma TX. **Riesgo**: `PackService.habilitar`/`activar` usan
`this.repo`/`this.redis` fuera de una TX explícita (no aceptan `tx`) — hay que
verificar si aceptan `Prisma.TransactionClient` o si conciliación necesita
extender `OrgPackRepositoryPort` con soporte `tx?` (mismo patrón que
`CierreComprobanteWriterPort`).

`prisma/seeds/packs-catalogo.ts:12-41` — catálogo idempotente por `upsert`
sobre `clave`. `contabilidad.conciliacion` **no existe todavía** en el seed.
Agregar la entrada es trivial (mismo patrón que `contabilidad.adjuntos`), con
`tipo: TipoPack.DOMINIO` (coincide con la decisión #5 y con el comentario del
enum: `DOMINIO // genera/consume comprobantes`).

## 4. Catálogo RBAC

`backend/src/common/permisos/catalogo.ts` — catálogo plano `CATALOGO_PERMISOS`,
formato `{modulo}.{submodulo}.{accion}`. Agregar el grupo:
```ts
{ modulo: 'contabilidad', submodulo: 'conciliacion', acciones: {
  read: '...', importar: '...', conciliar: '...' } }
```
(las acciones `importar`/`conciliar` no son CRUD estándar — el catálogo ya
admite acciones libres, ver comentario línea 6: "Acciones canónicas: read,
create, update, delete, post, void, execute, interact" — `importar`/`conciliar`
NO están en esa lista canónica; hay que decidir si se mapean a
`create`/`interact` o se agregan como nuevas acciones canónicas. **Pregunta
abierta**, ver abajo.)

`backend/src/common/permisos/catalogo-asignable.ts:10-14,54-77` — la
**convención pack↔submódulo YA es genérica**: "la clave del pack ES el
prefijo `{modulo}.{submodulo}` de sus permisos". Con `clave='contabilidad.conciliacion'`
y `submodulo='conciliacion'`, el filtrado (`submoduloEsAsignable`) funciona
**sin tocar ese archivo** — el submódulo se detecta automáticamente como
"clave de pack" (línea 70: `ctx.packsCatalogo.includes(clave)`) y sólo es
asignable si el pack está activo. **Cero código nuevo en catalogo-asignable.ts.**
Este sería el primer pack con permisos propios en el catálogo (adjuntos reusó
`asientos.read/update`, confirmado por grep: 0 resultados de "adjuntos" en
`catalogo.ts`).

## 5. Convención para identificar cuentas de banco

`prisma/schema.prisma:396-436` (`model Cuenta`): no hay un flag booleano
"es cuenta bancaria". Señales disponibles para el picker/heurística de
`CuentaBancaria`:
- `actividadFlujo: ActividadFlujo?` (`EFECTIVO | OPERACION | INVERSION | FINANCIACION`,
  usado hoy solo por el EFE). `ActividadFlujo.EFECTIVO` es la señal MÁS
  explícita y ya tiene precedente de uso (`reportes/domain/estado-flujo-efectivo.ts:69-92`).
- Fallback heurístico existente: `CODIGO_EFECTIVO_PREFIJO='1.1.1'`
  (`estado-flujo-efectivo.ts:50,92`) — prefijo de código, NO distingue caja de
  banco (¿`1.1.1` incluye caja chica Y cuentas bancarias?). Revisar el seed
  `comercial.ts` para confirmar si banco vive en un sub-código propio
  (ej. `1.1.2`) o comparte `1.1.1` con caja.
- `monedaFuncional: Moneda @default(BOB)` + `permiteMultiMoneda: Boolean`
  (`schema.prisma:433-436`) — relevante para la decisión #6: `CuentaBancaria`
  debería validar que la `Cuenta` referenciada tenga `monedaFuncional` acorde
  o `permiteMultiMoneda=true` si el extracto trae movimientos en la moneda de
  la cuenta bancaria.

**Recomendación**: el picker de "elegir cuenta del plan para vincular a
CuentaBancaria" filtra por `esDetalle=true AND activa=true` (regla general de
líneas contables, §4.1 core) y opcionalmente pre-ordena/resalta las que tengan
`actividadFlujo=EFECTIVO` o `codigoInterno` con el prefijo de banco — pero NO
debería restringir duro por heurística (el usuario puede tener un plan de
cuentas atípico). No hace falta tocar `Cuenta` ni sus mappers.

## 6. Upload de archivos — patrón a clonar

`backend/src/comprobantes/comprobantes.controller.ts:277-296` (subir),
`:355-370` (reemplazar): `@UseGuards(PackEnabledGuard)` + `@RequirePack(clave)`
+ `@RequirePermissions(...)` + `@UseInterceptors(FileInterceptor('file', {
storage: memoryStorage(), limits: { fileSize: LIMITE_BYTES } }))` +
`@ApiConsumes('multipart/form-data')`.

Validación por magic bytes: `backend/src/comprobantes/domain/mime-whitelist.ts`
usa `file-type` v16 (CJS, `require()` directo — ver comentario línea 59) +
whitelist explícita (líneas 18-26: PDF, XLS, XLSX, DOC, DOCX, TXT, PNG, JPG) +
manejo especial de OOXML-como-ZIP (líneas 30-40: `file-type` a veces detecta
`.xlsx` como `application/zip` genérico; se acepta combinando magic-bytes-ZIP +
extensión declarada). **XLSX y TXT YA están en la whitelist** — si conciliación
reusa este mecanismo para guardar el extracto original, no hace falta tocar
`mime-whitelist.ts`, solo agregar los MIME de MT940 (`.sta`/`.txt`, típicamente
`text/plain` — ya cubierto) si se decide soportarlo.

`backend/src/comprobantes/ports/storage.port.ts:14-38` (`StoragePort`,
`put/getStream/delete/exists`) + adapter `MinioStorageAdapter`
(`comprobantes.module.ts:66-71`, factory con `ConfigService` para leer
`MINIO_*`). Convención de key: `{tenantId}/{comprobanteId}/{uuid}-{nombreSaneado}`
(`storage.port.ts:11`).

**Conviene guardar el extracto original en MinIO**: sí, mismo `StoragePort`
funciona (es agnóstico de dominio pese al doc mencionar "adjuntos de
comprobantes" — es una interfaz genérica put/get/delete/exists). Convención de
key análoga: `{tenantId}/{cuentaBancariaId}/{importacionId}-{nombreSaneado}`.
**Pero el `STORAGE_PORT` HOY vive registrado dentro de `comprobantes.module.ts`
y se exporta como `ComprobantesModule` completo (no exporta `STORAGE_PORT`
suelto)** — grep confirma `exports: [ComprobantesService, CIERRE_COMPROBANTE_WRITER_PORT]`
en `comprobantes.module.ts:93`, `STORAGE_PORT` NO está en esa lista. Para que
`conciliacion-bancaria/` lo reuse sin importar todo `ComprobantesModule` (que
trae RBAC/Cuentas/Periodos/Documentos/Packs como dependencias transitivas),
**la opción limpia es extraer `MinioStorageAdapter` + `STORAGE_PORT` a un
módulo-puerto leaf propio** (mismo patrón que `PeriodosReaderModule`,
`EeffSaldosReaderModule`) — evita acoplar conciliación a todo el grafo de
comprobantes solo por storage.

## 7. `FechaContable` — aritmética de días para la ventana ±3 días

`backend/src/common/domain/fecha-contable.ts` (VO, líneas 18-118): tiene
`compare`/`isBefore`/`isAfter`/`equals`, construcción `of(y,m,d)`/`fromIso`/
`fromDbDate`, serialización `toIso`/`toDbDate`. **NO tiene `sumarDias`/
`restarDias`/aritmética de N días.**

`backend/src/reportes/fecha-contable.ts:53` (`diaAnterior(date: Date): Date`)
es un helper SUELTO que opera sobre `Date` cruda, **no sobre el VO** —
`reportes/` tiene su propio micro-set de helpers (`parseFechaContable`,
`diaAnterior`, `formatFechaContable`) que duplica funcionalidad del VO en vez
de usarlo (deuda preexistente, no introducida por esta exploración). Solo
`diaAnterior` (±1 día), usado en `evolucion-patrimonio.service.ts:93` y
`estado-flujo-efectivo.service.ts:95` para el saldo inicial (día previo al
rango) — no generaliza a N días.

**Recomendación**: extender el VO `FechaContable` con
`sumarDias(n: number): FechaContable` y `restarDias(n: number): FechaContable`
(o un único `sumarDias(n)` con `n` negativo para restar). Justificación:
1. Es el lugar correcto por cohesión — es aritmética PROPIA de un value object
   calendario, no un helper de módulo.
2. Reusa la mecánica ya probada de `diaAnterior` (`Date.UTC` con
   día `-1` o `+N` rueda correctamente de mes/año, ver comentario
   `reportes/fecha-contable.ts:47-51`) pero construida sobre
   `toDbDate()`/`fromDbDate()` para no reinventar el parseo.
3. Beneficia a CUALQUIER futuro consumidor de rango-por-N-días, no solo
   conciliación.
NO recomiendo un helper local en `conciliacion-bancaria/` (tercera copia de la
misma lógica) ni copiar el patrón `reportes/fecha-contable.ts` (es la
implementación que se quiere evitar duplicar más).

## 8. Frontend — molde y componentes reusables

**Hallazgo que CONTRADICE el framing "período XOR rango" del pedido**: el
componente compartido `frontend/src/components/shared/periodo-gestion-filtro.tsx`
fue refactorizado (comentario líneas 30-34, PR #232 "filtro de período con
presets estilo QuickBooks", confirmado en `git log`) para **SIEMPRE emitir un
`RangoFechas { fechaDesde, fechaHasta }`** — el contrato anterior
`{modo:'periodo'|'rango'}` fue ELIMINADO. Los 6 features que lo consumen
(libro-diario, libro-mayor, balance-comprobacion, hoja-trabajo,
flujo-efectivo, evolucion-patrimonio) **nunca envían `periodoFiscalId` al
backend** — el preset se resuelve a fechas concretas en el cliente
(`calcularRangoGestionISO`) antes de emitir. Confirmado en
`frontend/src/features/libro-mayor/api/get-libro-mayor.ts:6-9` ("El wire
nunca recibe periodoFiscalId") pese a que el DTO del backend
(`backend/src/reportes/dto/libro-mayor-query.dto.ts:32-46`) SIGUE aceptando
`periodoFiscalId` XOR rango (la exclusividad se valida server-side, pero el
frontend actual no ejerce esa rama).

**Implicación para conciliación**: el filtro de período del workspace debería
clonar `<PeriodoGestionFiltro>` tal cual (sin reimplementar el XOR a mano) —
más simple de lo que el pedido original sugería. Si el backend de conciliación
igual quiere aceptar `periodoFiscalId` en su DTO (por paridad con el resto de
reportes, o por si un consumidor futuro no-frontend lo usa), es una decisión
de diseño independiente del frontend.

**Molde recomendado para clonar**: `frontend/src/features/libro-mayor/`
(carpeta completa, ver `components/libro-mayor-filtros.tsx`) por sobre
`balance-comprobacion/` — el filtro de Libro Mayor YA compone
`<PeriodoGestionFiltro>` + selector de cuenta (`CuentaAutocomplete`, reuso
cross-feature de `features/comprobantes/components/cuenta-autocomplete.tsx`) +
toggles (`incluirAnulados`, `soloConMovimiento`) con `useState` local — es
estructuralmente el más cercano a "elegí una cuenta banco + un período". Para
`CuentaBancaria` (entidad nueva) probablemente hace falta un autocomplete
propio (`CuentaBancariaAutocomplete`) clonado de `CuentaAutocomplete`, no el
mismo componente (la cuenta bancaria no es una `Cuenta` del plan, referencia
una).

`frontend/src/components/nav-list.tsx` — **confirmado, conciliación sería el
primer `NAV_ITEM` con `pack` seteado**. El campo YA existe en el tipo
(`nav-items.ts:56`, comentario línea 51-53 documenta el filtro), el hook
`useMisPacks()` (`frontend/src/lib/use-packs.ts:22-42`) ya está cableado
(mismo cache que `usePermissions`/`useVerticalActivo`, queryKey
`['me-permissions', activeTenantId]`, fail-closed: `undefined`/`[]` ocultan el
ítem). `nav-list.tsx:33-49` ya filtra `item.pack === undefined ||
packsActivos?.includes(item.pack)`. **Cero código nuevo en el riel de nav** —
solo declarar `pack: 'contabilidad.conciliacion'` en el nuevo `NavItem`.

`RequirePermission`/`PermissionButton`/`Can` viven en
`frontend/src/components/shared/{require-permission,permission-button,can}.tsx`
— gating estándar, reusar sin cambios.

## 9. Dependencia de parsing CSV/XLSX — evaluación verificada (no memoria)

Confirmado: `backend/package.json` no tiene ninguna lib de lectura de
hojas de cálculo (`write-excel-file` es frontend-only y solo escribe).
`file-type@16.5.4` (CJS) ya está en dependencies — reusable para validar
magic bytes de los extractos subidos (ver punto 6).

**Verificado por consulta al registro npm + búsqueda web AHORA (no por
conocimiento previo)**:

| Librería | Versión npm | Licencia | Estado |
|---|---|---|---|
| `xlsx` (SheetJS) | 0.18.5 (publicada 2022-03-24, es la última en npm) | Apache-2.0 | **NO USAR** — ver abajo |
| `exceljs` | 4.4.0 | MIT | Activo pero último publish 2024-12-20 |
| `read-excel-file` | 9.3.4 | MIT | **Publish muy reciente** (2026-07-21), mismo autor que `write-excel-file` (ya en el frontend) |
| `node-xlsx` | 0.24.0 | Apache-2.0 | Wrapper fino; su dependencia `xlsx` apunta a un tarball del CDN de SheetJS (0.20.2, versión parcheada), no al paquete npm vulnerable |

**`xlsx` de npm tiene 2 CVEs sin parchear en el registro**: Prototype
Pollution (`CVE-2023-30533` / `GHSA-4r6h-8v6p-xvw6`, corregido en 0.19.3) y un
ReDoS (`GHSA-5pgg-2g8v-p4x9`). SheetJS dejó de publicar a npm después de
0.18.5 (2022) y redirige a su propio CDN (`cdn.sheetjs.com`) para versiones
parcheadas — **el paquete `xlsx` instalable vía `pnpm add xlsx` sigue siendo
la versión vulnerable, indefinidamente**, porque el mantenedor no publica ahí.
Confirmado vía búsqueda web (GitHub Advisory Database, OSV.dev, issue del
propio repo SheetJS `#3316`). Esto haría fallar cualquier `npm audit`/Dependabot
del proyecto — **descartar `xlsx` como dependencia directa.**

**Recomendación: `read-excel-file`**, por 3 razones:
1. **No depende de SheetJS** — su propio parser (`fflate` + `unzipper-esm` +
   `saxen`), sin el problema de CVEs sin parchear.
2. **Expone exactamente el hook que la decisión de dominio necesita**: opción
   `parseNumber(string) => T` que recibe el STRING crudo de la celda ANTES de
   cualquier conversión a `number` de JS — permite construir
   `new Decimal(string)` (o `Money.of(string)`) directo desde el texto fuente,
   satisfaciendo la regla verificada del caso BCP
   (`4.6500000000000004` como STRING → `Money`, nunca como `number`
   intermedio). Confirmado en su documentación oficial (README, ejemplo con
   `decimal.js`). Import Node.js dedicado: `read-excel-file/node`
   (`readSheet` desde buffer/stream/path).
3. **Consistencia de ecosistema**: mismo autor (`catamphetamine`) que
   `write-excel-file`, que el frontend YA usa (`lib/export-excel/`) — mismas
   convenciones de API, menor superficie de aprendizaje.

**Matiz que hay que resolver en `sdd-design` (no en esta exploración)**: el
callback `parseNumber` intercepta números; para TXT de ancho fijo (Unión) y
MT940 (regex/slicing, decisión #8 ya firmada — sin librería) no aplica, ahí el
parseo manual YA lee todo como substring/string nativamente, así que ya
cumple la regla sin cambios. El caso XLSX es el único que necesitaba
evaluación de librería.

---

## Puertos a crear vs reusar

| Puerto | Crear / Reusar | Detalle |
|---|---|---|
| Lectura de líneas de una cuenta banco en rango (moneda original) | **CREAR** — nuevo, dueño-owned por `conciliacion-bancaria/` | Punto 1. `LibroMayorReaderPort` no expone moneda original. |
| Escritura de comprobante de comisión/ITF prellenado | **REUSAR flujo de usuario existente** (`ComprobantesService.create` vía HTTP normal desde el frontend con DTO prellenado) | Punto 2. NO clonar `CierreComprobanteWriterPort` — ese es para escritura *sin* usuario; conciliación siempre involucra confirmación humana (decisión #2/#3). Pendiente de confirmar en propose. |
| `OrgPacksReaderPort` / `PackEnabledGuard` / `@RequirePack` | **REUSAR** tal cual | Punto 3. |
| `StoragePort` (extracto original en MinIO) | **REUSAR el contrato, EXTRAER a módulo leaf** | Punto 6. Hoy vive dentro de `ComprobantesModule` sin exportar el token — necesita extracción a módulo-puerto propio para no forzar a `conciliacion-bancaria/` a importar todo el grafo de comprobantes. |
| Repositorio `CuentaBancaria` / `MovimientoBancario` / `MatchConciliacion` | **CREAR** — entidades 100% nuevas | Punto 5. No hay precedente. |

## Riesgos

1. **`OrgPackEntitlement.habilitadoPorUserId` NO-NULO bloquea auto-otorgamiento
   limpio** (punto 3). Requiere decisión de diseño explícita antes de tocar
   schema — no es un simple "agregar default".
2. **`STORAGE_PORT` no exportado** de `ComprobantesModule` (punto 6) — o se
   extrae a módulo leaf (recomendado) o `conciliacion-bancaria/` importa
   `ComprobantesModule` completo (acopla más de lo necesario, contradice
   §3.7 CLAUDE.md "cruzar frontera de módulo → port mínimo").
3. **Ambigüedad sobre el "asiento prellenado de comisión/ITF"** (punto 2): el
   pedido original asume que `CierreComprobanteWriterPort` es el precedente a
   clonar, pero las decisiones firmadas (#2, #3) apuntan a que ese asiento es
   un borrador de usuario normal, no un comprobante de sistema. Si en
   `sdd-propose` se decide que SÍ debe haber un camino "generar asiento con un
   clic" sin pasar por el formulario completo, ahí sí aplicaría el patrón
   writer-port — pero como ATAJO de UX (prellenar y navegar a
   `/comprobantes/nuevo`), no como escritura directa server-side.
4. **`read-excel-file` es de publicación MUY reciente** (día de hoy/ayer según
   metadata) — vale la pena fijar la versión exacta en el lockfile y no
   `^9.x` laxo, dado lo fresco del release.
5. **Prefijo `1.1.1` (heurística EFE) no distingue caja de banco** — si el
   plan de cuentas comercial usa el mismo prefijo para caja chica y cuentas
   bancarias, la heurística de picker (punto 5) podría sugerir cuentas
   incorrectas. Revisar `seeds/comercial.ts` en `sdd-design`.

## Preguntas abiertas (para `sdd-propose`)

1. ¿El asiento de comisión/ITF se crea con un puerto de escritura cross-módulo
   (como cierre-ejercicio) o siempre vía flujo de usuario normal
   (`/comprobantes/nuevo` prellenado)? (riesgo 3)
2. ¿Cómo se resuelve el NOT NULL de `habilitadoPorUserId` para el
   auto-otorgamiento por defecto? (riesgo 1) — opciones (a)/(b)/(c) en punto 3.
3. ¿Las acciones `importar`/`conciliar` se agregan como acciones canónicas
   nuevas al catálogo de permisos, o se mapean a `create`/`interact`
   existentes? (punto 4)
4. ¿El puerto nuevo de lectura de líneas por cuenta banco vive en
   `reportes/ports/` (junto a los demás lectores cross-módulo) o dentro de
   `conciliacion-bancaria/ports/` (dueño exclusivo, sin compartir con
   reportes)? Recomendación de esta exploración: dentro del módulo nuevo.
5. ¿`CuentaBancaria.moneda` es un campo propio o se deriva 100% de
   `Cuenta.monedaFuncional`? (punto 5) — afecta si hace falta validación
   cruzada al vincular.

## Ready for Proposal

**Sí**, con las 5 preguntas abiertas arriba resueltas explícitamente en
`sdd-propose` (no asumidas). El terreno de código está suficientemente
mapeado: no hay bloqueos técnicos, solo decisiones de diseño pendientes.
