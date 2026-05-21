# Exploración — `documento-fisico`

> Fecha: 2026-04-25
> Fase: explore
> Proyecto: avicont

---

## 1. Estado del schema actual

### Modelos existentes en `schema.prisma`

El schema a la fecha (commit `84e725c`) contiene los siguientes modelos:
`User`, `Organization`, `Membership`, `CustomRole`, `Invitation`,
`RefreshToken`, `AuditLog`, `ImpersonationLog`, `ImpersonationAction`,
`CatalogoPuct`, `Cuenta`, `OrgConfiguracionContable`, `FeatureFlag`,
`GestionFiscal`, `PeriodoFiscal`, `PeriodoFiscalReopening`,
`Comprobante`, `LineaComprobante`, `SecuenciaComprobante`,
`ComprobanteAuditoria`, `Contacto`.

**No existe ningún modelo `DocumentoFisico`, `TipoDocumentoFisico` ni
`Factura` en el schema actual.** Todo arranca desde cero.

### `LineaComprobante.documentoFisicoId`

**CONTRADICCIÓN CON EL INPUT DEL ORCHESTRATOR**: el documento de entrada
afirmaba que `LineaComprobante.documentoFisicoId` ya nace en el schema
desde Fase 1.3 (basándose en `comprobantes-asientos.md` línea 5).

La revisión del código real revela lo contrario:

- `docs/disenos/comprobantes-asientos.md` §12.3 lista SOLO DOS campos
  forward-compat: `origenTipo`/`origenId` (para auto-entries) y
  `contactoId` (para contactos). **`documentoFisicoId` NO aparece en esa
  tabla.**
- El modelo `LineaComprobante` en `schema.prisma` (líneas 762-795) NO
  tiene columna `documentoFisicoId`.
- La relación entre `Comprobante` y `DocumentoFisico` deberá definirse
  completamente en este slice mediante migración nueva.

Esto implica que hay que diseñar la cardinalidad desde cero. El enunciado
dice "un Comprobante puede referenciar 0..N DocumentosFisicos", lo que
apunta a una tabla de asociación separada, NO a una FK directa en `LineaComprobante`.

### `Organization.tipoEmpresaPrincipal` y seed

`Organization` tiene `tipoEmpresaPrincipal TipoEmpresa` (enum con 8
valores: `COMERCIAL`, `SERVICIOS`, `TRANSPORTE`, `INDUSTRIAL`,
`PETROLERA`, `CONSTRUCCION`, `AGROPECUARIA`, `MINERA`). Solo existe un
seed de plan de cuentas: `prisma/seeds/prod/planes-cuentas/comercial.ts`
(COMERCIAL). No hay equivalentes para los otros 7 tipos.

Para `TipoDocumentoFisico` no existe seed de ningún tipo aún. La
pregunta de si los tipos son universales o per-`tipoEmpresa` es una
cuestión abierta que debe resolver el proposal (ver §8).

---

## 2. Patrón a copiar — módulo `contactos`

### Estructura de archivos

```
backend/src/contactos/
├── adapters/
│   ├── prisma-contactos-reader.adapter.ts       # implementa ContactosReaderPort (cross-módulo)
│   ├── prisma-contactos.repository.ts           # implementa ContactosRepositoryPort
│   └── prisma-contactos.repository.integration.spec.ts
├── domain/
│   ├── contacto-errors.ts                       # 5 DomainError subclasses
│   ├── contacto-validator.ts                    # validaciones puras sin NestJS
│   └── contacto-validator.spec.ts
├── dto/
│   ├── contacto-response.dto.ts
│   ├── create-contacto.dto.ts
│   ├── listar-contactos.dto.ts
│   └── update-contacto.dto.ts
├── ports/
│   ├── contactos-reader.port.ts                 # port cross-módulo (owner-owned)
│   └── contactos.repository.port.ts
├── contactos.controller.ts
├── contactos.module.ts
├── contactos.service.ts
└── contactos.service.spec.ts
```

Plus `test/contactos.e2e-spec.ts` (E2E).

### Value objects y dominio

`contactos` no tiene VOs propios; usa `string` para documento (texto libre)
y delega en `DomainError` subclasses. Los VOs del dominio contable
(`Money`, `Nit`, `FechaContable`) viven en `src/common/domain/` y son
candidatos para reuso en `documento-fisico`.

### Conteo de tests

- Validator unit: ~19 casos (`contacto-validator.spec.ts`)
- Service unit: ~30 casos (`contactos.service.spec.ts`, 38 líneas `describe`/`it`)
- Integration (adapter): ~23 specs (`prisma-contactos.repository.integration.spec.ts`, 24 hits)
- E2E: ~11 casos (`test/contactos.e2e-spec.ts`)

Total: ~83 tests para el módulo completo.

### Reader port cross-módulo

`ContactosReaderPort` expone un único método `obtenerBatch`:

```typescript
abstract obtenerBatch(
  tenantId: string,
  contactoIds: string[],
  tx?: Prisma.TransactionClient,
): Promise<Map<string, ContactoParaLinea>>;
```

Superficie mínima: solo `{ id, activo }`. El adapter deduplica ids y
hace early-return si la lista viene vacía. El `tx?` opcional permite
participar de la misma transacción del contabilizar (aislamiento contra
desactivación concurrente).

### Cómo lo consume `comprobantes`

- `ContactosModule` exporta `CONTACTOS_READER_PORT`.
- `ComprobantesModule` importa `ContactosModule` y el service inyecta
  `@Inject(CONTACTOS_READER_PORT)`.
- No hay `forwardRef` porque la dependencia es unidireccional.

---

## 3. Integración con comprobantes

### Patrón de validación de `contactoId`

`comprobantes.service.ts` valida en dos momentos distintos:

1. **Al crear/editar BORRADOR**: solo existencia del contacto en el
   tenant (usa `contactosMap.has(linea.contactoId)`). Permite
   referenciar contactos inactivos porque el usuario podría estar
   editando mientras el contacto se desactiva.

2. **Al contabilizar**: existencia + activo, dentro de la misma TX con
   `FOR SELECT` implícito vía Prisma (aislamiento contra race conditions).

Los errores viven en `comprobantes/domain/comprobante-errors.ts`
(no en el módulo `contactos`): `ContactoReferenciadoNoExisteError` y
`ContactoInactivoError`.

### Superficie de `CONTACTOS_READER_PORT`

Solo `obtenerBatch(tenantId, ids[], tx?)`. Valida simultáneamente:
- Pertenencia al tenant (solo devuelve ids del tenant correcto).
- Estado activo (campo `activo` en el resultado).

### Validaciones análogas para `documentoFisicoId`

Para `documento-fisico`, el patrón a seguir depende de qué modelo de
asociación se elija. Si la relación es Comprobante → DocumentoFisico
(tabla de asociación a nivel cabecera, no por línea), la validación
no ocurre en `LineaComprobante` sino en el flujo de contabilizar del
comprobante cabecera.

Validaciones mínimas necesarias al contabilizar:

1. **Existencia en el tenant**: el `documentoFisicoId` existe y pertenece
   al mismo `organizationId`.
2. **No asociado a otro comprobante CONTABILIZADO**: un documento físico
   no puede estar referenciado por dos comprobantes contabilizados
   simultáneamente (doble registro).
3. **Compatibilidad de contacto (a definir)**: si el documento físico
   tiene un `contactoId`, ¿debe coincidir con algún `contactoId` de las
   líneas del comprobante? Pregunta abierta.
4. **Compatibilidad de monto (a definir)**: ¿debe el `monto` del
   documento físico cuadrar con el total del comprobante? Pregunta abierta.

No hay validación de suma monetaria documentos vs líneas hoy en el código
existente.

---

## 4. Estado de facturas

**No existe ningún directorio `backend/src/facturas/` ni equivalente.**
No existe modelo `Factura` en el schema.

La decisión arquitectural del usuario establece una tabla `Factura`
separada con relación 1:1 opcional con `DocumentoFisico` cuando
`TipoDocumentoFisico.esTributario = true`. Esto arrancaría completamente
desde cero.

`docs/claude/dominio-contable.md` (§71-78) describe los invariantes de
documentos tributarios: unicidad por `(tenantId, tipo, nitEmisor, numero,
fecha)`, validación de NIT, IVA 13%, IT 3%. Esta lógica NO está
implementada.

La separación `Factura` (tributario) vs `DocumentoFisico` (no tributario)
es arquitecturalmente correcta porque los invariantes son distintos:
`Factura` requiere NIT, cálculo de IVA, unicidad por 4 campos; un recibo
de caja no tiene NIT ni IVA.

---

## 5. Permisos RBAC

### Permisos actuales relacionados en `catalogo.ts`

El catálogo actual tiene estos permisos contables relevantes:
- `contabilidad.asientos.{read, create, update, delete, post, void}`
- `contabilidad.compras.{read, create, update, delete, post, void}`
- `contabilidad.ventas.{read, create, update, delete, post, void}`

**Observación importante**: los permisos `contabilidad.contactos.*`
(documentados en `docs/disenos/contactos.md` §6.1) NO están en
`catalogo.ts` a la fecha. Fueron agregados al seed (commit 5 de
contactos: `46f51cd`) pero aún no al catálogo TypeScript. Esto es
una deuda pendiente del slice 1 de Fase 1.4.

### Permisos nuevos propuestos para `documento-fisico`

(Para evaluación en el proposal — no son decisiones finales.)

```
contabilidad.documentos-fisicos.read
contabilidad.documentos-fisicos.create
contabilidad.documentos-fisicos.update
contabilidad.documentos-fisicos.delete
```

Si se implementa `TipoDocumentoFisico` como configurable per-tenant,
necesitaría permisos de administración separados:

```
contabilidad.tipos-documento.read
contabilidad.tipos-documento.create
contabilidad.tipos-documento.update
contabilidad.tipos-documento.delete
```

Si `Factura` tiene flujo propio (registrar, contabilizar, anular):

```
contabilidad.facturas.read
contabilidad.facturas.create
contabilidad.facturas.update
contabilidad.facturas.void
```

---

## 6. Fricciones y deudas

### Seed inicial de `TipoDocumentoFisico`

Hoy no existe ningún seed de tipos. Al crear una organización, ¿qué tipos
de documento físico tiene disponibles? Las opciones son:

- **Universal**: todos los tenants arrancan con los mismos tipos básicos
  (Factura, Recibo, Nota de Entrega, Vale, Letra de Cambio). Simple pero
  inflexible.
- **Por tipo de empresa**: una empresa COMERCIAL necesita tipos distintos
  a una AGROPECUARIA. Hay algo de lógica aquí (avicultores usan
  "Liquidación de Compra" para productores primarios), pero multiplica
  la complejidad del seed sin certeza de que los contadores lo necesiten.
- **Vacío + onboarding manual**: el admin configura los tipos al provisionar.
  Cero asunciones, máxima fricción inicial.

Solo existe seed para plan de cuentas COMERCIAL. Los otros 7 tipos de
empresa no tienen seed. Si los tipos de documento van por `tipoEmpresa`,
la misma deuda de seed se duplica.

### Política de PATCH/DELETE de `DocumentoFisico` vs anulación

El invariante dice "anular Comprobante → desasocia DocumentosFisicos (no
los borra)". Pero no dice qué pasa si:

- Se intenta eliminar un `DocumentoFisico` que está asociado a un
  comprobante CONTABILIZADO. ¿Se bloquea? (patrón FK Restrict). ¿Se
  permite si se desasocia primero?
- Se intenta editar el `numero` de un `DocumentoFisico` ya usado en
  un comprobante CONTABILIZADO. ¿Es inmutable?
- Un `DocumentoFisico` puede tener estado propio (pendiente /
  contabilizado / anulado), o su estado se deriva únicamente del
  comprobante al que está asociado.

Estos casos necesitan política explícita antes de la implementación.

### Migración de datos existentes

No hay datos reales de producción. No hay `documentoFisicoId` en ninguna
tabla existente. La migración es aditiva: nuevas tablas + posiblemente
nueva columna en `Comprobante` o tabla de asociación. No hay riesgo de
migración destructiva.

Si la relación es 1:N (un comprobante → N documentos), la mejor opción
es una tabla de asociación `ComprobanteDocumentoFisico(comprobanteId,
documentoFisicoId)` con UNIQUE en ambos extremos para evitar duplicados.
Si es 1:1, basta con `documentoFisicoId` FK opcional en `Comprobante`.

---

## 7. UX — ¿Cómo se cargará el documento físico?

**Hipótesis de trabajo (sin decidir)**: el flujo más natural para un
contador boliviano es cargar el documento físico **antes** o
**simultáneamente** con el comprobante, no después.

Razón: el contador tiene el papel físico en mano (recibo, factura,
vale). Lo que hace en el sistema es registrar ese papel. Si el flujo
exige primero crear el comprobante y después asociar el documento, hay
dos pasos donde hoy el contador espera uno. Además, en el flujo de
compras/ventas de Fase 1.5, el documento tributario (factura) será el
punto de entrada, no el comprobante.

Esto sugiere dos patrones posibles:

1. **`POST /documentos-fisicos` standalone** + endpoint de asociación
   `POST /comprobantes/:id/documentos-fisicos/:docId`. El documento
   existe independientemente y se asocia al comprobante cuando se
   contabiliza.

2. **Inline en `CreateComprobanteDto`**: el borrador ya puede llevar
   `documentosFisicosIds: string[]` (referencias a documentos ya
   creados) o `documentosFisicos: CreateDocumentoFisicoDto[]` (inline).

La opción 1 da más flexibilidad y es consistente con el invariante "un
documento puede existir sin comprobante". La opción 2 es más conveniente
en UI pero complica el DTO. Lo más probable es que se necesiten ambas:
el endpoint standalone para gestión y el campo en el DTO para flujos
integrados.

La respuesta definitiva depende de cómo se diseñe la UX del formulario
de comprobantes, que está pendiente.

---

## 8. Preguntas para `sdd-propose`

1. **Cardinalidad comprobante ↔ documento físico**: ¿es 1:1 (FK en
   `Comprobante`) o 1:N (tabla de asociación)? El invariante dice 0..N
   pero necesita confirmación del caso real: ¿hay comprobantes que
   agrupan múltiples facturas?

2. **¿El número de `DocumentoFisico` admite letras o solo dígitos?**
   Ej: "A-001", "FC-2026-0042" vs "42". En Bolivia los talonarios de
   recibos suelen tener prefijos alfanuméricos.

3. **¿`monto` del `DocumentoFisico` es obligatorio o opcional?** Si es
   obligatorio, ¿en qué moneda? Si la validación de monto vs comprobante
   es explícita, el monto es requerido. Si solo es informativo, puede
   ser opcional.

4. **¿El número es inmutable una vez creado?** Si hay un comprobante
   CONTABILIZADO que lo referencia, cambiar el número es análogo a
   cambiar el número de una factura — debería ser inmutable. ¿Se permite
   editar antes de ser referenciado?

5. **¿Qué tipos de documento físico arrancan en seed?** ¿Son universales
   (igual para todos los tenants) o dependen de `tipoEmpresaPrincipal`?
   ¿Qué 5-8 tipos son el mínimo viable para una avicultura boliviana?

6. **¿`Factura` se implementa en este mismo slice o es un slice
   separado?** La relación 1:1 `Factura ↔ DocumentoFisico` añade
   complejidad (NIT, IVA, IT). ¿El slice 2 cubre ambos o solo el
   documento físico no-tributario?

7. **¿Cómo se gestiona la desasociación al anular un comprobante?**
   El invariante dice "se desasocian, no se eliminan". ¿La reversión
   (comprobante AJUSTE) re-asocia automáticamente los mismos documentos,
   o quedan libres para re-asignar manualmente?

8. **¿Un `DocumentoFisico` puede estar asociado a múltiples comprobantes
   simultáneamente?** La regla de unicidad `(tenantId, tipoDocumentoId,
   numero)` lo hace único como entidad, pero ¿puede aparecer en el
   borrador de dos comprobantes a la vez? ¿Solo uno puede estar
   CONTABILIZADO?

9. **¿La validación de `DocumentoFisico` al contabilizar verifica que
   el contacto del documento coincide con algún contacto de las líneas?**
   En el caso de una factura de proveedor, el NIT del emisor debería
   coincidir con el contacto referenciado en la línea de cuentas por
   pagar.

10. **¿Qué permisos necesita `TipoDocumentoFisico`?** Si es solo
    configurable por OWNER/ADMIN, podría estar bajo
    `contabilidad.configuracion.*`. Si el contador también puede
    administrarlo, necesita permisos propios.

---

## Hallazgos críticos (resumen)

- `LineaComprobante.documentoFisicoId` **NO existe** en el schema actual.
  El campo forward-compat mencionado en el input del orchestrator no fue
  incluido en Fase 1.3. Arranca desde cero con diseño libre.
- Ningún modelo de `DocumentoFisico`, `TipoDocumentoFisico` ni `Factura`
  existe en el schema ni en el código fuente.
- El catálogo de permisos (`catalogo.ts`) tampoco tiene los permisos de
  `contactos` que el slice 1 debería haber agregado — pequeña deuda que
  conviene cerrar en este slice también.
- El patrón de `ContactosReaderPort` es el modelo exacto a seguir para
  el reader port cross-módulo de documentos físicos.
- Solo hay seed de plan de cuentas para tipo `COMERCIAL`; los otros 7
  tipos de empresa son deuda pendiente que podría agravar si los tipos
  de documento físico también dependen de `tipoEmpresa`.
