# Estado de Flujo de Efectivo (EFE) — Frontend (delta spec)

<!--
Última edición: 2026-06-16
Última revisión contra core: 2026-06-16
Owner: frontend-lead
-->

> Fecha: 2026-06-16
> Fase: delta spec del change `flujo-efectivo-frontend`
> Proyecto: avicont
> Capability: `estado-flujo-efectivo`
> Alcance: FRONTEND-ONLY

Este delta AGREGA los requirements del FRONTEND a la capability `estado-flujo-efectivo`
(cuyos requirements de backend ya viven en `openspec/specs/estado-flujo-efectivo/spec.md`).
Consume el endpoint `GET /api/eeff/flujo-efectivo` y su `EstadoFlujoEfectivoResponseDto`,
ambos ya en `main` (PR #211).

---

## ADDED Requirements

### Requirement: Alias de tipo del response en la fachada `api.ts`

El DTO `EstadoFlujoEfectivoResponseDto` ya existe en `frontend/src/types/api.generated.ts`
pero no tiene fachada en `frontend/src/types/api.ts`. La feature debe consumirlo vía un
alias estable en `api.ts` (espeja el patrón de `EvolucionPatrimonioResponse`), nunca
importando de `api.generated.ts` directamente.

#### Scenario: La feature importa el tipo desde `@/types/api`

- **DADO** que el componente o la api necesita el tipo del response del EFE
- **CUANDO** importa el tipo
- **ENTONCES** lo importa como `EstadoFlujoEfectivoResponse` desde `@/types/api`
- **Y** `api.ts` exporta `export type EstadoFlujoEfectivoResponse = components['schemas']['EstadoFlujoEfectivoResponseDto'];` (o `Schemas['...']`, según el patrón vigente en el archivo)

### Requirement: Filtro de rango — período XOR rango + incluir anulados

La pantalla ofrece dos modos mutuamente excluyentes para acotar el reporte, calzando
con la query del endpoint (`desde`+`hasta` XOR `periodoFiscalId`, + `incluirAnulados?`).
A diferencia del EEPN, el EFE **no tiene modo `gestionId`**.

#### Scenario: Modo rango es el default

- **DADO** que el usuario abre `/eeff/flujo-efectivo`
- **CUANDO** se monta el formulario de filtros
- **ENTONCES** el modo activo por default es "rango" con dos inputs de fecha (`fechaDesde`, `fechaHasta`)
- **Y** el toggle "incluir anulados" arranca en `false`

#### Scenario: Modo período usa el selector de períodos fiscales

- **DADO** que el usuario cambia al modo "período"
- **CUANDO** se renderiza el filtro
- **ENTONCES** aparece un `Select` poblado con los períodos fiscales (vía el hook `usePeriodos()`)
- **Y** desaparecen los inputs de fecha

#### Scenario: Rango inválido (desde > hasta) bloquea el submit con mensaje en español

- **DADO** el modo rango con `fechaDesde` posterior a `fechaHasta`
- **CUANDO** el usuario intenta consultar
- **ENTONCES** el form muestra un mensaje de validación en español sobre `fechaHasta`
- **Y** no se dispara la request

#### Scenario: La consulta solo corre cuando hay filtros aplicados

- **DADO** que el usuario aún no presionó "Consultar"
- **CUANDO** la página está montada
- **ENTONCES** la query está deshabilitada (`enabled: filtros !== null`) y se muestra un estado inicial invitando a elegir rango/período

#### Scenario: Submit deshabilitado mientras la query está en vuelo (Anti-F-07)

- **DADO** que una consulta está en curso (`isFetching === true`)
- **CUANDO** se renderiza el botón de consultar
- **ENTONCES** el botón queda deshabilitado hasta que la respuesta llegue

### Requirement: Render de las 3 secciones de actividad con subtotales

La pantalla muestra las tres actividades del método indirecto —OPERACIÓN, INVERSIÓN,
FINANCIACIÓN— cada una con sus líneas y su subtotal. La línea de **resultado del
ejercicio** se presenta como punto de partida del método indirecto, separada o
encabezando la actividad de operación.

#### Scenario: Cada sección muestra sus líneas y su subtotal

- **DADO** un response con líneas en las tres actividades
- **CUANDO** se renderiza la tabla
- **ENTONCES** se ven tres bloques (Operación / Inversión / Financiación)
- **Y** cada bloque lista sus `lineas` (nombre + monto, con `codigoInterno` cuando existe)
- **Y** cada bloque cierra con su `subtotal` destacado

#### Scenario: El resultado del ejercicio se muestra como punto de partida

- **DADO** un response con `resultadoEjercicio`
- **CUANDO** se renderiza el reporte
- **ENTONCES** el `resultadoEjercicio` aparece como la línea de arranque del método indirecto (encabezando la actividad de operación o como fila destacada previa a sus ajustes)

#### Scenario: El tipo de cada línea se muestra en español legible, no como enum crudo

- **DADO** una línea con `tipo` ∈ {`RESULTADO_EJERCICIO`, `PARTIDA_NO_MONETARIA`, `VARIACION_CAPITAL_TRABAJO`, `VARIACION_CUENTA`}
- **CUANDO** se renderiza la línea
- **ENTONCES** el `tipo` se muestra como una etiqueta legible en español (ej. "Partida no monetaria", "Variación de capital de trabajo") y nunca como el literal del enum

#### Scenario: Montos en BOB, formato es-BO, alineados a la derecha

- **DADO** cualquier monto del response (líneas, subtotales, conciliación)
- **CUANDO** se renderiza
- **ENTONCES** se muestra como string del backend formateado es-BO (miles "." / decimal ","), alineado a la derecha
- **Y** el cliente NO suma ni recalcula montos (§4.5): consume `subtotal`, `variacionNeta`, etc. tal cual del backend

### Requirement: Bloque de conciliación de efectivo con indicador de cuadre

El efectivo es el ANCLA de la conciliación, NO una cuarta sección. La pantalla muestra
`efectivoInicial → variacionNeta → efectivoFinal` en un bloque dedicado, con un
indicador visual de cuadre alimentado por el campo `cuadra` del backend (la tolerancia
±Bs 0.01 ya está resuelta en backend; el front solo refleja el booleano).

#### Scenario: Conciliación muestra inicial, variación neta y final

- **DADO** un response con `efectivoInicial`, `variacionNeta`, `efectivoFinal`
- **CUANDO** se renderiza el bloque de conciliación
- **ENTONCES** los tres valores se muestran como la cadena de conciliación, separados de las 3 secciones de actividad

#### Scenario: Indicador de cuadre verde cuando `cuadra === true`

- **DADO** un response con `cuadra: true`
- **CUANDO** se renderiza el footer de conciliación
- **ENTONCES** se muestra un indicador de éxito (CheckCircle2 + texto afirmativo)

#### Scenario: Indicador de descuadre con la diferencia cuando `cuadra === false`

- **DADO** un response con `cuadra: false` y `diferencia` no nula
- **CUANDO** se renderiza el footer
- **ENTONCES** se muestra un indicador de advertencia (AlertTriangle) con el valor de `diferencia` formateado es-BO

### Requirement: Señales de calidad visibles (advertencias + heurística)

Las señales de calidad del backend no deben morir en el JSON: si el response trae
`advertencias[]` o `cuentasEfectivoDetectadasPorHeuristica[]`, la pantalla las muestra.

#### Scenario: Las advertencias se listan cuando existen

- **DADO** un response con `advertencias` no vacío
- **CUANDO** se renderiza la pantalla
- **ENTONCES** las advertencias se muestran en un bloque visible (ej. callout informativo)

#### Scenario: Cuentas detectadas por heurística se muestran como señal

- **DADO** un response con `cuentasEfectivoDetectadasPorHeuristica` no vacío
- **CUANDO** se renderiza la pantalla
- **ENTONCES** se listan esas cuentas (código + nombre) como aviso de que el efectivo se identificó por heurística y conviene marcar `actividadFlujo` explícitamente

#### Scenario: Sin advertencias ni cuentas heurísticas no se muestra ruido

- **DADO** un response con ambos arrays vacíos
- **CUANDO** se renderiza la pantalla
- **ENTONCES** no se muestra ningún bloque de señales de calidad

### Requirement: Export a Excel gateado por `contabilidad.eeff.read`

La pantalla expone un botón de exportación a Excel que respeta el gating de permisos y
las reglas de dinero/fecha del proyecto.

#### Scenario: Botón de export deshabilitado sin permiso o sin datos

- **DADO** un usuario sin `contabilidad.eeff.read`, o sin datos cargados, o con la exportación en curso
- **CUANDO** se renderiza el botón
- **ENTONCES** queda deshabilitado (con tooltip cuando la causa es el permiso, §14.7)

#### Scenario: Export respeta §4.5 (monto string→celda numérica) y §4.6 (fecha sin UTC)

- **DADO** un response con montos string y fechas YYYY-MM-DD
- **CUANDO** el mapeador arma las filas del Excel
- **ENTONCES** cada monto se escribe como celda numérica desde el string del backend SIN recalcular en cliente
- **Y** las fechas se formatean sin conversión UTC
- **Y** el archivo incluye la cabecera fiscal de la organización (vía `useEmpresa()` / `armarCabeceraFiscal`)

### Requirement: Ruta y navegación gateadas por `contabilidad.eeff.read`

La pantalla es accesible vía ruta y aparece en la navegación, ambas gateadas por el
permiso heredado `contabilidad.eeff.read` (sin permiso nuevo).

#### Scenario: Ruta protegida por permiso

- **DADO** un usuario sin `contabilidad.eeff.read`
- **CUANDO** navega a `/eeff/flujo-efectivo`
- **ENTONCES** la ruta está envuelta en `<RequirePermission permission={PERMISSIONS.contabilidad.eeff.read}>` y no muestra la pantalla

#### Scenario: Ítem de sidebar en la sección Contabilidad

- **DADO** un tenant con vertical `CONTABILIDAD` y el permiso `contabilidad.eeff.read`
- **CUANDO** se renderiza la navegación
- **ENTONCES** aparece el ítem "Estado de Flujo de Efectivo" en la sección Contabilidad, después de "Evolución del Patrimonio", con icono `Droplet` y `vertical: 'CONTABILIDAD'`

### Requirement: Estados de carga, error y vacío

#### Scenario: Loading muestra skeleton

- **DADO** una consulta en curso sin datos previos
- **CUANDO** se renderiza la tabla
- **ENTONCES** se muestra un skeleton, no contenido parcial

#### Scenario: Error muestra banner inline (no toast en cada render)

- **DADO** que la query falló (`isError === true`)
- **CUANDO** se renderiza la pantalla
- **ENTONCES** se muestra un banner de error inline accionable (Anti-F-13), nunca un `toast` disparado desde el cuerpo del componente

#### Scenario: Vacío informa que no hubo movimientos

- **DADO** un response sin líneas en ninguna actividad
- **CUANDO** se renderiza la pantalla
- **ENTONCES** se muestra un estado vacío indicando que no hubo movimientos en el período/rango
