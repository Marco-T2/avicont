# Exploración: verificador-movimientos-bancarios (mayor unificado de bancos)

> Fase: `sdd-explore`. NO crea proposal ni specs. Alcance funcional ya acordado
> con el usuario; esto mide lo que no estaba medido (puntos A–G del encargo).

## Current State

El módulo `conciliacion-bancaria` (pack `contabilidad.conciliacion`, 7 perfiles de
extracto) hoy expone tres controllers. **No hay ninguna vista cross-cuenta**: para
ver un solo movimiento hay que elegir una `cuentaBancariaId` y un rango
(`GET /api/conciliacion` exige ambos). No existe puerta de entrada al módulo.

`MovimientoBancario` ya persiste todo lo que la tabla necesita — `fecha`, `hora`,
`monto`, `tipo`, `moneda`, `descripcion`, `descripcionNormalizada`, `referencia`,
`saldo`, `estado` — más `@@index([organizationId, cuentaBancariaId, fecha])`.

El `estadoEfectivo` (`PENDIENTE | CONCILIADO | IGNORADO`) es **DERIVADO en cada
lectura**, no leído de la columna `estado`, que el propio DTO documenta como
*"proyección cacheada. NO es lo que se muestra"*. La derivación vive en
`ConciliacionService.verificarVinculos` + `armarRespuesta`.

## Affected Areas

- `backend/src/conciliacion-bancaria/movimientos-bancarios.controller.ts` — hoy solo `PATCH :id/estado`; recibe el `GET /` nuevo.
- `backend/src/conciliacion-bancaria/ports/movimiento-bancario.repository.port.ts` — método de listado cross-cuenta + saldos vigentes.
- `backend/src/conciliacion-bancaria/adapters/prisma-movimiento-bancario.repository.ts` — implementación.
- `backend/src/conciliacion-bancaria/extracto-importador.service.ts:157,165` — captura de `ordenFisico`.
- `backend/prisma/schema.prisma` (`MovimientoBancario`) — columna `ordenFisico` + índice.
- `frontend/src/features/` — feature nueva; `frontend/src/components/nav-items.ts:189` como molde de nav item con `pack`.

## Hallazgos por punto

### A. Derivar `estadoEfectivo` paginado cross-cuenta — **barato: 3 queries acotadas**

El workspace se trae **todo el pool de líneas contables** del rango
(`listarPorCuentaEnRango`) porque además pinta el panel contable y calcula
`EN_TRANSITO` + sugerencias. **El mayor unificado no necesita nada de eso**: es
vista bank-side, no necesita el pool.

Por página de N movimientos alcanza con:

1. la página de movimientos (filtros + orden + limit) — 1 query
2. `MatchConciliacionRepositoryPort.listarPorMovimientos(tenantId, ids)` — 1 query
3. `LineasCuentaReaderPort.listarPorAnclas(tenantId, anclas)` — 1 query, ≤ N anclas

…y después `verificarAnclas` **en memoria**. Todo acotado por page size; sin N+1.
Más 1 `count` para el total ⇒ **4 queries por request**.

`listarPorAnclas` ya existe y hace exactamente esto: resuelve anclas puntuales en
batch y **no filtra por `anulado` ni `estado`**, que es lo correcto porque
`verificarAnclas` chequea `anulado` por su cuenta para distinguir
`COMPROBANTE_ANULADO` de `LINEA_INEXISTENTE`.

⇒ **CERO métodos nuevos en `LineasCuentaReaderPort`** (no se toca `comprobantes/`,
no se roza el arch-spec `no-escribe-comprobantes.arch.spec.ts`). Solo se agregan
métodos al port propio del módulo.

### B. Saldo vigente por cuenta a fecha de corte — 1 query, con un riesgo serio

Query natural: `DISTINCT ON (cuentaBancariaId)` ordenado por
`cuentaBancariaId, fecha DESC, hora DESC NULLS FIRST, ordenFisico DESC NULLS FIRST,
id DESC`, filtrando `organizationId` y `fecha <= corte`. Una sola pasada, apoyada
en el índice.

> **Corregido en `sdd-design` (D3)**: este sketch decía `NULLS LAST`. Está mal —
> la inversión de `ASC NULLS LAST` es `DESC NULLS FIRST`. Con `NULLS LAST` una
> fila sin hora nunca sería elegida como "la última" aunque el listado de
> presentación la muestre última, y el saldo vigente saldría de una fila distinta
> a la que cierra la tabla.

Prisma no expresa `DISTINCT ON` ⇒ **sería el primer `$queryRaw` del módulo**
(verificado: hoy no hay ninguno). Precedente del proyecto en `reportes/`.

Dos cosas que NO se pueden pasar por alto:

- **El saldo vigente puede estar DESACTUALIZADO.** Es el saldo que publicó el
  banco en el último movimiento *importado*. Si no se subió el extracto más
  reciente de esa cuenta, el número es viejo — y el caso de uso declarado es
  literalmente *"cuánto tengo hoy sumando todos los bancos para transferir"*. Un
  saldo viejo presentado como saldo de hoy es una respuesta incorrecta a la
  pregunta que el usuario está haciendo. **Debe devolverse `fechaUltimoMovimiento`
  por cuenta y hacerse visible.**
- `saldo` es nullable: si un perfil no lo publica, el vigente es `null`, jamás `0`.

### C. Dónde vive el endpoint — extender el controller existente

`MovimientosBancariosController` ya está montado en `@Controller('movimientos-bancarios')`
con la cadena de guards correcta (Auth → ModuleEnabled → Permissions → PackEnabled)
y `@RequirePack('contabilidad.conciliacion')` a nivel de clase. El `GET /` es el
hermano natural del `PATCH :id/estado`.

Permiso por método: el `GET` pide `.read`, el `PATCH` ya pide `.conciliar`.
REQ-CB-14 (modo consulta fail-closed) ya modela exactamente esa asimetría.

### D. Filtro por glosa — `ILIKE`, sin índice GIN

La query **siempre** filtra `organizationId` + rango de fechas primero, y ahí se
va el grueso de la selectividad. `pg_trgm` está instalado (contactos), pero ese
caso es distinto: busca sobre un catálogo sin acotar por fecha.

Recomendación: `ILIKE` sobre `descripcionNormalizada` ahora; GIN trigram diferido
con disparador explícito (cuando una org supere ~100k movimientos o el p95 del
endpoint pase de ~300 ms).

### E. Paginación — offset, no cursor

Precedente de la casa para listados filtrables: `ListarComprobantesQueryDto`
(`page`/`limit`, `LIST_DEFAULT_LIMIT = 50`, `LIST_MAX_LIMIT = 200`, filtro libre `q`).
El cursor opaco base64 existe solo para el timeline de actividad, que es scroll
infinito. Acá el usuario salta entre páginas y quiere total ⇒ **offset**.

### F. `ordenFisico` — derivar de `ordenarCronologico`, NO del índice crudo

**El índice crudo del archivo está mal**: en un export DESC la fila 0 es la más
NUEVA, así que ordenar por él muestra el día al revés.

`ordenarCronologico(parseado.movimientos)` ya se calcula en el service
(`extracto-importador.service.ts:165`) y devuelve el array en orden cronológico
ascendente, o `null` si la secuencia no es monótona. ⇒ `ordenFisico` = índice en
**ese** array; y `null` cuando `ordenarCronologico` devuelve `null`, coherente con
la regla de no inventar (misma familia que `SIN_VERIFICAR` y que `saldo` nullable).

Punto de captura: hay que asignarlo **antes** de que `ordenarCanonico` reordene
(línea 155). Un `Map` de identidad de objeto → índice cronológico, leído dentro de
`construirMovimientoCreateData`.

**Limitación a resolver en `sdd-design`, no acá**: `ordenFisico` solo es
comparable **dentro de una misma importación**. Si dos extractos solapados aportan
movimientos al MISMO día, sus índices vienen de secuencias distintas y compararlos
no significa nada. Opciones: desempatar por `(fecha, hora, importacionId, ordenFisico)`,
o aceptarlo y documentarlo (en la práctica un día proviene de un solo extracto).

**Backfill**: los movimientos ya importados quedan en `null`. No se puede
reconstruir — el orden físico ya se descartó, e inventarlo violaría la misma regla.
El orden degrada limpio a `fecha, hora, id`.

### G. Frontend

Feature nueva; de `features/conciliacion/` se reusa el criterio de
`estado-movimiento-badge` y `etiquetas-conciliacion`, no los paneles (son de 2
columnas pareadas, otra cosa). Nav item con el molde de `nav-items.ts:189`
(sección Contabilidad, `requiredPermission: PERMISSIONS.contabilidad.conciliacion.read`,
`pack: 'contabilidad.conciliacion'`, gating fail-closed §14.7).

## Approaches — el punto realmente abierto: filtrar por estado

Es el único desacuerdo estructural que la exploración destapó, y toca **justo la
carga útil** de la capacidad (el filtro "pendientes cross-banco").

El filtro por estado se aplica en SQL sobre la columna **cacheada** `estado`,
pero lo que se muestra es el estado **derivado**. Cuando divergen —un match con
ancla rota: la columna dice `CONCILIADO`, el derivado es `PENDIENTE`— **el filtro
miente en las dos direcciones**: mete filas que ya no son pendientes y, peor,
**esconde movimientos que sí lo son**. Un pendiente escondido es exactamente el
pago que el contador no va a registrar.

1. **Filtrar por la columna cacheada y aceptar la deriva**
   - Pros: 1 query, paginación exacta, trivial.
   - Cons: el filtro puede ocultar pendientes reales. Silencioso.
   - Esfuerzo: Bajo

2. **Derivar primero, filtrar después**
   - Pros: siempre correcto.
   - Cons: hay que traer y verificar TODO el rango antes de paginar — se cae el
     techo de costo del punto A y el endpoint pasa a escalar con el rango, no con
     la página.
   - Esfuerzo: Alto

3. **Filtrar por la cacheada + re-derivar la página + marcar la discrepancia**
   - Pros: costo del punto A intacto; la deriva deja de ser silenciosa en las
     filas que SÍ entraron a la página.
   - Cons: **no resuelve la dirección peligrosa.** Los pendientes escondidos nunca
     entraron a la página, así que re-derivarla no puede encontrarlos. Solo limpia
     el ruido de la dirección inocua.
   - Esfuerzo: Medio

4. **Opción 3 + auditoría acotada de vínculos sobre el rango filtrado**
   - Los movimientos que pueden estar escondidos son, por definición, los que
     TIENEN un match. Se verifican solo esos —no todas las líneas del rango— con
     un `listarPorAnclas` en lote (pega contra `@@unique([comprobanteId, orden])`)
     y los rotos se devuelven en una franja aparte, fuera de la paginación.
   - Pros: ataca la dirección peligrosa; la paginación sigue intacta; el costo
     escala con la cantidad de MATCHES del rango (cientos), no con las líneas.
   - Cons: 1 query extra por request; con volúmenes altos de matches hay que
     chunkear el `OR` de anclas.
   - Esfuerzo: Medio

## Recommendation

**Opción 4.** La 3 —que era la recomendación inicial de esta exploración— se
descarta por insuficiente: limpia el ruido pero deja intacto el único error que
importa. Un pendiente escondido es el pago que el contador no va a registrar.

La franja de vínculos rotos se muestra separada de la tabla, con su contador y un
link al workspace de la cuenta. El módulo mantiene la convención de que **una
lectura nunca escribe** (design §2.3): no se auto-cura la columna.

Causa de fondo, **fuera de alcance de este change**: la proyección cacheada se
desincroniza porque nada la reconcilia. Si `comprobantes` emitiera un evento al
anular/editar y `conciliacion-bancaria` invalidara los matches afectados —que es
lo que manda CLAUDE.md §3.7 para efectos colaterales— la columna sería confiable y
la opción 1 pasaría a ser exacta. Anotado como slice futuro.

Resto de decisiones: A como está descrito (3 queries + count), B con `$queryRaw`
`DISTINCT ON` **devolviendo `fechaUltimoMovimiento`**, C extender el controller,
D `ILIKE`, E offset, F derivar de `ordenarCronologico` con `null` honesto.

### Orden de la tabla (cerrado)

`fecha ASC, hora ASC NULLS LAST, ordenFisico ASC NULLS LAST, id ASC`.

La **hora manda sobre `ordenFisico`**, así que en los 6 perfiles que la publican el
desempate intra-día es cronología real aunque los movimientos vengan de
importaciones distintas — el problema cross-importación del punto F se reduce a
Unión, misma cuenta, mismo día y dos importaciones aportando a ese día.

`id` al final NO es decorativo: **la paginación offset exige un `ORDER BY`
totalmente determinístico**. Con filas empatadas en todos los criterios previos,
Postgres puede devolverlas en distinto orden entre páginas y una fila se duplica o
desaparece. Con `id` cerrando, `importacionId` como desempate no hace falta.

`NULLS LAST` en `hora` es una CONVENCIÓN de presentación, no una afirmación
cronológica: la UI no debe prometer orden intra-día entre bancos distintos.

## Risks

- **Saldo vigente desactualizado** presentado como saldo de hoy (punto B). Es el
  riesgo de producto más alto: la pregunta que responde la pantalla es "cuánto
  tengo para transferir".
- **El filtro de pendientes puede esconder pendientes reales** — degradado de
  riesgo principal a riesgo acotado por la decisión de "apoyo, no limitante": la
  vista por defecto no filtra por estado, así que el caso solo aparece con el
  filtro opt-in activo. Ahí lo cubre la auditoría de vínculos de la opción 4, con
  el límite de que esa auditoría alcanza al rango consultado: un vínculo roto
  fuera del rango sigue sin verse.
- `ordenFisico` no comparable entre importaciones distintas del mismo día (punto
  F). Acotado por el orden cerrado: solo afecta a Unión, misma cuenta y mismo día.
- Primer `$queryRaw` del módulo: hay que cubrirlo con `*.integration.spec.ts`
  contra Postgres real, no con unit.
- Migración: aditiva pura (columna nullable + índice). Aplica §11.6 — revisar el
  `migration.sql` regenerado por `DROP` de objetos raw SQL antes de aplicarlo.

## Ready for Proposal

**Sí.** Las dos decisiones abiertas quedaron cerradas.

- **Orden / `ordenFisico` cross-importación — RESUELTO.** No hacía falta decidir
  nada: la hora ya desempata antes que `ordenFisico` en los 6 perfiles que la
  publican, y el `ORDER BY` cierra con `id` porque la paginación offset lo exige.
  Sin `importacionId`. (El usuario propuso desempatar por hora; ya era el diseño.)
- **Filtro por estado — FIRMADO: opción 4.** Esta exploración recomendaba la
  opción 3 y se corrigió al detectar que no cubre la dirección peligrosa.

### Principio firmado: la herramienta es de APOYO, no limitante

Instrucción explícita del usuario al firmar: *"esto solo es de apoyo, no tiene que
ser limitante… ayudaría en reconocer si algunos ya fueron conciliados, pero no
quiero que sea cerrado"*.

Consecuencia de diseño, y **no es cosmética — reduce el riesgo principal**:

- **La vista por defecto NO aplica filtro de estado.** Muestra TODOS los
  movimientos del rango, con el estado derivado como columna/badge informativo.
  Sin nada excluido, la dirección peligrosa del filtro (esconder un pendiente
  real) **no puede ocurrir en la vista por defecto**: el estado es una señal, no
  una compuerta.
- El filtro por estado pasa a ser **opt-in**. La auditoría de vínculos de la
  opción 4 protege ese caso, que ahora es el excepcional y no el principal.
- Esto además calza con el grano que ya tiene el módulo: el checksum informa y
  nunca rechaza (REQ-CB-08), el motor de sugerencias ranquea y nunca auto-matchea,
  `DESCUADRE` no bloquea la importación. La capacidad no introduce un criterio
  nuevo: sigue el que el módulo ya eligió.

⇒ Revisar en `sdd-spec`: el requisito de la vista por defecto se enuncia como
"sin filtro de estado", NO como "filtrada por pendientes".
