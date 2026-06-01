# Spec: granja-rbac-activacion

> Fecha: 2026-06-01
> Fase: spec
> Change: granja-v1
> Proyecto: avicont
> Fuente de verdad: `docs/disenos/granja.md` §3, §7; `docs/disenos/plataforma-multi-vertical.md` §10.4; `backend/src/common/permisos/catalogo.ts` (granja, líneas 216-241)

## Purpose

El gating del vertical: cada endpoint de granja exige (1) que el módulo esté
habilitado para la org (`@RequireModule('granja')` → 404 si no) y (2) el permiso
fino `granja.*` correspondiente (`@RequirePermissions(...)` → 403 si falta).
Además cubre la **activación exclusiva** del vertical: una org es de Contabilidad
**o** de Granja, nunca ambas. El error amigable `VerticalNoExclusivoError` (ya
existe en `TenantsService.updateFeatures`) precede al CHECK de BD. Al activar
granja se dispara el seed de `TipoRegistro` (ver `granja-tipos-registro`).

## Glosario

| Término | Definición |
|---------|-----------|
| **@RequireModule('granja')** | Decorator + `ModuleEnabledGuard`. Lee `granjaEnabled` de la org → 404 si está deshabilitado. |
| **granjaEnabled** | Flag en `Organization` (`@default(false)`). Activa el vertical. |
| **vertical exclusivo** | CHECK `organizations_vertical_exclusivo_check`: `NOT (contabilidadEnabled AND granjaEnabled)`. Una org no puede tener ambos verticales. |
| **VerticalNoExclusivoError** | `DomainError` (extiende `ConflictError`) ya thrown por `TenantsService.updateFeatures`. Defensa amigable previa al CHECK de BD. |
| **Permisos `granja.*`** | Catalogados: `granja.dashboard.read`, `granja.lotes.{create,read,update,delete}`, `granja.tipos-registro.{create,read,update,delete}`, `granja.movimientos.{create,read,update,delete}`, `granja.chat.interact` (v2). |

---

## Requirements

### Requirement: Module gating en cada endpoint de granja

Todo endpoint bajo `/api/granja/*` DEBE estar decorado con
`@RequireModule('granja')`. Si la org tiene `granjaEnabled = false`, el sistema
DEBE responder **404** (el módulo no existe para esa org), nunca exponiendo si
hay datos detrás.

#### Scenario: Endpoint de granja con módulo deshabilitado responde 404

- GIVEN una org con `granjaEnabled = false`
- WHEN un usuario (aunque tenga permisos `granja.*`) llama `GET /api/granja/dashboard`
- THEN el sistema responde **404**

#### Scenario: Endpoint de granja con módulo habilitado pasa el guard

- GIVEN una org con `granjaEnabled = true` y un usuario con `granja.dashboard.read`
- WHEN llama `GET /api/granja/dashboard`
- THEN el guard de módulo deja pasar la request

---

### Requirement: Permisos finos por endpoint

Cada endpoint DEBE exigir el permiso fino correspondiente vía
`@RequirePermissions(...)`. Sin el permiso, el sistema DEBE responder **403**.
El mapeo es: dashboard → `granja.dashboard.read`; CRUD de lotes →
`granja.lotes.{create,read,update,delete}` (cerrar usa `granja.lotes.update`);
tipos-registro → `granja.tipos-registro.{create,read,update,delete}`;
movimientos → `granja.movimientos.{create,read,update,delete}`.

#### Scenario: Sin permiso de crear lote responde 403

- GIVEN un usuario con `granjaEnabled = true` pero SIN `granja.lotes.create`
- WHEN intenta `POST /api/granja/lotes`
- THEN el sistema responde **403**

#### Scenario: Con permiso de leer pero sin crear

- GIVEN un usuario con `granja.lotes.read` pero sin `granja.lotes.create`
- WHEN llama `GET /api/granja/lotes` (permitido) y luego `POST /api/granja/lotes` (denegado)
- THEN el GET responde 200 y el POST responde **403**

#### Scenario: Cerrar lote exige granja.lotes.update

- GIVEN un usuario sin `granja.lotes.update`
- WHEN llama `POST /api/granja/lotes/:id/cerrar`
- THEN el sistema responde **403**

---

### Requirement: Activación exclusiva del vertical

El sistema NO DEBE permitir activar `granjaEnabled = true` en una org que ya
tiene `contabilidadEnabled = true` (ni viceversa). El sistema DEBE rechazar con
`VerticalNoExclusivoError` (error amigable en español) **antes** de que se viole
el CHECK de BD `organizations_vertical_exclusivo_check` (defense in depth).

#### Scenario: Activar granja con contabilidad activa es rechazado

- GIVEN una org con `contabilidadEnabled = true`
- WHEN un OWNER/ADMIN intenta activar `granjaEnabled = true`
- THEN el sistema rechaza con `VerticalNoExclusivoError` (409) y la org mantiene `granjaEnabled = false`; el CHECK de BD nunca se alcanza

#### Scenario: Activar granja en org sin vertical es válido

- GIVEN una org con `contabilidadEnabled = false` y `granjaEnabled = false`
- WHEN un OWNER/ADMIN activa `granjaEnabled = true`
- THEN la activación tiene éxito

---

### Requirement: Activar granja dispara el seed de TipoRegistro

Cuando `granjaEnabled` pasa de `false` a `true` en una org, el sistema DEBE
sembrar los tipos de registro de fábrica de forma idempotente (delegado a la
capability `granja-tipos-registro`). El seed corre tras la activación exitosa.

#### Scenario: Activación exitosa siembra los tipos de fábrica

- GIVEN una org elegible (sin contabilidad) sin tipos de registro
- WHEN se activa `granjaEnabled = true`
- THEN tras la activación la org tiene los 12 `TipoRegistro` de fábrica (`esSistema = true`)

#### Scenario: Activación fallida por exclusividad NO siembra nada

- GIVEN una org con `contabilidadEnabled = true`
- WHEN se intenta activar granja y falla con `VerticalNoExclusivoError`
- THEN NO se siembra ningún `TipoRegistro` (la operación es atómica)

---

### Requirement: Aislamiento multi-tenant sobre el gating

Los guards DEBEN resolver `granjaEnabled` y los permisos contra la org activa
del JWT (`activeTenantId`), nunca contra otra org. Un usuario con granja activa
en su org NO DEBE poder operar sobre recursos de una org donde granja está
deshabilitada.

#### Scenario: El flag se evalúa sobre la org activa del JWT

- GIVEN un usuario cuyo `activeTenantId` apunta a la org "A" (`granjaEnabled = true`)
- WHEN opera endpoints de granja
- THEN el guard evalúa `granjaEnabled` de "A"; cambiar de org activa (otro JWT) re-evalúa contra la nueva org
