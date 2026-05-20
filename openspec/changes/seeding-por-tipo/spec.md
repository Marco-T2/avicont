# Spec: seeding-por-tipo

> Fecha: 2026-05-20
> Fase: spec
> Proyecto: avicont

---

## 1. Glosario

| Término | Definición |
|---------|-----------|
| **modulo** | Campo del `CreateTenantDto` que captura el vertical elegido al crear una organización: `CONTABILIDAD`, `GRANJA` u `OTROS`. Es input transitorio — el service lo traduce a feature flags y selección de seeders; no se persiste como columna propia. |
| **vertical** | Sinónimo de `modulo` en este documento. El eje A del diseño: qué conjunto de funcionalidades activa la organización. Ortogonal al rubro contable (eje B, diferido). |
| **seeder** | Componente responsable de sembrar datos por defecto al crear una organización. Invocado síncronamente dentro de la TX de creación. Idempotente (upsert). |
| **PlanCuentasSeederPort** | Puerto cross-module (owner: módulo `cuentas`) que contrae la siembra del plan de cuentas COMERCIAL (111 cuentas) + `OrgConfiguracionContable` requerida en una sola operación atómica. Recibe `tx` obligatorio. |
| **TipoDocumentoFisicoSeederPort** | Puerto cross-module (owner: módulo `documento-fisico`) que siembra los 8 tipos de documento físico universales. Absorbido en la rama CONTABILIDAD del switch junto al `PlanCuentasSeederPort`. |
| **TX de creación** | La `prisma.$transaction` que envuelve: crear org+membership, derivar flags, y correr los seeders del vertical. Si cualquier paso lanza, la TX hace rollback — la org no queda creada. |
| **contabilidadEnabled** | Flag booleano en el schema de `Organization`. `true` cuando la org opera el módulo contable. Derivado del `modulo` al crear; no se recalcula post-creación por este change. |
| **granjaEnabled** | Flag booleano en el schema de `Organization`. `true` cuando la org opera el módulo granja. Derivado del `modulo` al crear. |
| **siembra CONTABILIDAD** | Las operaciones que corren en la rama `CONTABILIDAD` del switch: 111 cuentas del plan COMERCIAL + `OrgConfiguracionContable` requerida + 8 tipos de documento físico, todo en la misma TX. |
| **idempotencia** | Propiedad de los seeders: ejecutarlos múltiples veces sobre el mismo tenant no duplica registros (upsert por clave de negocio). |

---

## 2. Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

### 2.1 Campo `modulo` en el DTO de creación

- **REQ-DTO-01**: El sistema DEBE requerir el campo `modulo` en `CreateTenantDto`. Una solicitud de creación de organización sin `modulo` DEBE rechazarse con **400 Bad Request**.

- **REQ-DTO-02**: Los únicos valores válidos para `modulo` son `CONTABILIDAD`, `GRANJA` y `OTROS`. Cualquier otro valor DEBE rechazarse con **400 Bad Request** con detalle de validación.

- **REQ-DTO-03**: El campo `modulo` NO DEBE tener valor por defecto en el DTO. El llamador elige conscientemente el vertical. Si se requiriera tolerancia temporal, esa lógica vive en el service — NO en el DTO.

- **REQ-DTO-04**: El sistema NO DEBE persistir el campo `modulo` como columna en la base de datos. Es un input transitorio que el service traduce a los feature flags existentes (`contabilidadEnabled`, `granjaEnabled`) y a la selección de seeders. Sin migration de schema.

### 2.2 Mapeo de `modulo` a feature flags

- **REQ-FLAGS-01**: `modulo=CONTABILIDAD` DEBE producir `contabilidadEnabled=true` y `granjaEnabled=false` en la organización creada.

- **REQ-FLAGS-02**: `modulo=GRANJA` DEBE producir `granjaEnabled=true` y `contabilidadEnabled=false` en la organización creada.

- **REQ-FLAGS-03**: `modulo=OTROS` DEBE producir `contabilidadEnabled=false` y `granjaEnabled=false` en la organización creada.

- **REQ-FLAGS-04**: Los flags derivados DEBEN persistirse junto a la organización dentro de la misma TX de creación. No se permiten dos operaciones separadas (crear org + actualizar flags).

### 2.3 Orquestación de seeders en la TX de creación

- **REQ-SEED-01**: `TenantsService.create` DEBE ejecutar la creación de organización, la derivación de flags, y la siembra de datos por defecto dentro de una única `prisma.$transaction`. Ninguna de esas operaciones PUEDE ocurrir fuera de esa TX.

- **REQ-SEED-02**: Para `modulo=CONTABILIDAD`, el sistema DEBE invocar, en la misma TX y en este orden:
  1. `PlanCuentasSeederPort.seedDefaultsForTenant(tenantId, tx)` — siembra 111 cuentas + `OrgConfiguracionContable`.
  2. `TipoDocumentoFisicoSeederPort.seedDefaultsForTenant(tenantId, tx)` — siembra 8 tipos de documento físico.
  Esta siembra subsume la task 9.1 del change `documento-fisico`.

- **REQ-SEED-03**: Para `modulo=GRANJA`, el sistema NO DEBE invocar ningún seeder contable. La rama es un placeholder explícito — solo setea `granjaEnabled=true`. Cero cuentas contables, cero tipos de documento físico.

- **REQ-SEED-04**: Para `modulo=OTROS`, el sistema NO DEBE invocar ningún seeder. La org se crea con la membresía OWNER únicamente. Ambos flags en `false`.

- **REQ-SEED-05**: El sistema DEBE mantener la creación de la membresía OWNER del creador en todos los casos, independientemente del `modulo`.

### 2.4 Atomicidad y rollback

- **REQ-ATOM-01**: Si cualquier seeder lanza una excepción dentro de la TX, el sistema DEBE hacer rollback completo de toda la TX. La org NO DEBE quedar creada, la membresía NO DEBE quedar creada, ninguna cuenta NI tipo de documento NI configuración contable DEBE persistir.

- **REQ-ATOM-02**: Un fallo del seeder (ej. la plantilla COMERCIAL no sembró todas las cuentas requeridas) DEBE propagarse como un error de infraestructura/plantilla, mapeado a **500** por el `GlobalExceptionFilter`. NO es un error de dominio del usuario.

- **REQ-ATOM-03**: Una colisión de slug (UNIQUE constraint en BD dentro de la TX) DEBE hacer rollback y mapearse a **409 Conflict** por el `GlobalExceptionFilter` (código Prisma P2002). La validación pre-TX de slug existente (defense in depth) devuelve el mismo 409 sin tocar la BD.

### 2.5 Contrato del `PlanCuentasSeederPort`

- **REQ-PORT-01**: `PlanCuentasSeederPort` DEBE ser una abstract class con un único método: `seedDefaultsForTenant(tenantId: string, tx: Prisma.TransactionClient): Promise<void>`. El parámetro `tx` es **obligatorio** (no opcional).

- **REQ-PORT-02**: `PlanCuentasSeederPort` DEBE vivir en el módulo `cuentas` (`backend/src/cuentas/ports/`). El módulo `tenants` lo consume inyectado; NUNCA importa el adapter concreto.

- **REQ-PORT-03**: El adapter `PrismaPlanCuentasSeederAdapter` DEBE invocar síncronamente, dentro de la `tx` recibida: primero `sembrarPlanCuentasComercial(tx, tenantId)` y con el `porCodigoInterno` que devuelve, `poblarConfiguracionContableRequerida(tx, tenantId, porCodigoInterno)`.

- **REQ-PORT-04**: Las funciones `sembrarPlanCuentasComercial` y `poblarConfiguracionContableRequerida` en `comercial.ts` DEBEN aceptar `PrismaClient | Prisma.TransactionClient` como tipo del parámetro `prisma`. El cuerpo no cambia; solo se amplía el tipo para aceptar el cliente transaccional. El uso CLI standalone (que pasa un `PrismaClient` real) NO DEBE romperse.

- **REQ-PORT-05**: `CuentasModule` DEBE proveer y exportar `PLAN_CUENTAS_SEEDER_PORT` con `PrismaPlanCuentasSeederAdapter`. `TenantsModule` DEBE importar `CuentasModule` para resolver el token.

### 2.6 Idempotencia del seeder

- **REQ-IDEM-01**: `PlanCuentasSeederPort.seedDefaultsForTenant` DEBE ser idempotente. Ejecutarlo múltiples veces sobre el mismo `tenantId` NO DEBE crear duplicados de cuentas ni de `OrgConfiguracionContable`. La idempotencia se garantiza por `upsert` en `(organizationId, codigoInterno)` para cuentas y por `upsert` en `organizationId` para la configuración.

- **REQ-IDEM-02**: La idempotencia del seeder es una propiedad de su implementación, no una responsabilidad del caller. `TenantsService` NO DEBE verificar si el tenant ya tiene datos antes de llamar al seeder.

### 2.7 Multi-tenancy y aislamiento

- **REQ-MT-01**: Las cuentas sembradas por `PlanCuentasSeederPort` DEBEN tener el `organizationId` de la organización recién creada. NUNCA se siembran sin `organizationId` o con un `organizationId` de otro tenant.

- **REQ-MT-02**: Los tipos de documento físico sembrados por `TipoDocumentoFisicoSeederPort` DEBEN tener el `organizationId` de la organización recién creada.

- **REQ-MT-03**: Las cuentas de un tenant NO DEBEN ser visibles ni accesibles para queries de otros tenants. El aislamiento lo garantiza el filtro por `organizationId` en las queries del módulo `cuentas`.

### 2.8 Módulo `TenantRepositoryPort` y adapter

- **REQ-REPO-01**: `TenantRepositoryPort.create` DEBE aceptar un parámetro `tx?: Prisma.TransactionClient` (opcional, backwards-compatible). Cuando se provee, la operación de creación usa ese cliente transaccional.

- **REQ-REPO-02**: `TenantCreateData` DEBE incluir `contabilidadEnabled: boolean` y `granjaEnabled: boolean` como campos explícitos. El adapter los persiste directamente en el `organization.create` dentro de la TX.

- **REQ-REPO-03**: La nested write de membresía OWNER DEBE conservarse dentro del mismo `organization.create`. No se agrega una operación separada para la membresía.

---

## 3. Escenarios (Given/When/Then)

### 3.1 Validación del DTO

**E-DTO-01: Crear organización sin campo `modulo` → 400**
- **Given** un usuario autenticado con los permisos para crear una organización
- **When** envía `POST /api/tenants` con `{ name: "Mi Empresa" }` (sin `modulo`)
- **Then** respuesta **400 Bad Request** con detalle de validación indicando que `modulo` es requerido
- **And** no se crea ninguna organización en BD

**E-DTO-02: Crear organización con `modulo` de valor inválido → 400**
- **Given** un usuario autenticado con los permisos para crear una organización
- **When** envía `POST /api/tenants` con `{ name: "Mi Empresa", modulo: "FARMACIA" }`
- **Then** respuesta **400 Bad Request** con detalle indicando que `FARMACIA` no es un valor válido del enum
- **And** no se crea ninguna organización en BD

**E-DTO-03: Crear organización con `modulo: null` → 400**
- **Given** un usuario autenticado con los permisos para crear una organización
- **When** envía `POST /api/tenants` con `{ name: "Mi Empresa", modulo: null }`
- **Then** respuesta **400 Bad Request** — el campo no acepta null, es requerido

**E-DTO-04: Los tres valores del enum son aceptados por el DTO**
- **Given** un usuario autenticado
- **When** envía `POST /api/tenants` con `modulo: "CONTABILIDAD"`, luego con `"GRANJA"`, luego con `"OTROS"` (en 3 requests distintos, nombres distintos)
- **Then** cada request devuelve **201 Created** — los tres valores son válidos

### 3.2 Alta con `modulo=CONTABILIDAD`

**E-CONT-01: Alta exitosa siembra 111 cuentas + configuración + tipos de documento**
- **Given** un usuario autenticado con los permisos para crear una organización
- **When** envía `POST /api/tenants` con `{ name: "Empresa Contable S.A.", modulo: "CONTABILIDAD" }`
- **Then** respuesta **201 Created** con la organización creada
- **And** `contabilidadEnabled = true` en la organización
- **And** `granjaEnabled = false` en la organización
- **And** existen exactamente 111 cuentas con `organizationId` de la nueva org en la tabla `cuentas`
- **And** existe una `OrgConfiguracionContable` para la nueva org con las cuentas requeridas mapeadas
- **And** existen exactamente 8 `TipoDocumentoFisico` con `organizationId` de la nueva org
- **And** existe una membresía OWNER del usuario creador asociada a la nueva org
- **And** todo lo anterior fue creado dentro de una única transacción de BD

**E-CONT-02: Alta CONTABILIDAD crea exactamente 111 cuentas, no más ni menos**
- **Given** un usuario autenticado
- **When** crea una organización con `modulo: "CONTABILIDAD"`
- **Then** `SELECT COUNT(*) FROM cuentas WHERE organizationId = <nueva-org>` devuelve exactamente `111`
- **And** ninguna cuenta tiene `organizationId` de otro tenant

**E-CONT-03: Alta CONTABILIDAD mapea `OrgConfiguracionContable` con las cuentas requeridas del sistema**
- **Given** una organización recién creada con `modulo: "CONTABILIDAD"`
- **When** se consulta `OrgConfiguracionContable` para esa org
- **Then** las 8 cuentas requeridas por el sistema (`esRequeridaSistema = true`) tienen sus correspondientes cuentas de la org asignadas en la configuración
- **And** la configuración contable tiene `organizationId` de la nueva org

**E-CONT-04: Alta CONTABILIDAD siembra los 8 tipos de documento físico universales**
- **Given** una organización recién creada con `modulo: "CONTABILIDAD"`
- **When** se consulta `TipoDocumentoFisico` para esa org
- **Then** existen exactamente 8 tipos con `organizationId` de la nueva org
- **And** los códigos presentes son: `factura-emitida`, `factura-recibida`, `nota-credito-emitida`, `nota-debito-emitida`, `recibo-ingreso`, `recibo-egreso`, `comprobante-interno`, `vale-caja-chica`

### 3.3 Alta con `modulo=GRANJA`

**E-GRAN-01: Alta exitosa no siembra nada contable**
- **Given** un usuario autenticado con los permisos para crear una organización
- **When** envía `POST /api/tenants` con `{ name: "Granja El Amanecer", modulo: "GRANJA" }`
- **Then** respuesta **201 Created** con la organización creada
- **And** `granjaEnabled = true` en la organización
- **And** `contabilidadEnabled = false` en la organización
- **And** `SELECT COUNT(*) FROM cuentas WHERE organizationId = <nueva-org>` devuelve `0`
- **And** no existe `OrgConfiguracionContable` para la nueva org
- **And** `SELECT COUNT(*) FROM tipos_documento_fisico WHERE organizationId = <nueva-org>` devuelve `0`
- **And** existe una membresía OWNER del usuario creador

**E-GRAN-02: Alta GRANJA no invoca `PlanCuentasSeederPort`**
- **Given** un `PlanCuentasSeederPort` mock registrado en el contenedor de prueba
- **When** se crea una organización con `modulo: "GRANJA"`
- **Then** el método `seedDefaultsForTenant` del `PlanCuentasSeederPort` NO fue llamado (0 invocaciones)
- **And** el método `seedDefaultsForTenant` del `TipoDocumentoFisicoSeederPort` NO fue llamado (0 invocaciones)

### 3.4 Alta con `modulo=OTROS`

**E-OTROS-01: Alta exitosa sin siembra ni flags activos**
- **Given** un usuario autenticado con los permisos para crear una organización
- **When** envía `POST /api/tenants` con `{ name: "Asociación Vecinal", modulo: "OTROS" }`
- **Then** respuesta **201 Created** con la organización creada
- **And** `contabilidadEnabled = false` en la organización
- **And** `granjaEnabled = false` en la organización
- **And** no se sembró ninguna cuenta, configuración contable ni tipo de documento
- **And** existe una membresía OWNER del usuario creador

**E-OTROS-02: Alta OTROS no invoca ningún seeder**
- **Given** seeders mock registrados en el contenedor de prueba
- **When** se crea una organización con `modulo: "OTROS"`
- **Then** ningún seeder (`PlanCuentasSeederPort`, `TipoDocumentoFisicoSeederPort`) fue invocado (0 invocaciones en ambos)

### 3.5 Atomicidad y rollback

**E-ATOM-01: Fallo del seeder de plan de cuentas → rollback completo**
- **Given** un `PlanCuentasSeederPort` mock que lanza `new Error('Plantilla COMERCIAL incompleta')`
- **When** se intenta crear una organización con `modulo: "CONTABILIDAD"`
- **Then** respuesta **500 Internal Server Error**
- **And** no existe ninguna organización con el nombre enviado en BD (`SELECT COUNT(*) FROM organizations WHERE name = '...'` = `0`)
- **And** no existe ninguna membresía asociada a una org que no se creó
- **And** no existe ninguna cuenta con el `organizationId` que habría tenido la nueva org

**E-ATOM-02: Fallo del seeder de tipos de documento físico → rollback que incluye las cuentas sembradas**
- **Given** un `PlanCuentasSeederPort` mock que funciona correctamente
- **And** un `TipoDocumentoFisicoSeederPort` mock que lanza `new Error('Tipos no disponibles')`
- **When** se intenta crear una organización con `modulo: "CONTABILIDAD"`
- **Then** respuesta **500 Internal Server Error**
- **And** no existe ninguna organización creada en BD
- **And** no existen cuentas para el `organizationId` de la org fallida (rollback incluyó las cuentas que sembró el primer seeder)
- **And** no existen tipos de documento físico para esa org

**E-ATOM-03: Colisión de slug dentro de la TX → rollback + 409**
- **Given** ya existe una organización con el mismo slug derivado del nombre (race condition: otro request la creó en paralelo)
- **When** se intenta crear una organización con ese mismo nombre y `modulo: "CONTABILIDAD"`
- **Then** respuesta **409 Conflict** (P2002 mapeado por `GlobalExceptionFilter`)
- **And** no se creó la organización ni se sembró ningún dato

**E-ATOM-04: Validación pre-TX de slug duplicado → 409 sin tocar BD**
- **Given** ya existe una organización con `slug: "mi-empresa"` en BD
- **When** se intenta crear una organización con nombre `"Mi Empresa"` (mismo slug) y `modulo: "CONTABILIDAD"`
- **Then** respuesta **409 Conflict** antes de abrir la TX
- **And** no se abrió ninguna transacción ni se invocó ningún seeder

### 3.6 Idempotencia del seeder

**E-IDEM-01: Re-sembrar el mismo tenant no duplica cuentas**
- **Given** una organización con `modulo: "CONTABILIDAD"` ya creada con 111 cuentas sembradas
- **When** se invoca manualmente `PlanCuentasSeederPort.seedDefaultsForTenant(org.id, tx)` una segunda vez (simulando un retry o re-provisioning)
- **Then** `SELECT COUNT(*) FROM cuentas WHERE organizationId = <org>` sigue devolviendo `111`
- **And** ningún campo de las cuentas existentes fue modificado (el upsert con `update: {}` no toca datos existentes)

**E-IDEM-02: Re-sembrar no duplica `OrgConfiguracionContable`**
- **Given** una organización con configuración contable ya sembrada
- **When** se invoca el adapter del seeder una segunda vez para el mismo tenant
- **Then** sigue existiendo exactamente 1 `OrgConfiguracionContable` para esa org

### 3.7 Contrato del `PlanCuentasSeederPort`

**E-PORT-01: El port es invocado con el `organizationId` correcto y la TX activa**
- **Given** un `PlanCuentasSeederPort` mock con spy
- **When** se crea una organización con `modulo: "CONTABILIDAD"`
- **Then** el spy registra exactamente 1 llamada a `seedDefaultsForTenant`
- **And** el primer argumento es el `id` de la organización recién creada (no el `ownerId`, no `undefined`)
- **And** el segundo argumento es el cliente transaccional (`tx`) de la TX de creación

**E-PORT-02: El `TipoDocumentoFisicoSeederPort` también se invoca con los argumentos correctos**
- **Given** un `TipoDocumentoFisicoSeederPort` mock con spy
- **When** se crea una organización con `modulo: "CONTABILIDAD"`
- **Then** el spy registra exactamente 1 llamada a `seedDefaultsForTenant`
- **And** el primer argumento es el `id` de la nueva org
- **And** el segundo argumento es la misma TX que recibió el `PlanCuentasSeederPort`

**E-PORT-03: El adapter `PrismaPlanCuentasSeederAdapter` encadena las dos funciones de siembra**
- **Given** un `Prisma.TransactionClient` mock y un `tenantId`
- **When** se invoca `PrismaPlanCuentasSeederAdapter.seedDefaultsForTenant(tenantId, tx)`
- **Then** se invoca primero `sembrarPlanCuentasComercial(tx, tenantId)` y con el `porCodigoInterno` que devuelve, se invoca `poblarConfiguracionContableRequerida(tx, tenantId, porCodigoInterno)` en ese orden
- **And** ambas funciones reciben la `tx` (no un `PrismaClient` nuevo)

**E-PORT-04: `tx` es obligatorio en `PlanCuentasSeederPort` — sin `tx` el TypeScript no compila**
- **Given** el tipo del port declarado en `plan-cuentas-seeder.port.ts`
- **When** se intenta llamar a `seedDefaultsForTenant(tenantId)` sin el segundo argumento `tx`
- **Then** TypeScript emite un error de compilación (`error TS2554: Expected 2 arguments, but got 1`)
- _Nota: este escenario se verifica con `npx tsc --noEmit`, no con un test de runtime_

### 3.8 Multi-tenancy

**E-MT-01: Las cuentas sembradas pertenecen solo a la nueva org**
- **Given** org A y org B creadas ambas con `modulo: "CONTABILIDAD"` (distintos nombres)
- **When** se consultan las cuentas de cada org
- **Then** org A tiene exactamente 111 cuentas con `organizationId = org-A-id`
- **And** org B tiene exactamente 111 cuentas con `organizationId = org-B-id`
- **And** ninguna cuenta de org A tiene `organizationId = org-B-id` ni viceversa

**E-MT-02: El flujo CONTABILIDAD no afecta orgs existentes**
- **Given** org `acme` ya existe con 111 cuentas sembradas
- **When** se crea una org nueva `beta` con `modulo: "CONTABILIDAD"`
- **Then** `SELECT COUNT(*) FROM cuentas WHERE organizationId = <acme-id>` sigue siendo `111`
- **And** `SELECT COUNT(*) FROM cuentas WHERE organizationId = <beta-id>` es `111`

**E-MT-03: Org GRANJA no puede acceder a módulo contable**
- **Given** org creada con `modulo: "GRANJA"` (tiene `contabilidadEnabled = false`)
- **When** un usuario de esa org intenta `GET /api/plan-cuentas` (protegido por `ModuleEnabledGuard` de contabilidad)
- **Then** respuesta **403 Forbidden** — el módulo contable no está habilitado para esa org

### 3.9 Firma de funciones de siembra (`comercial.ts`)

**E-FIRMA-01: `sembrarPlanCuentasComercial` acepta `Prisma.TransactionClient`**
- **Given** una `Prisma.TransactionClient` activa
- **When** se invoca `sembrarPlanCuentasComercial(tx, organizationId)`
- **Then** la función ejecuta sin error de tipos y devuelve `{ porCodigoInterno: Record<string, string> }`
- **And** las operaciones `cuenta.upsert` se ejecutan dentro de la `tx`

**E-FIRMA-02: `sembrarPlanCuentasComercial` sigue aceptando `PrismaClient` (uso CLI)**
- **Given** el bloque `if (require.main === module)` de `comercial.ts` que instancia `new PrismaClient()`
- **When** se corre el seed de forma standalone (`ts-node comercial.ts`)
- **Then** TypeScript no emite error de tipos al pasar `PrismaClient` donde se espera `PrismaClient | Prisma.TransactionClient`
- **And** la siembra funciona igual que antes del cambio de firma

---

## 4. Códigos de error

Todos extienden `DomainError` o son errores de infraestructura mapeados por `GlobalExceptionFilter`.

### 4.1 Errores del módulo `tenants`

| Code | HTTP | Mensaje | Cuándo |
|------|------|---------|--------|
| — (validación class-validator) | 400 | `modulo` es requerido / valor inválido del enum | `CreateTenantDto` sin `modulo` o con valor fuera de `[CONTABILIDAD, GRANJA, OTROS]` |
| `TENANT_SLUG_DUPLICADO` (existente) | 409 | Ya existe una organización con ese nombre | Slug derivado del name colisiona, pre-TX |
| P2002 mapeado por `GlobalExceptionFilter` | 409 | — | Colisión de slug por race condition dentro de la TX |
| `Error` (infraestructura) | 500 | — | Fallo del seeder (plantilla COMERCIAL incompleta, error de Prisma inesperado) |

> **Nota**: este change NO introduce nuevos `DomainError`. Los fallos de seed son fallos de infraestructura/plantilla, no condiciones de dominio del usuario.

---

## 5. Endpoints afectados

Este change modifica un único endpoint existente:

| Método | Path | Cambio |
|--------|------|--------|
| `POST` | `/api/tenants` | Body añade campo `modulo` (requerido, enum). Comportamiento de creación cambia: ahora corre en TX con orquestación de seeders según vertical. |

No se crean endpoints nuevos. No se modifica la forma de la respuesta (sigue devolviendo `OrganizationConMemberships`).

---

## 6. Coverage objetivo

| Tipo | Target | Descripción |
|------|--------|-------------|
| Unit — `tenants.service` | ≥ 90% | Mocks de los 2 seeder ports + `repo.create` + `prisma.$transaction`. Cubre: `modulo=CONTABILIDAD` invoca ambos seeders con `org.id` y `tx`; `modulo=GRANJA` no invoca ningún seeder, setea solo `granjaEnabled`; `modulo=OTROS` no-op; seeder lanza → error propagado (simula rollback); slug duplicado pre-TX → 409 sin abrir TX; flags derivados correctos para cada vertical. |
| Unit — `PrismaPlanCuentasSeederAdapter` | ≥ 85% | Mock de `sembrarPlanCuentasComercial` y `poblarConfiguracionContableRequerida`; verifica encadenamiento del `porCodigoInterno`; verifica que `tx` se pasa a ambas funciones. |
| Integration — adapter contra Postgres real | ≥ 80% | `PrismaPlanCuentasSeederAdapter` contra Postgres real: siembra 111 cuentas + `OrgConfiguracionContable` en una TX; re-ejecutar no duplica (idempotencia); plantilla falla → rollback (0 cuentas). |
| Integration — `TenantsService.create` contra Postgres real | ≥ 80% | Alta CONTABILIDAD → 111 cuentas + 8 tipos-doc + config en 1 TX; alta GRANJA → 0 cuentas; fallo de seeder → org no creada. |
| E2E — `POST /api/tenants` | Golden paths + errores clave | `modulo=CONTABILIDAD` → 201 + 111 cuentas verificadas; `modulo=GRANJA` → 201 + 0 cuentas + `granjaEnabled=true`; `modulo=OTROS` → 201 + ambos flags false; sin `modulo` → 400; valor inválido → 400. |
| **Global** | **≥ 80%** | Línea base CLAUDE.md §10.6 |

---

## 7. DTOs (forma esperada)

```typescript
// CreateTenantDto (modificado)
{
  name: string;        // existente
  modulo: 'CONTABILIDAD' | 'GRANJA' | 'OTROS';  // NUEVO — requerido, @IsEnum
}

// TenantCreateData (puerto — modificado)
{
  slug: string;
  name: string;
  ownerUserId: string;
  contabilidadEnabled: boolean;   // derivado del modulo
  granjaEnabled: boolean;         // derivado del modulo
}

// Respuesta de POST /api/tenants (sin cambios en forma — OrganizationConMemberships)
{
  id: string;
  name: string;
  slug: string;
  contabilidadEnabled: boolean;
  granjaEnabled: boolean;
  // ...resto de campos existentes de Organization...
  memberships: [{ id: string; role: string; userId: string; }];
}
```

---

**Fin del spec.**
