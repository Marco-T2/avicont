# Proposal: Conciliación bancaria (pack `contabilidad.conciliacion`)

> Decisiones 1–11 firmadas en engram `architecture/conciliacion-bancaria` (#952) +
> resoluciones R-1..R-5 (`...-resoluciones` #956, `...-validacion-cuenta` #959) +
> formatos reales (`...-formatos-bancos` #953). **No se re-litigan.**
> Verdad viva: `design.md` (rev 5) + `specs/conciliacion-bancaria/spec.md` (18 REQ-CB).
> Este proposal es el **por qué y el qué**; el cómo vive en el design.

## Intent

El contador cruza a mano el extracto del banco contra el Libro Mayor de la cuenta banco.
Es la tarea recurrente más cara del mes y la fuente #1 de errores detectados tarde.
Este change entrega una **herramienta de apoyo** (decisión 3: nada inmutable, nada bloqueante)
que importa extractos reales de bancos bolivianos, deduplica de forma idempotente, sugiere pares
ranqueados por confianza y deja al usuario confirmar siempre.

## Scope

### In Scope (v1)
- Pack `contabilidad.conciliacion` (`TipoPack.DOMINIO`) + **auto-otorgamiento activo** en provisión de org (decisión 5).
- `CuentaBancaria`: vincula explícitamente una `Cuenta` del plan **elegida por el usuario** + `/settings/cuentas-bancarias`.
- Importación **acumulativa e idempotente** (decisión 7): **2 adaptadores, 3 perfiles** —
  `BANCOSOL_XLSX` + `ECONOMICO_XLSX` (comparten generador → **un** adaptador) y `UNION_XLSX`
  (dialecto propio, mismo motor de lectura XLSX, **NO** comparte el mapeo).
- Modelo canónico `MovimientoBancario` (núcleo + común nullable + `datosOriginales` JSON) con hash de dedup determinístico.
- **Validación del número de cuenta del extracto** contra la `CuentaBancaria` destino (R-5 / REQ-CB-16), con captura+confirmación en el alta.
- Detección de `.xls` legacy por **magic bytes** con error accionable (REQ-CB-04).
- Motor de **sugerencias** ranqueadas (monto exacto + fecha ±3 días), **sin auto-confirmación** (decisión 2).
- `MatchConciliacion` **1↔1 duro** anclado a `(comprobanteId, orden)` + snapshot de 5 campos, verificación **auto-curativa en cada lectura** (decisión 4).
- Workspace `/conciliacion` (2 paneles + toggle modo consulta) y drawer de historial de importaciones.
- USD desde v1 (decisión 6). Multi-tenant en las 4 tablas nuevas (REQ-CB-13).

### Out of Scope (diferido)
- **Matching compuesto N↔1** (R-4): depósito consolidado ↔ N líneas, o N movimientos ↔ 1 asiento. v1 es 1↔1 duro (cubre "1 comprobante con 2 depósitos" = dos matches 1↔1). El design deja la salida de evolución preparada.
- Adaptadores BCP, BMSC, Fortaleza, FIE y **MT940** (diferido: el XLSX de BancoSol/Económico es estrictamente superior — #953 validó 20 movs = 20 movs, neto idéntico).
- **Persistencia del binario del extracto / MinIO** (R-2): v1 guarda solo `sha256Archivo` + metadata. La recuperación existe (todos los bancos re-exportan por rango).
- **Perfil ancho-fijo TXT de Unión** (centavos implícitos, sin columna de saldo): documentado, diferido — Unión entra a v1 por su export XLSX.
- Escritura al núcleo contable. **Conciliación SOLO LEE** (REQ-CB-15). Conciliación "cerrada"/período conciliado, correlativos, triggers de auditoría propios (decisión 3 los descarta).

## Capabilities

### New Capabilities
- `conciliacion-bancaria`: cuentas bancarias, importación de extractos, movimientos bancarios, matching y workspace (18 REQ-CB).

### Modified Capabilities
- `packs-riel`: `Pack.otorgadoPorDefecto` + auto-otorgamiento en provisión de org; `habilitar(...)` acepta `{activo?, tx?}` para componer con la TX de creación.
- `frontend-sidebar-nav`: primer `NAV_ITEM` con `pack` seteado (el riel ya lo soporta, cero código nuevo).

## Resoluciones firmadas (antes preguntas abiertas)

Las 5 preguntas abiertas de la exploración **ya están cerradas** (no vuelven al usuario):

| # | Pregunta | Resolución firmada |
|---|---|---|
| 1 | Asiento de comisión/ITF | **Sin writer port** (REQ-CB-15). Borrador de usuario normal prellenado por navegación. El módulo solo lee. `CierreComprobanteWriterPort` existe porque el cierre no tiene humano; acá siempre lo hay. |
| 2 | `habilitadoPorUserId` NOT NULL | **No se toca la nullability.** Hay actor humano en ambos entry points de provisión (`tenants.service.ts:83` recibe `ownerId`; `platform-admin.service.ts:103-116` resuelve `owner.id`). |
| 3 | `importar`/`conciliar` ¿canónicas? | **Se agregan tal cual.** El comentario `catalogo.ts:6` está desactualizado: el catálogo ya usa `cerrar`, `reabrir`, `invite`, `remove`, `admin`. |
| 4 | ¿Dónde vive el port de lectura de líneas? | **En `comprobantes/`, módulo-puerto leaf `LineasCuentaReaderModule`** (§3.3 + 4 precedentes). Discrepo de la exploración, que proponía `$queryRaw` sobre tablas ajenas. |
| 5 | `CuentaBancaria.moneda` | **Campo propio** (REQ-CB-02): si `cuenta.permiteMultiMoneda === false`, debe coincidir con `cuenta.monedaFuncional`. Un extracto tiene UNA moneda por definición. |

Y las 3 decisiones que sí eran del usuario, firmadas: **R-1** fixture de dedup con datos reales de
BancoSol (A/B, ver Success Criteria); **R-2** sin MinIO en v1; **R-3** un único campo `perfilExtracto`.

## Modelo de datos (migración aditiva, §11.6)

### `CuentaBancaria` — configuración
`id`, `organizationId`, `cuentaId` (FK `Cuenta`, `onDelete: Restrict`), `alias`,
**`perfilExtracto`** (enum, ej. `BANCOSOL_XLSX`), `numeroCuenta` (**nullable**), `moneda`, `activa`.
- `@@unique([organizationId, cuentaId])` — una cuenta del plan mapea a lo sumo UNA `CuentaBancaria`.
- `@@unique([organizationId, perfilExtracto, numeroCuenta])`.

> **Un único campo `perfilExtracto`** (R-3, REQ-CB-01): NO hay columna `banco` separada — el
> adaptador auto-descrito aporta `banco`/`formato` como metadata de solo-lectura para la UI. Una
> sola fuente de verdad; combinaciones inválidas imposibles por construcción. Decisión 10 (una
> cuenta = un perfil) enforzada por la forma: `perfilExtracto` es un escalar, no una lista. Enum y
> no string libre porque los adaptadores son CÓDIGO (decisión 9): agregar uno ya exige deploy.
> `numeroCuenta` nullable: se captura y confirma en la primera importación (REQ-CB-16), nunca se transcribe a ciegas.

### `MovimientoBancario` — canónico
**Núcleo** (los 7 bancos lo tienen): `fecha @db.Date`, `monto Decimal(18,2)` siempre positivo,
`tipo` (`DEBITO | CREDITO`), `moneda`, `descripcion`, `descripcionNormalizada`, `ordinalDia`,
`hashDedup`, `estado` (`PENDIENTE | CONCILIADO | IGNORADO`).

> `monto + tipo` en vez de monto con signo es el mínimo común: Fortaleza trae 2 columnas D/C,
> FIE trae signo explícito `+50,450.00`, MT940 trae C/D en `:61:`, BCP trae signo numérico (#953).

**Común nullable** (mayoría, no todos): `hora`, `referencia`, `saldo Decimal(18,2)?`,
`contraparteNombre`, `contraparteDocumento`.

> BMSC trae 5 columnas dedicadas de contraparte, BancoSol la trae etiquetada, BCP no la trae (#953).
> Nullable, nunca inventada. `saldo` nullable para un futuro perfil sin columna de saldo — los 3 perfiles de v1 sí lo traen.

**Extra**: `datosOriginales Json` — el renglón crudo completo. Las 21 columnas de BMSC no justifican
columnizar 7 dialectos; es evidencia auditable de lo que dijo el banco.

`@@unique([cuentaBancariaId, hashDedup])` ← **la idempotencia de la decisión 7 es estructural**.
Hash = `(cuentaBancariaId, fecha, monto, tipo, descripcionNormalizada, ordinalDia)`; `ordinalDia`
es el índice de ocurrencia dentro del grupo de tupla idéntica, sobre un **orden canónico del
sistema**, **nunca la posición física en el archivo** — un mismo banco exporta el mismo período
ascendente o descendente (#953, regla dura #1) y el hash debe salir idéntico.

### `ImportacionExtracto` — metadata sin binario (R-2)
`nombreArchivo`, `tamanoBytes`, `sha256Archivo`, `perfilExtracto`, `fechaDesde/Hasta @db.Date`,
`saldoInicial?`, `saldoFinal?`, `estadoVerificacion` (`VERIFICADO | DESCUADRE | SIN_VERIFICAR`),
`diferencia?`, `filasLeidas`, `movimientosNuevos`, `movimientosDuplicados`, `importadoPorUserId`.
`onDelete: Restrict` — una importación con movimientos no se borra (refuerza por qué R-5 rechaza antes de persistir).

> **Sin `storageKey`, sin MinIO** (R-2): el `sha256Archivo` da detección de archivo-idéntico gratis.
> Tres estrategias de checksum por perfil (REQ-CB-08): **declarado** (BCP, FIE, Económico),
> **derivado** de la columna saldo (BancoSol, BMSC, Fortaleza, **Unión**), **imposible** (ningún
> perfil de v1; reservado para un ancho-fijo futuro). `DESCUADRE` es informativo — **no rechaza** (decisión 3).

### `MatchConciliacion` — 1↔1 duro
`movimientoBancarioId` (FK, `@@unique([organizationId, movimientoBancarioId])`),
`comprobanteId String` **sin FK**, `orden Int`, `@@unique([organizationId, comprobanteId, orden])`,
snapshot de **5 campos**: `snapshotCuentaId`, `snapshotMonto`, `snapshotTipo` (`DEBITO|CREDITO`),
`snapshotMoneda`, `snapshotFecha`; `confianzaSugerida Int?`, `conciliadoPorUserId`.

> **Por qué sin FK** — no es descuido: `Restrict` bloquearía editar/borrar comprobantes (viola
> decisión 3); `Cascade` borraría el match en silencio dejando el movimiento `CONCILIADO` huérfano
> (viola decisión 4). Sin FK, la **verificación del ancla en cada lectura** (REQ-CB-10) cubre línea
> movida, monto/lado/moneda/fecha cambiados y comprobante borrado, y deriva `estadoEfectivo=PENDIENTE`
> con motivo — **sin escribir nada**.
>
> **`snapshotTipo` es el 5º campo, no opcional** (corrección C-1 del design): `(comprobanteId, orden)`
> NO es estable — `comprobantes.service.ts` reasigna `orden` por posición cada vez que `dto.lineas`
> está presente (insertar/borrar/reordenar líneas). El snapshot deja de ser defensa en profundidad
> y pasa a ser EL mecanismo de correctitud. Sin `snapshotTipo`, una línea de débito editada a crédito
> por el mismo monto pasaría la verificación en silencio.

`EN_TRANSITO` **no se persiste**: se deriva (líneas contables de la cuenta banco en el rango sin vínculo válido).

### Cambio en el riel de packs
`ALTER TABLE packs ADD COLUMN "otorgadoPorDefecto" BOOLEAN NOT NULL DEFAULT false`. Cero DROP.
Aplicar §11.6 al `migration.sql` generado (los objetos raw SQL vivos —`pg_trgm`, índices trigram,
uniques parciales, triggers de `comprobantes_audit`— no deben aparecer en ningún `DROP`).

## Puertos

| Puerto | Crear/Reusar | Dueño | Nota |
|---|---|---|---|
| `LineasCuentaReaderPort` | **Crear** | `comprobantes/` (leaf `LineasCuentaReaderModule`) | `comprobanteId, orden, fecha, cuentaId, moneda, debito, credito, debitoBob, creditoBob, glosa, numeroComprobante, estadoComprobante, anulado`. |
| `ExtractoParserPort` | **Crear** | `conciliacion-bancaria/` | `perfil`, `parse(buffer)` → `ExtractoParseado` (incluye `numeroCuentaDeclarado: string \| null`), `instruccionesDescarga`, `advertencia?` (decisión 11). Registro por perfil. |
| 4 repos (`CuentaBancaria`/`MovimientoBancario`/`ImportacionExtracto`/`MatchConciliacion`) | **Crear** | `conciliacion-bancaria/` | Sin precedente. |
| `OrgPacksReaderPort`, `PackEnabledGuard`, `@RequirePack`, `ClockPort`, `Money`, `file-type` | **Reusar** | — | `Money` compara USD también — el design ajusta el método de tolerancia (`Money` hoy solo tiene `balanceadoEnBobCon`, semántica BOB). |
| `FechaContable` | **Reusar, extender** | `common/domain/` | Necesita `sumarDias(n)`/`restarDias(n)` para la ventana ±3 (no existen hoy). |
| Escritura de comprobantes | **Ninguno** | — | El módulo no escribe en el núcleo contable (REQ-CB-15). |

**Sin `StoragePort` en v1** (R-2): no se persiste el binario, así que no hace falta extraerlo a un
módulo leaf. Esa extracción vuelve al alcance solo si se decide guardar el archivo en un slice posterior.

**Discrepancia sostenida con la exploración**: recomendaba `$queryRaw` sobre `lineas_comprobante`
dentro de `conciliacion-bancaria/` — un módulo consultando tablas de otro, contra §3.3. El repo ya
resolvió esto cuatro veces con módulos-puerto leaf; se sigue ese patrón.

## Endpoints

Todos con `@RequireModule('contabilidad')` + `@RequirePack('contabilidad.conciliacion')`
(orden de guards `Auth → ModuleEnabled → Permissions → PackEnabled`).

| Método | Ruta | Permiso |
|---|---|---|
| `GET/POST/PATCH/DELETE` | `/api/cuentas-bancarias[/:id]` | `.read` / `.create` / `.update` / `.delete` |
| `GET` | `/api/cuentas-bancarias/perfiles` | `.read` — catálogo con `instruccionesDescarga` + `advertencia` |
| `POST` | `/api/cuentas-bancarias/:id/importaciones` (multipart) | `.importar` — R-5: valida perfil + nº cuenta antes de persistir; primera vez sin nº → `200 {requiereConfirmacionCuenta, numeroDetectado}` sin crear nada, cliente re-postea con `confirmarNumeroCuenta:true` |
| `GET` | `/api/cuentas-bancarias/:id/importaciones` | `.read` — historial (drawer) |
| `GET` | `/api/conciliacion?cuentaBancariaId&desde&hasta` | `.read` — paneles + sugerencias + resumen (deriva `estadoEfectivo` y `EN_TRANSITO`) |
| `POST` / `DELETE` | `/api/conciliacion/matches[/:id]` | `.conciliar` — crear/deshacer match 1↔1; reemplazo de match roto; `409 CONCILIACION_LINEA_YA_CONCILIADA` |
| `PATCH` | `/api/movimientos-bancarios/:id/estado` | `.conciliar` — ignorar / des-ignorar |

**Sin `GET /importaciones/:id/archivo`** (R-2: no hay binario que descargar).

**Permisos RBAC** (nuevo grupo en `catalogo.ts`, submódulo `conciliacion`):
`contabilidad.conciliacion.{read, create, update, delete, importar, conciliar}`.
`catalogo-asignable.ts` **no se toca** (la convención clave-pack = prefijo `modulo.submodulo` ya
filtra). Primer pack con permisos propios.

## Slices

| # | Slice | Por qué en ese orden |
|---|---|---|
| 0 | Riel: `Pack.otorgadoPorDefecto` + seed del catálogo + auto-otorgamiento en los 2 entry points + permisos RBAC + `NAV_ITEM` gateado + `.gitignore` de fixtures | Desbloquea todo. Sin pack activo, ningún endpoint responde. |
| 1 | `CuentaBancaria` CRUD (perfil único, moneda validada, nº nullable) + `/settings/cuentas-bancarias` + catálogo de perfiles | La importación necesita una cuenta configurada. |
| 2 | **Dominio puro**: hash de dedup, orden canónico, ventana ±3d, motor de sugerencias, verificación del ancla (5 campos), VO `NumeroCuentaBancaria` (igualdad exacta, sin getter del normalizado) | Sin DB, sin NestJS. ≥95% cobertura. Strict TDD: acá vive el riesgo real. |
| 3 | Adaptador **XLSX core-compartido** (`BANCOSOL_XLSX` + `ECONOMICO_XLSX`) + `read-excel-file` + importación E2E (magic bytes, R-5, checksum derivado/declarado) | Un adaptador, dos bancos. Ejercita seriales de Excel, detección de orden, ambas estrategias de checksum, y el strip de `CA: … (Bs)` de Económico. |
| 4 | Adaptador **`UNION_XLSX`** (dialecto propio, mismo motor de lectura) | Checksum `DERIVADO` verificado sobre datos reales. NO reusa el mapeo de BancoSol/Económico → valida que la abstracción del puerto aguante un segundo dialecto XLSX. |
| 5 | Workspace `/conciliacion` (2 paneles, sugerencias, confirmar/deshacer, ignorar, EN_TRANSITO derivado, drawer historial, modo consulta fail-closed) | Consume todo lo anterior. Molde: `features/libro-mayor/`. |
| 6 | Atajo "crear asiento de comisión/ITF" (prellenar + navegar a `/comprobantes/nuevo`) | Frontend puro. Depende de que el formulario acepte prellenado; si no, se difiere sin bloquear v1. |

**Acuerdo con el corte de 2 adaptadores**, con el dominio (slice 2) antes que cualquier adaptador.
Los bancos restantes y MT940 no aportan diseño nuevo — solo dialectos del mismo contrato.

## Riesgos

| Riesgo | Prob. | Mitigación |
|---|---|---|
| **v1 no tiene ningún formato no-Excel** — con Unión pasando a `UNION_XLSX`, los 3 perfiles son XLSX. La abstracción `ExtractoParserPort` no se prueba contra algo estructuralmente distinto (regex/slicing) hasta un slice posterior | Media | Aceptado para v1 (los 3 dialectos XLSX ya difieren en mapeo, orden, seriales y strip de nº). El contrato se valida contra un formato radicalmente distinto al construir **MT940** o el **TXT ancho-fijo** diferido; el puerto se diseña con eso en mente. |
| **Número de cuenta: etiqueta ≠ valor** — Económico rotula `Cuenta:` pero el valor es `CA: 2031262031 (Bs)` (#959, verificado en celda). Un VO que normaliza solo separadores rechazaría el 100% de las importaciones de Económico | Alta | El **dialecto del adaptador** limpia prefijo de producto y sufijo de moneda antes de devolver `numeroCuentaDeclarado`; el VO `NumeroCuentaBancaria` compara por **igualdad exacta normalizada**, nunca prefijo/substring, y no expone getter del valor normalizado (un `startsWith` fuera del VO no compila). Fortaleza/BCP/BMSC/FIE: `exponeNumeroCuenta` **no verificado** — abrir el archivo antes de construir cada adaptador. |
| `PackService.habilitar/activar` no aceptan `tx` y llaman `redis.del`; `habilitar` re-lee el vertical de la org que la TX aún no commiteó | Media | Método dedicado `otorgarPacksPorDefecto(orgId, vertical, userId, tx)` que recibe el vertical del `dto.modulo` y usa `tx`; invalidación de cache post-commit. Extender `OrgPackRepositoryPort`/`habilitar` con `{activo?, tx?}`. |
| El snapshot debe atrapar edición de comprobante en cualquiera de sus 5 campos | Media | Es el escenario que la decisión 4 y la corrección C-1 diseñaron. Tests dedicados por motivo (`MONTO_CAMBIADO`, `LADO_CAMBIADO`, `CUENTA_CAMBIADA`, `MONEDA_CAMBIADA`, `FECHA_CAMBIADA`, `LINEA_INEXISTENTE`, `COMPROBANTE_ANULADO`) + caso benigno (orden corrido, snapshot intacto → válido). Ninguno escribe en BD. |
| `read-excel-file` NO lee `.xls` legacy (BIFF), solo `.xlsx` | Media | v1: los 3 perfiles exportan `.xlsx`. Detección por **magic bytes** (`50 4B 03 04` vs `D0 CF 11 E0 A1 B1 1A E1`) con `file-type` ya presente → error accionable "Abrilo en Excel y guardalo como .xlsx" (REQ-CB-04), nunca "formato inválido". BCP/BMSC (que publican `.xls`) quedan diferidos con esa nota en su `advertencia`. |
| Variación de parseo XLSX entre exports del mismo banco | Media | Económico envuelve todo en namespace `x:` + `sharedStrings`; el export viejo de BancoSol usa inline strings sin `sharedStrings`, mientras bancosol-A/B sí usan `sharedStrings` (#961). `read-excel-file` abstrae esto, pero el adaptador se testea contra los 3 fixtures reales, no uno. |
| `read-excel-file@9.3.4` es reciente | Baja | Re-verificado contra registry.npmjs.org: 9.3.4, MIT, publicada 2026-07-21, deps `fflate`+`unzipper-esm`+`saxen` (sin SheetJS), 5 releases en julio 2026 → activo. Fijar versión exacta. `xlsx`/SheetJS descartado (0.18.5 de 2022, 2 CVEs sin parchear en npm). |

**Riesgos ya cerrados** (no re-abrir): `.gitignore` de `docs/extractosBancos/` aplicado (#956, `.gitignore:13`, verificado); fixture de dedup resuelto con datos reales de BancoSol (R-1).

## Rollback Plan

Change aditivo detrás de un pack: `revert` del PR + `prisma migrate resolve --rolled-back` (4 tablas
nuevas + 1 columna en `packs`, cero destructivo sobre datos existentes). En caliente sin deploy:
desactivar el pack de la org (`PATCH /api/packs/contabilidad.conciliacion` → `activo=false`) →
`PackEnabledGuard` devuelve 404 y el `NAV_ITEM` desaparece. **Ningún dato contable existente se
toca** — el módulo solo lee.

## Success Criteria

- [ ] **Fixture real R-1**: importar `bancosol-A` (60 movs) → 60 nuevos; luego `bancosol-B` (80 movs, solapado) → 21 nuevos + 59 ya existían; total distinto = **81**.
- [ ] Reimportar el mismo archivo → **0 nuevos**, sin borrar ni modificar nada.
- [ ] Un extracto exportado ascendente y el mismo descendente producen `hashDedup` idénticos.
- [ ] Editar un comprobante conciliado en cualquiera de los 5 campos del snapshot devuelve el movimiento a `estadoEfectivo=PENDIENTE` con motivo visible — sin `UPDATE` sobre `MatchConciliacion` ni `MovimientoBancario.estado`.
- [ ] Importar el extracto de `...-002` en la cuenta `...-001` se rechaza (`CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE`, 422) **antes de persistir nada**, con ambos números en el mensaje. Los 3 números reales cruzados de a pares dan `false` en los 6 pares.
- [ ] Un `.xls` legacy renombrado a `.xlsx` se rechaza por magic bytes con mensaje accionable, nunca llega al parser.
- [ ] Una org nueva con vertical CONTABILIDAD nace con el pack habilitado **y activo**, sin intervención del super-admin.
- [ ] Un usuario solo con `.read` ve datos pero no acciones; sin `.read` no ve el ítem ni entra por URL (fail-closed).
- [ ] Ningún monto pasa por `number` de JS: string crudo → `Money`. Test con la celda real de BCP `4.6500000000000004`.
- [ ] `contract-drift` verde (OpenAPI + `api.generated.ts` regenerados).
