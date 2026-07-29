# Items — Specification

> Change: `ventas-piloto`. Capability NUEVA.
> Fuente: `proposal.md` (D-15, D-24, D-25, D-26, D-27) + brechas B-2, B-11, B-15.

## Purpose

Catálogo mínimo de ítems vendibles, **módulo propio compartido**
(`backend/src/items/`, hexagonal §3.2) con la disciplina de Contactos: el CRUD
es rico, lo compartido es un port de dos campos (D-15). Sin inventario, sin
stock, sin costo. FREE, sin pack: gating `@RequireModule('contabilidad')`
solamente (D-01).

## Requirements

### REQ-ITM-01: Forma del ítem — campos y semántica firmada

`Item` DEBE tener: `codigo` **opcional** (D-24), `nombre` obligatorio,
`tipo PRODUCTO | SERVICIO`, `unidadMedida` (string libre, D-25),
`precioUnitarioSugerido?` (opcional), `cantidadPorDefecto`
(`@db.Decimal(18,6)`, default 1 — D-25), `cuentaIngresoId?` (opcional, cae al
concepto `ventasId` de la configuración), `activo` (soft-delete espejo de
Contactos: se desactiva, no se borra), `createdByUserId`, `organizationId`.

Semántica de `tipo` firmada por D-26: responde **¿es físico?** y nada más.
"¿Le sigo el stock?" será un **booleano aditivo** del pack Inventario — NUNCA
un tercer valor del enum. `esVendible`/`esComprable` NO existen en v1:
divergencia **deliberada** contra el consenso del mercado (D-27), entran como
columnas aditivas cuando Compras les dé un segundo consumidor real.

El único campo obligatorio para guardar es `nombre` (D-24: no se le pide
nomenclatura a quien solo quiere cobrar).

#### Escenario: alta con solo el nombre

- DADO un usuario con `contabilidad.items.create`
- CUANDO crea un ítem enviando únicamente `nombre` y `tipo`
- ENTONCES el ítem se guarda sin código, con `cantidadPorDefecto = 1` y
  `activo = true`

#### Escenario: desactivar, nunca borrar

- DADO un ítem referenciado por líneas de venta
- CUANDO se lo desactiva
- ENTONCES `activo = false`, el ítem deja de ofrecerse para ventas nuevas
- Y las ventas existentes conservan su `itemId` y sus snapshots intactos

### REQ-ITM-02: Código opcional — UNIQUE PARCIAL + normalización (D-24, B-15)

La unicidad del `codigo` DEBE regir **solo cuando existe**: UNIQUE PARCIAL
`(organizationId, codigo) WHERE "codigo" IS NOT NULL`, escrito a mano como raw
SQL dentro de la migración de tablas y **sumado a la tabla de objetos raw
vivos de `CLAUDE.md` §11.6** (precedente exacto:
`contactos_organizationId_documento_partial_key`).

Enforcement **simultáneo** constraint + guard de servicio con error amigable
`ITEM_CODIGO_DUPLICADO` (Anti-23, cicatriz F-01: solo-servicio falla bajo
concurrencia; solo-constraint da un 500 críptico).

Normalización ANTES de persistir y de comparar (B-15):
1. `trim`; si queda vacío (o viene null/undefined) → `null` (precedente
   literal: `normalizarDocumento` de Contactos — así el unique parcial deja
   convivir N ítems sin código).
2. **Mayúsculas** (`toUpperCase`). Divergencia justificada respecto de
   `documento` (solo dígitos, el case no existe): un código alfanumérico donde
   `"P-01"` y `"p-01 "` fueran dos ítems distintos es una trampa para el
   usuario, no una feature.

#### Escenario: dos ítems sin código conviven

- DADO una organización con un ítem sin código
- CUANDO se crea otro ítem sin código
- ENTONCES ambos se guardan sin conflicto

#### Escenario: mismo código choca por los dos mecanismos

- DADO un ítem con código `P-01`
- CUANDO se intenta crear otro con código `p-01 ` (case y espacios distintos)
- ENTONCES el servicio rechaza con `ITEM_CODIGO_DUPLICADO` (409)
- Y si dos requests concurrentes esquivan el guard, el constraint parcial
  rechaza al segundo

#### Escenario: normalización al persistir

- DADO un alta con `codigo: "  ab-9 "`
- CUANDO se guarda
- ENTONCES persiste como `AB-9`

### REQ-ITM-03: Multi-tenant estricto (B-2)

`Item.organizationId` DEBE ser no nulo y TODA query del módulo DEBE filtrar
por él — guard + servicio + repositorio, ninguna capa confía en la anterior
(§4.2: query sin filtro = bug de seguridad). Un ítem de otra organización DEBE
responder 404, nunca 403: la existencia de recursos ajenos no se revela.

#### Escenario: ítem de otro tenant

- DADO un ítem de la organización B
- CUANDO un usuario de la organización A lo pide por id
- ENTONCES responde 404

### REQ-ITM-04: `ItemsReaderPort` de superficie mínima (D-15)

El port compartido DEBE ser espejo exacto de `ContactosReaderPort`:
`obtenerBatch(tenantId, ids, tx?) → Map<id, { id, activo }>` — **dos campos**,
nada más. No expone nombre, precio ni cuenta: blast radius acotado. Cableado
patrón A (port exportado del módulo principal), sin módulo-hoja.

#### Escenario: la superficie no crece por conveniencia

- DADO el módulo `ventas` consumiendo `ItemsReaderPort`
- CUANDO necesita nombre o precio del ítem
- ENTONCES NO los obtiene del port: los lee al crear la línea y los guarda
  como snapshot (D-28) — el port sigue exponiendo solo `{ id, activo }`

### REQ-ITM-05: Cuenta de ingreso del ítem protegida (B-11, Anti-41)

`Item.cuentaIngresoId` DEBE llevar FK con `onDelete: Restrict`. Desactivar una
cuenta referenciada como `cuentaIngresoId` por ítems **activos** DEBE
rechazarse con `CUENTA_REFERENCIADA_POR_ITEMS` (409) devolviendo en `details`
la lista de ítems afectados — mismo patrón que
`CUENTA_CONFIGURADA_COMO_CONCEPTO` (Anti-41): el admin no desactiva una cuenta
sin saber que está enchufada a configuración almacenada.

Defense in depth: si a pesar del guard una cuenta del snapshot llega inactiva
al momento de generar el asiento, el writer re-valida y rechaza (ver
REQ-CMP-VTA-03) — error, no bypass.

#### Escenario: desactivar cuenta enchufada a ítems

- DADO la cuenta `4.1.1.002` configurada como `cuentaIngresoId` de 3 ítems activos
- CUANDO se intenta desactivarla
- ENTONCES responde 409 `CUENTA_REFERENCIADA_POR_ITEMS` con los 3 ítems en `details`

#### Escenario: cuenta libre se desactiva normalmente

- DADO una cuenta sin ítems activos que la referencien ni conceptos mapeados
- CUANDO se la desactiva
- ENTONCES responde 200

### REQ-ITM-06: RBAC — `contabilidad.items.*` (D-23)

DEBE declararse `contabilidad.items.{read, create, update, delete}` en
`common/permisos/catalogo.ts` — el test de tres puntas
(`catalogo-vs-controllers.spec.ts`: decoradores + `.hasPermission` + seed)
rompe el build ante cualquier permiso usado y no catalogado, y los decoradores
DEBEN usar literales string (el escaneo es por texto). El template Contador
recibe los 4 verbos (D-23). El espejo manual
`frontend/src/lib/permissions.ts` DEBE sumar el submódulo. Sin verbo `post` ni
`void`: un ítem no se contabiliza ni se anula.

#### Escenario: usuario sin permiso

- DADO un usuario sin `contabilidad.items.create`
- CUANDO llama `POST /api/items`
- ENTONCES responde 403

## Códigos de error

| Código | HTTP | Condición |
|---|---|---|
| `ITEM_CODIGO_DUPLICADO` | 409 | código normalizado ya existe en la organización |
| `CUENTA_REFERENCIADA_POR_ITEMS` | 409 | desactivar cuenta usada como `cuentaIngresoId` por ítems activos |
