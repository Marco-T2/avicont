# Riel de packs (eje 2) — Referencia del riel construido

> **Estado: CONSTRUIDO** (2026-06-02, change `packs-riel`, PRs #150–#157, main
> `86105e8`) — El RIEL completo del eje 2 está implementado. Este documento pasó de
> plano de diseño a referencia de lo construido. **Ningún pack concreto fue
> construido en esta fase**: el catálogo contiene claves placeholder
> (`contabilidad.adjuntos`, `contabilidad.rag`, `granja.rag`). La siguiente fase
> consiste en enchufar el PRIMER PACK CONCRETO (Marco decide cuál): ver §9 para la
> guía de "cómo enchufar un pack".
>
> **Spec viva**: `openspec/specs/packs-riel/spec.md` (reconciliada contra el código).
>
> Este doc **presupone** el `CLAUDE.md` raíz (multi-tenancy flat §4.2, defense in
> depth §4.8, seguridad §5/§10.4), `docs/claude/seguridad.md`,
> `docs/disenos/plataforma-multi-vertical.md` (tres ejes §2, entitlement vs
> activación §5, packs §7, NavItem §8) y `docs/disenos/super-admin-plataforma.md`
> (alcance de plataforma, `isSuperAdmin`). Si algo acá contradice un invariante del
> core → va al core primero, acá después (regla anti-drift §12 core).
>
> **Fuente de verdad de implementación**: el código y `schema.prisma`.
> Las referencias de archivos reflejan el estado al 2026-06-02.

---

## 1. Propósito y tesis

### 1.1 El problema

El vertical **Contabilidad** es el core básico, **FREE**, usable solo. Pero no todas
las empresas necesitan lo mismo: unas quieren adjuntar PDFs de respaldo a sus
comprobantes, otras un agente que responda sobre sus normas, otras un sub-dominio de
Ventas/Compras que genere asientos. Esas funcionalidades son **opcionales**, viven
**dentro** de un vertical y, típicamente, son **de pago**.

Hoy no hay riel para enchufarlas. Existe el precedente del **module-flag del
vertical** (`contabilidadEnabled`/`granjaEnabled` + `ModuleEnabledGuard` +
`@RequireModule` + cache Redis `org-features:<id>` + derivación del vertical en
`GET /me/permissions`), pero ese mecanismo modela **un vertical exclusivo por org**,
no una **extensión opcional con entitlement**. Y el sistema `FeatureFlag` genérico
(flags A/B, `schema.prisma:532`) es flat: no representa "lo que el plan habilita",
no tiene catálogo cerrado de packs, y arrastra la deuda de naming de §1.2 del doc
fundacional.

### 1.2 La tesis (cerrada por producto)

Un **pack** es una funcionalidad OPCIONAL que vive DENTRO de un vertical, gobernada
por **entitlement → activación**, típicamente de PAGO. Un pack **NO tiene que
generar comprobantes** (corrección a una definición previa demasiado estrecha): lo
que lo hace pack es ser **opcional + vivir dentro de un vertical + gobernarse por la
frontera entitlement→activación**. El modelo es **agnóstico al contenido** del pack.

El riel debe permitir el flujo: la plataforma/super-admin **habilita** un pack a una
org (entitlement) → el Owner **activa** los que va a usar (activación ⊆ entitlement) →
su **navegación, sus permisos RBAC y su capacidad/tablas aparecen solos**, sin
re-arquitecturar.

### 1.3 Qué NO incluye esta etapa

- **No** se construye ningún pack concreto (ni Adjuntos, ni RAG, ni Ventas/Compras).
- **No** se elige el proveedor de storage (Adjuntos) ni de embeddings/LLM (RAG): son
  detalles internos de cada pack, fuera del riel (§10).
- **No** se decide CUÁL es el primer pack: sigue siendo decisión de Marco (§9).

---

## 2. Recordatorio de los tres ejes (dónde encaja packs)

`docs/disenos/plataforma-multi-vertical.md` §2 define **tres ejes ortogonales** que
se componen en cascada. Packs es el **eje 2**:

```
Vertical de la org    →  qué FAMILIA de pantallas/dominio EXISTE      (eje 1)
   ∩
Packs activos         →  qué EXTENSIONES de ese vertical están PRENDIDAS  (eje 2 ← este doc)
   ∩
Permisos del usuario  →  cuáles de esas pantallas/acciones puede USAR  (eje 3)
```

| Eje | Pregunta | Granularidad | Modelo hoy | Estado |
|---|---|---|---|---|
| 1. Vertical | ¿Qué producto ES el tenant? | Por org | `contabilidadEnabled`/`granjaEnabled` | ✅ construido |
| **2. Packs** | ¿Qué extensiones están prendidas? | Por org | — (este doc lo modela) | ❌ greenfield |
| 3. Permisos | ¿Qué puede hacer el usuario? | Por membresía | strings `{modulo}.{submodulo}.{accion}` | ✅ construido |

**Regla mental**: el Vertical decide qué EXISTE, los Packs agregan/quitan dentro de
eso, y el RBAC decide qué de lo existente puede tocar el usuario. El **sidebar** es
la materialización: `items visibles = árbol del vertical ∩ packs activos ∩ permisos`.

Hoy el sidebar ya compone DOS de los tres ejes (`nav-list.tsx:30-34`: filtra por
`requiredPermission` y por `vertical`); el eje `pack` enchufa **idéntico** (§5.6).

---

## 3. Qué es FREE vs PACK + tipología de packs

### 3.1 FREE vs PACK (cerrado por producto)

| Capacidad | Clasificación | Razón |
|---|---|---|
| Core contable (plan de cuentas, comprobantes, libros, períodos, EEFF, contactos) | **FREE** | Es el producto base; usable solo. |
| **Generar / exportar reportes PDF y Excel** | **FREE** | Es **cómputo**, no storage. GENERAR un reporte ≠ ALMACENAR un archivo. |
| **Adjuntos a comprobantes** 💲 | **PACK** | Guardar documentos de respaldo vinculados a un Comprobante ocupa **storage** → costo real → se cobra. Acotado a Comprobantes. **Store A.** |
| **RAG + Agente inteligente** 💲 | **PACK** | "Lugar especial" SEPARADO donde el usuario sube docs que se **vectorizan**; un agente consulta y responde sobre ESE corpus. **Store B.** Pack pesado (vector store, embeddings, LLM) → diferido. |
| Packs de dominio futuros (Ventas, Compras, Costos, Punto de Venta, Despachos/Fletes, RRHH) 💲 | **PACK** | Sub-dominios opcionales que generan/consumen comprobantes. Sin orden de prioridad definido. |
| Granja: RAG + Agente 💲 | **PACK** | Mismo patrón que el RAG contable, en el vertical Granja. |

> **Distinción clave**: la frontera no es "genera asientos / no genera". Reportes
> PDF/Excel es FREE aunque produzca un archivo, porque lo GENERA al vuelo y no lo
> retiene. Adjuntos es PACK porque RETIENE (storage). El riel cobra la **capacidad
> persistente / valor agregado**, no el cómputo del core.

### 3.2 Tipología de packs (el riel soporta los tres tipos)

Los candidatos NO son homogéneos. El riel debe ser agnóstico al contenido para
soportar todos:

1. **Packs de DOMINIO** — agregan un sub-dominio + generan/consumen comprobantes:
   Ventas, Compras, Costos, Punto de Venta, Despachos/Fletes, RRHH (planillas →
   asientos). Comparten el dominio de su vertical (mueven el plan de cuentas).
2. **Packs de CAPACIDAD TRANSVERSAL** — NO generan asientos; agregan una capa sobre
   lo existente: **Adjuntos a comprobantes** (storage), **RAG + Agente** (IA).

El modelo `Pack` + entitlement + activación + `@RequirePack` + `pack?` en `NavItem`
es **agnóstico al contenido** → sirve para los dos tipos sin cambios. Lo que cambia
entre packs es el módulo de dominio que cada uno enchufa detrás del guard, no el riel.

### 3.3 Los dos stores: A (Adjuntos) ≠ B (RAG) — NO se mezclan

Decisión de producto (engram `sdd/packs/reglas-producto`): **Adjuntos** y **RAG** son
DOS capacidades de storage **física y lógicamente separadas**, con propósitos
distintos:

| | **Store A — Adjuntos** | **Store B — Corpus RAG** |
|---|---|---|
| Qué guarda | Documentos de respaldo colgados de un `Comprobante` | Docs curados (normas, políticas, parte de la contabilidad) que el usuario sube a un "lugar especial" |
| Vectorizado | **No** | **Sí** (embeddings) |
| Consultable por el agente | **No** | **Sí** |
| Acotamiento | A `Comprobante` "nada más" | A su corpus curado |
| Pack | "Adjuntos a comprobantes" | "RAG + Agente inteligente" |

> **Invariante de producto**: el Agente RAG responde SOLO desde el corpus del Store B.
> **NUNCA** ve los adjuntos del Store A. Esto evita que el agente "vea" facturas de
> respaldo que no debería y mantiene el corpus RAG curado. Son dos packs separados,
> dos capacidades separadas, dos almacenes separados. El riel los trata como dos
> entradas distintas en el catálogo `Pack`.

---

## 4. Modelo de datos propuesto

> **PROPUESTA conceptual — NO se aplica todavía.** Los bloques `prisma` son
> ilustrativos del plano. Naming sigue el core: framework en inglés, dominio del
> negocio en español donde corresponde. `Pack` es entidad de dominio SIN sufijo.

### 4.1 Decisión de modelado: modelo `Pack` dedicado (NO reusar `FeatureFlag`)

La exploración (engram `sdd/packs/explore`) evaluó dos forks:

| Fork | Veredicto |
|---|---|
| **A — reusar `FeatureFlag`** (`schema.prisma:532`) | Mínimo código nuevo, **pero**: es flat, sin noción de entitlement (cualquier `key` es válida, el Owner prende lo que quiera), sin catálogo cerrado de packs, sin frontera entitlement→activación, frágil para defense in depth §4.8, y **empeora** la deuda de naming §1.2 ("Módulos activos" ya renderiza `FeatureFlag` genérico). **Descartado.** |
| **B — modelo `Pack` dedicado** ✅ | Catálogo cerrado de packs + capa de entitlement + capa de activación, con defense in depth real. Limpia la deuda de naming (separa packs de A/B-flags). Es el riel que §5/§10.3 del doc fundacional pide. **Elegido.** |

**Por qué B encaja en ESTE código**: el proyecto ya tiene el precedente EXACTO
(module-flags + `ModuleEnabledGuard` + `@RequireModule` + cache Redis + derivación en
`/me/permissions` + eje `vertical` en `NavItem`). Un pack es **"otro module-flag con
un nivel de entitlement encima"**. B = clonar el patrón del eje vertical, agregando
la capa de entitlement que el module-flag no tiene.

### 4.2 Las tres capas del modelo

```
Catálogo de packs (global, definido por la plataforma)
        │  qué packs EXISTEN en el producto
        ▼
Entitlement por org (lo que la plataforma/billing HABILITA a cada org)
        │  qué packs PUEDE activar esta org
        ▼
Activación por org (lo que el Owner PRENDE ⊆ entitlement)
        │  qué packs están ACTIVOS para esta org
        ▼
gating: @RequirePack (backend) + pack? en NavItem (frontend)
```

### 4.3 Entidad `Pack` (catálogo global — sin tenant)

Catálogo cerrado, **read-only desde cualquier tenant** (como los catálogos
compartidos del §4.2 core, p.ej. `CotizacionUfv`). Lo administra la plataforma.

```prisma
// Catálogo de packs disponibles en el producto. Global, sin organizationId.
// Análogo a CATALOGO_PERMISOS pero en tabla (los packs se venden/contratan,
// el catálogo de permisos es código).
model Pack {
  id     String  @id @default(uuid())
  // Clave estable, namespaced por vertical. Ej: "contabilidad.adjuntos",
  // "contabilidad.rag", "contabilidad.ventas", "granja.rag".
  clave  String  @unique
  nombre String           // user-facing, español
  descripcion String?
  // A qué vertical pertenece el pack. Un pack vive DENTRO de un vertical
  // (§8 interacción): no rompe la exclusividad de vertical de la org.
  verticalAplicable VerticalPack   // CONTABILIDAD | GRANJA
  // Tipo de pack (informativo / para agrupación UI). Ver §3.2.
  tipo   TipoPack         // DOMINIO | CAPACIDAD
  activo Boolean @default(true)   // un pack retirado del catálogo no se vende
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  entitlements OrgPackEntitlement[]
  @@map("packs")
}

enum VerticalPack {
  CONTABILIDAD
  GRANJA
}

enum TipoPack {
  DOMINIO    // genera/consume comprobantes
  CAPACIDAD  // capa transversal (Adjuntos, RAG)
}
```

> Naming: `Pack`, `VerticalPack`, `TipoPack` son dominio → español; **valores** de
> enum en español/mayúsculas (core §1, "nombre Y valores en español"). `clave` y
> `nombre` en español; sufijos de relación en inglés.

### 4.4 `OrgPackEntitlement` (entitlement por org — lo que billing habilita)

**Tabla EXPLÍCITA de packs por org** (decisión cerrada, regla 1 — §6.1): NO un enum
`Plan` con bundles. La existencia de una fila `(organizationId, packId)` = "la
plataforma habilitó este pack a esta org". La habilita el **super-admin/billing**.

```prisma
// Lo que la plataforma HABILITA a una org (entitlement, §5 fundacional).
// La fila existe ⇔ el pack está habilitado para la org. Borrar la fila =
// quitar el entitlement (revoca también la activación por la regla activación⊆entitlement).
model OrgPackEntitlement {
  id             String  @id @default(uuid())
  organizationId String
  packId         String
  // Capa de ACTIVACIÓN embebida (§4.5): el Owner prende/apaga DENTRO del entitlement.
  // Por defecto false: habilitar ≠ activar. El Owner decide cuándo encenderlo.
  activo         Boolean @default(false)
  // Auditoría de quién habilitó (super-admin) y cuándo.
  habilitadoPorUserId String
  createdAt      DateTime @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime @updatedAt @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  pack         Pack         @relation(fields: [packId], references: [id], onDelete: Restrict)

  // DEFENSE IN DEPTH (§4.8 core): unicidad hard — un pack se habilita UNA vez por org.
  @@unique([organizationId, packId])
  @@index([organizationId])
  @@map("org_pack_entitlements")
}
```

### 4.5 La frontera activación ⊆ entitlement (defense in depth)

**Frontera de oro (§5 fundacional)**: la activación es siempre un **subconjunto del
entitlement**. El Owner **nunca** puede activar un pack que la plataforma no le
habilitó.

**Cómo se modela la frontera estructuralmente**: la activación es la columna `activo`
**dentro de** `OrgPackEntitlement`. Es imposible activar sin entitlement porque **no
existe una fila de activación independiente** — `activo` vive en la fila de
entitlement. Si no hay entitlement, no hay fila, no hay `activo` que prender. La
frontera está garantizada por la **forma del modelo**, no solo por una validación.

**Defense in depth completo** (CLAUDE.md §4.8 — hard + friendly, **nunca solo uno**):

| Capa | Mecanismo |
|---|---|
| **Hard (DB)** | El entitlement y la activación son la MISMA fila (`OrgPackEntitlement.activo`). Sin entitlement no hay fila → activar es estructuralmente imposible. `@@unique([organizationId, packId])` evita doble entitlement bajo concurrencia. |
| **Friendly (servicio)** | El endpoint de activación del Owner (`PATCH` sobre `activo`) hace `findUnique({ organizationId, packId })`; si la fila no existe → `PackNoHabilitadoError` (403, mensaje español "Este pack no está habilitado para tu organización"). |
| **Friendly (guard)** | `@RequirePack('contabilidad.adjuntos')` (§5.2) lee la activación efectiva; si el pack no está `activo` → 404 deliberado (no revela que existe pero está apagado, igual que `ModuleEnabledGuard`). |

> **Alternativa considerada y descartada**: dos tablas separadas
> (`OrgPackEntitlement` + `OrgPackActivacion` con FK a la primera). Da el mismo
> invariante pero con una FK más y una tabla más, sin beneficio: la activación no
> tiene atributos propios más allá del booleano. Si en el futuro la activación gana
> estado (fecha de activación, quién activó, límites de uso del pack), se promueve a
> tabla propia. Por ahora, columna embebida = menos superficie, mismo invariante.

### 4.6 Multi-tenant estricto

`OrgPackEntitlement` lleva `organizationId` no nulo; toda query filtra por él
(defense in depth guard+servicio+repo, core §4.2). `Pack` es catálogo compartido
(sin `organizationId`) → solo lectura cross-tenant, excepción del §4.2 core.

---

## 5. Cómo enchufa contra lo existente (clonar de X → equivalente packs)

La regla de oro de esta sección: **clonar el patrón del eje vertical**, que ya está
construido y probado. Cada fila es "el riel de packs replica ESTE archivo".

### 5.1 Tabla de clonado

| Pieza del eje vertical (existe) | Archivo:línea | Equivalente packs (a construir) |
|---|---|---|
| `@RequireModule('contabilidad'\|'granja')` | `backend/src/common/decorators/require-module.decorator.ts:13` | `@RequirePack('contabilidad.adjuntos')` — `SetMetadata(REQUIRE_PACK_KEY, clave)` |
| `ModuleEnabledGuard` (lee flags, cache Redis, 404 si apagado) | `backend/src/common/guards/module-enabled.guard.ts:30` | `PackEnabledGuard` — lee `OrgPackEntitlement.activo` por `(tenantId, clave)`, cache Redis, **404** si no activo |
| Cache Redis `org-features:<id>` TTL 300 | `module-enabled.guard.ts:65,84` | `org-packs:<id>` TTL 300 (lista de packs activos de la org); invalidar en habilitar/activar |
| Derivación del vertical en `GET /me/permissions` | `backend/src/me/me.controller.ts:46-78` | mismo handler devuelve `packsActivos: string[]` (claves) en el `select` existente — cero round-trip extra |
| `actualizarEntitlement` (super-admin edita plan/verticales) | `backend/src/platform/platform-admin.service.ts:146-180` | `habilitarPack` / `revocarPack` (super-admin crea/borra `OrgPackEntitlement`) |
| Módulo hexagonal por dominio | (cualquier módulo, p.ej. `granja/`) | módulo `packs/` (domain/ ports/ adapters/ dto/ + `pack.service.ts` `pack.controller.ts` `pack.module.ts`) |
| `NavItem { …, vertical? }` | `frontend/src/components/nav-items.ts:24-41` | `NavItem { …, vertical?, pack? }` |
| `NavList` filtra por permiso ∧ vertical | `frontend/src/components/nav-list.tsx:30-34` | agrega `∧ (item.pack === undefined ∨ pack ∈ packsActivos)` |
| `useVerticalActivo` (mismo cache que `usePermissions`) | `frontend/src/lib/use-vertical.ts` | `useMisPacks` — lee `packsActivos` del MISMO cache `['me-permissions', tenantId]`, cero red extra |

### 5.2 Backend — módulo `packs/` hexagonal

Estructura obligatoria (core §3.2), **incluso con un solo adapter**:

```
backend/src/packs/
├── domain/
│   ├── pack.ts                         // entidad pura (clave, nombre, vertical, tipo)
│   └── pack-errors.ts                  // PackNoHabilitadoError, PackNoEncontradoError
├── ports/
│   ├── pack-catalog.reader.port.ts     // listar catálogo Pack
│   ├── org-pack.repository.port.ts     // entitlement + activación por org
│   └── org-packs.reader.port.ts        // ← lo que OTROS módulos leen (packs activos de la org)
├── adapters/
│   └── prisma-org-pack.repository.ts
├── dto/
│   ├── habilitar-pack.dto.ts           // super-admin
│   ├── activar-pack.dto.ts             // owner
│   └── pack-response.dto.ts
├── pack.service.ts
├── pack.controller.ts                  // endpoints del Owner (activar/listar mis packs)
└── pack.module.ts
```

- **`@RequirePack` + `PackEnabledGuard`** viven en `common/` (transversales, como su
  contraparte de vertical). Se registran **por-controller** en `@UseGuards`, DESPUÉS
  de `AuthGuard('jwt')` (necesitan `req.user.activeTenantId`) y, idealmente, **antes**
  de `PermissionsGuard` (un 404 de pack apagado gana al 403 de permiso — no revela el
  endpoint). Mismo razonamiento que `module-enabled.guard.ts:21-28`.
- **El módulo dueño del pack** decora SUS controllers con `@RequirePack`. El módulo
  `packs/` NO conoce a los módulos de dominio; solo provee el `OrgPacksReaderPort` que
  el guard consume.
- **Cruzar frontera de módulo → port** (core §3.3/§3.7). Un módulo de dominio que
  quiera saber si un pack está activo depende de `OrgPacksReaderPort`, inyectado vía
  NestJS, nunca import directo de `packs/adapters/`.

### 5.3 `GET /me/permissions` — exponer packs activos

`me.controller.ts:46-52` ya lee `organization: { select: { contabilidadEnabled,
granjaEnabled } }` para derivar el vertical. El riel **agrega** al mismo `select` la
relación de packs activos y devuelve `packsActivos: string[]` (claves) junto a
`vertical`. El DTO `MePermissionsResponseDto` gana un campo; el frontend lo consume
del mismo cache (§5.5). **Cero red extra** (invariante que ya respeta el eje vertical).

### 5.4 Administración (dos alcances, core §4 + §5 fundacional)

- **Plataforma (super-admin)** habilita/revoca entitlement: `habilitarPack(orgId,
  packId)` / `revocarPack(...)` en `PlatformAdminService` (clon de
  `actualizarEntitlement`, `platform-admin.service.ts:146`), expuestos en
  `/admin/platform/orgs/:id/packs` (POST/DELETE). Auditado vía
  `PlatformAuditInterceptor` (ya existe). Solo `isSuperAdmin === true`
  (`SuperAdminGuard`).
- **Organización (Owner/ADMIN)** activa/desactiva lo habilitado: `PATCH` sobre
  `OrgPackEntitlement.activo` en `pack.controller.ts`, gatéado por
  `organizacion.*` (SystemRole OWNER/ADMIN) — **no** un permiso fino. El servicio
  valida la frontera activación⊆entitlement (§4.5).

### 5.5 Frontend — `pack?` en `NavItem` + `useMisPacks` + filtro

1. `NavItem` (`nav-items.ts:24-41`) gana `pack?: string` (clave del pack). Items sin
   `pack` siempre pasan (igual que items sin `vertical` = administración).
2. `useMisPacks` (`frontend/src/lib/`) — clon de `useVerticalActivo`
   (`use-vertical.ts`): lee `packsActivos` del MISMO `queryKey ['me-permissions',
   tenantId]`. Server state → TanStack Query, **NUNCA** Zustand (Anti-F-05). Cero red
   extra (TanStack deduplica por queryKey).
3. `NavList` (`nav-list.tsx:30-34`) agrega el tercer filtro:
   ```
   pasaPack = item.pack === undefined || packsActivos.includes(item.pack)
   return pasaPermiso && pasaVertical && pasaPack
   ```
   Fail-closed: `packsActivos` indefinido durante loading → ítems con `pack` ocultos.

> **El gating frontend es UX, no seguridad** (core §4.2, frontend §14.7). El candado
> real es `PackEnabledGuard` (404) + `PermissionsGuard` (403) en el backend. Ocultar
> el ítem de un pack no contratado es pulido; el backend ya rechaza la request.

---

## 6. Las 4 reglas cerradas (invariantes del riel)

Documentadas por Marco (producto). El riel las enforza; un PR que las viole no entra.

### Regla 1 — Entitlement granular (tabla explícita, no enum Plan con bundles)

El entitlement se modela con una **tabla explícita de packs por org**
(`OrgPackEntitlement`), no con un enum `Plan {FREE, PRO}` que empaquete bundles. El
plan FREE es el **baseline** (core contable, usable solo); cada pack se habilita
**uno por uno** (son vendibles sueltos). Lo habilita la **plataforma/super-admin/
billing**, nunca el Owner.

> Consecuencia: `Organization.plan` (`schema.prisma:24,150`) y `BillingService`
> siguen existiendo para cuotas numéricas (límite de miembros), pero **no** mapean
> plan→packs. El entitlement de packs es la tabla, no el enum.

### Regla 2 — Granularidad = BUNDLE

Un pack agrupa, **todo junto**: su navegación (`NavItem`s con ese `pack`), sus
permisos RBAC (los `{modulo}.{submodulo}.{accion}` del sub-dominio) y su
tabla/capacidad (storage de Adjuntos, vector store de RAG, tablas del sub-dominio).
**No** es un permiso suelto ni un submódulo aislado. Habilitar el pack "Adjuntos"
prende su nav + sus permisos `contabilidad.adjuntos.*` + su capacidad de storage, en
bloque.

### Regla 3 — Pack ↔ org-status: ejes ortogonales, no mezclar

El pack gobierna **solo VISIBILIDAD/ACCESO** a su funcionalidad. El enforcement de
`Organization.status` (`OrgStatusGuard`, change `org-status-enforcement`,
2026-06-02) es **otro eje**: bloquea **mutaciones** en orgs `SUSPENDED`/`ARCHIVED`
(403 `ORG_STATUS_NO_ACTIVE`), lecturas siempre pasan.

- El entitlement de un pack **NO se pierde** al suspender la org: la fila
  `OrgPackEntitlement` permanece. Al volver a `ACTIVE`, el pack se reactiva sin
  re-habilitar.
- Mientras la org está suspendida, el pack es visible/legible pero sus **mutaciones**
  caen por `OrgStatusGuard` (no por el riel de packs).
- **No mezclar los dos guards**: `PackEnabledGuard` decide "existe/está activo este
  pack para la org"; `OrgStatusGuard` decide "la org puede mutar". Cadenas
  independientes.

### Regla 4 — Frontera de oro: activación ⊆ entitlement

El Owner NUNCA activa un pack que la plataforma no habilitó. Enforzado con defense in
depth estructural (§4.5): la activación vive DENTRO de la fila de entitlement.

---

## 7. Cierre de la deuda RBAC (catálogo asignable filtrado)

### 7.1 La deuda (confirmada en el código)

Hoy el selector de roles muestra el **catálogo COMPLETO**, ignorando el vertical y
los packs de la org:

- **Backend**: `custom-roles.service.ts:149` (`validatePermissions`) solo valida que
  el permiso exista en el catálogo plano (`permisoExisteEnCatalogo`), sin filtrar por
  vertical+packs. `permissions.controller.ts:18,24` sirve `CATALOGO_PERMISOS` /
  `catalogoAgrupado()` **completo** a cualquier usuario autenticado.
- **Frontend**: `permissions-picker.tsx` consume `CatalogoAgrupado` completo
  (`contabilidad.*` Y `granja.*`).

Esto **contradice** §3 del doc fundacional ("en una org de granja solo se ofrecen
permisos `granja.*`"). Es deuda existente que el riel de packs **hereda y debe
cerrar** (regla 4 del encargo, §10.3 fundacional).

### 7.2 Cómo lo cierra el riel

El catálogo asignable se filtra por **vertical + packs activos** de la org:

1. **Backend (servidor-autoritativo)**: el endpoint de catálogo (o uno nuevo
   `GET /permissions/asignables`) filtra `CATALOGO_PERMISOS` dejando solo:
   - permisos del **vertical activo** de la org (`contabilidad.*` o `granja.*`),
   - permisos `organizacion.*`/`sistema.*` (cross-vertical, siempre),
   - permisos de **submódulos cuyos packs estén activos** (ej. `contabilidad.adjuntos.*`
     solo si el pack `contabilidad.adjuntos` está activo).
   `validatePermissions` (`custom-roles.service.ts:149`) suma el mismo filtro: un
   `CustomRole` no puede asignar permisos de un pack no activo → `PermisoNoHabilitadoError`.
2. **Frontend (UX)**: `permissions-picker.tsx` consume el catálogo ya filtrado por el
   backend; no re-filtra (espeja el backend, igual que `usePermissions`).

> Mapeo pack→submódulos: cada `Pack` declara qué prefijos de permiso aporta (ej.
> `contabilidad.adjuntos` → `contabilidad.adjuntos.*`). Se puede modelar como
> metadata del catálogo `Pack` o como convención de naming (clave del pack = prefijo
> del submódulo). **Decisión menor a cerrar en la fase de tasks** (§10).

---

## 8. Interacción con otros ejes / sistemas

| Sistema | Relación | Regla |
|---|---|---|
| **Vertical (eje 1)** | Un pack **pertenece a un vertical** (`Pack.verticalAplicable`). | El pack vive DENTRO de su vertical; **no** rompe la exclusividad de vertical por org (CHECK `organizations_vertical_exclusivo_check`). Una org de Contabilidad solo puede tener entitlement de packs `CONTABILIDAD`. El servicio de habilitación valida `pack.verticalAplicable` contra el vertical de la org. |
| **org-status** | Ortogonal (regla 3, §6). | `PackEnabledGuard` (visibilidad) y `OrgStatusGuard` (mutaciones) son cadenas independientes; no se mezclan. |
| **RBAC (eje 3)** | El pack aporta permisos al catálogo asignable. | Activar el pack hace asignables sus permisos (§7); desactivarlo los quita del catálogo (los roles que ya los tengan dejan de poder ejercerlos vía `PackEnabledGuard` → 404). |
| **Super-admin / billing** | Único que habilita entitlement. | `isSuperAdmin === true` + `SuperAdminGuard`. Auditado en `platform_audit`. |
| **`FeatureFlag` genérico** | NO se reusa para packs. | `FeatureFlag` queda para A/B-flags/rollouts. La deuda de naming "Módulos activos" (§1.2 fundacional) se cierra cuando la pantalla de activación de packs reemplace/renombre esa vista (opcional, fase final). |

---

## 9. Secuencia de construcción (futura sesión, menor → mayor dependencia)

1. **Cerrar las decisiones menores abiertas** (§10): mapeo pack→submódulos, una vs
   dos tablas (ya recomendado: embebida), CUÁL es el primer pack (decisión de Marco).
2. **Modelo `Pack`**: schema (`Pack` + `OrgPackEntitlement` + enums `VerticalPack`/
   `TipoPack`) + migración + `@@unique([organizationId, packId])`. Seed del catálogo
   con los packs definidos.
3. **Backend riel**: módulo `packs/` hexagonal (ports/adapters/service/controller),
   `@RequirePack` + `PackEnabledGuard` (clon de `ModuleEnabledGuard`) en `common/`,
   cache Redis `org-packs:<id>`.
4. **Exponer packs activos** en `GET /me/permissions` (campo `packsActivos`, mismo
   `select`).
5. **Entitlement admin**: `PlatformAdminService.habilitarPack/revocarPack` + endpoints
   `/admin/platform/orgs/:id/packs` (super-admin).
6. **Activación**: endpoint Owner (`PATCH activo`) con validación activación⊆entitlement.
7. **Cierre deuda RBAC** (§7): filtrar catálogo asignable por vertical+packs,
   backend (`permissions.controller` + `custom-roles.service`) + frontend
   (`permissions-picker`).
8. **Frontend riel**: `pack?` en `NavItem` + `useMisPacks` + filtro en `NavList`.
9. **Primer pack concreto** enchufado al riel (validación end-to-end).

### 9.1 El "primer cliente" del riel

**Adjuntos a comprobantes** es el candidato natural a estrenar el riel: es
técnicamente **acotado** (solo storage colgado de `Comprobante`, no un sub-dominio
contable completo), tiene **costo real** (storage) que justifica el cobro, y prueba
los dos extremos del riel sin la complejidad del RAG (vector store, embeddings, LLM
→ diferido). `DocumentoFisico` (`schema.prisma:890`) **NO** almacena el binario, solo
metadata del papel → guardar el archivo es capacidad nueva = pack de capacidad
transversal, ideal para el shakedown.

> **PERO**: CUÁL es el primer pack sigue siendo **decisión de Marco**. "No hay orden
> de importancia definido" entre los candidatos de dominio (Ventas/Compras/Costos/
> POS/Despachos/RRHH). Este doc recomienda Adjuntos por acotamiento técnico, no lo
> impone.

---

## 10. Riesgos / cicatrices a respetar + decisiones abiertas

### 10.1 Cicatrices a respetar

- **Multi-tenant estricto** (core §4.2): toda query de `OrgPackEntitlement` filtra
  `organizationId`; defense in depth guard+servicio+repo.
- **Vertical exclusivo** (core §10.4): un pack NO debe romperlo. `Pack.verticalAplicable`
  + validación en habilitación. Una org sigue siendo de un solo vertical.
- **404 vs 403** del `ModuleEnabledGuard` (no revelar): `PackEnabledGuard` replica el
  404 deliberado para packs apagados; el 403 queda para RBAC.
- **Concurrencia en habilitación** (core §4.8): `@@unique([organizationId, packId])`
  hard + guard friendly. Nunca solo uno.
- **`new Date()` prohibido** en `domain/` y `*.service.ts` (core §4.6): usar
  `ClockPort` si el servicio necesita timestamps de dominio.
- **Naming** (core §1): `Pack` español sin sufijo; `Service`/`Guard`/`Dto` en inglés;
  enums español con valores español; archivos kebab-case doble-dot
  (`require-pack.decorator.ts`, `pack-enabled.guard.ts`).
- **Hexagonal estricto** (core §3.2/§3.3): cruzar frontera de módulo → port. Los
  módulos de dominio dependen de `OrgPacksReaderPort`, no de `packs/adapters/`.

### 10.2 Decisiones abiertas (a cerrar en tasks o por Marco)

| Decisión | Recomendación | Quién cierra |
|---|---|---|
| Mapeo pack → submódulos de permiso (§7.2) | Convención: clave del pack = prefijo del submódulo (`contabilidad.adjuntos` → `contabilidad.adjuntos.*`). Alternativa: metadata explícita en `Pack`. | Fase tasks |
| Una tabla (activación embebida) vs dos (§4.5) | Una tabla embebida (menos superficie, mismo invariante). Promover a dos si la activación gana estado propio. | Fase tasks (recomendado: embebida) |
| CUÁL es el primer pack | Adjuntos (acotado) — recomendación, no imposición. | **Marco** |
| Proveedor de storage (pack Adjuntos) | **Fuera de scope del riel** — detalle interno del pack. | Cuando se construya Adjuntos |
| Proveedor de embeddings/LLM (pack RAG) | **Fuera de scope del riel** — pack pesado, diferido. | Cuando se construya RAG |
| Renombrar/reemplazar pantalla "Módulos activos" (`/settings/features`) por activación de packs | Opcional, fase final; cierra deuda de naming §1.2 fundacional. | Fase final del riel |

---

**Fin del documento.** Documento de bases: se versiona en git, cualquier cambio se
discute en PR. Al construir el riel, mantener este doc reconciliado con el código y
mover las decisiones abiertas (§10.2) a su sección al cerrarse (regla anti-drift §12
core).
