# Delta for Comprobante

> Origen: change `ventas-piloto`. La spec viva
> (`openspec/specs/comprobante/spec.md`, REQ-CMP-SYS-01..06) cubre
> `generadoPorSistema` para el cierre de ejercicio y queda INTACTA — este
> delta solo AGREGA: el tipo `VENTA` en el enum, los `origenTipo` `'VENTA'` y
> `'COBRO'`, el camino de escritura de sistema que Ventas necesita (D-17) y el
> backfill de `tiposComprobanteAplicables` (D-22). Brechas cubiertas: B-13.

## ADDED Requirements

### REQ-CMP-VTA-01 — Tipo `VENTA` en el enum, con serie propia (D-06, R-6)

`TipoComprobante` DEBE sumar el valor `VENTA`, prefijo `'V'` (único, una sola
letra — `TIPO_POR_PREFIJO` lo exige), con secuencia mensual propia por
`(tenantId, VENTA, year, month)` en `SecuenciaComprobante` bajo `FOR UPDATE`
(§4.9). La serie es independiente de la `I` de INGRESO.

Migraciones (R-6, receta verificada contra los 4 precedentes de `ADD VALUE`):
**enum-only escrita a mano PRIMERO**, tablas después — la migración de tablas
NO DEBE contener ningún literal `'VENTA'` (restricción de Postgres sobre
valores nuevos pre-COMMIT). Protocolo §11.6 obligatorio al regenerar: grep de
`^DROP (INDEX|EXTENSION|TYPE)` y rescate de los objetos raw vivos (los
`contactos_*_trgm_idx` caen SIEMPRE; el unique parcial de `Item.codigo` se
suma a la lista desde este change). Forward-only (Anti-22); el valor no se
puede quitar del enum y queda inerte si se abandona.

La cola del valor nuevo DEBE cubrirse completa: los `Record` exhaustivos del
backend (`PREFIJO_POR_TIPO`, `enums.ts`, `enum-mappers.ts`) los exige el
compilador; las **9 listas hardcodeadas del frontend** (medidas en R-6, no
avisan) se actualizan a mano en el mismo change.

#### Escenario: serie propia desde la primera venta

- **DADO** una organización sin ventas contabilizadas en julio 2026
- **CUANDO** se contabilizan una venta y luego un comprobante `INGRESO`
- **ENTONCES** la venta recibe `V2607-000001` y el ingreso el siguiente de SU
  serie `I2607-…` — los contadores no se cruzan

#### Escenario (−): la migración de tablas no usa el valor nuevo

- **DADO** las tres migraciones del change
- **CUANDO** se inspecciona la migración de tablas
- **ENTONCES** no contiene ningún literal `'VENTA'` (default, CHECK, backfill
  ni índice parcial) — el backfill vive en la tercera migración, data-only

### REQ-CMP-VTA-02 — `origenTipo` `'VENTA'` y `'COBRO'` como constantes (B-13, D-11, Anti-17)

Este change introduce `origenTipo = 'VENTA'` (comprobantes de venta, tipo
`VENTA`) y `origenTipo = 'COBRO'` (comprobantes de cobro, tipo `INGRESO` —
D-11: el tipo del comprobante NO identifica al cobro; el origen sí).

- El comentario-contrato de `schema.prisma` (`// "VENTA" | "COMPRA" | "PAGO" |
  NULL`) DEBE actualizarse en este mismo change para incluir `'COBRO'` y
  reflejar los valores vivos — hoy `'COBRO'` no está en la lista y se pisa
  semánticamente con `'PAGO'` (B-13).
- Los valores DEBEN usarse vía **constantes de dominio** (p. ej.
  `ORIGEN_TIPO_VENTA`), nunca literales sueltos en los call sites: son strings
  libres comparados en varios lugares y un typo es un `false` silencioso
  (Anti-09).
- Ambos generadores escriben sobre el
  `@@unique([organizationId, origenTipo, origenId])` existente con `upsert`,
  nunca `create` ciego (Anti-17, §4.9).

#### Escenario: idempotencia del auto-asiento

- **DADO** una venta cuyo generador corre dos veces
- **CUANDO** se consulta por `('VENTA', venta.id)` en la organización
- **ENTONCES** existe exactamente UN comprobante

#### Escenario: el listado distingue cobro de venta sin mirar el tipo

- **DADO** un comprobante `INGRESO` con `origenTipo = 'COBRO'` y una venta
  tipo `VENTA`
- **CUANDO** el listado de comprobantes los presenta
- **ENTONCES** el cobro se identifica por su origen, no por el tipo del
  comprobante (criterio de éxito 9)

### REQ-CMP-VTA-03 — Escritura de sistema que RE-VALIDA (D-17, D-19, B-1)

`ComprobanteWriterPort` (declarado por `ventas`/`cuentas-por-cobrar`,
implementado por `comprobantes`) DEBE ofrecer el camino de sistema que el flag
`generadoPorSistema = true` bloquea para el usuario (REQ-CMP-SYS-02/03/05
quedan intactos):

- **Regenerar líneas** de un comprobante de sistema (BORRADOR o CONTABILIZADO
  con período abierto) por la mecánica de §4.3: reemplazo de líneas en bloque,
  cabecera con su `id` y su `numero` preservados. PROHIBIDO el patrón del
  cierre de ejercicio (delete + create del comprobante entero): a un
  contabilizado le cambiaría el número, que es inmutable (§4.9).
- **Eliminar borrador** de sistema junto con su venta (D-19; precedente
  `eliminarBorradorSistema` del cierre).
- **RE-VALIDAR, no solo reemplazar** (Approach ⚠️, defense in depth §4.2): el
  camino de sistema DEBE aplicar las validaciones de §4.1 — partida doble
  ±Bs 0.01, ≥2 líneas, suma > 0, glosa no vacía, cuenta `activa` Y
  `esDetalle`, y `contactoId` en cuentas `requiereContacto` (B-1). Un writer
  que esquiva la guarda del flag sin re-validar produce asientos
  desbalanceados o contra cuentas desactivadas.

#### Escenario: regenerar preserva el número

- **DADO** un comprobante de venta `V2607-000042` CONTABILIZADO en período abierto
- **CUANDO** ventas regenera sus líneas por una edición
- **ENTONCES** las líneas se reemplazan en bloque y `id` y `numero` no cambian
- **Y** la edición queda en `comprobantes_audit` vía triggers (§4.3)

#### Escenario (−): el writer rechaza un asiento inválido

- **DADO** una regeneración cuyas líneas no cumplen partida doble, o apuntan a
  una cuenta inactiva, o omiten `contactoId` contra CxC
- **CUANDO** el writer de sistema ejecuta
- **ENTONCES** rechaza sin persistir — error, no bypass

### REQ-CMP-VTA-04 — Anulación solo desde el módulo origen (Anti-14)

La operación de usuario `anular` del módulo comprobantes DEBE rechazar un
comprobante con `origenTipo` `'VENTA'` o `'COBRO'` con 409
`COMPROBANTE_ANULACION_DESDE_ORIGEN`: la anulación se dispara desde
ventas/cobros, que orquestan la desvinculación de aplicaciones (D-12) y luego
anulan vía el camino de sistema. Sin esto, anular el comprobante "por abajo"
deja la venta viva apuntando a un asiento anulado — la inconsistencia exacta
que Anti-14 nombra.

#### Escenario (−): anular el comprobante de una venta por la API de comprobantes

- **DADO** un comprobante CONTABILIZADO con `origenTipo = 'VENTA'`
- **CUANDO** un usuario llama la anulación del módulo comprobantes
- **ENTONCES** responde 409 `COMPROBANTE_ANULACION_DESDE_ORIGEN` señalando el
  módulo origen

#### Escenario (+): anular desde ventas sí procede

- **DADO** la misma venta, anulada desde el módulo ventas con motivo válido
- **CUANDO** ventas orquesta (desvincula aplicaciones + anula vía sistema)
- **ENTONCES** el comprobante queda `anulado = true` con su número conservado

### REQ-CMP-VTA-05 — Backfill de `tiposComprobanteAplicables` (D-22, R-7)

Sin backfill ninguna venta puede llevar documento físico adjunto: array vacío
= NINGUNO (no wildcard) y la validación es rechazo duro del backend. Este
change DEBE incluir:

1. **Migración data-only** (tercera del change, precedente
   `20260521000633`): agregar `VENTA` a todo `TipoDocumentoFisico` cuyo array
   ya contenga `INGRESO`. Idempotente; toca datos existentes (el Rollback Plan
   lo dice explícito). Alcanza a `factura-emitida`, `recibo-ingreso`,
   `nota-debito-emitida` y `comprobante-interno`.
2. **Seed actualizado** (`TIPOS_UNIVERSALES`): sin esto el backfill arregla
   las orgs de hoy y cada tenant nuevo reproduce el problema.

#### Escenario: org existente tras el backfill

- **DADO** una organización creada antes del change, con sus 8 tipos de seed
- **CUANDO** corre la migración data-only
- **ENTONCES** los 4 tipos que llevaban `INGRESO` aceptan también `VENTA`, y
  los tipos personalizados del tenant que no llevaban `INGRESO` quedan intactos

#### Escenario: org nueva nace correcta

- **DADO** una organización creada después del change
- **CUANDO** se siembra `TIPOS_UNIVERSALES`
- **ENTONCES** una venta contabilizada puede asociar una `factura-emitida` sin
  editar configuración

## Códigos de error (nuevos, módulo comprobantes)

| Código | HTTP | Condición |
|---|---|---|
| `COMPROBANTE_ANULACION_DESDE_ORIGEN` | 409 | anular por API de comprobantes un comprobante con `origenTipo` de módulo comercial |
