# Granja — Diseño de dominio (vertical de engorde)

> **Estado: v1 IMPLEMENTADO** (act. 2026-06-01) — Documento fundacional del vertical
> **Granja**. El **v1 (núcleo) está construido y mergeado**: `backend/src/granja/`
> (hexagonal), `frontend/src/features/granja/` (mobile-first), las 4 tablas + 2 enums
> en schema y el seed de `TipoRegistro`. Este doc describe el modelo y la dirección;
> la **fuente de verdad de implementación es el código y `schema.prisma`**. v1.5+ sigue
> pendiente (§8). El pulido de UI "personas mayores" (PRs #109–#111) está registrado en §2.1.
>
> Presupone el `CLAUDE.md` raíz (hexagonal §3, multi-tenant §4.2, dinero §4.5,
> fechas §4.6, errores §6, testing §7), `docs/disenos/plataforma-multi-vertical.md`
> (Granja como vertical, §6.2) y `docs/adr/0001-agente-ia.md` (el asistente IA de
> granja, diferido a v2). Si algo acá contradice un invariante del core → va al
> core primero, acá después (regla anti-drift §12 core).
>
> **Fuente de verdad de implementación**: el código y `schema.prisma`. Este doc
> describe el modelo y la dirección; cuando el código diverja, se reconcilia acá.

---

## 1. Qué es Granja y qué resuelve

Granja es el segundo vertical de Avicont (el primero es Contabilidad). Es un
**operativo avícola simple**, pensado para que un socio de una asociación de
avicultores lo use **desde el celular, en el gallinero**. NO es contabilidad: no
tiene partida doble, no genera asientos, no toca el plan de cuentas. Es control
operativo puro.

**El vertical de arranque es ENGORDE (pollos parrilleros).** Ponedoras (gallinas
de postura) es un vertical/slice futuro con su propio dominio — **fuera de scope**
de este doc (ver §9).

### 1.1 El norte: "costo por pollo vivo, en tiempo real"

El feature estrella —y la razón de ser del módulo— es responder, en cualquier
momento de la crianza, **cuánto le cuesta al granjero cada pollo que sigue vivo**:

```
costo por pollo vivo  =        Σ(todo lo invertido en el lote)
                         ───────────────────────────────────────────
                         cantidad inicial − Σ(aves que salieron: muertes)
```

El valor del módulo está en cómo se comporta esta fórmula conforme avanza la
crianza: cuando mueren pollos, **el numerador (la plata gastada) no baja, pero el
denominador sí** → el costo de cada sobreviviente **sube**. El granjero ve en vivo
cómo la mortalidad le encarece cada pollo, y cuando se acerca el día de la saca
decide su precio de venta con ese número en la mano ("me cuesta Bs 15, lo vendo a
Bs 20"). Esa decisión de precio queda **fuera del sistema** en el v1 (ver §8).

---

## 2. Glosario avícola

Términos del dominio (en **español**, por §1 del core). Canónico para naming de
entidades, campos y UI.

| Término | Significado |
|---------|-------------|
| **Lote** | Camada de pollos que entra junta (misma fecha, mismo galpón) y se maneja como unidad. Es la **raíz** del modelo (§4). |
| **Galpón** | La instalación física donde se cría el lote. Puede ser propia o alquilada. En el v1 es un **campo de texto** del lote, no una entidad (§5.1). |
| **Pollito BB** | Pollo bebé de 1 día; así entran al lote (la `cantidadInicial`). |
| **Saca** | El día en que se vende/retira el lote terminado (~42-49 días en engorde). |
| **Mortalidad** | Aves que mueren durante la crianza. Único movimiento de cantidad del v1 (§5.4). |
| **Balanceado / Alimento** | El alimento de los pollos. Es el costo más grande de un engorde. |
| **Chala** | Cama del galpón, base de cáscara/hojas de arroz sobre la que se crían los pollos. |
| **Engorde / Parrillero** | Pollo criado para carne (a diferencia de ponedora, que es para huevo). |

### 2.1 Vocabulario user-facing en la UI (v1)

El dominio mantiene su naming (§4): `MovimientoInversion`, `MovimientoCantidad`,
`TipoRegistro`, enum `NaturalezaRegistro = INVERSION | CANTIDAD`. Pero la UI del v1
—pensada para el granjero mayor que opera desde el celular— usa **sinónimos
user-facing** más cercanos, igual que "asiento" es el sinónimo de `Comprobante` en
contabilidad (CLAUDE.md raíz §1):

| Código / schema | UI (lo que ve el granjero) |
|-----------------|----------------------------|
| `MovimientoInversion` / `NaturalezaRegistro.INVERSION` | **Gasto** |
| `MovimientoCantidad` / `NaturalezaRegistro.CANTIDAD` | **Mortalidad** |
| `cantidad` (aves que salen) | **aves** |
| `Lote` sin `nombre` | "Lote sin nombre" |

**Regla**: en código, schema y tests → nombres del dominio; en UI, botones y textos
al usuario → los sinónimos de arriba. La categoría `CANTIDAD` admite otros tipos
además de mortalidad (ej. descarte, §6); si el descarte se vuelve común, el rótulo
"Mortalidad" se reevalúa (es vocabulario user-facing, no el enum).

**Otras decisiones de UI v1** (pulido "personas mayores", PRs #109–#111):
- Las fechas de lote / gasto / mortalidad arrancan en **"hoy"** (La Paz) —
  `features/granja/lib/hoy-en-la-paz.ts`.
- Toda acción destructiva (cerrar lote, eliminar gasto/mortalidad/tipo) **confirma**
  con un `AlertDialog` corto antes de mutar.
- El detalle del lote **NO usa pestañas**: dos botones directos ("Registrar gasto" /
  "Registrar mortalidad") + secciones apiladas siempre visibles.
- **Editar un movimiento NO existe** (solo crear + borrar, §7). Para corregir, se
  borra y se vuelve a cargar. (Decisión revisable si aparece la necesidad.)

---

## 3. Relación con la plataforma (no reinventar)

Granja se apoya en la base de plataforma ya construida; **no la duplica**:

| Pieza de plataforma | Estado | Granja la usa así |
|---------------------|--------|-------------------|
| `Organization` (tenant) + multi-tenancy flat (§4.2) | ✅ existe | Todo lote/registro lleva `organizationId`; toda query filtra por él. |
| Flag de módulo `granjaEnabled` | ✅ existe (`schema.prisma`) | Activa/desactiva el vertical para la org. |
| Vertical **exclusivo** por org (CHECK + guard, §10.4 plataforma) | ✅ existe (#94) | Una org es de Contabilidad **o** de Granja, nunca las dos. |
| `@RequireModule('granja')` + `ModuleEnabledGuard` | ✅ existe (genérico) | Cada endpoint de granja se decora con `@RequireModule('granja')`. |
| Permisos `granja.*` en el catálogo | ✅ existe (`common/permisos/catalogo.ts`) | RBAC por endpoint (§7). |
| `Money` y `FechaContable` (VOs de `common/domain/`) | ✅ existen | Son **primitivos de plataforma**, no de contabilidad → granja los reutiliza para dinero y fechas-calendario. |
| `ClockPort` (§4.6) | ✅ existe | Para "hoy" (edad del lote, fechas default). Nada de `new Date()` en services/domain. |

> **Lo que Granja NO comparte con Contabilidad**: el dominio (sus tablas, su
> lógica), la navegación/shell, los reportes. Son mundos separados (plataforma
> §6.2/§6.3). El único puente es la base de plataforma de la tabla de arriba.

---

## 4. El modelo de dominio

### 4.1 El `Lote` es la raíz (aggregate root)

**Todo cuelga del lote y todo se calcula POR lote.** Una org puede tener **varios
lotes activos en paralelo**, cada uno independiente:

```
Organization "Avícola X"
 ├── Lote A   galpón "El Alto"      ingresó 01/06   5000 pollos   [ACTIVO]
 │     ├── MovimientoInversion[]   (alimento, vacunas, alquiler galpón, …)
 │     └── MovimientoCantidad[]    (mortalidad…)
 │
 ├── Lote B   galpón "Santa Rosa"   ingresó 08/06   3000 pollos   [ACTIVO]
 │     ├── MovimientoInversion[]   (sus propios costos)
 │     └── MovimientoCantidad[]    (su propia mortalidad)
 │
 └── Lote C   galpón "El Alto"      ingresó 15/03   4000 pollos   [CERRADO]
```

**Invariante de raíz**: el costo por pollo vivo **nunca se agrega a nivel
organización**. Sumar un lote de 10 días con uno de 40 días daría un número sin
sentido. La pregunta "¿cuánto me cuesta el pollo?" SIEMPRE es relativa a un lote.

### 4.2 Las cuatro entidades

```
Lote 1──< MovimientoInversion   >──1 TipoRegistro (naturaleza = INVERSION)
  │
  └───< MovimientoCantidad      >──1 TipoRegistro (naturaleza = CANTIDAD)
```

#### `Lote` — la unidad de crianza

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | |
| `organizationId` | String | Multi-tenant (§4.2). NOT NULL, toda query filtra. |
| `nombre` | String? | Etiqueta humana opcional ("Lote junio El Alto"). |
| `galpon` | String? | Texto libre, sin unicidad (§5.1). |
| `fechaIngreso` | `FechaContable` | Cuándo entraron los pollitos BB. |
| `cantidadInicial` | Int | Pollitos BB que ingresaron. > 0. **Inmutable tras crear** (es el denominador base). |
| `estado` | `EstadoLote` | `ACTIVO` → `CERRADO`. |
| `fechaEstimadaSaca` | `FechaContable?` | Opcional, para el contador "se acerca la saca". |
| `fechaCierre` | `FechaContable?` | Se setea al cerrar. |
| `detalle` | String? | Observaciones libres (ej. de dónde compró los pollitos). |
| `createdAt` / `updatedAt` | `timestamptz` (UTC) | Auditoría técnica (§4.6). |

**Derivados — NO se almacenan, se calculan en lectura** (como los saldos en
contabilidad; evita drift):

- `edadDias` = `ClockPort.hoyEnLaPaz()` − `fechaIngreso`.
- `avesVivas` = `cantidadInicial` − Σ(`MovimientoCantidad.cantidad`).
- `costoAcumulado` = Σ(`MovimientoInversion.monto`) (`Money`).
- `costoPorPolloVivo` = `avesVivas > 0 ? costoAcumulado / avesVivas : null` (mostrar "—" si no hay aves vivas).
- `porcentajeMortalidad` = Σ(muertes) / `cantidadInicial`.

#### `TipoRegistro` — clasificación configurable

La pieza flexible: **viene con tipos de fábrica (seed) y el granjero agrega los
suyos** (§6).

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | |
| `organizationId` | String | Multi-tenant. Los de seed se crean por org al activar granja. |
| `nombre` | String | Único por `(organizationId, nombre)`. |
| `naturaleza` | `NaturalezaRegistro` | `INVERSION` \| `CANTIDAD`. Declara a qué tabla de movimiento pertenece. |
| `esSistema` | Boolean | `true` = sembrado por el sistema, no se elimina. `false` = creado por el usuario. |
| `activo` | Boolean | Soft-disable (default `true`). No se borra si tiene movimientos. |
| `createdAt` / `updatedAt` | `timestamptz` (UTC) | |

#### `MovimientoInversion` — plata que entra al lote

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | |
| `organizationId` | String | Multi-tenant. |
| `loteId` | uuid | FK al lote. |
| `tipoRegistroId` | uuid | FK; debe ser un `TipoRegistro` con `naturaleza = INVERSION`. |
| `fecha` | `FechaContable` | **Puede ser anterior a `fechaIngreso`** (gastos previos: yutes, pintura). |
| `monto` | `Money` (`Decimal(18,2)`) | Obligatorio, > 0. **Nunca `number`** (§4.5). |
| `detalle` | String? | Texto libre — la válvula que mantiene chico el catálogo (§5.3). |
| `createdAt` / `updatedAt` | `timestamptz` (UTC) | |

#### `MovimientoCantidad` — aves que salen del lote

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | |
| `organizationId` | String | Multi-tenant. |
| `loteId` | uuid | FK al lote. |
| `tipoRegistroId` | uuid | FK; debe ser un `TipoRegistro` con `naturaleza = CANTIDAD`. |
| `fecha` | `FechaContable` | |
| `cantidad` | Int | Obligatorio, > 0. Representa aves que **salen** (resta) — ver §5.4. |
| `detalle` | String? | Texto libre (ej. "muerte por moquillo"). |
| `createdAt` / `updatedAt` | `timestamptz` (UTC) | |

### 4.3 Enums de dominio (español, §1)

```
EstadoLote          = ACTIVO | CERRADO
NaturalezaRegistro  = INVERSION | CANTIDAD
```

---

## 5. Decisiones de diseño (cerradas en esta sesión)

### 5.1 Galpón = campo de texto, no entidad
Elegido sobre "Galpón como entidad". Razón: a veces se alquila el galpón solo para
una crianza y se deja de pagar; los granjeros con galpón propio no usan el dato; y
los costos de alquiler/mantenimiento son **incurridos por lote**, no por galpón.
Sin entidad, sin unicidad: dos lotes (en momentos distintos) pueden reusar el mismo
nombre de galpón. **Reabrible a v2** si surge demanda de analítica por galpón.

### 5.2 Dos tablas de movimiento (no una unificada)
`MovimientoInversion` (lleva `monto`) y `MovimientoCantidad` (lleva `cantidad`) son
tablas separadas. Razón: invariantes limpios y self-validating (en Inversión el
`monto` es obligatorio; en Cantidad la `cantidad` es obligatoria), sin columnas
nulleables ambiguas. El `TipoRegistro.naturaleza` enruta cada tipo a su tabla. La
compra inicial de pollitos es la `cantidadInicial` del Lote + un `MovimientoInversion`
"Compra de pollitos" — no necesita ser una fila que mezcle ambos ejes.

### 5.3 Campo `detalle` en ambos movimientos (la válvula de presión)
Texto libre opcional. Permite que un tipo amplio como "Mantenimiento Galpón"
englobe muchas cosas (yutes, cables, pintura) sin crear un `TipoRegistro` por cada
una. Mantiene el catálogo chico y estable, y captura la riqueza en el detalle.

### 5.4 Un solo ingreso por lote → cantidad solo resta
En engorde el lote tiene **un único ingreso** de pollitos (no hay reposición a
mitad de crianza). Por eso `cantidadInicial` vive en el `Lote` y todos los
`MovimientoCantidad` son **restas** (mortalidad/descarte). Invariante:
`avesVivas ≥ 0` — no se registra una salida que deje el lote en negativo.

### 5.5 Cálculo de costo en lectura, nunca almacenado
`costoAcumulado`, `avesVivas` y `costoPorPolloVivo` se computan al leer (en el
service, con `Money`), nunca se persisten. Espejo del patrón de saldos de
contabilidad: evita drift entre el dato derivado y los movimientos reales.

### 5.6 Lote `CERRADO` es de solo lectura (v1)
Al cerrar un lote no se le agregan ni editan movimientos. La reapertura de lotes
se difiere (v2) — si surge la necesidad de corregir un lote cerrado.

---

## 6. Seed de `TipoRegistro` (de fábrica al activar granja)

Cuando una org activa el vertical granja, se siembran estos tipos (`esSistema = true`).
Nombres reales del avicultor boliviano de engorde:

**Naturaleza `INVERSION`:**
- Compra de pollitos
- Alimento
- Alquiler Galpón
- Mantenimiento Galpón
- Vacunas
- Veterinario
- Mano de Obra
- Chala
- Garrafas (gas)
- Agua y Luz
- Otros gastos

**Naturaleza `CANTIDAD`:**
- Mortalidad

El granjero puede agregar los suyos (ej. "Descarte" de cantidad, "Fletes" de
inversión) desde la UI.

---

## 7. Superficie de API y RBAC

URLs en **español** (§1). Todos los endpoints bajo `@RequireModule('granja')` +
`@RequirePermissions(...)`. Permisos **ya catalogados** en
`common/permisos/catalogo.ts`:

| Recurso | Endpoint (propuesto) | Permiso |
|---------|----------------------|---------|
| Dashboard (lotes activos + costo/pollo) | `GET /api/granja/dashboard` | `granja.dashboard.read` |
| Lotes | `POST/GET/GET:id/PATCH /api/lotes` · `POST /api/lotes/:id/cerrar` | `granja.lotes.{create,read,update,delete}` |
| Tipos de registro | `GET/POST/PATCH/DELETE /api/granja/tipos-registro` | `granja.tipos-registro.{...}` |
| Movimientos | `POST/GET/DELETE /api/lotes/:id/movimientos/{inversion,cantidad}` | `granja.movimientos.{...}` |
| Asistente IA (v2) | `POST /api/granja/chat` | `granja.chat.interact` |

Errores con la jerarquía `DomainError` (§6.2) y códigos `GRANJA_{SUBDOMINIO}_{CONDICION}`
(ej. `GRANJA_LOTE_NO_ENCONTRADO`, `GRANJA_MOVIMIENTO_CANTIDAD_EXCEDE_VIVAS`,
`GRANJA_TIPO_REGISTRO_NATURALEZA_INVALIDA`).

---

## 8. Faseo de construcción

La columna vertebral primero; lo demás se enchufa sin rediseñar.

### v1 — el núcleo (entrega valor solo)
- `backend/src/granja/` hexagonal estricto (§3.2): `domain/`, `ports/`, `adapters/`, services, controller, module.
- Migración Prisma: las 4 tablas + 2 enums + seed de `TipoRegistro` al activar granja.
- CRUD de `Lote` (crear, listar, ver, editar, **cerrar**).
- CRUD de `TipoRegistro` (con seed + propios + `detalle`).
- Registro de `MovimientoInversion` y `MovimientoCantidad`.
- **El cálculo costo/pollo vivo** (la joya).
- **Informe/vista del lote activo**: desglose de costos por tipo, % mortalidad, edad en días, aves vivas, costo por pollo.
- **Dashboard**: lista de lotes activos lado a lado con su costo/pollo y mortalidad.
- Frontend `features/granja/` **mobile-first estricto** (`frontend/CLAUDE.md` — el granjero opera en el gallinero con el celular).
- Tests de aislamiento multi-tenant (§4.2) + cobertura del dominio (§7 core).

### v1.5 — cierra el ciclo (barato, no toca el modelo del core)
- **Calculadora de utilidad de referencia** (*what-if*, NO persiste): "costo Bs 15 × 9850 pollos vivos vs precio Bs 20 → utilidad estimada Bs X". Pura aritmética sobre lo ya calculado.
- **Cierre de lote capturando el precio de venta final** → snapshot histórico del lote (costo/pollo final, mortalidad final, precio) para análisis futuro.

> Para no cerrar la puerta: el modelo del v1 deja el **riel puesto** para la venta
> y el precio de cierre (campos aditivos al `Lote` y/o un futuro `MovimientoVenta`),
> sin migración dolorosa.

### v2+ — cuando haya uso y datos reales
- Registro de **ventas reales** (parciales + utilidad real persistida).
- **El asistente IA / chat de granja** — el diferenciador. Releer **ADR-0001 ANTES** de empezar su SDD (el agente entra como adapter, persiste directo en granja porque no hay implicancia contable, actor dual `userId`+`agentSessionId`, aislamiento multi-tenant por JWT).
- Comparativa entre lotes (histórico).
- **Ponedoras** como vertical/slice aparte (otro dominio: postura diaria, % de postura, ciclo de ~18 meses).
- `Galpón` como entidad (analítica por galpón), si hay demanda.

---

## 9. Lo que NO hace Granja (scope explícito)

| Fuera de scope | Por qué |
|----------------|---------|
| Partida doble, asientos, plan de cuentas | Granja es operativo, no contable. No comparte dominio con Contabilidad (plataforma §6.2). |
| Registro de ventas / ingresos / utilidad real (v1) | El v1 entrega el costo; el precio de venta lo decide el granjero afuera. Ventas reales → v2. |
| **Ponedoras** (gallinas de postura) | Otro dominio (huevos, postura diaria, ciclo largo). Vertical/slice futuro. |
| `Galpón` como entidad | Campo de texto alcanza para el v1 (§5.1). |
| Asistente IA / chat | Diferido a v2; gobernado por ADR-0001. |
| Inventario/consumo de alimento, conversión alimenticia (FCR) | Se registra el **costo** del alimento, no su inventario ni la métrica zootécnica. Posible v2+. |

---

**Fin del documento.** Próxima sesión: arrancar el **v1** — `/sdd-explore granja-v1`
o directo al SDD del primer slice (modelo + migración + Lote). Para el slice de IA
(v2), releer ADR-0001 antes de planificar.
