# Design: Conciliación bancaria (pack `contabilidad.conciliacion`)

> **Insumos cerrados, no re-litigados**: 11 decisiones firmadas (engram `architecture/conciliacion-bancaria`),
> 3 resoluciones del usuario (R-1/R-2/R-3, `architecture/conciliacion-bancaria-resoluciones`),
> análisis de 7 bancos (`architecture/conciliacion-formatos-bancos`), `proposal.md` y `exploration.md`.
> Este documento resuelve el **CÓMO técnico**.
>
> **Revisión 2** — incorpora **R-5 / REQ-CB-16** (validar el número de cuenta del extracto contra
> la `CuentaBancaria` destino, engram `architecture/conciliacion-bancaria-validacion-cuenta`) y el
> orden de compuertas de **REQ-CB-05**. Secciones tocadas: §4.1 (contrato), §4.3 (evidencia por
> formato), §4.4 (VO + ubicación de la comparación — NUEVA), §9 (`numeroCuenta` nullable), §10
> (flujo), §11 (tests), §12 (archivos), §13 (R10/R11/R12), §14.
>
> **Revisión 3** — `UNION_TXT.exponeNumeroCuenta` pasa a `true` con evidencia verificada sobre
> `docs/extractosBancos/Extracto_Movimientos.txt`: el token `BUNCA10000024346492` está en las 12
> filas de datos, cols 19–37, valor único (`cut -c19-37 | sort | uniq -c` → `12 BUNCA…`). **7/7
> formatos validan destino.** Secciones tocadas: §4.3 (tabla), §4.3.1 (NUEVA — strip del prefijo en
> el adaptador + chequeo de archivo mezclado), §11 (tests), §13 (R11 cerrado, R13 nuevo), §14.
>
> **Revisión 4** — dos cambios:
> **(a) Códigos de error alineados a `spec.md`** (`CLAUDE.md §6.3` = `{MODULO}_{SUBDOMINIO}_{CONDICION}`;
> `EXTRACTO_*` ponía un subdominio en el lugar del módulo): `CONCILIACION_ARCHIVO_{PERFIL_NO_COINCIDE,
> XLS_LEGACY, CUENTA_NO_COINCIDE, CUENTA_NO_VERIFICABLE, FORMATO_NO_RECONOCIDO, MEZCLADO}`.
> **(b) `UNION_XLSX` reemplaza a `UNION_TXT` en v1** con datos medidos: checksum **DECLARADO**
> (tres valores del archivo, los tres cierran), número de cuenta limpio en cabecera, decimales
> explícitos ⇒ **los 7 formatos soportan checksum, ningún banco de v1 importa a ciegas.** El análisis
> del TXT se conserva íntegro como perfil futuro en §4.3.2.
> Secciones tocadas: §4.3, §4.3.1 (reescrita), §4.3.2 (NUEVA — TXT diferido), §4.5, §8.1, §8.2, §8.3,
> §9 (enum), §11, §13 (R13 no aplica, R14 nuevo), §14.
>
> **Revisión 5** — 4 CRITICAL + 4 WARNING de la revisión adversarial (#961):
> **CRITICAL-2** número de Económico mal caracterizado: `E4='Cuenta:'` (etiqueta) / `G4='CA: 2031262031 (Bs)'`
> (valor con prefijo+sufijo) — verificado celda por celda; el strip pasa a ser capacidad general del
> dialecto (§4.3), no exclusiva del TXT; Fortaleza/BCP/BMSC/FIE marcados "no verificado etiqueta-vs-valor".
> **CRITICAL-1** checksum de Unión `DECLARADO`→**`DERIVADO`** (no declara saldo inicial; REQ-CB-08).
> **CRITICAL-3** `Money` — `equalsConTolerancia`/`redondear`/`toFixed` NO existen: se agrega
> `igualaConTolerancia` currency-neutral (BOB vs USD resuelto, §8.0), `toBob()` para el string 2-dp;
> `money.ts` entra al §12. **CRITICAL-5** `banco` sale de la constraint: `@@unique([organizationId,
> perfilExtracto, numeroCuenta])`. WARNINGs: `LadoContable` definido y `snapshotTipo` re-tipado;
> columna fuente de `descripcion` fijada; R4 extendido a namespace `x:` de Económico;
> `invalidarCacheDeOrg` al §12. Secciones tocadas: §0, §4.3, §4.3.1, §5.2, §8.0 (NUEVA), §8.1, §9,
> §11, §12, §13. **Discrepancia registrada** (no la "corregí" a ciegas): las filas de Unión son
> **8/16/39/41/45** (verificado por celda B8/B16/B39/B41), no 7/15/… — el −1 del reviewer leyó el
> export "extendido" descartado, que sí tiene `Cuenta:` en r7.
>
> **Nota de tamaño**: el skill sugiere ≤800 palabras. El entregable pedido por el orquestador
> (7 puntos con firmas concretas, alternativas y evidencia `file:line`) es incompatible con ese
> presupuesto. Se prioriza el pedido explícito; se compensa con densidad y cero relleno.

---

## 0. Correcciones al insumo — con evidencia

Tres cosas que me pasaron o que están en los artefactos previos **no son exactas**. No las arreglo
en silencio.

### C-1 (CRÍTICA) — El ancla `(comprobanteId, orden)` NO se preserva cuando se edita el CONJUNTO de líneas

El insumo afirma «la edición preserva `orden` (`prisma-comprobante.repository.ts:129`,
`comprobantes.service.ts:679`)». Eso es cierto **solo para ediciones de cabecera**.

`comprobantes.service.ts:676-677` y `:698` (líneas verificadas rev 5):

```ts
const lineasInput: CreateLineaDto[] =
  dto.lineas ?? original.lineas.slice().sort((a, b) => a.orden - b.orden).map(...)
// ...
const lineasPersist = lineasInput.map((l, idx) => {
  const orden = idx + 1;          // ← orden REASIGNADO por posición en el array
```

- `dto.lineas === undefined` (editar glosa/fecha/tipo) → se reconstruye desde `original.lineas`
  ordenadas por `orden` y se reasigna `idx + 1` → **orden idéntico**. ✅
- `dto.lineas` presente (insertar / borrar / reordenar líneas) → `orden` se reasigna por la
  posición del array que mandó el cliente. Insertar una línea al principio **corre todas las
  demás**. El `orden` 3 pasa a apuntar a otra línea. ❌

**No invalida la decisión 4 — la justifica.** Es exactamente el escenario para el que existe el
snapshot. Pero **invalida cualquier spec o test que asuma que `orden` es estable**. El invariante
real es: *`(comprobanteId, orden)` identifica unívocamente una línea EN UN INSTANTE
(`schema.prisma:776` `@@unique([comprobanteId, orden])`), y NO es estable en el tiempo.*
El snapshot no es "defensa en profundidad opcional": es **el** mecanismo.

### C-2 — `proposal.md` contradice R-2 (no hay MinIO en v1)

`proposal.md:88` lista `storageKey (MinIO)` en `ImportacionExtracto` y `proposal.md:150` expone
`GET /api/importaciones/:id/archivo` con `StreamableFile`. R-2 cerró que **no hay storage del
binario en v1**. Este design **elimina** ambos: `ImportacionExtracto` no lleva `storageKey`, el
endpoint de descarga no existe, y `STORAGE_PORT` **no se extrae** (queda como está en
`comprobantes.module.ts:93`).

### C-3 — `Organization` NO tiene columna `ownerUserId`

`grep -rn "ownerUserId" src/` → solo aparece como campo del DTO de entrada de
`OrgsWriterPort` (`platform/ports/orgs-writer.port.ts:14`); el adapter lo materializa como
**membership** (`prisma-orgs-writer.adapter.ts:45`, `prisma-tenant.repository.ts:36`:
`create: { userId: data.ownerUserId, systemRole: SystemRole.OWNER }`). Consecuencia práctica: un
backfill de packs para orgs existentes **no puede** leer `organizations."ownerUserId"` — tiene que
resolver el OWNER desde `memberships`. Ver §7.4.

### C-4 (menor, informativa) — el dominio "puro" arrastra Prisma en runtime

`common/domain/money.ts:19` hace `import { Prisma } from '@prisma/client'` (no `import type`).
Todo `domain/` que use `Money` arrastra el cliente Prisma. Es **deuda preexistente**
(`docs/deudas-arquitecturales.md` §5.3), la comparten `reportes/domain/` y `cierre-ejercicio/domain/`.
Se sigue el patrón existente (regla del skill: seguir la convención del repo). No bloquea el
"dominio testeable sin DB" — Prisma.Decimal no abre conexiones.

---

## 1. Enfoque técnico

Módulo hexagonal nuevo `backend/src/conciliacion-bancaria/`, **solo-lectura sobre el núcleo
contable**, gateado por `@RequireModule('contabilidad')` + `@RequirePack('contabilidad.conciliacion')`.

```
conciliacion-bancaria/
├── domain/            hash, orden canónico, ordinal del día, ventana ±3d,
│                      motor de sugerencias, verificación del ancla, checksum
├── ports/             ExtractoParserPort + 4 repos + registry
├── adapters/          Prisma repos · parsers XLSX/TXT · parsing/ (dinero+fechas)
├── dto/
├── *.service.ts       importador · workspace · cuentas bancarias
└── *.controller.ts
```

Dos piezas fuera del módulo:
1. `comprobantes/lineas-cuenta-reader.module.ts` — módulo-puerto **leaf** (§3).
2. `packs/` — `otorgarPacksPorDefecto` + `Pack.otorgadoPorDefecto` (§7).

Regla estructural que gobierna todo el design: **el orden del archivo es información sin valor
semántico** (evidencia Fortaleza: mismo banco, mismo día, DESCENDENTE en export default y
ASCENDENTE por rango). Todo lo que dependa del orden — ordinal del día, hash, checksum derivado —
se calcula **después** de aplicar un orden canónico propio, en dominio puro.

---

## 2. Decisión 1 — Verificación del ancla sin FK

### 2.1 Qué se guarda en el snapshot

`MatchConciliacion` guarda el ancla + una **fotografía de las propiedades que hacen válido el
match**. Nada más: cada campo del snapshot tiene que ser capaz de invalidar el match por sí solo.

| Campo | Tipo Prisma | Por qué está |
|---|---|---|
| `comprobanteId` | `String` **sin FK** | Mitad del ancla. |
| `orden` | `Int` | Mitad del ancla. **No estable en el tiempo** (C-1). |
| `snapshotCuentaId` | `String` | La línea pudo re-apuntarse a otra cuenta → deja de ser de la cuenta banco. |
| `snapshotMonto` | `Decimal(18,2)` | Monto en **moneda original**, siempre positivo. |
| `snapshotTipo` | `LadoContable` (`DEBITO`\|`CREDITO`) | Un débito que pasó a crédito invierte el sentido del dinero. |
| `snapshotMoneda` | `Moneda` | USD desde v1 (decisión 6). |
| `snapshotFecha` | `DateTime @db.Date` | `fechaContable` puede moverse de período (§4.3 core). |

**No** se guarda glosa, contacto ni `tipoCambio`: cambian sin que el match deje de ser cierto.
Snapshot mínimo = menos falsos positivos de "vínculo roto".

### 2.2 Cuándo y dónde se verifica — el análisis de costo

La query del workspace (`GET /api/conciliacion?cuentaBancariaId&desde&hasta`) **ya trae los dos
lados**, porque son los dos paneles de la pantalla:

- `A` = movimientos bancarios de la cuenta en el rango (repo propio).
- `B` = líneas contables de `cuentaBancaria.cuentaId` en el rango (`LineasCuentaReaderPort`).
- `M` = matches de esos movimientos (repo propio).

**La verificación se hace en memoria, post-fetch. No en el JOIN.** Tres razones, en orden de peso:

1. **No se puede hacer en el JOIN sin romper §3.3.** El módulo posee `matches_conciliacion` pero
   NO posee `lineas_comprobante`. Un `JOIN matches ↔ lineas_comprobante` obliga a poner ese SQL
   dentro del adapter de `comprobantes/`, que entonces tendría que conocer las tablas de
   conciliación → propiedad circular. La alternativa (SQL de conciliación tocando tablas ajenas)
   es exactamente lo que el `proposal.md:131-137` ya rechazó.
2. **Sería I/O duplicada, no ahorrada.** `B` ya está en memoria: es el panel izquierdo. Verificar
   en SQL significaría traer las mismas líneas dos veces.
3. **Es lógica de dominio, no de almacenamiento.** Comparar montos exige tolerancia `±0.01`
   (`Money.igualaConTolerancia`, §8.0), y comparar fechas exige `FechaContable`. En SQL eso se degrada a
   `numeric` crudo y se pierde la testeabilidad sin DB que exige Strict TDD.

**Costo real** (`n=|A|`, `m=|B|`, `k=|M| ≤ n`):

```
build Map<`${comprobanteId}${orden}`, LineaCuentaRow>   O(m)     — 1 pasada sobre B
verificar cada match                                          O(k)     — lookups O(1)
consultas extra en el camino feliz                            0
```

**Camino no-feliz**: si el ancla no aparece en `B`, puede ser (a) la línea ya no existe,
(b) el comprobante fue anulado, (c) la `fechaContable` se movió fuera del rango consultado, o
(d) la línea se reasignó a otra cuenta. Para (a)-(d) el resultado de negocio es el mismo — *ese
match ya no explica ese movimiento* — así que **no hace falta más I/O para decidir**. Solo para dar
un mensaje bueno se hace **una** consulta batch acotada:
`LineasCuentaReaderPort.listarPorAnclas(tenantId, anclasHuérfanas)` — se ejecuta **solo si hay
huérfanas** (típicamente cero), es una sola query con `IN`, y pega contra
`@@unique([comprobanteId, orden])` (index-backed). Techo: 1 query extra por request.

Alternativa descartada: **verificar en la escritura** (al editar un comprobante, purgar los matches
afectados). Requeriría que `comprobantes/` conozca conciliación o emita un evento — acopla el
núcleo contable a un pack opcional, y el pack puede estar desactivado cuando ocurre la edición
(quedarían matches sucios). El chequeo en lectura es el único que **no puede saltearse**.

### 2.3 Cómo se representa "stale" sin persistir basura

**Regla dura: una lectura NUNCA escribe.** Ni auto-cura en DB, ni marca, ni contador.

El `MatchConciliacion` y el `MovimientoBancario.estado` quedan **intactos**. La respuesta lleva
campos **derivados**:

```ts
interface MovimientoConciliacionView {
  // ... datos del movimiento
  estadoEfectivo: 'PENDIENTE' | 'CONCILIADO' | 'IGNORADO';   // ← lo que se muestra
  vinculo: {
    comprobanteId: string; orden: number;
    roto: MotivoVinculoRoto | null;   // null ⇒ match válido
  } | null;
}

type MotivoVinculoRoto =
  | 'LINEA_INEXISTENTE'      // ancla no resuelve
  | 'COMPROBANTE_ANULADO'    // resuelve pero anulado = true
  | 'CUENTA_CAMBIADA'
  | 'MONTO_CAMBIADO'
  | 'LADO_CAMBIADO'
  | 'MONEDA_CAMBIADA'
  | 'FECHA_CAMBIADA';
```

`estadoEfectivo = 'PENDIENTE'` cuando `vinculo.roto !== null` → el movimiento **vuelve al pool de
sugerencias en la misma respuesta**. Ese es el auto-curado de la decisión 4, y cierra el lazo sin
un solo `UPDATE`.

La columna persistida `MovimientoBancario.estado` se declara explícitamente como **proyección
cacheada**, mantenida por los caminos de escritura (`crear match → CONCILIADO`,
`borrar match → PENDIENTE`), usada **solo** para filtrar/contar con índice
(`@@index([cuentaBancariaId, estado, fecha])`), **nunca** como verdad de display.

> **Alternativa considerada y descartada**: no persistir `CONCILIADO` en absoluto y derivarlo
> siempre de la existencia de un match válido (como `EN_TRANSITO`). Es estructuralmente superior
> —la divergencia se vuelve imposible—, pero (a) la decisión 5 firmada enumera los tres estados
> persistidos y no me corresponde reabrirla, y (b) sin la columna, `WHERE estado = 'PENDIENTE'` y
> los contadores del encabezado pasan a ser un anti-join en cada listado. Se conserva la columna y
> se paga el precio con un test de invariante: `estado === 'CONCILIADO' ⟺ existe MatchConciliacion`
> tras cada camino de escritura. La única divergencia posible restante es la ruptura del ancla, y
> `estadoEfectivo` la cubre por construcción.

### 2.4 El caso que la unicidad hace incómodo

`@@unique([organizationId, comprobanteId, orden])` (una línea contable se reclama a lo sumo una vez)
puede quedar ocupado por un match **roto**. Si el usuario quiere conciliar la línea que hoy ocupa
`orden = 3`, el `INSERT` choca contra la fila vieja.

Resolución: `ConciliacionService.crearMatch` verifica el ancla del match existente **antes** de
fallar. Si está **roto**, lo borra (escritura explícita, disparada por el usuario — no viola §2.3) y
continúa. Si está **sano**, `409 CONCILIACION_LINEA_YA_CONCILIADA`. Test dedicado obligatorio.

---

## 3. Decisión 2 — `LineasCuentaReaderPort` como módulo-puerto leaf

**Ubicación**: `backend/src/comprobantes/lineas-cuenta-reader.module.ts`, calcado de
`periodos-fiscales/periodos-reader.module.ts` (leído: solo `PrismaService` + `TenantContextService`
como providers, cero imports de módulos → imposible cerrar ciclo CJS, que es la razón documentada de
ese patrón). Precedentes: `PeriodosReaderModule`, `EeffSaldosReaderModule`, `CuentasReaderModule`,
`MembershipsReaderModule`.

```ts
// comprobantes/ports/lineas-cuenta-reader.port.ts
export const LINEAS_CUENTA_READER_PORT = Symbol('LINEAS_CUENTA_READER_PORT');

/** Proyección de una línea contable en MONEDA ORIGINAL. No es la entidad Prisma. */
export interface LineaCuentaRow {
  comprobanteId: string;
  orden: number;
  cuentaId: string;
  fechaContable: Date;              // @db.Date → FechaContable.fromDbDate en el boundary
  moneda: Moneda;
  debito: Decimal;                  // moneda original — LibroMayorReaderPort NO lo trae
  credito: Decimal;
  debitoBob: Decimal;               // para mostrar equivalente, no para matchear
  creditoBob: Decimal;
  glosa: string;                    // cabecera
  glosaLinea: string | null;
  numeroComprobante: string | null;
  estado: EstadoComprobante;
  anulado: boolean;
}

export interface LineasCuentaFiltros {
  cuentaId: string;
  fechaDesde: Date;   // inclusive
  fechaHasta: Date;   // inclusive
}

export abstract class LineasCuentaReaderPort {
  /**
   * Líneas de UNA cuenta en un rango, en moneda original.
   * Solo CONTABILIZADO/BLOQUEADO y `anulado = false`: un BORRADOR no movió plata
   * y un anulado dejó de moverla — ninguno es conciliable.
   * Orden determinístico: fechaContable ASC, numero ASC NULLS LAST, comprobanteId ASC, orden ASC.
   * Multi-tenant: filtra organizationId (§4.2 core, Anti-31).
   */
  abstract listarPorCuentaEnRango(
    tenantId: string, filtros: LineasCuentaFiltros,
  ): Promise<LineaCuentaRow[]>;

  /**
   * Resuelve anclas `(comprobanteId, orden)` puntuales. NO filtra por anulado ni por
   * estado: existe para DIAGNOSTICAR por qué se rompió un vínculo (§2.2 del design) —
   * distinguir "la línea no existe" de "el comprobante fue anulado".
   * Se invoca solo cuando quedaron anclas huérfanas. Devuelve las que existan.
   */
  abstract listarPorAnclas(
    tenantId: string, anclas: ReadonlyArray<{ comprobanteId: string; orden: number }>,
  ): Promise<LineaCuentaRow[]>;
}
```

**Superficie mínima**: dos métodos. No hay `contar`, no hay `incluirAnulados` (los anulados nunca
son conciliables; se ven solo como motivo de ruptura), no hay filtro por comprobante.

**Implementación con el query builder de Prisma, NO `$queryRaw`.** `LibroMayorReaderPort` usa raw
porque hace `GROUP BY` con agregados (`prisma-libro-mayor-reader.adapter.ts:114-220`); acá es una
lectura filtrada plana. El builder devuelve `Decimal` tipado sin el remapeo `string → Decimal` que
el adapter de libro mayor tiene que hacer a mano (`:225-230`), y deja el filtro de tenant
estáticamente visible.

```ts
client.lineaComprobante.findMany({
  where: {
    organizationId: tenantId,
    cuentaId: filtros.cuentaId,
    comprobante: {
      organizationId: tenantId,                       // defense in depth
      estado: { in: ['CONTABILIZADO', 'BLOQUEADO'] },
      anulado: false,
      fechaContable: { gte: filtros.fechaDesde, lte: filtros.fechaHasta },
    },
  },
  include: { comprobante: { select: { numero: true, glosa: true, fechaContable: true,
                                      estado: true, anulado: true } } },
  orderBy: [{ comprobante: { fechaContable: 'asc' } }, { comprobante: { numero: 'asc' } },
            { comprobanteId: 'asc' }, { orden: 'asc' }],
})
```

`ConciliacionBancariaModule` importa `LineasCuentaReaderModule`. Sin ciclo: el leaf no importa nada.

---

## 4. Decisión 3 — Contrato del puerto `ExtractoParser`

### 4.1 Auto-descripción → alimenta UI e instructivo sin duplicar verdad

```ts
export type EstrategiaChecksum = 'DECLARADO' | 'DERIVADO' | 'IMPOSIBLE';

export interface DescriptorPerfilExtracto {
  readonly perfil: PerfilExtracto;          // enum Prisma — clave estable
  readonly banco: string;                   // "Banco Sol"            (user-facing)
  readonly formato: string;                 // "Excel (.xlsx)"        (user-facing)
  readonly extensiones: readonly string[];  // ['.xlsx']
  readonly mimeTypes: readonly string[];
  readonly estrategiaChecksum: EstrategiaChecksum;
  readonly soportaContraparte: boolean;
  readonly soportaHora: boolean;
  /**
   * ¿Este perfil sabe extraer el número de cuenta de la cabecera?
   * `false` ⇒ el importador NO puede validar destino y cae al fallback de
   * advertencia (REQ-CB-16). Nunca se infiere: lo declara el adaptador.
   */
  readonly exponeNumeroCuenta: boolean;
  readonly instruccionesDescarga: string;   // decisión 11
  readonly advertencia?: string;            // decisión 11
}

export abstract class ExtractoParserPort {
  /** Metadata del perfil. Única fuente de verdad para desplegable + instructivo. */
  abstract get descriptor(): DescriptorPerfilExtracto;

  /**
   * ¿Este archivo corresponde a ESTE perfil? Valida la decisión 10 (una cuenta =
   * un perfil): detecta cabeceras/estructura, NUNCA por extensión ni nombre.
   * Barato — no parsea filas.
   */
  abstract reconoce(buffer: Buffer): Promise<boolean>;

  /**
   * Parsea a modelo canónico ya normalizado (Money 2 dec, FechaContable sin UTC).
   * NO garantiza orden: el orden del archivo es irrelevante por construcción
   * (Fortaleza exporta DESC en modo default y ASC por rango). El caller aplica
   * `ordenarCanonico`. El adapter tiene PROHIBIDO derivar semántica de la
   * posición de la fila (ej. saldo "de la fila anterior").
   */
  abstract parse(buffer: Buffer): Promise<ExtractoParseado>;
}
```

Modelo canónico devuelto:

```ts
export interface MovimientoParseado {
  readonly fecha: FechaContable;
  readonly hora: string | null;                 // 'HH:MM:SS'
  readonly monto: Money;                        // SIEMPRE positivo, 2 decimales
  readonly tipo: LadoBancario;                  // 'DEBITO' | 'CREDITO'
  readonly descripcion: string;                 // cruda, legible
  readonly referencia: string | null;
  readonly saldo: Money | null;
  readonly contraparteNombre: string | null;
  readonly contraparteDocumento: string | null;
  readonly datosOriginales: Readonly<Record<string, string | null>>;  // celdas como STRING
}

export interface ExtractoParseado {
  readonly movimientos: readonly MovimientoParseado[];
  readonly cobertura: { desde: FechaContable; hasta: FechaContable; declarada: boolean };
  readonly saldoInicialDeclarado: Money | null;
  readonly saldoFinalDeclarado: Money | null;
  readonly monedaDeclarada: Moneda | null;
  /**
   * Número de cuenta tal como lo escribió el banco en la cabecera, CRUDO —
   * sin normalizar, sin comparar (REQ-CB-16). `null` cuando el perfil no lo
   * expone (`descriptor.exponeNumeroCuenta === false`) o cuando la etiqueta
   * esperada no apareció en un perfil que sí debería traerlo.
   */
  readonly numeroCuentaDeclarado: string | null;
}
```

`cobertura.declarada = true` cuando salió del encabezado (Fortaleza modo rango:
`Movimientos del: 2026-05-08 al: 2026-07-23`); `false` cuando se derivó del `min/max` de las filas.
Distinguirlo es lo que después habilita detección de huecos sin re-parsear (fuera de v1).

### 4.2 Orden determinístico — dónde vive

**No en el parser.** Vive en dominio puro: `domain/orden-canonico.ts`.

```ts
export function ordenarCanonico(movs: readonly MovimientoParseado[]): MovimientoParseado[];
```

Clave total, sobre datos que son idénticos entre descargas:

```
fecha ASC  →  monto (centavos, string zero-padded) ASC  →  tipo ASC ('CREDITO' < 'DEBITO')
           →  descripcionNormalizada ASC  →  referencia ASC (null último)
```

Motivo de sacarlo del adapter: cada uno de los 5 adaptadores futuros podría driftear en la regla de
la que depende el hash de deduplicación. Una implementación, una spec, cero DB. El contrato del
puerto dice "el caller garantiza el orden canónico" — la garantía vive en un solo lugar.

El **checksum derivado** también es dominio (`domain/checksum-extracto.ts`) y consume la lista **ya
ordenada**: `saldoInicial = saldo(primerMovimiento) ∓ monto(primerMovimiento)` según lado; luego
`saldoInicial + Σ(±montos) ≟ saldoFinal` con `Money.igualaConTolerancia` (§8.0). El resultado es
`VERIFICADO | SIN_VERIFICAR | DESCUADRE` + `diferencia` — **informativo, nunca rechaza la
importación** (decisión 3).

### 4.3 Número de cuenta declarado — R-5 / REQ-CB-16

**El problema**: tres cuentas del usuario en el mismo banco difieren **solo en el dígito final**
(`1191959-000-001`, `-002`, `-003`). Las tres usan `BANCOSOL_XLSX`, así que `reconoce()` — que
valida *formato* — las acepta a todas. Importar el extracto de una en otra es el error más probable
del módulo, y es **irreversible**: `importacion ImportacionExtracto @relation(..., onDelete: Restrict)`
(§9) hace que una importación con movimientos no se pueda borrar. Se deshace un *match*, no una
*importación*.

**De dónde sale, por formato.** El número está en la cabecera de los 7, pero **la etiqueta y el valor
son celdas distintas, y el valor puede venir contaminado con prefijo de producto y/o sufijo de
moneda.** Confundir "etiqueta" con "valor" fue un error real de los insumos (#953/#959) que este
design arrastraba: `CA:` NO es la etiqueta de Económico, es parte del valor.

Convención de la tabla: **celda en notación A1** (fila 1-based, columna por letra). Verificado
abriendo cada `.xlsx` y leyendo el atributo `r` de las celdas — no por inspección visual.

| Perfil | Celda ETIQUETA | Celda VALOR | Valor crudo | Limpieza necesaria | `exponeNumeroCuenta` |
|---|---|---|---|---|---|
| **BancoSol XLSX** | `E4` `Cuenta:` | `G4` | `1191959-000-001` | separadores (VO) | **`true`** ✅ verificado |
| **Económico XLSX** | `E4` `Cuenta:` | `G4` | **`CA: 2031262031 (Bs)`** | **prefijo `CA:` + sufijo `(Bs)`** + separadores | **`true`** ✅ verificado |
| **Unión XLSX** | `B8` `Cuenta:` | `E8` | `10000024346492` | separadores (VO) | **`true`** ✅ verificado |
| Fortaleza XLSX | `B6` `NÚMERO DE CUENTA:` | `C6` | `5651023390` | **por verificar** | `true` ⚠️ **NO verificado etiqueta-vs-valor** (slice futuro) |
| BMSC XLSX | `A7` `Nro de Cuenta:` | `F7` | `4066710701` | **por verificar** | `true` ⚠️ **NO verificado** (slice futuro) |
| BCP XLSX | `C10` `Nro. Cuenta:` | `H10` | `201-51454470-3-93` | **por verificar** | `true` ⚠️ **NO verificado** etiqueta-vs-valor (slice futuro) |
| FIE XLSX | `H8` `NUMERO DE CUENTA:` | `P8` | `40-0-1816170-4` | **por verificar** | `true` ⚠️ **NO verificado** etiqueta-vs-valor (slice futuro) |

> **Nota**: BCP y FIE son slices futuros; sus valores están tomados de los archivos pero el nivel
> etiqueta-vs-valor recién se cierra al construir cada adaptador. Verificado por celda al cierre de
> la 2ª revisión: **BCP** = `Nro. Cuenta:` (C10) → `201-51454470-3-93` (H10); **FIE** =
> `NUMERO DE CUENTA:` (H8) → `40-0-1816170-4` (P8). (Una revisión intermedia invirtió esta
> atribución; los números de arriba son los del archivo real.)

**Los 4 formatos marcados ⚠️** tienen el número visualmente presente, pero **nadie los abrió con el
nivel de detalle etiqueta-vs-valor que reveló el `CA:` de Económico**. El valor crudo de la tabla es
una lectura rápida; puede ocultar un prefijo/sufijo como el de Económico. **Verificar etiqueta y
valor celda por celda es tarea obligatoria antes de construir cada uno de esos adaptadores** — no se
declara `exponeNumeroCuenta: true` en firme hasta hacerlo.

**Dos de los tres formatos de v1 necesitan limpieza más allá de los separadores del VO.** La
afirmación anterior de este design —"ningún formato de v1 necesita tratamiento especial"— **era
falsa** y se elimina: Económico necesita strip de `CA:` y de `(Bs)`.

**Mecanismo — capacidad del dialecto, no `replace` suelto ni tolerancia en el VO.** La extracción
del número es parte de la máquina de escaneo de cabecera (§8.3); cada dialecto declara cómo aislar
el valor:

```ts
interface ExtraccionNumeroCuenta {
  etiqueta: string;            // 'Cuenta:' — se localiza normalizada (§6.2), no por celda fija
  offsetValor: 'derecha';      // el valor está en la celda a la derecha de la etiqueta
  prefijoProducto?: string;    // Económico 'CA:', Unión TXT 'BUNCA' — se strippea
  sufijoMoneda?: string;       // Económico '(Bs)' — se strippea
}

const NUMERO_CUENTA_BANCOSOL:  ExtraccionNumeroCuenta = { etiqueta: 'Cuenta:', offsetValor: 'derecha' };
const NUMERO_CUENTA_ECONOMICO: ExtraccionNumeroCuenta = {
  etiqueta: 'Cuenta:', offsetValor: 'derecha', prefijoProducto: 'CA:', sufijoMoneda: '(Bs)',
};
const NUMERO_CUENTA_UNION_XLSX: ExtraccionNumeroCuenta = { etiqueta: 'Cuenta:', offsetValor: 'derecha' };
```

Reglas invariantes (idénticas a la "Consecuencia A" de §4.3.2, ahora generales):

1. **El adaptador devuelve `numeroCuentaDeclarado` ya limpio** (`'2031262031'`, no
   `'CA: 2031262031 (Bs)'`). El VO normaliza *separadores*, nunca *prefijos alfabéticos* — y §4.4
   prohíbe que los tolere (sería `endsWith` disfrazado = R10).
2. **Si el `prefijoProducto`/`sufijoMoneda` declarado NO aparece, es error de formato**
   (`CONCILIACION_ARCHIVO_FORMATO_NO_RECONOCIDO`), no un strip silencioso: un valor de Económico que
   no arranca con `CA:` no es el archivo que creemos.
3. **El strip es dato del dialecto, testeable**: un test por perfil afirma
   `numeroCuentaDeclarado === '2031262031'` desde el crudo `'CA: 2031262031 (Bs)'`.

### 4.3.1 Unión — el XLSX por fechas reemplaza al TXT en v1

**Decisión: `UNION_XLSX` (export por rango de fechas) es el perfil de v1. `UNION_TXT` sale del
corte** y queda como perfil futuro (su análisis se conserva en §4.3.2 — es correcto, solo no aplica).

Medido sobre `Extracto_Movimientos (1).xlsx`, hoja **`ExtractoMovimientosFechas`**:

| Aspecto | Valor medido |
|---|---|
| Cabecera | `Cuenta:` → `10000024346492` (**limpio, sin prefijo `BUNCA`**) r8 · `Producto: CAJA DE AHORRO M/N` r10 · `Desde: 01/04/2026 Hasta: 23/07/2026` r12 |
| Fila de encabezados | **r16** — `[1]Fecha Movimiento [3]AG [7]Descripción [20]Nro Documento [25]Monto␊ [29]Saldo` |
| Datos | r17–r37 = **21 movimientos**, 02/04/2026 … 13/07/2026, orden **ASCENDENTE** |
| Monto | string con signo, miles y padding: `'               -900.00'`, `'             12,600.00'`. **Sin centavos implícitos** |
| Fecha | `02/04/2026` — `DD/MM/YYYY` string. **No es serial de Excel** |
| Contraparte / hora | **no las trae** ⇒ `soportaContraparte: false`, `soportaHora: false` |

**Checksum — `estrategiaChecksum: 'DERIVADO'`** (corrección de rev 5, ver abajo). Verificado por
ejecución; el archivo NO declara saldo inicial, pero sí declara tres totales y todos cierran:

```
── ANCLA (define la estrategia DERIVADO) ──
inicial derivado (saldo₁ − monto₁)         =  3.143,43   ← NO viene en el archivo, se deriva
neto de los 21 montos                      =  8.765,97
3.143,43 + 8.765,97 = 11.909,40  ==  saldo de la última fila           ✅
── VERIFICACIÓN ADICIONAL del adaptador (no es la estrategia) ──
Total Créditos declarado (fila 39) 12.618,94  ==  Σ montos > 0         ✅
Total Débitos  declarado (fila 41)  3.852,97  ==  Σ |montos < 0|       ✅
Total / Disponible declarado (fila 45) 11.909,40 == saldo final        ✅
saldo corrido coherente fila a fila (saldoᵢ₋₁ + montoᵢ = saldoᵢ)       ✅ en las 21
```

> **Por qué `DERIVADO` y no `DECLARADO`** (CRITICAL-1, resuelto por el usuario): la definición
> normativa de `DECLARADO` en **REQ-CB-08** es *"el archivo trae saldo inicial/final en su
> cabecera"*. Unión declara totales de crédito/débito y saldo final, **pero NO trae saldo
> inicial** — no cumple la definición. La rev 4 usaba una noción más amplia de "declarado" y
> chocaba con spec, tasks, proposal y #953. Se corrige: la **estrategia** es `DERIVADO` (inicial =
> `saldo₁ − monto₁`); los tres totales declarados son **verificación adicional que hace el
> adaptador de Unión**, no la estrategia. Quedan las 5 comprobaciones, sin romper la definición.
>
> `estrategiaChecksum` es un literal del descriptor que después alimenta la UI: tiene que decir la
> verdad normativa (`DERIVADO`), no "lo más rico que pude verificar".

**Las 3 estrategias quedan cubiertas en v1** — y `DECLARADO` la aporta **Económico**, que SÍ trae
`Saldo Inicial:` (`M4` = 327.520,14) y `Saldo Final:` (`M5` = 179.757,37) en cabecera (verificado):

| Perfil v1 | `estrategiaChecksum` | Evidencia |
|---|---|---|
| BancoSol XLSX | `DERIVADO` | sin saldo declarado; inicial = `saldo₁ − monto₁` (#953) |
| **Económico XLSX** | **`DECLARADO`** | `Saldo Inicial` `M4` + `Saldo Final` `M5` en cabecera |
| Unión XLSX | `DERIVADO` | totales al pie, **sin saldo inicial**; verificación adicional cruzada |

`EstrategiaChecksum.IMPOSIBLE` no tiene perfil en v1 (se conserva en el tipo: la necesitaría Unión
**TXT**). Ningún banco de v1 importa a ciegas.

**`UNION_XLSX` es un `DialectoXlsx` propio, NO una variante del dialecto BancoSol/Económico.**
Comparte el **motor de lectura** (`XlsxCoreExtractoParser` + `read-excel-file`), no el mapeo:

| | BancoSol / Económico | Unión XLSX |
|---|---|---|
| Generador | el mismo entre sí (#953) | **distinto** |
| Columnas | `[0]Fecha [1]Hora [2]Nro Trn. [4]Transacción [8]Nota [11]Monto [12]Saldo` | `[1]Fecha [3]AG [7]Descripción [20]Nro Doc [25]Monto [29]Saldo` |
| Cabecera | bloque + panel de filtros | `Cuenta:`/`Producto:`/`Desde-Hasta` + totales al pie |
| Monto | columna única, formato del dialecto | string con signo, miles, padding |

Reusar el mapeo de BancoSol para Unión daría columnas corridas silenciosamente. **El mapeo por
nombre de cabecera (§8.3) lo hace imposible por construcción** — pero queda escrito para que nadie
lo intente por "ahorro".

**Un hallazgo que valida el diseño**: el encabezado de la columna de monto es literalmente
`'Monto\n'` — **con salto de línea al final**. El paso 4 de `normalizarDescripcion` (§6.2), que se
reusa para normalizar etiquetas de cabecera, colapsa saltos y espacios y hace `trim`: la etiqueta
matchea sin ningún caso especial. Un mapeo por índice, o un `===` sobre la etiqueta cruda, habría
fallado acá.

**El otro export de Unión está DESCARTADO** (`Extracto_Movimientos.xlsx`, hoja
`ExtractoMovimientosUltimosExt`): topado en `Últimos 12 movimientos` (r11), **sin columna Saldo** ⇒
checksum imposible, orden DESCENDENTE, y declara `Cuenta Origen/Destino` / `Nombre` / `Documento`
(r16) **con las 12 filas vacías** — promete contraparte y no la entrega. Además sus índices de
columna son **distintos** a los del export por fechas (`Fecha=[3]` vs `[1]`, `Nro Documento=[17]`
vs `[20]`, `Monto=[26]` vs `[25]`): el mismo banco, dos layouts. Refuerzo independiente de la regla
"mapear por nombre, nunca por índice".

> **Recomendación operativa que ya valía para todos los bancos** (#953) y que acá se vuelve dura:
> exportar **siempre por rango**, nunca el default. En Unión el default además pierde el saldo.

### 4.3.2 Unión TXT — análisis conservado, perfil FUTURO (no v1)

> Lo que sigue **no se implementa en v1**. Se conserva porque el análisis es correcto y ahorra
> trabajo si alguna vez entra el TXT (por ejemplo si Unión discontinúa el XLSX por fechas).
> Nada de esto aplica a `UNION_XLSX`, que trae el número limpio en la cabecera como los otros 6.

`Extracto_Movimientos.txt` **no tiene cabecera**. El número viaja en **cada fila de datos**, en
posición fija. Verificado sobre el archivo real (12 filas, todas de 199 chars — ancho fijo estricto):

```
1260000           BUNCA10000024346492  20260608N/C POR TRASPASO ENTRE BANCOS…
                  └──── cols 19-37 ───┘  └ fecha (col 40)
```

`cut -c19-37 | sort | uniq -c` → **`12  BUNCA10000024346492`**: un único valor distinto en las 12
filas. Estructura del token: `BUN` (Banco Unión) + `CA` (tipo de producto) + `10000024346492` (el
número de cuenta, confirmado por el usuario).

**Consecuencia A — el strip del prefijo vive en el ADAPTADOR de Unión, no en el VO.**

`numeroCuentaDeclarado` para `UNION_TXT` (futuro) se devuelve **ya sin `BUNCA`**: `'10000024346492'`. Si el
adaptador devolviera la cadena completa, jamás coincidiría con lo que el usuario carga en
configuración — el VO normaliza *separadores*, no prefijos alfabéticos.

| Opción | Consecuencia | Decisión |
|---|---|---|
| Strip en el adaptador de Unión | Es conocimiento del formato, del mismo tipo que "los montos vienen en centavos implícitos" (el TXT sí los tiene — §8.1). Vive donde ya viven las otras rarezas de Unión | **ELEGIDA** |
| El VO tolera prefijos alfabéticos | Mete al dominio una regla de un banco puntual **y**, mucho peor, reintroduce el matching parcial que el VO existe para hacer imposible: "tolerar prefijos" es un `endsWith` con otro nombre, y R10 dice que esa clase de comportamiento es la que convierte la validación en confianza falsa | Descartada |

La segunda opción es la que hay que rechazar con más ganas: el valor entero del VO es que su
superficie **no permite** comparación parcial. Agregarle tolerancia de prefijo lo desarma desde
adentro, y encima por un caso de un solo banco.

El prefijo se declara como dato del dialecto, no como `replace` suelto:

```ts
const DIALECTO_UNION_TXT = {   // perfil FUTURO
  // ...
  numeroCuenta: {
    columnas: [19, 37] as const,   // 1-based, inclusive — ancho fijo verificado
    prefijoProducto: 'BUNCA',      // BUN (Banco Unión) + CA (caja de ahorro)
  },
};
```

Si el prefijo esperado no está, es **error de formato** (`CONCILIACION_ARCHIVO_FORMATO_NO_RECONOCIDO`), no un
strip silencioso: un archivo cuyo campo no arranca con `BUNCA` no es el archivo que creemos.

**Consecuencia B — chequeo de integridad exclusivo de Unión: archivo mezclado.**

Como el token se repite en **cada** fila, si **varía entre filas** el archivo contiene movimientos
de más de una cuenta ⇒ **rechazo duro** `CONCILIACION_ARCHIVO_MEZCLADO` (422), con los valores distintos
encontrados en el mensaje.

Es una capacidad que **ningún otro de los 7 formatos tiene**: en los demás el número aparece una
sola vez, en la cabecera, y un archivo mezclado sería indetectable. Por eso queda como **regla del
adaptador de Unión**, no como comportamiento genérico del puerto — generalizarla obligaría a los
otros 6 a fingir una verificación que no pueden hacer.

Ubicación dentro del adaptador: en `parse()`, no en `reconoce()`. Un archivo mezclado **es** un
Unión TXT válido en forma — `reconoce()` valida formato y devuelve `true`; lo que falla es la
coherencia del contenido. El contrato del puerto ya admite que `parse()` lance un `DomainError`; el
importador lo mapea a 422 en la misma compuerta del §10.

**Caso borde**: archivo Unión sin filas de datos ⇒ no hay de dónde sacar el número ⇒
`numeroCuentaDeclarado = null` ⇒ cae al fallback de advertencia del §4.4. Correcto por
construcción: sin datos tampoco hay nada que importar.

### 4.4 Dónde vive la comparación — y por qué

**El parser SOLO extrae.** Devuelve `numeroCuentaDeclarado` como string crudo y no compara nada.
Tres razones:

1. **El parser no conoce el destino.** `parse(buffer)` recibe un archivo, no una `CuentaBancaria`.
   Pasarle la cuenta destino lo convertiría en un validador con estado y volvería `parse` no
   reutilizable para previsualizar un archivo antes de elegir cuenta.
2. **Es una regla igual para los 7 bancos.** Si vive en el adaptador, se reimplementa 5 veces y
   basta que uno escriba `startsWith` para que la validación se vuelva inservible **en silencio**.
3. **Es la regla más fácil de implementar mal de todo el módulo** (ver abajo) ⇒ tiene que ser
   dominio puro, testeable sin DB, con su propia spec.

**Value object en `domain/numero-cuenta-bancaria.ts`.** El tipo impide el bug; no lo impide el code
review:

```ts
/**
 * Número de cuenta bancaria normalizado para comparación (REQ-CB-16).
 *
 * REGLA CRÍTICA: la comparación es EXACTA sobre el valor normalizado.
 * Este VO NO expone —y no debe exponer NUNCA— `startsWith`, `includes`,
 * `contains`, ni acceso al string normalizado para comparar por fuera.
 * Las cuentas del usuario difieren SOLO en el dígito final
 * (`1191959-000-001` / `-002` / `-003`): una comparación por prefijo o
 * substring haría pasar las tres → validación inservible y PEOR que no
 * tenerla, porque da confianza falsa.
 */
export class NumeroCuentaBancaria {
  private constructor(
    private readonly normalizado: string,
    readonly original: string,          // se conserva para el mensaje de error
  ) {}

  /** Quita guiones, espacios (incl. NBSP), puntos, barras y separadores. Uppercase. */
  static of(raw: string): NumeroCuentaBancaria;

  /** Única comparación disponible: igualdad TOTAL del normalizado. */
  equals(other: NumeroCuentaBancaria): boolean {
    return this.normalizado === other.normalizado;
  }

  /** Para persistir / mostrar. NO usar para comparar. */
  toString(): string { return this.original; }
}
```

- `equals` es el **único** método de comparación. No hay getter del normalizado: sin ese getter, un
  `startsWith` fuera del VO no compila contra el tipo.
- Normalización simétrica en ambos lados: `1191959-000-001` ≡ `1191959000001` ≡ `1191959 000 001`,
  pero `…001` **≠** `…002`.
- Spec del VO con el caso adversarial explícito: los tres números del usuario, comparados de a
  pares, deben dar `false` en los 6 pares cruzados y `true` solo consigo mismos. Ese test es la
  regresión que impide que alguien "optimice" a un prefijo más adelante.

**El servicio de importación orquesta** (`ExtractoImportadorService`), sin lógica de comparación
propia — delega en el VO:

```
si  descriptor.exponeNumeroCuenta === false  ó  numeroCuentaDeclarado === null
      → advertencia `CONCILIACION_ARCHIVO_CUENTA_NO_VERIFICABLE`, la importación SIGUE
si  cuentaBancaria.numeroCuenta === null
      → NO importa todavía: devuelve el número leído para CONFIRMACIÓN explícita
        del usuario ("Este extracto dice cuenta X. ¿Es esta cuenta?"). Al confirmar,
        se persiste en `CuentaBancaria.numeroCuenta` y la importación procede.
si  NumeroCuentaBancaria.of(declarado).equals(NumeroCuentaBancaria.of(cuenta.numeroCuenta))
      → OK, sigue
en otro caso
      → FALLO DURO 422 `CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE`
```

**El mensaje muestra los DOS números juntos**, con el original de cada lado (no el normalizado), para
que el usuario vea el dígito que difiere:

> *El archivo corresponde a la cuenta `1191959-000-002` y lo estás importando en `1191959-000-001`.
> Verificá que bajaste el extracto de la cuenta correcta.*

La UI resalta la parte distinta. "Cuenta incorrecta" a secas no alcanza: el usuario tiene que poder
decidir cuál de los dos está mal.

**Coherencia con la decisión 3**: esto rechaza del lado de la **importación**, no del núcleo
contable. Editar comprobantes, anular, reordenar líneas y cerrar períodos siguen sin restricción —
por eso el ancla sigue sin FK (§2).

### 4.5 Registro de adaptadores + cómo lo lee la UI

```ts
export const EXTRACTO_PARSERS = Symbol('EXTRACTO_PARSERS');   // multi-provider (array)

@Injectable()
export class ExtractoParserRegistry {
  private readonly porPerfil: ReadonlyMap<PerfilExtracto, ExtractoParserPort>;

  constructor(@Inject(EXTRACTO_PARSERS) parsers: readonly ExtractoParserPort[]) {
    // Fail-fast en bootstrap: (a) perfil duplicado, (b) valor del enum sin parser.
    // Agregar PerfilExtracto sin adaptador rompe el arranque, no producción.
  }
  descriptores(): DescriptorPerfilExtracto[];
  para(perfil: PerfilExtracto): ExtractoParserPort;   // throws si falta
}
```

Wiring en `conciliacion-bancaria.module.ts`:

```ts
BancoSolXlsxParser  = new XlsxCoreExtractoParser(DIALECTO_BANCOSOL)
EconomicoXlsxParser = new XlsxCoreExtractoParser(DIALECTO_ECONOMICO)   // mismo generador que BancoSol
UnionXlsxParser     = new XlsxCoreExtractoParser(DIALECTO_UNION_XLSX)  // generador DISTINTO (§4.3.1)
{ provide: EXTRACTO_PARSERS, useFactory: (...p) => p, inject: [BancoSolXlsxParser, ...] }
```

**"XLSX core-compartido" hecho concreto**: UNA clase `XlsxCoreExtractoParser` parametrizada por un
objeto `DialectoXlsx` (época de fechas o formato de texto, dialecto decimal, estrategia de checksum,
extractor de contraparte, etiquetas de cabecera esperadas), instanciada **tres** veces en v1. Tres
perfiles, tres descriptores, **un** camino de código.

Hay que distinguir dos niveles, porque no son lo mismo:

| Nivel | Alcance |
|---|---|
| **Mismo generador** | BancoSol ↔ Económico: columnas idénticas (#953). Sus diferencias (serial de Excel vs `03/Jun/2026`; sin saldo declarado vs Saldo Inicial/Final; DESC vs ASC) son **tolerancias del mismo mapeo** |
| **Mismo motor, generador distinto** | Unión XLSX: columnas y cabecera propias (§4.3.1). Comparte `XlsxCoreExtractoParser` y `read-excel-file`, **no** el mapeo de columnas |

Ambos son "datos del dialecto, no ramas del parser" — pero confundirlos lleva a reusar el mapeo de
BancoSol para Unión y leer columnas corridas. El mapeo por nombre de cabecera lo hace imposible; el
test de "anti-reuso de mapeo" (§11) es la red.

**De qué columna sale `descripcion` — hay que fijarlo, es entrada del `hashDedup`** (WARNING). El
fixture R-1 de dedup **no discrimina** (da 59 de solape con cualquier elección de columna), así que
ningún test de idempotencia lo va a atrapar: si queda ambiguo, se elige mal en silencio. Se declara
por dialecto y se bloquea con un test de renglón dorado:

```ts
interface DialectoXlsx {
  // ...
  columnasDescripcion: readonly string[];   // nombres de cabecera, unidos por ' '
}
const DIALECTO_BANCOSOL:  { columnasDescripcion: ['Transacción', 'Nota'] }   // [4] + [8]
const DIALECTO_ECONOMICO: { columnasDescripcion: ['Transacción', 'Nota'] }   // mismo generador
const DIALECTO_UNION_XLSX:{ columnasDescripcion: ['Descripción'] }           // [7]
```

- **BancoSol/Económico concatenan `Transacción` + `Nota`** (`[4]` + `[8]`): la `Nota` sola pierde el
  tipo de transacción; la `Transacción` sola pierde el detalle libre. Ambas vienen del mismo
  generador → estables entre descargas. La contraparte, cuando el dialecto la extrae, sale de la
  misma `Nota` (etiquetada) — se parsea aparte, no se pisa con la descripción.
- **Test de renglón dorado obligatorio** (por dialecto): sobre una fila real conocida, `descripcion`
  debe ser exactamente el string esperado. Es lo único que fija la elección, porque el fixture de
  dedup no la ejercita.
- **Advertencia para el implementador**: cambiar `columnasDescripcion` **cambia el `hashDedup`** de
  todo el histórico de esa cuenta → duplicados masivos al re-importar. Si alguna vez se toca, va con
  el bump de versión del hash (`v1`→`v2`, §6.1) y un plan de re-hash, nunca suelto.

**La UI**: `GET /api/cuentas-bancarias/perfiles` → `registry.descriptores()` → `PerfilResponseDto[]`.
El desplegable de `perfilExtracto`, el instructivo de descarga y el cartel de advertencia salen
todos de esa misma respuesta. Agregar un banco = agregar un adaptador; la UI se entera sola.
Cero duplicación de verdad (mecanismo de la decisión 11).

**v1: el enum `PerfilExtracto` contiene exactamente 3 valores** — `BANCOSOL_XLSX`,
`ECONOMICO_XLSX`, `UNION_XLSX`. No se pre-cargan bancos futuros: el chequeo de bootstrap los
rechazaría.

---

## 5. Decisión 4 — Motor de sugerencias (dominio puro, ≥95%)

### 5.1 La inversión de lado — la pieza que es fácil equivocar

El extracto está escrito **desde la perspectiva del banco**. Un `CREDITO` en el extracto es plata
que ENTRA a la cuenta. En los libros de la empresa, plata que entra a una cuenta de activo se
registra al **DÉBITO**.

```ts
// El extracto habla desde el banco; el libro desde la empresa. Un CRÉDITO bancario
// (entra plata) se registra al DÉBITO de la cuenta de activo, y viceversa.
export function ladoContableEsperado(tipo: LadoBancario): LadoContable {
  return tipo === 'CREDITO' ? 'DEBITO' : 'CREDITO';
}
```

Función nombrada con spec propia. Inlinearla es la forma más barata de introducir un bug que
"funciona" en la mitad de los casos.

### 5.2 Algoritmo

```
ENTRADA  movimientos pendientes P  (estadoEfectivo === 'PENDIENTE', incluye los de vínculo roto)
         líneas candidatas     L  (de `B`, MENOS las que tienen match VÁLIDO)
         ventanaDias = 3

1. FILTRAR pares (p, l) elegibles:
     l.moneda === p.moneda
     l.lado   === ladoContableEsperado(p.tipo)
     l.monto.igualaConTolerancia(p.monto)          // ±0.01, misma moneda (§8.0)
     |p.fecha.diferenciaEnDias(l.fecha)| <= 3        ← FechaContable.sumarDias/restarDias

2. INDEXAR   candidatosDe: Map<movimientoId, Par[]>
             reclamantesDe: Map<`${comprobanteId}:${orden}`, movimientoId[]>

3. PUNTUAR cada par:
     ALTA   ⇔ diferenciaEnDias === 0
              ∧ candidatosDe(p).length === 1
              ∧ reclamantesDe(l).length === 1        ← unicidad en AMBAS direcciones
     MEDIA  ⇔ candidatosDe(p).length === 1 ∧ reclamantesDe(l).length === 1
              (monto exacto, fecha dentro de ±3 días)
     BAJA   ⇔ en cualquier otro caso (varios candidatos de un lado o del otro)

4. ORDENAR  confianza DESC → |diferenciaDias| ASC → comprobanteId ASC → orden ASC
            (orden TOTAL ⇒ los tests no dependen del orden de entrada)
```

**Cómo se evitan asignaciones duplicadas** — tres capas, ninguna redundante:

| Capa | Mecanismo | Qué previene |
|---|---|---|
| Conjunto candidato | `L` excluye líneas con match **válido**; las de match **roto** vuelven al pool | Sugerir contra algo ya conciliado; y cierra el lazo de auto-curado (§2.3) |
| Ranking | `reclamantesDe(l).length > 1` ⇒ degrada a `BAJA` | Presentar como "certeza" algo que dos movimientos se disputan |
| Escritura (autoritativa) | `@@unique([organizationId, comprobanteId, orden])` + `409 CONCILIACION_LINEA_YA_CONCILIADA` | La carrera real: dos confirmaciones concurrentes (defense in depth §4.8) |

El motor **nunca auto-asigna** (decisión 2): devuelve una lista ranqueada; confirma el usuario.

### 5.3 N↔1

**v1 = estrictamente 1↔1**, enforzado por DOS uniques:
`@@unique([organizationId, movimientoBancarioId])` y `@@unique([organizationId, comprobanteId, orden])`.

| Opción | Costo | Decisión |
|---|---|---|
| 1↔1 duro | Un depósito registrado en 2 líneas no se puede conciliar del todo. Salida honesta: `IGNORADO` con nota, o ajustar el asiento | **ELEGIDA v1** |
| N↔1 general (suma de aplicaciones ±0,01) | Estados parciales (`PARCIALMENTE_CONCILIADO`), columna `montoAplicado`, UI de agrupación, motor que enumera subconjuntos | Diferido |

Ninguna de las 11 decisiones firmadas exige N↔1, y decisión 3 (herramienta de apoyo, nada
bloqueante) tolera que un caso raro quede sin conciliar. Camino de salida barato y no destructivo:
**quitar `@@unique([organizationId, movimientoBancarioId])` + agregar `montoAplicado Decimal(18,2)`**.
No hay pérdida de datos; sí exige el protocolo §11.6 sobre la migración regenerada.

### 5.4 `FechaContable` — extender el VO, no duplicar el helper

Se agregan a `common/domain/fecha-contable.ts` (leído: hoy tiene `compare/isBefore/isAfter/equals`,
sin aritmética):

```ts
/** Nueva fecha desplazada n días (n puede ser negativo). Reusa Date.UTC — nunca zona local. */
sumarDias(n: number): FechaContable { return FechaContable.fromDbDate(
  new Date(Date.UTC(this.year, this.month - 1, this.day + n))); }
restarDias(n: number): FechaContable { return this.sumarDias(-n); }
/** Días calendario entre ambas (this - other). Positivo si this es posterior. */
diferenciaEnDias(other: FechaContable): number;
```

**NO** se toca `reportes/fecha-contable.ts:53` (`diaAnterior(date: Date)`, helper suelto sobre `Date`
cruda, usado en `evolucion-patrimonio.service.ts:93` y `estado-flujo-efectivo.service.ts:95`). Es
duplicación preexistente; migrarla es un refactor de `reportes/` fuera de este change. Se registra
como deuda, no se arrastra: `conciliacion-bancaria/` **no crea una tercera copia**.

---

## 6. Decisión 5 — Deduplicación

### 6.1 El hash

```
hashDedup = sha256( 'v1' ⧉ cuentaBancariaId ⧉ fechaIso ⧉ montoCentavos
                         ⧉ tipo ⧉ descripcionNormalizada ⧉ ordinalDia )
```

- Separador `⧉` = `` (UNIT SEPARATOR) — imposible en una celda de banco. Sin él,
  `('AB','C')` y `('A','BC')` colisionan.
- `montoCentavos` = `money.toBob()` **string** (`"12600.00"`; `toBob` = `amount.toFixed(2)`, §8.0). Nunca `number`.
- Prefijo de versión `v1`: si algún día cambia la normalización, es un **cambio explícito y
  greppable** con plan de re-hash, no una tormenta silenciosa de duplicados.
- Persistido `hashDedup String` + **`@@unique([cuentaBancariaId, hashDedup])`** — la idempotencia
  de la decisión 7 es **estructural**, no una comparación en el service. La importación usa
  `createMany({ skipDuplicates: true })` y cuenta `nuevos = insertados`,
  `duplicados = leídos − insertados`.

### 6.2 Normalización de la descripción

```ts
export function normalizarDescripcion(raw: string): string
```

Pasos, en orden. Cada uno responde a variación observada entre descargas:

| # | Paso | Por qué |
|---|---|---|
| 1 | Unicode **NFKC** | Ligaduras / formas de ancho completo según el generador |
| 2 | Quitar diacríticos (NFD + `\p{Diacritic}` → ``) | `DEPÓSITO` vs `DEPOSITO` entre modos de export |
| 3 | `toUpperCase()` | Bancos alternan capitalización entre XLSX y MT940 |
| 4 | NBSP ` `, tabs, saltos → espacio; colapsar runs; `trim()` | XLSX inyecta NBSP; MT940 `:86:` corta a 65 y se re-concatena |
| 5 | Truncar a 200 chars | Cota superior estable |

**Lo que deliberadamente NO se hace**: quitar dígitos, números de referencia ni puntuación. Esos
caracteres son justamente lo que distingue dos transferencias del mismo monto el mismo día.
Sobre-normalizar es el único riesgo real acá — las colisiones legítimas ya las resuelve
`ordinalDia`.

### 6.3 `ordinalDia` — por qué dos movimientos idénticos sobreviven ambos

**Definición precisa**: `ordinalDia` es el índice de ocurrencia (0-based) del movimiento **dentro
de su grupo de tupla idéntica** `(fecha, monto, tipo, descripcionNormalizada)`, asignado recorriendo
la lista **en orden canónico** (§4.2), **jamás** en el orden del archivo.

```
Día 2026-06-03, tras ordenarCanonico:
  (12.600,00 · DEBITO · "PAGO PROVEEDOR")   → ordinalDia 0   → hash A
  (12.600,00 · DEBITO · "PAGO PROVEEDOR")   → ordinalDia 1   → hash B ≠ A
  (  350,00 · CREDITO · "TRANSFERENCIA")    → ordinalDia 0   → hash C
```

Dos movimientos legítimamente idénticos ⇒ **tuplas iguales pero ordinales distintos ⇒ hashes
distintos ⇒ el `@@unique` no los toca ⇒ ambos sobreviven.** Y al re-importar el mismo día se
regeneran los ordinales 0 y 1 en el mismo orden ⇒ **ambos deduplican.** Las dos propiedades salen
de la misma regla.

Contar **por grupo de tupla** y no "por día" es lo que lo hace robusto: si contara todos los
movimientos del día, un import parcial que trajera un movimiento menos correría todos los ordinales
siguientes → hashes distintos → duplicados.

**Supuesto explícito, con su límite**: el grupo de tupla está completo cada vez que el día está
cubierto. Válido porque los 7 bancos filtran **por día**, nunca por hora — un rango incluye el día
entero o no lo incluye. Si algún banco expusiera cortes intra-día, el ordinal se rompe; mitigación
en ese momento: incorporar `hora` a la tupla cuando `descriptor.soportaHora === true`. Se documenta,
no se implementa.

**Evidencia de que la regla es necesaria** (#953, regla dura #1): Fortaleza, misma cuenta, mismo
día, export default DESCENDENTE (30 movs) y export por rango ASCENDENTE (73 movs), ambos con
checksum ✅ `366.394,85`. Con ordinal por posición de archivo, los 30 se re-insertarían como
duplicados. Es un bug que solo aparece cuando el usuario cambia de modo de export — el más caro de
diagnosticar en producción.

---

## 7. Decisión 6 — Auto-otorgamiento del pack

### 7.1 Los dos bugs del camino actual (verificados)

1. `PrismaOrgVerticalReader.verticalDe` usa `this.prisma` — **no acepta `tx`**
   (`packs/adapters/prisma-org-vertical.reader.ts:20`). Llamado desde dentro de la `$transaction` de
   provisión, lee por otra conexión, **no ve la org sin commitear**, devuelve `null` y
   `PackService.habilitar` (`pack.service.ts:94-101`) tira `PackVerticalNoAplicableError` → aborta
   la creación de la org.
2. `habilitar` y `activar` llaman `await this.redis.del(...)` (`pack.service.ts:105`, `:178`). Un
   efecto sobre Redis dentro de una TX que puede hacer rollback es un patrón que no se debe copiar.

Además `habilitar` deja `activo = false` (`org-pack.repository.port.ts:38`), y la decisión 5 exige
que el pack nazca **activo**.

### 7.2 Método dedicado

```ts
// packs/pack.service.ts
/**
 * Otorga (entitlement + activación) los packs marcados `otorgadoPorDefecto` del
 * vertical dado, DENTRO de la transacción de provisión de la org.
 *
 * Recibe `vertical` como PARÁMETRO en vez de leerlo con OrgVerticalReaderPort:
 * dentro de la TX la fila de `organizations` todavía no está commiteada y el
 * reader usa su propia conexión → devolvería null (ver design §7.1). El caller
 * ya lo conoce: sale de `dto.modulo`.
 *
 * NO invalida el cache Redis: un efecto externo no puede vivir dentro de una TX
 * que puede hacer rollback. El caller invalida DESPUÉS del commit.
 *
 * @returns claves otorgadas (para log/telemetría del caller)
 */
async otorgarPacksPorDefecto(
  organizationId: string,
  vertical: VerticalPack,
  habilitadoPorUserId: string,
  tx: Prisma.TransactionClient,
): Promise<string[]>
```

Cambios de puerto — mínimos y aditivos:

```ts
// PackCatalogReaderPort
abstract listarOtorgadosPorDefecto(vertical: VerticalPack): Promise<Pack[]>;

// OrgPackRepositoryPort — opts opcional, retrocompatible (patrón `tx?` de
// CierreComprobanteWriterPort)
abstract habilitar(
  organizationId: string, packId: string, habilitadoPorUserId: string,
  opts?: { activo?: boolean; tx?: Prisma.TransactionClient },
): Promise<OrgPackEntitlementRow>;
```

`habilitar(..., { activo: true, tx })` + `@@unique([organizationId, packId])` ⇒ la operación es
idempotente por construcción.

### 7.3 Call sites

Ambos entry points ya tienen `$transaction` + `switch (dto.modulo)` y un actor humano —
**la nullability de `habilitadoPorUserId` no se toca** (`schema.prisma:1257`):

| Archivo | Actor | Dónde |
|---|---|---|
| `tenants/tenants.service.ts:84-116` (`create`) | `ownerId` (parámetro) | tras el `switch`, dentro de la TX |
| `platform/platform-admin.service.ts:112-145` (`crearOrgConOwner`) | `owner.id` (`:107`) | ídem |

```ts
const vertical = verticalParaModulo(dto.modulo);          // OTROS → null
if (vertical !== null) {
  clavesOtorgadas = await this.packs.otorgarPacksPorDefecto(org.id, vertical, ownerId, tx);
}
// ... fuera de la $transaction:
await this.packs.invalidarCacheDeOrg(org.id);
```

La invalidación post-commit es **estrictamente redundante hoy** (el id de la org acaba de generarse,
la clave `org-packs:<id>` no puede existir) y se hace igual: cuesta un `DEL` de una clave ausente y
evita que quien copie el patrón para una org existente herede un bug silencioso.

**Sin ciclo de módulos**: `PacksModule` (`packs/pack.module.ts`) no importa ningún módulo — solo
declara providers. `TenantsModule` y el módulo de platform lo importan directo, igual que
`cierre-ejercicio.module.ts:23` importa su leaf sin `forwardRef`.

### 7.4 Schema, seed y orgs existentes

```prisma
model Pack {
  // ...
  /// Si true, se otorga (habilitado + ACTIVO) automáticamente al provisionar
  /// una org del vertical aplicable. Ver design conciliacion-bancaria §7.
  otorgadoPorDefecto Boolean @default(false)
}
```

Seed `prisma/seeds/packs-catalogo.ts` (upsert por `clave`, ya idempotente):
`contabilidad.conciliacion` · `VerticalPack.CONTABILIDAD` · `TipoPack.DOMINIO` ·
`otorgadoPorDefecto: true`.

**Orgs existentes**: el backfill va en el **seed**, no en la migración — la fila de `packs` la crea
el seed y en `migrate deploy` todavía no existe. Idempotente, y como **no hay
`Organization.ownerUserId` (C-3)** el actor sale de la membership OWNER:

```ts
// para cada org con contabilidadEnabled = true:
//   ownerId = membership con systemRole = OWNER  (findFirst)
//   entitlement.upsert({ where: { organizationId_packId }, create: { activo: true, ... },
//                        update: {} })     // no pisa la decisión de una org que ya lo apagó
```

---

## 8. Decisión 7 — Dinero y fechas en el boundary del parser

Todo vive en `adapters/parsing/` (infraestructura: sabe de seriales de Excel y dialectos de banco;
el dominio recibe `Money` y `FechaContable` ya construidos).

### 8.0 Contrato de `Money` — qué existe y qué se agrega (CRITICAL-3)

Las revisiones anteriores usaban `equalsConTolerancia`, `redondear(2)` y `toFixed(2)` — **ninguno
existe** en `backend/src/common/domain/money.ts`. La API real (leída): `of, plus, minus, mul, div,
abs, equals, greaterThan…, lessThanOrEqualTo, isZero, isPositive, isNegative, balanceadoEnBobCon,
toBob, toString, toPrismaDecimal` + `static ZERO`, `static TOLERANCIA_BOB` (= `0.01`).

| Uso en el design | Método REAL a usar | Acción |
|---|---|---|
| 2 decimales canónicos para hash / persistencia (`montoCentavos`, §6.1) | **`toBob()`** — ya existe, devuelve `amount.toFixed(2)` string (`'12600.00'`) | reemplaza `toFixed(2)` |
| "redondear a 2" al parsear (§8.1) | **no hace falta método**: `Money.of(raw)` en memoria; `.toBob()` cuando se necesita el string 2-dp; la columna `Decimal(18,2)` redondea al persistir | elimina `redondear(2)` |
| comparar dos montos con tolerancia (§4.2 ancla, §5.2 sugerencias, §4.3.1 checksum) | **`igualaConTolerancia(other, tol?)`** — **método NUEVO** | agregar a `money.ts` con test |

**El problema de fondo — tolerancia BOB vs USD (decisión 6: USD desde v1).** `balanceadoEnBobCon`
existe, pero su nombre y su constante `TOLERANCIA_BOB` afirman **BOB**. Conciliación compara montos
en **moneda original** (USD o BOB).

Opciones consideradas:

| Opción | Por qué se descarta / elige |
|---|---|
| (a) Reusar `balanceadoEnBobCon` tal cual | Funciona aritméticamente (siempre comparamos **misma moneda** — el motor filtra `l.moneda === p.moneda` antes), pero el **nombre miente** para USD, viola la filosofía de naming del proyecto (§1: el dominio habla su idioma) y **acopla la corrección de conciliación a una constante que pertenece al invariante de partida doble**: si alguien ajustara `TOLERANCIA_BOB` pensando "esto es solo contable", conciliación se movería en silencio. ❌ |
| (b) Renombrar `balanceadoEnBobCon` → genérico | Blast radius grande sobre el **core contable** (partida doble lo usa en todos lados) y **ahí el nombre BOB es correcto**: la partida doble se valida en BOB (§4.1). Renombrar sería empeorar la semántica del core por conveniencia de un módulo nuevo. ❌ |
| **(c) Método nuevo `igualaConTolerancia(other, tolerancia = Money.of('0.01'))`** | Aditivo, testeable en aislamiento, **currency-neutral**. Su JSDoc documenta la precondición: *compara dos `Money` de la MISMA moneda dentro de una tolerancia; el caller garantiza misma moneda*. El valor `0.01` es correcto para el centavo de cualquier moneda; es parámetro con default, así que un futuro caso ≠ 0.01 no bifurca el código. `TOLERANCIA_BOB` y `balanceadoEnBobCon` quedan intactos para la contabilidad. ✅ **ELEGIDA** |

⇒ **`money.ts` entra al §12 como "Modificar"** con su tarea de test (`igualaConTolerancia`: dentro de
tolerancia → `true`; en el borde exacto `0.01` → `true`; fuera → `false`; simétrico `a.iguala(b) ===
b.iguala(a)`; USD y BOB con el mismo `0.01`). §4.5 es zona de cero tolerancia a `any`/ad-hoc: sin
este método, el implementador inventaría tres tolerancias distintas en el hash y en el ancla.

### 8.1 Dinero — el string crudo nunca se convierte a `number`

`read-excel-file` se configura con **`{ parseNumber: (s: string) => s }`**: se desactiva por
completo la conversión numérica de la librería y **cada celda llega como string**. Toda coerción es
nuestra, en un solo lugar.

```ts
/** Única puerta por la que una celda se convierte en dinero. */
export function leerMontoCelda(raw: string, d: DialectoMonto): Money
```

| Caso real (#953) | Regla | Resultado |
|---|---|---|
| BCP `4.6500000000000004` | `Money.of(stringCrudo)` en memoria; `.toBob()` = `'4.65'` para hash/persistencia (§8.0) — **nunca** `Number()` | `4.65` exacto |
| Fortaleza `Bs.  16,000.00` | Quitar prefijo `/^\s*(Bs\.?\|USD\|\$us\.?)\s*/i`; quitar miles según dialecto | `16000.00` |
| **Unión XLSX** `'             12,600.00'` / `'               -900.00'` | `trim` → quitar miles → el signo determina `tipo`, `monto = abs` | `12600.00` CREDITO / `900.00` DEBITO |
| ~~Unión TXT `1260000` (centavos implícitos)~~ | **Cirugía de string**: `insertarPuntoDecimal(raw, 2)` → `'12600.00'` → `Money.of` (exacto, sin división) | **Perfil futuro (§4.3.2)** — el XLSX de v1 trae decimales explícitos |
| FIE `+50,450.00` / `-31,000.00` | El signo determina `tipo`; `monto = abs` | `50450.00` CREDITO |
| Fortaleza 2 columnas D/C | La columna no vacía determina `tipo` | — |

El dialecto decimal (`1,234.56` vs `1.234,56`) es un **flag explícito del `DialectoMonto`**, jamás
inferido por sniffing: un extracto con un solo movimiento de `1.500` es ambiguo y el sniffing
acertaría el 50% de las veces. Errar acá es un error de 1000x.

`insertarPuntoDecimal` no usa `div(100)` — pura manipulación de string, exacta por construcción y
trivial de testear.

### 8.2 Fechas — todo termina en `FechaContable`, nunca en `Date`

| Caso real | Regla | Nota |
|---|---|---|
| **BancoSol serial** `46224.6478587963` | `[ent, frac] = raw.split('.')`; `FechaContable.of(1899,12,30).sumarDias(Number(ent))` | Época **1899-12-30** por el bug del año bisiesto 1900 de Excel. `Number(ent)` es exacto (entero « 2^53) |
| Hora del mismo serial | `segundos = Math.round(Number('0.'+frac) * 86400)` → `HH:MM:SS` | Float **aceptable acá**: `hora` es display, nullable, jamás entra al hash ni a un cálculo. El redondeo es obligatorio |
| **Económico** `03/Jun/2026` | Mapa explícito `{ENE..DIC}`, sin diacríticos, `SET` alias de `SEP` | **`new Date(string)` PROHIBIDO** — depende del locale del proceso |
| **Unión XLSX** `02/04/2026` · Fortaleza `22/07/2026 09:01` | Split por espacio si hay hora; `DD/MM/YYYY` | — |
| BCP `20260701` (y Unión **TXT**, futuro) | Slice 4/2/2 → `FechaContable.of` | — |

`FechaContable.of` valida el calendario (bisiestos incluidos) ⇒ un serial corrupto o un mes `13`
explotan en el boundary, no tres capas más abajo. Guarda extra para seriales:
`1 ≤ ent ≤ 60000` (≈ año 2064) → si no, `CONCILIACION_ARCHIVO_FECHA_INVALIDA`. Cero UTC fuera del VO (§4.6).

### 8.3 Columnas y detección de archivo

- **Mapeo por NOMBRE de cabecera, nunca por índice** (#953 trampa 4: BCP tiene Fecha=[1],
  Monto=[20], Saldo=[22] con columnas vacías intercaladas; BMSC 21 columnas; Fortaleza la cabecera
  en `r8`). El core escanea las primeras N filas buscando la fila que contiene el conjunto de
  etiquetas requeridas (normalizadas con la misma función del §6.2), y arma
  `Map<etiquetaNormalizada, índice>`. Falta una requerida → `422
  CONCILIACION_ARCHIVO_FORMATO_NO_RECONOCIDO` nombrando las columnas esperadas. Ese mismo escaneo **es**
  `reconoce()`.
- **Magic bytes** con `file-type@16.5.4` (ya en `package.json:51`): `.xlsx` = ZIP `50 4B 03 04`.
  OLE2 `D0 CF 11 E0 A1 B1 1A E1` ⇒ error **accionable** dedicado
  `CONCILIACION_ARCHIVO_XLS_LEGACY`: *"Es un .xls antiguo. Abrilo en Excel y guardalo como .xlsx."*
  Nunca "formato inválido" (decisión 11: nunca aceptar dato malo en silencio, y nunca un mensaje que
  no dice qué hacer).
- **v1 es 100% `.xlsx`**: los 3 perfiles pasan por el mismo chequeo de magic bytes. La rama de
  validación de texto plano (`file-type` no reconoce TXT ⇒ extensión + decodificación + forma de
  línea) **no se implementa en v1**; entra con el primer perfil no-Excel (§4.3.2 o MT940). En
  ningún caso se reutiliza `mime-whitelist.ts` del pack de adjuntos: es otra política, otra lista.
- Upload: patrón idéntico a `comprobantes.controller.ts:277-296` —
  `FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize } })` +
  `@ApiConsumes('multipart/form-data')`.

---

## 9. Modelo de datos (tipos Prisma exactos)

```prisma
enum PerfilExtracto      { BANCOSOL_XLSX  ECONOMICO_XLSX  UNION_XLSX }   // UNION_TXT = perfil futuro (§4.3.2)
enum LadoBancario        { DEBITO  CREDITO }   // perspectiva del BANCO (extracto)
enum EstadoMovimientoBancario  { PENDIENTE  CONCILIADO  IGNORADO }
enum EstadoVerificacionExtracto { VERIFICADO  SIN_VERIFICAR  DESCUADRE }
enum MotivoVinculoRoto   { LINEA_INEXISTENTE COMPROBANTE_ANULADO CUENTA_CAMBIADA
                           MONTO_CAMBIADO LADO_CAMBIADO MONEDA_CAMBIADA FECHA_CAMBIADA }
// ↑ MotivoVinculoRoto NO se persiste: se expone en el DTO. Vive en TS, no en Prisma.

// LadoContable = perspectiva de la EMPRESA (libro). DISTINTO de LadoBancario:
// un CREDITO bancario (entra plata) es un DEBITO contable en la cuenta de activo
// (§5.1). Confundirlos es "la pieza más fácil de invertir por error" del módulo,
// así que son DOS tipos, no uno reusado. Ambos son String en Prisma con los
// mismos literales, pero el tipo TS los mantiene separados en el dominio.
enum LadoContable        { DEBITO  CREDITO }   // perspectiva de la EMPRESA (línea de comprobante)

model CuentaBancaria {
  id             String   @id @default(uuid())
  organizationId String
  cuentaId       String              // Cuenta del plan que ELIGE el usuario
  alias          String
  // R-3 / REQ-CB-01 / CRITICAL-5: `perfilExtracto` es la ÚNICA fuente de verdad
  // del banco+formato. `banco` y `formato` los aporta el descriptor del adaptador
  // (read-only). Acá NO se persiste `banco` como columna: era la mitad de una
  // constraint de identidad (`@@unique([org, banco, numeroCuenta])`) y como texto
  // libre "BancoSol" vs "Banco Sol" no protegía nada. Si se quiere un alias de UI
  // editable, va en `alias`, que NO participa de ninguna unicidad.
  perfilExtracto PerfilExtracto      // enum — un perfil identifica el banco por construcción
  // NULLABLE (REQ-CB-16): se puede crear la cuenta sin el número y capturarlo en
  // la primera importación, con confirmación explícita del usuario — elimina el
  // error de transcripción manual. Mientras sea null NO se puede validar destino:
  // el importador advierte, no rechaza.
  numeroCuenta   String?
  moneda         Moneda              // validada vs cuenta.permiteMultiMoneda/monedaFuncional
  activa         Boolean  @default(true)
  createdAt      DateTime @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime @updatedAt      @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  cuenta       Cuenta       @relation(fields: [cuentaId],       references: [id], onDelete: Restrict)
  movimientos  MovimientoBancario[]
  importaciones ImportacionExtracto[]

  @@unique([organizationId, cuentaId])                  // 1 cuenta contable ↔ 1 cuenta bancaria
  // CRITICAL-5: identidad por `perfilExtracto` (no `banco`). El perfil ya fija el
  // banco por construcción, y es un enum → sin ambigüedad "BancoSol"/"Banco Sol".
  // Postgres permite múltiples NULL en un UNIQUE ⇒ varias cuentas del mismo perfil
  // coexisten sin número hasta que la primera importación lo capture. La unicidad
  // aplica en cuanto el número existe (evita dos CuentaBancaria apuntando al mismo extracto).
  @@unique([organizationId, perfilExtracto, numeroCuenta])
  @@index([organizationId, activa])
  @@map("cuentas_bancarias")
}

model MovimientoBancario {
  id               String   @id @default(uuid())
  organizationId   String
  cuentaBancariaId String
  importacionId    String                       // trazabilidad del origen

  fecha            DateTime @db.Date            // §4.6 — calendario puro
  hora             String?                      // 'HH:MM:SS'
  monto            Decimal  @db.Decimal(18, 2)  // SIEMPRE positivo
  tipo             LadoBancario
  moneda           Moneda
  descripcion            String
  descripcionNormalizada String
  referencia             String?
  saldo            Decimal? @db.Decimal(18, 2)
  contraparteNombre     String?
  contraparteDocumento  String?
  datosOriginales  Json                          // renglón crudo, celdas como STRING

  ordinalDia       Int
  hashDedup        String
  estado           EstadoMovimientoBancario @default(PENDIENTE)  // proyección cacheada (§2.3)

  createdAt        DateTime @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime @updatedAt      @db.Timestamptz(3)

  organization   Organization        @relation(fields: [organizationId],   references: [id], onDelete: Cascade)
  cuentaBancaria CuentaBancaria      @relation(fields: [cuentaBancariaId], references: [id], onDelete: Restrict)
  importacion    ImportacionExtracto @relation(fields: [importacionId],    references: [id], onDelete: Restrict)
  match          MatchConciliacion?

  @@unique([cuentaBancariaId, hashDedup])       // idempotencia ESTRUCTURAL (decisión 7)
  @@index([organizationId, cuentaBancariaId, fecha])
  @@index([cuentaBancariaId, estado, fecha])
  @@map("movimientos_bancarios")
}

model ImportacionExtracto {
  id               String   @id @default(uuid())
  organizationId   String
  cuentaBancariaId String
  nombreArchivo    String
  sha256Archivo    String                       // R-2: SIN storageKey, SIN binario en v1
  tamanioBytes     Int
  perfilExtracto   PerfilExtracto
  fechaDesde       DateTime @db.Date
  fechaHasta       DateTime @db.Date
  coberturaDeclarada Boolean                     // true ⇒ del encabezado; false ⇒ min/max de filas
  saldoInicial     Decimal? @db.Decimal(18, 2)
  saldoFinal       Decimal? @db.Decimal(18, 2)
  estadoVerificacion EstadoVerificacionExtracto
  diferencia       Decimal? @db.Decimal(18, 2)
  filasLeidas            Int
  movimientosNuevos      Int
  movimientosDuplicados  Int
  importadoPorUserId String
  createdAt        DateTime @default(now()) @db.Timestamptz(3)

  organization   Organization   @relation(fields: [organizationId],   references: [id], onDelete: Cascade)
  cuentaBancaria CuentaBancaria @relation(fields: [cuentaBancariaId], references: [id], onDelete: Restrict)
  movimientos    MovimientoBancario[]

  @@index([organizationId, cuentaBancariaId, createdAt])
  @@index([cuentaBancariaId, sha256Archivo])    // "este archivo ya lo subiste" gratis
  @@map("importaciones_extracto")
}

model MatchConciliacion {
  id                  String @id @default(uuid())
  organizationId      String
  movimientoBancarioId String

  // Ancla SIN FK — deliberado. Restrict bloquearía editar comprobantes (viola
  // decisión 3); Cascade borraría el match dejando el movimiento CONCILIADO
  // huérfano (viola decisión 4). La verificación contra el snapshot en CADA
  // lectura es el mecanismo único que cubre los 3 casos. Ver design §2.
  comprobanteId       String
  orden               Int

  snapshotCuentaId String
  snapshotMonto    Decimal      @db.Decimal(18, 2)
  snapshotTipo     LadoContable                       // lado CONTABLE de la línea (NO LadoBancario)
  snapshotMoneda   Moneda
  snapshotFecha    DateTime     @db.Date

  confianzaSugerida  String?                          // 'ALTA'|'MEDIA'|'BAJA'|null (manual)
  conciliadoPorUserId String
  createdAt          DateTime @default(now()) @db.Timestamptz(3)

  organization Organization       @relation(fields: [organizationId],       references: [id], onDelete: Cascade)
  movimiento   MovimientoBancario @relation(fields: [movimientoBancarioId], references: [id], onDelete: Cascade)

  @@unique([organizationId, movimientoBancarioId])    // v1: 1↔1 (§5.3)
  @@unique([organizationId, comprobanteId, orden])    // una línea se reclama una vez
  @@index([organizationId, comprobanteId])
  @@map("matches_conciliacion")
}
```

**Migración**: 4 tablas + 4 enums + `ALTER TABLE "packs" ADD COLUMN "otorgadoPorDefecto" BOOLEAN
NOT NULL DEFAULT false`. **Cero DROP, cero destructivo.** Protocolo §11.6 **obligatorio** sobre el
`migration.sql` generado: `grep -E "^DROP (INDEX|EXTENSION|TYPE)"` y borrar a mano cualquier drop de
los objetos raw SQL vivos (`pg_trgm`, índices trigram de `contactos`, uniques parciales,
`comprobantes_audit` + sus triggers, `comprobante_documento_fisico_unique_contabilizado`).

---

## 10. Flujos

### Importación

```
POST /api/cuentas-bancarias/:id/importaciones   (multipart)
  │
  ├─ guards      Auth → ModuleEnabled('contabilidad') → Permissions('…importar') → PackEnabled
  ├─ magic bytes file-type   ·  .xls legacy → 422 accionable
  ├─ sha256(buffer)          ·  ya existe para la cuenta → aviso, NO error (puede querer re-parsear)
  ├─ registry.para(cuenta.perfilExtracto)
  ├─ parser.reconoce(buffer) false → 422 CONCILIACION_ARCHIVO_PERFIL_NO_COINCIDE   (decisión 10)
  ├─ parser.parse(buffer)  ─────────────► ExtractoParseado   [INFRA]
  │
  │   ══ COMPUERTAS DE RECHAZO — todas ANTES de tocar la DB (REQ-CB-05) ══
  ├─ validarCuentaDestino(...)           [DOMINIO PURO — VO NumeroCuentaBancaria]
  │     exponeNumeroCuenta=false ó declarado=null → advertencia, SIGUE
  │     cuenta.numeroCuenta = null                → 200 con CONFIRMACIÓN pendiente,
  │                                                  NO importa, NO crea fila
  │     equals() = false                          → 422 CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE
  │                                                  (mensaje con LOS DOS números)
  │   ═══════════════════════════════════════════════════════════════════
  │
  ├─ ordenarCanonico(movimientos)        [DOMINIO PURO]
  ├─ asignarOrdinalDia(...)              [DOMINIO PURO]  ← por grupo de tupla
  ├─ calcularHashDedup(...)              [DOMINIO PURO]
  ├─ verificarChecksum(...)              [DOMINIO PURO]  → VERIFICADO|SIN_VERIFICAR|DESCUADRE
  │                                                        informativo, NUNCA rechaza
  └─ $transaction:  ImportacionExtracto.create
                    MovimientoBancario.createMany({ skipDuplicates: true })
                    nuevos = insertados · duplicados = leídos − insertados
```

**Orden de las compuertas (REQ-CB-05) — no es cosmético.** Un rechazo por perfil o por número de
cuenta es **fallo duro que ocurre antes de la lógica de idempotencia**: **no se crea fila de
`ImportacionExtracto`** y **nunca** se reporta como `0 nuevos, 0 ya existían`. Confundir "rechacé el
archivo" con "no había nada nuevo" es exactamente el modo de falla que R-5 viene a cerrar: el
usuario leería "0 nuevos" como "ya lo había importado" y seguiría de largo con el extracto
equivocado. Por eso el diagrama pone las compuertas **fuera** de la `$transaction`, no adentro con
un rollback: un rollback dejaría el mismo camino de código emitiendo el mismo DTO de resultado.

El caso `cuenta.numeroCuenta === null` **tampoco** importa en esa llamada: devuelve
`{ requiereConfirmacionCuenta: true, numeroDetectado }` con `200`. El cliente re-postea con
`confirmarNumeroCuenta: true`; recién ahí se persiste `CuentaBancaria.numeroCuenta` y se importa, en
la misma transacción. Dos viajes, cero adivinanzas — el usuario confirma antes de que exista un solo
movimiento.

### Workspace

```
GET /api/conciliacion?cuentaBancariaId&desde&hasta
  │
  ├─ A = movimientos de la cuenta en el rango           (repo propio)
  ├─ B = LineasCuentaReaderPort.listarPorCuentaEnRango  (leaf de comprobantes/)
  ├─ M = matches de A                                   (repo propio)
  │                        ── 3 queries, en paralelo ──
  │
  ├─ Map<`${comprobanteId}${orden}`, LineaCuentaRow> desde B          O(m)
  ├─ verificarAnclas(M, mapa)  [DOMINIO PURO] → válidos / rotos+motivo      O(k)
  ├─ (solo si hay huérfanas) listarPorAnclas(...)  ← 1 query acotada, diagnóstico
  │
  ├─ pendientes  = A donde estadoEfectivo === 'PENDIENTE'   (incluye los de vínculo roto)
  ├─ candidatas  = B menos las líneas con match VÁLIDO
  ├─ enTransito  = candidatas sin sugerencia confirmada     ← DERIVADO, no persistido
  └─ sugerir(pendientes, candidatas, 3)  [DOMINIO PURO]  → ranking ALTA/MEDIA/BAJA
```

---

## 11. Estrategia de testing (Strict TDD)

| Capa | Qué | Cómo | Meta |
|---|---|---|---|
| **Dominio puro** (`domain/*.spec.ts`) | `normalizarDescripcion`, `ordenarCanonico`, `asignarOrdinalDia`, `calcularHashDedup`, `ladoContableEsperado`, `sugerir`, `verificarAnclas`, `verificarChecksum` | Jest sin DB, sin NestJS. Fixtures como tuplas en memoria. **Se escribe ANTES del adaptador** (slice 2) | **≥95%** |
| **VO** | `FechaContable.sumarDias/restarDias/diferenciaEnDias`: cruce de mes, de año, bisiesto (28→29 feb 2028), negativos | Junto al VO en `common/domain/` | 100% |
| **Parsing boundary** | `leerMontoCelda` (BCP `4.6500000000000004`, Unión XLSX `'             12,600.00'` con padding y miles, `Bs.  16,000.00`, FIE `±`), `serialAExcelFechaHora` (`46224.6478587963` → `2026-07-22` + hora), meses en español, `20260701` | Unit, entradas **string** literales tomadas de los extractos reales | 100% de los casos de #953 |
| **VO `NumeroCuentaBancaria`** | **Test adversarial obligatorio**: los 3 números reales (`1191959-000-001/-002/-003`) comparados de a pares ⇒ `false` en los 6 pares cruzados, `true` solo consigo mismos. Equivalencias de normalización (`-`, espacios, NBSP, puntos). Que el tipo **no exponga** el normalizado (chequeo de superficie) | Unit puro. Es la regresión que impide que alguien "optimice" a un prefijo | 100% |
| **Validación de destino** | Perfil sin `exponeNumeroCuenta` ⇒ advierte y sigue; `numeroCuentaDeclarado = null` ⇒ advierte y sigue; cuenta sin número ⇒ pide confirmación y **no crea `ImportacionExtracto`**; número distinto ⇒ 422 con **los dos números** en el mensaje; número igual con distinto formateo ⇒ pasa | Unit (dominio) + e2e (los dos viajes de confirmación) | 100% |
| **Orden de compuertas (REQ-CB-05)** | Tras un rechazo por perfil o por cuenta: `count(ImportacionExtracto) === 0` y la respuesta **no** dice `0 nuevos / 0 existían` | Integration — es lo que distingue "rechacé" de "no había nada" | crítico |
| **`Money.igualaConTolerancia` (§8.0)** | Dentro de tolerancia → `true`; borde exacto `0.01` → `true`; fuera → `false`; simétrico `a.iguala(b) === b.iguala(a)`; **USD y BOB con el mismo `0.01`**; `4.6500000000000004` vs `4.65` → `true` | Unit puro junto al VO. `money.ts` es §4.5 cero-tolerancia | 100% |
| **Extracción + strip de número (§4.3)** | **Económico**: `numeroCuentaDeclarado === '2031262031'` desde el crudo `'CA: 2031262031 (Bs)'` (strip prefijo `CA:` + sufijo `(Bs)`); si el crudo NO trae `CA:` ⇒ `CONCILIACION_ARCHIVO_FORMATO_NO_RECONOCIDO`, no strip silencioso. **BancoSol/Unión**: valor limpio, solo separadores del VO | Unit contra `Buffer`. Caza el bug que rompía el 100% de las importaciones de Económico | 100% |
| **`descripcion` — renglón dorado (§4.5)** | Por dialecto, sobre una fila real conocida, `descripcion` es exactamente el string esperado (BancoSol/Económico = `Transacción` + `' '` + `Nota`; Unión = `Descripción`). Fija la columna fuente que el fixture de dedup no discrimina | Unit contra `Buffer` | por dialecto |
| **Adaptadores parser** | Fixture real **anonimizado preservando la forma** por perfil: nº de movimientos, primer/último movimiento, checksum. **`estrategiaChecksum` correcta por perfil** (BancoSol `DERIVADO`, Económico `DECLARADO`, Unión `DERIVADO`) | Unit contra `Buffer` de fixture. Sin DB | por perfil |
| **Unión XLSX (§4.3.1)** | `numeroCuentaDeclarado === '10000024346492'` desde `Cuenta:` **B8**; **21 movimientos** 02/04–13/07; checksum **`DERIVADO`** (inicial = `saldo₁ − monto₁`) + verificación adicional cruzada con los 3 totales declarados (`Total Créditos 12.618,94` fila 39, `Total Débitos 3.852,97` fila 41, `Total 11.909,40` fila 45); montos `'             12,600.00'` → `12600.00` CREDITO y `'-900.00'` → `900.00` DEBITO; **etiqueta `'Monto\n'` con salto de línea matchea tras normalizar** | Unit contra `Buffer` del fixture real anonimizado | 100% |
| **Anti-reuso de mapeo** | El `DialectoXlsx` de Unión NO comparte índices con BancoSol/Económico: parsear el fixture de Unión con el dialecto de BancoSol debe **fallar** (etiquetas ausentes), no devolver datos corridos | Unit — es la red que protege el §4.3.1 | — |
| **Idempotencia** | Mismo archivo 2 veces ⇒ 0 nuevos. ASC vs DESC ⇒ hashes idénticos. **Solape real** (R-1: 2 exports reales solapados de BancoSol/Económico) ⇒ unión exacta | Integration contra Postgres real: el `@@unique` es parte de lo que se prueba | — |
| **Integration adapters** | `PrismaLineasCuentaReaderAdapter` (aislamiento por tenant, exclusión de BORRADOR/anulado, orden determinístico); repos del módulo | Postgres real (§7.2 core), TX por test | — |
| **Ancla / auto-curado** | Editar el CONJUNTO de líneas de un comprobante conciliado (C-1) ⇒ `estadoEfectivo` vuelve a `PENDIENTE` con motivo, **sin escrituras** en la lectura; anular ⇒ `COMPROBANTE_ANULADO`; mover `fechaContable` ⇒ `FECHA_CAMBIADA`; crear match sobre ancla ocupada por un match ROTO ⇒ éxito; sobre uno SANO ⇒ 409 | Integration | crítico |
| **Packs** | Org nueva CONTABILIDAD nace con el pack **habilitado y activo** en la misma TX; rollback de la TX no deja entitlement; org GRANJA no lo recibe; org OTROS tampoco; re-provisión idempotente | Integration + e2e | — |
| **E2E** | Flujo completo: crear cuenta bancaria → importar → sugerencias → confirmar → deshacer. Fail-closed: sin permiso ⇒ 403; sin pack ⇒ **404** | Supertest + AppModule, `--runInBand --forceExit` | — |
| **Arquitectura** | `require-pack-tenant-guard.arch.spec.ts` ya existente cubre los controllers nuevos. Sumar: el registry de parsers cubre todos los valores del enum (falla en bootstrap) | — | — |

---

## 12. Cambios de archivos (resumen)

| Archivo | Acción | Qué |
|---|---|---|
| `backend/prisma/schema.prisma` | Modificar | 4 modelos + 4 enums + `Pack.otorgadoPorDefecto` + relación en `Cuenta`/`Organization` |
| `backend/prisma/migrations/<ts>_conciliacion_bancaria/migration.sql` | Crear | Aditiva. **§11.6 obligatorio** |
| `backend/prisma/seeds/packs-catalogo.ts` | Modificar | `contabilidad.conciliacion` + backfill de orgs existentes (owner desde membership — C-3) |
| `backend/src/comprobantes/ports/lineas-cuenta-reader.port.ts` | Crear | Port (§3) |
| `backend/src/comprobantes/adapters/prisma-lineas-cuenta-reader.adapter.ts` | Crear | Query builder, no raw |
| `backend/src/comprobantes/lineas-cuenta-reader.module.ts` | Crear | Leaf, molde `periodos-reader.module.ts` |
| `backend/src/conciliacion-bancaria/**` | Crear | Módulo completo (dominio · ports · adapters · dto · services · controllers) |
| `backend/src/conciliacion-bancaria/domain/numero-cuenta-bancaria.ts` | Crear | VO de comparación EXACTA (§4.4). Sin getter del normalizado — el tipo impide el `startsWith` |
| `backend/src/common/domain/fecha-contable.ts` | Modificar | `sumarDias` · `restarDias` · `diferenciaEnDias` (+ test) |
| `backend/src/common/domain/money.ts` | **Modificar** | **`igualaConTolerancia(other, tol?)`** currency-neutral (§8.0, CRITICAL-3) + su spec. NO se toca `balanceadoEnBobCon`/`TOLERANCIA_BOB` |
| `backend/src/common/permisos/catalogo.ts` | Modificar | Grupo `contabilidad.conciliacion.{read,create,update,delete,importar,conciliar}` + actualizar el comentario obsoleto de `:6` |
| `backend/src/packs/pack.service.ts` | Modificar | `otorgarPacksPorDefecto`, **`invalidarCacheDeOrg(orgId)` público** (hoy solo `private cacheKey()` + `redis.del` inline — el design lo invoca en §7, hay que crearlo) |
| `backend/src/packs/{ports/*, adapters/*}` | Modificar | `listarOtorgadosPorDefecto(vertical)`, `habilitar(..., opts?: {activo?, tx?})` |
| `backend/src/tenants/tenants.service.ts` · `platform/platform-admin.service.ts` | Modificar | Otorgamiento en la TX + invalidación post-commit |
| `backend/package.json` | Modificar | `read-excel-file` **versión exacta** `9.3.4` |
| `frontend/src/features/conciliacion/**` · `features/cuentas-bancarias/**` | Crear | Molde `features/libro-mayor/` (16 archivos leídos) |
| `frontend/src/components/nav-items.ts` | Modificar | Primer `NAV_ITEM` con `pack` (`nav-items.ts:56` — campo ya existe, riel ya cableado) |
| `.gitignore` | Modificar | `docs/extractosBancos/` — **slice 0, riesgo de seguridad vivo** |
| `backend/openapi.json` · `frontend/src/types/api.generated.ts` | Regenerar | CI `contract-drift` |

`common/permisos/catalogo-asignable.ts` **NO se toca**: la convención "clave del pack = prefijo
`modulo.submodulo`" ya filtra (`:70`). `STORAGE_PORT` **NO se extrae** (R-2).

---

## 13. Riesgos

| # | Riesgo | Prob. | Mitigación |
|---|---|---|---|
| R1 | **C-1**: specs o tests que asuman que `orden` es estable ⇒ falsa confianza en el ancla | **Certeza** si no se corrige | El design lo corrige con evidencia. `sdd-spec` debe escribir el requisito como "el snapshot es el mecanismo, el ancla sola no basta" |
| R2 | `docs/extractosBancos/` sin `.gitignore` (`git ls-files` = 0, `git status` = `??`) — un `git add docs/` commitea nº de cuenta y montos reales | **Alta** | Slice 0, primera tarea. Fixtures anonimizados **preservando la forma** |
| R3 | R-1 (2 exports reales solapados) todavía no está en el repo ⇒ el test de dedup con datos reales no es ejecutable | Media | **No bloquea el slice 2**: el dominio se prueba con tuplas sintéticas. Bloquea solo la aceptación de los slices 3/4 |
| R4 | `read-excel-file` `parseNumber` podría no interceptar celdas tipadas; **y las 3 serializaciones XLSX de v1 NO son iguales** (verificado): Económico envuelve **todos** los elementos en el prefijo de namespace `x:` (`<x:worksheet>`, `<x:row>`, `<x:c>`, `<x:v>`); BancoSol/Unión no. Un lector SAX que matchee `row`/`c`/`v` sin contemplar el namespace devuelve **cero filas** para Económico. (Además la variabilidad `sharedStrings` vs inline strings existe, aunque en v1 los 3 usan `sharedStrings`.) | Media | El **primer test del slice 3 corre contra los TRES fixtures de v1** (BancoSol, Económico con prefijo `x:`, Unión): (a) `parseNumber` recibe todas las celdas como string; (b) **Económico devuelve sus 21 filas, no cero** — ese es el que caza el bug de namespace. `read-excel-file` es un lector OOXML completo (debería resolver namespaces), pero se verifica, no se asume. Versión exacta pineada |
| R5 | `PerfilExtracto` como enum Prisma ⇒ agregar banco = migración | Baja | Aceptado (decisión 9: los adaptadores son código, ya exigen deploy). El chequeo de bootstrap del registry impide enum sin adapter |
| R10 | **Alguien implementa la comparación de cuenta con `startsWith`/`includes`/prefijo** ⇒ las 3 cuentas del usuario pasan todas ⇒ validación inservible **y peor que no tenerla**, porque da confianza falsa | **Alta si se deja al criterio del implementador** | El VO `NumeroCuentaBancaria` **no expone** el normalizado ni ningún método parcial: solo `equals`. El bug no compila. Reforzado con el test adversarial de los 6 pares cruzados (§11) |
| ~~R11~~ | ~~`UNION_TXT` no está verificado~~ | — | **CERRADO** con evidencia: el token `BUNCA10000024346492` está en las 12 filas, cols 19–37, valor único (`cut -c19-37 \| uniq -c`). `exponeNumeroCuenta: true`. **7/7 formatos** validan destino (§4.3.1) |
| ~~R13~~ | ~~El adaptador de Unión devuelve el token con prefijo `BUNCA`~~ | — | **NO APLICA en v1**: `UNION_XLSX` trae el número limpio en la cabecera. El riesgo vuelve solo si se construye `UNION_TXT` (§4.3.2) |
| R14 | **v1 queda con tres adaptadores XLSX y ningún formato no-Excel** ⇒ se pierde la validación temprana de que `ExtractoParserPort` aguanta un formato estructuralmente distinto. El puerto podría estar sobre-ajustado a hojas de cálculo sin que nadie lo note hasta el primer TXT/MT940 | Media | **Costo aceptado conscientemente**: entregar peor calidad de dato (centavos implícitos, cero checksum, sin totales declarados) sólo para ejercitar la abstracción está al revés. Mitigación de diseño, no de test: `parse(buffer: Buffer)` recibe bytes crudos y devuelve el modelo canónico — nada en la firma ni en `ExtractoParseado` presupone celdas. La validación real llega con `UNION_TXT` o MT940 |
| R12 | Un rechazo de perfil/cuenta que igual crea `ImportacionExtracto` y reporta `0 nuevos` ⇒ el usuario lo lee como "ya lo importé" y sigue con el extracto equivocado | Media | Compuertas **fuera** de la `$transaction` (§10) + test de integración que verifica `count === 0` tras el rechazo |
| R6 | 1↔1 duro deja sin conciliar depósitos partidos en 2 líneas | Media | Salida documentada (`IGNORADO` + nota / ajustar asiento). Camino de evolución en §5.3 |
| R7 | Cobertura intra-día rompería `ordinalDia` | Baja | No alcanzable con las UIs de export observadas (filtro por día). Mitigación futura documentada (§6.3) |
| R8 | Importar un rango grande (BMSC: 193 movs) en una TX | Baja | `createMany` con `skipDuplicates` es una sola sentencia. Tope defensivo de filas por archivo, error accionable |
| R9 | **C-4**: `domain/` arrastra Prisma vía `Money` | Baja | Deuda preexistente compartida con `reportes/` y `cierre-ejercicio/`. Se sigue el patrón del repo; no abre conexiones |

---

## 14. Preguntas abiertas

- [ ] Ninguna que bloquee la implementación. Las 3 que quedaban (R-1/R-2/R-3) están resueltas y
      aplicadas en este design; C-2 se resuelve eliminando MinIO de v1 por coherencia con R-2.
- [ ] **Confirmación operativa, no de diseño**: los 2 exports reales solapados de R-1 tienen que
      existir en el repo (anonimizados) antes de cerrar el slice 3.
- [x] ~~`UNION_TXT.exponeNumeroCuenta` se decide con evidencia~~ → **CERRADO**: `true`. El token
      `BUNCA10000024346492` está en las 12 filas de datos, cols 19–37, valor único. Los **7 de 7**
      formatos validan destino. Ver §4.3.1.
- [x] ~~Aviso: Unión también publica el extracto en Excel~~ → **CERRADO con datos medidos**:
      `UNION_XLSX` (hoja `ExtractoMovimientosFechas`) **reemplaza a `UNION_TXT` en v1**. Trae número
      de cuenta limpio en cabecera, decimales explícitos, orden ascendente y **checksum `DERIVADO`**
      (inicial = `saldo₁ − monto₁`; los tres totales declarados son verificación adicional del
      adaptador, no la estrategia — §4.3.1, CRITICAL-1). El export "extendido"
      (`ExtractoMovimientosUltimosExt`) está descartado: tope de 12 movimientos, sin saldo,
      contraparte declarada y vacía. Ver §4.3.1.
