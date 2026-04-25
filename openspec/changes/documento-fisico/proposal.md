# Proposal: documento-fisico

> Fecha: 2026-04-25
> Fase: proposal
> Slice: 2 de Fase 1.4
> Proyecto: avicont

---

## Why

Hoy el comprobante contable existe como entidad independiente del papel físico
que lo respalda. El contador boliviano trabaja al revés: tiene en mano un
recibo, factura o vale, y su trabajo es **registrar ese papel** dentro del
sistema contable. Sin un modelo de `DocumentoFisico` el sistema obliga al
contador a inventar una equivalencia mental entre el papel y el comprobante,
sin trazabilidad bidireccional ("¿qué papel respalda este asiento?", "¿este
recibo ya fue contabilizado o sigue en el folder?").

Este slice cierra esa brecha: introduce el dominio de documentos físicos,
permite cargarlos antes o junto con su comprobante, deja constancia de la
asociación N:N en sentido lógico (un comprobante respalda con 0..N papeles),
y prepara el terreno para `Factura` (slice tributario) y para LCV (slice 4),
que dependen de tener documentos formalmente registrados con su número y
tipo. Sin este slice, los siguientes están bloqueados.

---

## What Changes

- Nuevo módulo hexagonal `documentos-fisicos` (estructura completa: domain /
  ports / adapters / dto / service / controller / module) siguiendo el patrón
  de `contactos`.
- Nuevo módulo hexagonal `tipos-documento-fisico` (catálogo configurable
  per-tenant del tipo de papel: factura, recibo de ingreso, recibo de egreso,
  vale, nota crédito/débito, comprobante interno).
- Migración Prisma que agrega:
  - Modelo `TipoDocumentoFisico` (per-tenant, con flag `esTributario` y
    array `tiposComprobanteAplicables: TipoComprobante[]` para el filtro
    de compatibilidad tipo documento ↔ tipo comprobante — ver Decisión 11).
  - Modelo `DocumentoFisico` (cabecera del papel: número, fecha emisión,
    monto **nullable**, moneda **nullable**, contacto, tipo, organización
    — ver Decisión 4 actualizada).
  - Tabla de asociación `ComprobanteDocumentoFisico` (N:N a nivel
    cabecera de comprobante, NO a nivel línea — ver Decisión 8).
- Reader port cross-módulo `TIPOS_DOCUMENTO_FISICO_READER_PORT` (consumido
  por `documentos-fisicos`) y `DOCUMENTOS_FISICOS_READER_PORT` (consumido por
  `comprobantes` para validar al contabilizar).
- Endpoints REST en español: `/api/documentos-fisicos`,
  `/api/tipos-documento-fisico`. Endpoints de asociación viven bajo
  `/api/comprobantes/:id/documentos-fisicos`.
- Permisos RBAC nuevos en `catalogo.ts` (ver Decisión 7), incluido el
  cierre oportunístico de la deuda `contabilidad.contactos.*`.
- Seed mínimo de `TipoDocumentoFisico` ejecutado al crear la organización
  (8 tipos universales, ver Decisión 6). Idempotente.
- Wire-up con `comprobantes`: validación al contabilizar de que cada
  `documentoFisicoId` referenciado existe, pertenece al tenant, y no está
  ya asociado a otro comprobante CONTABILIZADO. Al asociar un
  `DocumentoFisico` a un `Comprobante`, se valida que el tipo de documento
  sea compatible con el tipo del comprobante (ver Decisión 11).
- **NO** se agrega `LineaComprobante.documentoFisicoId`. La asociación es
  cabecera-cabecera, no línea-cabecera (ver Decisión 8 — esto contradice
  explícitamente la nota de "forward-compat" que algunos docs anteriores
  insinuaban).

---

## Scope

### In scope

- CRUD completo de `DocumentoFisico`: crear, listar (con filtros tipo,
  fecha, contacto, asociación), ver, editar (mientras no esté asociado a
  CONTABILIZADO), eliminar (solo si nunca se asoció a un comprobante).
- CRUD de `TipoDocumentoFisico` per-tenant (admin del tenant configura su
  catálogo, partiendo del seed inicial).
- Asociación y desasociación entre `Comprobante` y `DocumentoFisico` vía
  endpoints explícitos. La asociación se registra en una tabla intermedia
  con `organizationId` denormalizado.
- Validaciones al contabilizar (cabecera): existencia, pertenencia al
  tenant, no asociado a otro comprobante CONTABILIZADO.
- Política de inmutabilidad: documento físico asociado a comprobante
  CONTABILIZADO es **inmutable** en sus campos clave (número, fecha,
  monto, tipo, contacto). Editable mientras solo esté asociado a
  comprobantes BORRADOR o no asociado.
- Política de eliminación: eliminable solo si nunca se asoció a ningún
  comprobante. Si alguna vez tuvo asociación (incluso a BORRADOR ya
  borrado), permanece — no soft-delete, no DELETE físico.
- Desasociación al anular comprobante: el comprobante en estado ANULADO
  deja huérfanos los `DocumentoFisicoId` referenciados; quedan disponibles
  para re-asociar.
- Permisos RBAC nuevos + cierre de la deuda `contabilidad.contactos.*` en
  `catalogo.ts`.
- Seed inicial de tipos universales (8 tipos) al crear la organización.
- Tests: unit (validators, service), integración (repositories), E2E
  (flujos completos crear/asociar/contabilizar/anular).

### Out of scope (defer)

- **Tabla `Factura` y todos sus invariantes** (NIT emisor/receptor,
  IVA 13%, IT 3%, unicidad por 4 campos, alícuotas, exenciones). Va al
  slice 3 de Fase 1.4 — `factura` — porque añade un dominio tributario
  completo: validaciones de NIT, redondeos específicos, multi-moneda con
  IVA, código de control. Mezclarlo con este slice duplica el alcance.
  Este slice deja la base preparada: `TipoDocumentoFisico.esTributario`
  ya existe como flag, y `DocumentoFisico` tendrá relación 1:1 opcional
  con la futura `Factura` por id.
- **LCV (Libro Compras y Ventas)** — slice 4. Depende de `Factura`.
- **Integración con SIN** (CUF, CUFD, validación online de NIT, envío
  del LCV). Fuera de scope total del producto (CLAUDE.md §10.9).
- **Carga inline de `DocumentoFisico` desde `CreateComprobanteDto`**
  (es decir, crear documento físico y asociarlo en una sola llamada).
  La operación se hace en dos pasos: `POST /documentos-fisicos` →
  `POST /comprobantes/:id/documentos-fisicos`. El front-end puede
  orquestar ambos en un mismo formulario, pero el backend mantiene
  endpoints atómicos. Inline complica el DTO, los errores parciales y
  la auditoría — y puede agregarse después sin breaking change si se
  comprueba que la UX lo necesita.
- **Validación cruzada contacto-documento vs contacto-línea** del
  comprobante. Pregunta abierta del explore §8.9 — se difiere a fase
  spec del slice `factura`, donde la regla cobra sentido (proveedor de
  factura recibida = contacto de cuenta por pagar). Hoy se valida solo
  existencia y pertenencia al tenant.
- **Validación cruzada de monto documento vs total comprobante**.
  Mismo argumento: cobra sentido en `factura` (subtotal + IVA = total
  monto del documento). Hoy es informativo.
- **Estado propio del `DocumentoFisico`** (PENDIENTE / CONTABILIZADO /
  ANULADO como enum derivado). El estado se deriva en runtime de la
  asociación con su(s) comprobante(s); no se persiste como columna.
  Si más adelante hace falta un estado materializado para queries
  rápidas, se agrega después.
- **Seed per-`tipoEmpresaPrincipal`** de tipos de documento. Universal
  (Decisión 6). Si más adelante se ve que avicultores/transportistas
  necesitan tipos distintos (ej. "Liquidación de Compra"), se agrega
  como deuda.

---

## Decisiones clave del proposal

### Decisión 1: Tabla `Factura` separada vs flag/enum en `DocumentoFisico`

**Decisión**: Tabla `Factura` separada, en relación 1:1 opcional con
`DocumentoFisico` cuando `tipoDocumentoFisico.esTributario = true`.
Implementación de `Factura` queda fuera de este slice — solo se diseña
el contrato y el flag que la anticipa.

**Rationale**: los invariantes de un documento tributario (NIT emisor
y receptor, IVA 13%, IT 3%, unicidad por 4 campos `(tenantId, tipo,
nitEmisor, numero, fecha)`, código de control, dosificación) son
sustancialmente distintos a los de un recibo de caja (solo número y
monto). Mezclar ambos en una sola tabla obliga a 7-8 columnas sparse
nullables con validaciones condicionales que dependen del tipo. El
patrón "tabla separada con FK opcional" aísla la complejidad
tributaria, permite extender `Factura` con campos del SIN sin tocar
`DocumentoFisico`, y prepara el LCV (que itera solo sobre `Factura`).

**Tradeoff**: costo: 2 tablas + JOIN cuando el contador necesita ver
un documento tributario completo (un endpoint que combine ambos en
respuesta). Beneficio: aislamiento, claridad de invariantes, libertad
para crecer `Factura` con campos SIN futuros sin migration de impacto.

### Decisión 2: Cardinalidad Comprobante ↔ DocumentoFisico

**Decisión**: **N:M lógica vía tabla de asociación
`ComprobanteDocumentoFisico`** (`comprobanteId`, `documentoFisicoId`,
`organizationId` denormalizado, `createdAt`), con un constraint adicional
parcial que permite "asociado a UN comprobante CONTABILIZADO a la vez"
pero "asociado a múltiples BORRADORES en simultáneo". Implementado vía
unique index parcial `WHERE comprobante.estado = 'CONTABILIZADO'`.

**Rationale**: el invariante explícito (regla 5) dice "un Comprobante
puede referenciar 0..N DocumentosFisicos" — eso impone N a 1 desde el
lado comprobante. La pregunta inversa es: ¿un mismo `DocumentoFisico`
puede aparecer en 2 comprobantes a la vez? La realidad contable: un
papel físico respalda **un** asiento contabilizado. Pero antes de
contabilizar, el contador puede estar comparando dos borradores
distintos donde cita el mismo recibo. Bloquear esa flexibilidad en
borrador es fricción innecesaria. La regla dura es: **a lo sumo un
comprobante CONTABILIZADO por documento físico**, no "a lo sumo un
comprobante en cualquier estado".

Tabla de asociación (vs FK directa en `Comprobante`) gana porque:
- Permite la cardinalidad N:M lógica con el constraint parcial.
- Mantiene auditoría simple (un `INSERT` / `DELETE` por asociación,
  sin `UPDATE` de columnas que vienen y van).
- Si en el futuro se necesita atributos de la asociación (orden,
  porcentaje de respaldo, nota), no requiere migration disruptiva.

**Tradeoff**: tabla extra + un JOIN. Con índices `(comprobanteId)` y
`(documentoFisicoId)` el costo es despreciable. Alternativa descartada
(`DocumentoFisico.comprobanteId` FK opcional) implicaría 1:N estricta
y bloquearía el caso "documento citado en dos borradores comparativos".

### Decisión 3: Numeración del DocumentoFisico — formato libre vs estructurado

**Decisión**: `numero String` con regla de validación: **trim + uppercase
en el value object**, longitud `1..50` chars, regex `^[A-Z0-9./-]+$`.
UNIQUE per `(tenantId, tipoDocumentoId, numero)`.

**Rationale**: la realidad boliviana es heterogénea — talonarios oficiales
suelen ser numéricos (`1234`, `0001234`); talonarios físicos privados
tienen prefijos (`A-001`, `FC-2026-0042`); algunos sistemas legacy usan
`/` como separador. Forzar solo dígitos rompe el caso de talonarios con
prefijo; aceptar Unicode arbitrario abre la puerta a homoglyphs y bugs
de unicidad. El conjunto `[A-Z0-9./-]` cubre el 99% de los casos reales
y es ASCII-safe. La normalización (trim + uppercase) en el value object
elimina ambigüedades por capitalización ("a-001" vs "A-001").

**Tradeoff**: rechazamos números con espacios o letras minúsculas
intencionales. Si aparece un caso real, se relaja la regex. Cero costo
en migration porque la normalización persiste el formato canónico.

### Decisión 4: Monto y moneda en DocumentoFisico — condicionales según esTributario

**Decisión**: `monto Decimal? @db.Decimal(18, 2)` **nullable** en schema,
`moneda Moneda?` **nullable** en schema (sin default). La obligatoriedad
se valida en el servicio según `tipo.esTributario`:

- Si `tipo.esTributario = true` (Factura emitida, Factura recibida, Nota
  de crédito emitida, Nota de débito emitida): `monto` y `moneda` son
  **OBLIGATORIOS**. Si vienen `null`, error 422
  `DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO`.
- Si `tipo.esTributario = false` (Recibo de ingreso/egreso, Comprobante
  interno, Vale de caja chica): `monto` y `moneda` deben ser **NULL**. Si
  llegan con valor, error 422
  `DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO`.

Sin `tipoCambio` en este slice (se agrega cuando llegue `Factura` y
multi-moneda real con LCV).

**Rationale**: el documento físico no-tributario es solo una referencia
al papel del talonario — un "puntero" al papel físico que confirma la
operación. El monto de un recibo de egreso o un comprobante interno
vive en el `Comprobante` contable (sus líneas y totales). Duplicar el
monto en el documento físico no-tributario viola el principio de
single source of truth: si el comprobante se edita o anula, el monto
del documento ya no refleja la realidad.

Para documentos tributarios (facturas, notas de crédito/débito), la
situación es diferente: el papel impreso tiene un monto total explícito
que el contador verifica físicamente. Ese monto es el total del papel
(neto + IVA + IT), distinto de cualquier descomposición contable. El
LCV suma por `Factura`, no por `DocumentoFisico` directamente, pero
en slice 3 `Factura` hereda `DocumentoFisico.monto` como el total
del comprobante fiscal.

**Tradeoff**: la validación condicional es más compleja que "siempre
obligatorio". Costo: validación en service con bifurcación según
`esTributario`. Beneficio: modelo semántico correcto, sin datos
espurios en documentos no-tributarios, single source of truth para
montos operativos.

### Decisión 5: Edición / Eliminación de DocumentoFisico

**Decisión**: política de mutabilidad alineada con CLAUDE.md §4.7
(no soft-delete en contabilidad):

- **Editable** (PATCH parcial: número, fecha, monto, moneda, contacto,
  tipo, glosa) **mientras no esté asociado a ningún comprobante en
  estado CONTABILIZADO**. Estar asociado solo a BORRADORES no impide
  editar.
- **Inmutable** desde el primer instante en que se asocia a un
  comprobante CONTABILIZADO. Cualquier intento de PATCH retorna
  `DOCUMENTOS_FISICOS_INMUTABLE_POR_COMPROBANTE_CONTABILIZADO`.
- **Eliminable** (DELETE físico) **solo si nunca tuvo ninguna
  asociación, ni siquiera con borrador**. Una vez referenciado por
  cualquier comprobante (aunque ese comprobante después se borre o
  anule), el documento físico **queda en BD permanentemente**. Esto
  preserva la trazabilidad histórica.
- **Anular comprobante** (estado ANULADO): rompe la asociación del
  documento físico con ese comprobante (DELETE en `ComprobanteDocumentoFisico`),
  pero el `DocumentoFisico` **persiste**. Queda disponible para
  re-asociarlo a un nuevo comprobante (típicamente un comprobante de
  AJUSTE que reemplaza al anulado).

**Rationale**: replica el comportamiento de la contabilidad real — el
papel sigue existiendo aunque el asiento se haya hecho mal y se anule.
"Mientras está suelto, lo puedo corregir; cuando ya está contabilizado,
es histórico." Cero soft-delete (cumple §4.7).

**Tradeoff**: registro permanente de documentos huérfanos creados por
error. Mitigación: si la auditoría detecta documentos creados nunca
asociados, el admin del tenant decide. Costo: cero — son rows de una
tabla.

### Decisión 6: Catálogo TipoDocumentoFisico — seed inicial

**Decisión**: 8 tipos **universales** (no per-`tipoEmpresaPrincipal`)
sembrados al crear la organización vía hook idempotente. Tipos (con
matriz de compatibilidad — ver Decisión 11):

| `codigo` | Nombre | `esTributario` | `tiposComprobanteAplicables` |
|---|---|---|---|
| `factura-emitida` | Factura emitida | `true` | `[INGRESO, DIARIO]` |
| `factura-recibida` | Factura recibida | `true` | `[EGRESO, DIARIO]` |
| `nota-credito-emitida` | Nota de crédito (emitida) | `true` | `[EGRESO, AJUSTE, DIARIO]` |
| `nota-debito-emitida` | Nota de débito (emitida) | `true` | `[INGRESO, AJUSTE, DIARIO]` |
| `recibo-ingreso` | Recibo de ingreso | `false` | `[INGRESO, DIARIO]` |
| `recibo-egreso` | Recibo de egreso | `false` | `[EGRESO, DIARIO]` |
| `comprobante-interno` | Comprobante interno | `false` | `[APERTURA, DIARIO, INGRESO, EGRESO, AJUSTE, TRASPASO, CIERRE]` |
| `vale-caja-chica` | Vale de caja chica | `false` | `[EGRESO, DIARIO]` |

Todos editables y desactivables por el admin del tenant. NO eliminables
si tienen documentos asociados (FK Restrict).

**Rationale**: el subset universal cubre el 95% de operaciones contables
en cualquier rubro boliviano. La flexibilidad por `tipoEmpresa` es deuda
diferida — no hay evidencia hoy de que un avicultor (AGROPECUARIA)
necesite tipos distintos a un comerciante. Si aparece "Liquidación de
Compra" como caso real, el admin lo crea manualmente. Cero deuda
agregada al seed (que ya tiene la deuda pendiente del plan de cuentas
para 7 tipos de empresa).

**Tradeoff**: descartamos seed especializado por rubro hoy. Beneficio:
seed simple, único, mantenible. Costo: admins de rubros nicho hacen
2-3 clics extra para crear sus tipos custom.

### Decisión 7: Permisos RBAC nuevos

**Decisión**: agregar al catálogo (`backend/src/common/permisos/catalogo.ts`):

```
contabilidad.documentos-fisicos.read
contabilidad.documentos-fisicos.create
contabilidad.documentos-fisicos.update
contabilidad.documentos-fisicos.delete

contabilidad.tipos-documento-fisico.read
contabilidad.tipos-documento-fisico.create
contabilidad.tipos-documento-fisico.update
contabilidad.tipos-documento-fisico.delete
```

Y **cerrar oportunísticamente** la deuda del slice 1:

```
contabilidad.contactos.read
contabilidad.contactos.create
contabilidad.contactos.update
contabilidad.contactos.delete
```

(Estos últimos están en el seed pero NO en `catalogo.ts` — confirmado
en explore §5.)

**Rationale**: módulos distintos → submódulos distintos en el catálogo.
`tipos-documento-fisico` es admin-flavor (configura el catálogo del
tenant) y `documentos-fisicos` es operativo (carga diaria del contador),
los roles típicos los asignan distinto: OWNER/ADMIN para tipos, OWNER/ADMIN/
CONTADOR para documentos. La separación lo hace explícito.

NO se separan permisos para asociar/desasociar documentos al comprobante:
esa operación cae bajo `contabilidad.asientos.update` (modificás un
borrador) o `contabilidad.asientos.post` (al contabilizar valida la
asociación). El permiso de `documentos-fisicos.update` sí es necesario
si se quiere desasociar desde el lado del documento.

**Tradeoff**: 8 permisos nuevos + 4 que cierran deuda. Beneficio: el
RBAC queda al día con el código antes de que la deuda se acumule.

### Decisión 8: Wire-up con comprobantes — asociación a NIVEL CABECERA, no línea

**Decisión**: la asociación entre `Comprobante` y `DocumentoFisico` vive
en una **tabla intermedia `ComprobanteDocumentoFisico`** que referencia
al comprobante por su `id` (cabecera), NO al `LineaComprobante`. El
schema **NO** agrega `LineaComprobante.documentoFisicoId`.

**Rationale**: la regla 5 explícita dice "un Comprobante puede referenciar
0..N DocumentosFisicos" — singular Comprobante, plural DocumentosFisicos.
Eso es asociación cabecera. Reforzando con el caso real: un asiento de
venta tiene típicamente 3 líneas (CuentaCliente DR, VentaIVA13 CR, IVA
débito CR), y las TRES líneas respaldan UNA factura. Asociar el documento
a una sola línea es semánticamente arbitrario; replicarlo a las 3 líneas
es redundancia. La asociación pertenece al comprobante.

Esto **contradice explícitamente** la nota de "forward-compat" insinuada
en `docs/disenos/comprobantes-asientos.md` §12.3 que sugería un campo
`LineaComprobante.documentoFisicoId`. **Hallazgo crítico del explore §1**:
ese campo nunca se agregó al schema en Fase 1.3, y este proposal confirma
que **NO debe agregarse**. La asociación correcta es cabecera-cabecera.

**Acción**: cuando se actualicen los docs de diseño post-archive, retirar
o aclarar la nota de comprobantes-asientos.md §12.3.

**Tradeoff**: descartamos granularidad línea-documento (ej. "esta línea
de costo respalda con esta factura, esta otra con otra"). Si emerge ese
caso (puede pasar en compras agregadas: una compra de varios items con
facturas separadas), se agrega `LineaComprobante.documentoFisicoId` como
**campo opcional adicional** sin remover la tabla cabecera. Pero hoy no
hay evidencia.

### Decisión 9: Endpoints de asociación

**Decisión**: el ciclo de vida de la asociación se expone en endpoints
explícitos bajo el comprobante:

```
POST   /api/comprobantes/:comprobanteId/documentos-fisicos
       body: { documentoFisicoIds: string[] }
DELETE /api/comprobantes/:comprobanteId/documentos-fisicos/:documentoFisicoId
GET    /api/comprobantes/:comprobanteId/documentos-fisicos    (lista los asociados)
```

NO se acepta inline en `CreateComprobanteDto`. El front hace dos llamadas
secuenciales o usa un patrón optimista.

**Rationale**: separar la asociación del payload del comprobante mantiene
DTOs limpios, errores parciales claros (si falla la asociación pero el
borrador ya existe, el contador sabe qué corregir), y auditoría nítida
(cada asociación es un evento INSERT/DELETE).

**Tradeoff**: el front hace 2 calls en lugar de 1 al crear "todo de una".
Mitigación: el patrón es trivial en React (Promise.all o cadena), y el
slice de comprobantes ya soporta crear borrador vacío y editarlo.

### Decisión 10: Reader port consumido por `comprobantes`

**Decisión**: `documentos-fisicos` expone dos métodos en
`DOCUMENTOS_FISICOS_READER_PORT`:

1. `obtenerBatchParaAsociar(tenantId, ids[], tx?)` → `Map<string,
   DocumentoFisicoParaAsociar>` — usado al **asociar** documentos a un
   comprobante. Devuelve existencia + pertenencia al tenant +
   `tiposComprobanteAplicables` (para validar compatibilidad de tipo —
   Decisión 11) en una sola query.

2. `idsYaAsociadosAContabilizado(tenantId, ids[], excluyendoComprobanteId,
   tx?)` → `string[]` — usado al **contabilizar**. Devuelve los ids que ya
   están asociados a OTRO comprobante CONTABILIZADO distinto (pre-validación
   UX antes del UPDATE que activa el UNIQUE PARCIAL).

**Rationale**: copia el patrón de `CONTACTOS_READER_PORT.obtenerBatch` ya
probado. Una sola query batched evita N+1 al contabilizar comprobantes con
varios documentos. El parámetro `tx?` permite participar de la TX del
contabilizar para aislamiento contra modificación concurrente del
documento físico (consistente con CLAUDE.md §4.4 cicatriz F-03).

**Tradeoff**: ninguno relevante — es el patrón establecido del proyecto.

**Impacto de Decisión 11**: el shape de retorno `DocumentoFisicoParaAsociar`
(nombre actualizado — ver D11) incluye `tiposComprobanteAplicables:
TipoComprobante[]` para que el service de comprobantes pueda validar la
compatibilidad sin un segundo query al asociar.

### Decisión 11: Filtro de compatibilidad tipo documento ↔ tipo comprobante

**Decisión**: agregar campo `tiposComprobanteAplicables: TipoComprobante[]`
en `TipoDocumentoFisico` (array nativo de enum Postgres). Lista **explícita
siempre** — array vacío `[]` significa que el tipo no aplica a ningún
comprobante (no es un wildcard). Al asociar un `DocumentoFisico` a un
`Comprobante`, el service verifica que
`documento.tipoDocumentoFisico.tiposComprobanteAplicables.includes(comprobante.tipo)`;
si no, error 422 `TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE`.

**Rationale**: sin este filtro, el contador puede equivocarse y asociar una
"Factura emitida" a un comprobante de tipo EGRESO (que es semánticamente
un pago, no una venta). El tipo del comprobante define la naturaleza del
movimiento contable; el tipo del documento físico debe ser coherente con
esa naturaleza. La lista explícita por tipo es mantenible y auditable: el
admin del tenant la ve en la UI y puede ajustarla si el negocio lo requiere.
Array vacío = tipo desactivado para todos los flujos de asociación (el admin
lo usa cuando quiere impedir que un tipo legacy se asocie a comprobantes
nuevos sin eliminarlo).

**Defense in depth**: el frontend filtra el combobox de documentos físicos
al seleccionar uno para un comprobante (UX — evita que el contador vea
opciones incompatibles). El backend SIEMPRE valida al ejecutar el `POST
/api/comprobantes/:id/documentos-fisicos` (seguridad — el frontend puede
estar desactualizado o ser reemplazado por llamadas directas a la API).

**Nuevo error code**: `TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE` (422).
Mensaje sugerido: "El tipo de documento '<nombre>' no es aplicable a
comprobantes de tipo <tipo>. Tipos permitidos: <lista>."

**Tradeoff**: el admin del tenant debe mantener la lista actualizada si
agrega tipos custom. Costo bajo: es una sola columna array en el catálogo,
ya editable vía PATCH sobre `TipoDocumentoFisico`. Beneficio: errores de
asociación semánticamente incorrecta quedan imposibles en flujo normal.

---

## Affected Modules

| Módulo | Tipo de cambio | Blast radius |
|---|---|---|
| `documentos-fisicos` (nuevo) | Módulo completo nuevo | Estructura hexagonal completa: domain (errors, validator), ports (repository, reader), adapters (Prisma), dto (4-5), service, controller, module + tests (~80 tests estimados). Reader port `DOCUMENTOS_FISICOS_READER_PORT` expone shape `DocumentoFisicoParaAsociar` con `tiposComprobanteAplicables: TipoComprobante[]` incluido (Decisión 11). |
| `tipos-documento-fisico` (nuevo) | Módulo completo nuevo | Estructura más liviana (catálogo simple): domain, ports, adapters, dto, service, controller, module + tests (~40 tests estimados). Campo `tiposComprobanteAplicables TipoComprobante[]` en schema y seed. |
| `comprobantes` | Modificación | Service inyecta `DOCUMENTOS_FISICOS_READER_PORT`; valida al contabilizar (post) y al asociar (compatibilidad tipo D11). Nuevos endpoints `/comprobantes/:id/documentos-fisicos`. Hook al anular: borra asociaciones. Nuevos errores en `comprobante-errors.ts` (`DocumentoFisicoReferenciadoNoExisteError`, `DocumentoFisicoYaAsociadoAOtroComprobanteContabilizadoError`, `TipoDocumentoIncompatibleConComprobanteError`). |
| `prisma/schema.prisma` | Migration aditiva | 3 modelos nuevos: `TipoDocumentoFisico` (con `tiposComprobanteAplicables TipoComprobante[]`), `DocumentoFisico` (con `monto Decimal?` y `moneda Moneda?` nullables), `ComprobanteDocumentoFisico`. Sin cambios en `LineaComprobante`. Sin tabla `Factura` todavía. |
| `prisma/seeds/prod` | Seed nuevo | `tipos-documento-fisico.seed.ts` con 8 tipos universales. Hook idempotente al crear organización (en el flujo de `Organization.create`). |
| `common/permisos/catalogo.ts` | Adición | 8 permisos nuevos + 4 permisos retroactivos de `contactos`. |
| `organizations` (módulo existente) | Hook | El flujo de creación de organización dispara el seed de tipos universales. |
| `rbac` | Sin cambios | El catálogo se actualiza solo; el resolver/cache reacciona automáticamente. |

---

## Risks & Rollback

### Riesgos

- **R1: Migration aditiva con seed dependiente**. La migration crea las
  3 tablas. El seed de tipos universales corre por organización
  existente — pero como en producción aún no hay organizaciones reales
  (Fase 1.4 todavía no en prod), esto es de bajo impacto. Mitigación:
  el seed es idempotente (`upsert` por `(organizationId, nombre)`).
- **R2: Cambio de criterio del slice tributario más adelante** —
  podríamos descubrir al implementar `Factura` que la separación 1:1
  no escala (ej. queremos un único registro tipo "Factura/Recibo
  unificado"). Mitigación: el flag `esTributario` y la separación de
  permisos hacen el cambio reversible con migration, no breaking en
  API pública (los endpoints siguen siendo `/documentos-fisicos`).
- **R3: La contradicción con `comprobantes-asientos.md` §12.3** sobre
  `LineaComprobante.documentoFisicoId` puede generar confusión a un
  dev nuevo que lea el doc viejo. Mitigación: durante el archive del
  slice, actualizar comprobantes-asientos.md para reflejar la decisión
  cabecera-cabecera (Decisión 8).
- **R4: Race en asociación concurrente al contabilizar**. Dos
  contadores simultáneos contabilizan dos comprobantes que referencian
  el mismo `DocumentoFisico`. Mitigación: el constraint UNIQUE parcial
  `(documentoFisicoId) WHERE comprobanteEstado = 'CONTABILIZADO'`
  resuelve a nivel BD; el primer INSERT gana, el segundo recibe error
  de constraint que se mapea a `DOCUMENTOS_FISICOS_YA_ASOCIADO_A_OTRO_CONTABILIZADO`.
  El reader port pre-valida con `tx?` para mejor UX (error claro antes
  del INSERT real). Patrón consistente con CLAUDE.md §4.8 (defense in
  depth: DB constraint + service guard).
- **R5: Crecimiento descontrolado de `TipoDocumentoFisico`** si los
  admins crean uno por cada matiz. Mitigación: deferida — UI mostrará
  los tipos activos primero. Si emerge como problema, agregamos límite
  o flag de auditoría.

### Rollback plan

Migration es 100% aditiva. Rollback paso a paso:

1. Drop tabla `ComprobanteDocumentoFisico` (no tiene FK desde otros
   modelos hacia adentro; solo hacia afuera).
2. Drop tabla `DocumentoFisico`.
3. Drop tabla `TipoDocumentoFisico`.
4. Revertir migration `*_add_documentos_fisicos.sql`.
5. Revertir cambios en `catalogo.ts` (permisos nuevos + permisos de
   contactos).
6. Code de los nuevos módulos se descarta con `git revert` del PR.

Sin breaking change para datos existentes (no hay datos cargados que
referencien las nuevas tablas). Sin downtime esperado más allá del
deploy estándar.

---

## Dependencias

- Contactos (slice 1 de Fase 1.4) — cerrada y mergeada. Reusamos
  `Contacto` como FK opcional en `DocumentoFisico` y el patrón de
  `ContactosReaderPort` como referencia arquitectural.
- Comprobantes (Fase 1.3) — cerrada. Reusamos el modelo `Comprobante`
  y el flujo de contabilizar/anular para integrar las validaciones.
- Períodos fiscales (Fase 1.2) — cerrada. No se toca, pero el cierre de
  período sigue mandando: no se asocian documentos a comprobantes en
  período cerrado (lo enforza el módulo `comprobantes` al contabilizar).
- RBAC (Fase 0.6) — cerrada. Solo agregamos al catálogo; no se modifica
  el resolver ni el cache.

---

## Desbloquea

- **`Factura`** (slice 3 de Fase 1.4) — depende directamente. Necesita
  `TipoDocumentoFisico.esTributario = true` y `DocumentoFisico` como
  base 1:1.
- **LCV (Libro Compras y Ventas)** (slice 4 de Fase 1.4) — depende de
  `Factura`, indirectamente de este slice.
- **Libro Mayor** (slice 5) — independiente, pero podría enriquecer
  filtros usando `tipoDocumentoFisico.nombre` como dimensión adicional.
- **Integración SIN futura** (out of scope, deferida) — la separación
  `Factura` ya prevista permite añadir CUF/CUFD/dosificación sin tocar
  `DocumentoFisico`.

---

## Cuestiones diferidas a la fase spec/design

Estas decisiones se resuelven en spec (escenarios) o design (schema
fino):

- **Validaciones detalladas del value object `NumeroDocumento`**: regex
  exacta confirmada arriba (`^[A-Z0-9./-]+$`, 1..50 chars), pero la spec
  define los escenarios edge: `   123   ` → trim → `123`; `a-001` → upper
  → `A-001`; `42` ⇄ `0042` (¿son distintos? Decisión: SÍ, son distintos
  — la unicidad es por string exacto post-normalización, alineado con
  la realidad del talonario físico).
- **Estados explícitos de `DocumentoFisico`**: ¿se materializa como
  enum o se deriva en runtime de la asociación? Decisión preliminar:
  derivado en runtime, sin columna. La spec confirma con escenarios.
- **Política exacta al anular comprobante**: ¿la asociación se borra
  inmediatamente en la TX del anular, o queda para reconciliación
  manual? Decisión preliminar: borrado inmediato en la misma TX (la
  reversión es simétrica al contabilizar).
- **Schema fino de `ComprobanteDocumentoFisico`**: índices óptimos,
  composición del UNIQUE parcial, `ON DELETE` policy del FK al
  `Comprobante` (CASCADE para que anular comprobante borre la fila).
  Va en design.
- **Hook de seed al crear organización**: ¿corre síncrono en la TX de
  `Organization.create`, o async via evento `organization.created`?
  Decisión preliminar: síncrono — el tenant nace listo para usarse.
  Va en design (riesgo de TX más larga vs simplicidad).
- **DTOs de respuesta**: nivel de embedding (¿`DocumentoFisicoResponseDto`
  embebe el `TipoDocumentoFisico` completo, solo el id, o un par
  `{id, nombre}`?). Va en spec (con escenarios HTTP).
- **Test contracts**: la lista exacta de `describe`/`it` que cubre los
  invariantes. Va en spec.

---

**Fin del proposal.**
