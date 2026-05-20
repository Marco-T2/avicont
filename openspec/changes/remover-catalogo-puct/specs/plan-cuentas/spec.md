# Delta para plan-cuentas (remover-catalogo-puct)

> Fecha: 2026-05-19 · Fase: spec · Tipo: refactor de eliminación
>
> **No hay nuevas capacidades.** El comportamiento observable del plan de
> cuentas NO cambia. Este delta describe (a) comportamiento ELIMINADO
> —maquinaria especulativa PUCT que nunca tuvo flujo contable real— y (b)
> requisitos de REGRESIÓN que el cambio DEBE preservar idénticos. No existen
> specs previos en `openspec/specs/`; este delta documenta los deltas de
> comportamiento para guiar el TDD (`strict_tdd: true`).

## REMOVED Requirements

### Requirement: Endpoint de mapeo PUCT
(Razón: la integración SIN está fuera de scope total —CLAUDE.md §10.9—; el endpoint nunca formó parte de un flujo contable.)

El sistema NO DEBE exponer el endpoint `POST /api/cuentas/:id/mapear-puct` ni ningún método de mapeo de cuentas al catálogo PUCT.

#### Scenario: El endpoint mapear-puct deja de existir

- GIVEN un usuario autenticado en tenant `acme` con una cuenta `cuenta-1`
- WHEN envía `POST /api/cuentas/cuenta-1/mapear-puct` con cualquier body
- THEN la respuesta DEBE ser **404 Not Found** (ruta inexistente)

### Requirement: Campo codigoPuct en creación de cuenta
(Razón: metadata especulativa de mapeo tributario; descartada explícitamente, sin texto libre.)

El endpoint `POST /api/cuentas` NO DEBE aceptar ni persistir el campo `codigoPuct` en el body.

#### Scenario: Crear cuenta ignorando codigoPuct enviado

- GIVEN un usuario con permiso `contabilidad.cuentas.create` en tenant `acme`
- WHEN envía `POST /api/cuentas` con un body que incluye `codigoPuct`
- THEN la cuenta se crea normalmente (201) SIN persistir ningún dato PUCT
- AND la respuesta NO DEBE incluir `codigoPuct`, `nombrePuctSnapshot` ni `versionPuctMapeado`

### Requirement: Campos PUCT en la respuesta de cuenta
(Razón: columnas eliminadas del schema.)

La respuesta de cuenta (`cuenta-response`) NO DEBE incluir los campos `codigoPuct`, `nombrePuctSnapshot` ni `versionPuctMapeado`.

#### Scenario: Listar y obtener cuentas sin campos PUCT

- GIVEN cuentas existentes en tenant `acme`
- WHEN se consulta `GET /api/cuentas`, `GET /api/cuentas/tree` o `GET /api/cuentas/:id`
- THEN ningún objeto de cuenta DEBE contener las claves PUCT

### Requirement: Códigos de error de validación PUCT
(Razón: validador de nivel PUCT eliminado.)

El sistema NO DEBE emitir los códigos de error `CUENTA_CODIGO_PUCT_INVALIDO` ni `CUENTA_CODIGO_PUCT_NIVEL_INSUFICIENTE`. Estos códigos dejan de existir en el catálogo de errores del módulo.

#### Scenario: Los códigos de error PUCT no se emiten

- GIVEN cualquier operación del módulo `cuentas`
- WHEN ocurre un error de validación
- THEN el `error.code` NUNCA DEBE ser `CUENTA_CODIGO_PUCT_INVALIDO` ni `CUENTA_CODIGO_PUCT_NIVEL_INSUFICIENTE`

## ADDED Requirements (guardas de regresión — comportamiento PRESERVADO)

> Estos requisitos no agregan funcionalidad: fijan como contrato verificable
> el comportamiento que el refactor DEBE dejar IDÉNTICO. Existen para que el
> TDD detecte cualquier regresión introducida al retirar la maquinaria PUCT.

### Requirement: Seed comercial autocontenido produce el mismo plan de cuentas

`sembrarPlanCuentasComercial` DEBE producir EXACTAMENTE las mismas cuentas que hoy —61 cuentas hoja (`esDetalle = true`) más su jerarquía completa de agrupadores, con la misma distribución por nivel— SIN consultar `CatalogoPuct`. Los datos `nombre`, `nivel` y `claseCuenta` DEBEN provenir inlineados del propio seed. Toda inserción DEBE filtrar por `organizationId` (multi-tenant, CLAUDE.md §4.2).

#### Scenario: Mismo total y jerarquía sin consultar CatalogoPuct

- GIVEN una organización nueva `org-nueva`
- WHEN se ejecuta `sembrarPlanCuentasComercial(org-nueva)`
- THEN se crean exactamente 61 cuentas hoja con `esDetalle = true`
- AND la jerarquía de agrupadores (`esDetalle = false`) y la distribución por nivel son idénticas a las del seed previo basado en PUCT
- AND el seed NO ejecuta ninguna lectura sobre `CatalogoPuct`

#### Scenario: Las 8 cuentas requeridas por el sistema se preservan

- GIVEN el seed comercial ejecutado para `org-nueva`
- WHEN se consultan las cuentas con `esRequeridaSistema = true`
- THEN existen exactamente 8 cuentas requeridas, con los mismos `codigoInterno` que hoy (`1.1.6.001`, `2.1.4.001`, `2.1.4.002`, `2.1.4.004`, `3.1.3.001`, `3.1.4.001`, `4.4.1.003`, `5.6.1.003`)

#### Scenario: codigoInterno conserva la numeración estilo PUCT como código interno puro

- GIVEN el seed comercial ejecutado
- WHEN se inspecciona el `codigoInterno` de cualquier cuenta sembrada (ej. `1.1.1.001`)
- THEN el valor es idéntico al anterior, ahora SIN referencia alguna al catálogo PUCT

### Requirement: OrgConfiguracionContable se sigue mapeando completo

El seed DEBE producir un `OrgConfiguracionContable` con los 8 conceptos mapeados (8/8), alimentado por `MAPEO_CODIGO_A_CONCEPTO` (renombrado desde `MAPEO_PUCT_A_CONCEPTO`, misma lógica). La query DEBE filtrar por `organizationId`.

#### Scenario: 8 de 8 conceptos mapeados tras el seed

- GIVEN una organización nueva `org-nueva`
- WHEN se ejecuta el seed comercial
- THEN `OrgConfiguracionContable` de `org-nueva` tiene los 8 conceptos resueltos a sus cuentas (`ivaCreditoId`, `ivaDebitoId`, `rcIvaRetenidoId`, `itPorPagarId`, `resultadosAcumuladosId`, `resultadoEjercicioId`, `difCambioGananciaId`, `difCambioPerdidaId`)

### Requirement: CRUD de cuentas sin cambios funcionales (salvo ausencia de PUCT)

Las operaciones de `cuentas` —listar, tree, crear, actualizar, desactivar, reactivar, conceptos— DEBEN comportarse idénticas a hoy, salvo la ausencia de los campos y el endpoint PUCT. Se preservan los invariantes del core: partida doble, multi-tenant (toda query filtra por `tenantId`), decimales y no soft-delete en contabilidad (desactivar/reactivar, nunca borrar). El plan de cuentas per-tenant queda intacto.

#### Scenario: CRUD de cuentas funciona igual sin PUCT

- GIVEN un usuario con permisos sobre `cuentas` en tenant `acme`
- WHEN ejecuta listar, tree, crear, actualizar, desactivar, reactivar y conceptos
- THEN cada operación retorna los mismos resultados que antes del refactor, sin campos PUCT
- AND ninguna query devuelve cuentas de otro tenant

#### Scenario: Desactivar/reactivar en lugar de borrado (no soft-delete contable)

- GIVEN una cuenta activa en tenant `acme`
- WHEN se desactiva y luego se reactiva
- THEN la cuenta cambia su estado `activa` sin ser eliminada físicamente ni marcada con `deletedAt`
