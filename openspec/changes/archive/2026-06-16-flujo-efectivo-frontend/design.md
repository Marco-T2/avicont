# Frontend del EFE — Diseño técnico

> Change: `flujo-efectivo-frontend`
> Alcance: FRONTEND-ONLY
> Molde: `frontend/src/features/evolucion-patrimonio/` (EEPN, PR #210)

---

## 1. Árbol de archivos de la feature nueva

```
frontend/src/features/flujo-efectivo/
├── api/
│   └── get-flujo-efectivo.ts                  # arma params (período XOR rango) + GET
├── hooks/
│   └── use-flujo-efectivo.ts                  # useQuery, enabled: filtros !== null
├── schemas/
│   ├── flujo-efectivo-filtro-schema.ts        # discriminatedUnion período|rango + incluirAnulados
│   └── flujo-efectivo-filtro-schema.test.ts   # (TEST) válido/ inválido desde>hasta
├── components/
│   ├── flujo-efectivo-filtros.tsx             # RHF+zod, 2 modos, usePeriodos()
│   ├── flujo-efectivo-tabla.tsx               # 3 secciones + conciliación + señales calidad
│   ├── flujo-efectivo-tabla.test.tsx          # (TEST) render / descuadre / empty / error
│   └── boton-exportar-flujo-efectivo.tsx      # PermissionButton gateado eeff.read
├── lib/
│   ├── exportar-flujo-efectivo.ts             # mapearFlujoEfectivoAFilas(response, perfil): Celda[][]
│   ├── exportar-flujo-efectivo.test.ts        # (TEST) cabecera fiscal + secciones + conciliación
│   └── etiquetas-tipo-flujo.ts                # mapa tipo enum → label español (pura, podría inline)
└── pages/
    └── flujo-efectivo-page.tsx                # container: H1 + botón export + filtros + tabla
```

Más, fuera de la feature:
- `frontend/src/types/api.ts` — agregar alias `EstadoFlujoEfectivoResponse`.
- `frontend/src/routes/router.tsx` — ruta `/eeff/flujo-efectivo`.
- `frontend/src/components/nav-items.ts` — ítem de sidebar.

## 2. Decisiones de diseño

### 2.1 Alias en `api.ts` (gap a cerrar)

`api.ts` ya tiene (línea 783):

```ts
export type EvolucionPatrimonioResponse = Schemas['EvolucionPatrimonioResponseDto'];
```

Agregar, siguiendo ese patrón exacto (usa el helper `Schemas`, no `components['schemas']`):

```ts
export type EstadoFlujoEfectivoResponse = Schemas['EstadoFlujoEfectivoResponseDto'];
```

> Confirmado en repo: `api.ts:783` usa `Schemas['...DTO']`. El DTO
> `EstadoFlujoEfectivoResponseDto` ya está en `api.generated.ts` (PR #211), así que
> el alias compila sin regenerar nada. NO se toca `contract-drift` (no hay cambio de
> DTO backend).

### 2.2 Schema + api + hook: clon directo del EEPN, SIN `gestionId`

El schema del EEPN (`evolucion-patrimonio-filtro-schema.ts`) ya es exactamente
"período XOR rango + incluirAnulados" — el EEPN no expuso `gestionId` en su filtro
final. El EFE clona ese schema renombrando el tipo a `FlujoEfectivoFiltroValues`.

El `api/get-flujo-efectivo.ts` clona `get-evolucion-patrimonio.ts` cambiando:
- la URL → `/api/eeff/flujo-efectivo`
- los nombres de fecha de query: el endpoint del EFE usa **`desde`/`hasta`**
  (no `fechaDesde`/`fechaHasta`). Mapear: `params.desde = filtros.fechaDesde`,
  `params.hasta = filtros.fechaHasta`. `periodoFiscalId` e `incluirAnulados` igual.

> Diferencia con EEPN #1: el endpoint del EFE recibe `desde`/`hasta`, no
> `fechaDesde`/`fechaHasta`. El schema del FORM mantiene `fechaDesde`/`fechaHasta`
> (es UI); el mapeo a `desde`/`hasta` ocurre en la capa `api/`.

El hook clona `use-evolucion-patrimonio.ts`: `queryKey: ['flujo-efectivo', filtros]`,
`enabled: filtros !== null`. No se testea (wrapper trivial de useQuery, §9).

### 2.3 Render: 3 secciones + conciliación, NO una tabla plana

**Esta es la diferencia estructural con el EEPN.** El EEPN es una lista plana de
componentes (una tabla homogénea). El EFE tiene tres secciones heterogéneas con
subtotal + un bloque de conciliación. Decisión: **bloques por sección, no una sola
tabla**.

Layout de `flujo-efectivo-tabla.tsx`:

```
┌─ Resultado del ejercicio (punto de partida)  ........ Bs X
│
├─ ACTIVIDADES DE OPERACIÓN
│   <línea>  [Partida no monetaria]  ........ Bs ...
│   <línea>  [Variación de capital de trabajo] .. Bs ...
│   Subtotal operación ........................ Bs ...
│
├─ ACTIVIDADES DE INVERSIÓN
│   <línea>  ................................. Bs ...
│   Subtotal inversión ....................... Bs ...
│
├─ ACTIVIDADES DE FINANCIACIÓN
│   <línea>  ................................. Bs ...
│   Subtotal financiación .................... Bs ...
│
├─ [BLOQUE CONCILIACIÓN]  (reusa patrón CuadreFooter del EEPN)
│   Efectivo inicial ......... Bs ...
│   Variación neta ........... Bs ...
│   Efectivo final ........... Bs ...
│   [✓ Cuadra]  /  [⚠ No cuadra · diferencia Bs ...]
│
└─ [SEÑALES DE CALIDAD]  (solo si hay advertencias o cuentas heurísticas)
```

Cada sección puede ser una sub-tabla simple (`<table>` con líneas + fila subtotal) o
una lista — a criterio del implementador, pero las tres comparten un sub-componente
parametrizado `SeccionActividad({ titulo, lineas, subtotal })` para no repetir markup
(DRY). El componente `Monto` (font-mono, "Bs", alineado derecha, `formatearMontoBob`)
se clona del EEPN.

> Diferencia con EEPN #2: estructura de secciones+conciliación vs.
> componentes-en-filas. Se compone con sub-componentes; el `CuadreFooter` del EEPN
> se adapta para mostrar la cadena inicial/variación/final (no solo el total).

> Diferencia con EEPN #3 (conceptual): el **efectivo es el ANCLA de la
> conciliación, NO una sección**. Va SOLO en el bloque de conciliación, separado de
> las 3 actividades. No renderizar el efectivo como una cuarta sección.

### 2.4 Línea con `tipo` enum → etiqueta legible

`LineaFlujoDto.tipo` ∈ {`RESULTADO_EJERCICIO`, `PARTIDA_NO_MONETARIA`,
`VARIACION_CAPITAL_TRABAJO`, `VARIACION_CUENTA`}. Mostrarlo crudo es ruido técnico.
Mapa en `lib/etiquetas-tipo-flujo.ts` (función pura, testeable barato):

```ts
const ETIQUETAS_TIPO_FLUJO: Record<LineaFlujoTipo, string> = {
  RESULTADO_EJERCICIO: 'Resultado del ejercicio',
  PARTIDA_NO_MONETARIA: 'Partida no monetaria',
  VARIACION_CAPITAL_TRABAJO: 'Variación de capital de trabajo',
  VARIACION_CUENTA: 'Variación de cuenta',
};
```

Se muestra como `Badge variant="outline"` discreto junto al nombre de la línea
(análogo al badge "contraria" del EEPN). El `RESULTADO_EJERCICIO` que viene como
línea no necesita badge si ya se destaca como punto de partida — criterio del
implementador.

> Diferencia con EEPN #4: las líneas tienen `tipo` enum que conviene mostrar
> legible. El EEPN no tenía nada equivalente.

### 2.5 Señales de calidad

Bloque renderizado **solo si** `advertencias.length > 0 || cuentasEfectivoDetectadasPorHeuristica.length > 0`:
- `advertencias[]` → callout informativo (borde `border-border`, fondo `bg-muted/20`,
  texto `text-muted-foreground`), una línea por advertencia.
- `cuentasEfectivoDetectadasPorHeuristica[]` → lista `codigoInterno + nombre` con un
  copy corto: "Estas cuentas se identificaron como efectivo por heurística; marcá su
  `actividadFlujo` para precisión." (la UI de marcado está fuera de scope).

Variables semánticas del tema (Anti-F-10), nada hardcoded.

### 2.6 Export a Excel

`lib/exportar-flujo-efectivo.ts` clona `exportar-evolucion-patrimonio.ts`. Firma:
`mapearFlujoEfectivoAFilas(response, perfil): Celda[][]`. Reusa
`armarCabeceraFiscal(perfil)` de `@/lib/export-excel`.

**Columnas del Excel** (4): `Actividad | Línea | Tipo | Monto (BOB)`. Estructura de
filas:

```
[cabecera fiscal]
[Actividad, Línea, Tipo, Monto (BOB)]                          ← headers bold
[—, Resultado del ejercicio, Resultado del ejercicio, <num>]   ← punto de partida
[Operación,  <línea>, <tipo legible>, <num>] ...
[Operación,  Subtotal operación, '', <num bold>]
[Inversión,  <línea>, <tipo legible>, <num>] ...
[Inversión,  Subtotal inversión, '', <num bold>]
[Financiación, <línea>, <tipo legible>, <num>] ...
[Financiación, Subtotal financiación, '', <num bold>]
[—, Efectivo inicial, '', <num>]      ┐
[—, Variación neta, '', <num>]        ├ BLOQUE CONCILIACIÓN
[—, Efectivo final, '', <num bold>]   ┘
[✓/✗ Cuadra, '', 'Diferencia', <num diferencia bold>]
```

§4.5: cada monto se escribe como `{ type: 'numero', value: <stringDelBackend> }` SIN
recalcular. §4.6: las fechas (en nombre de archivo / cabecera) sin UTC.

`boton-exportar-flujo-efectivo.tsx` clona el del EEPN: `PermissionButton` gateado por
`PERMISSIONS.contabilidad.eeff.read`, `disabled` si `!data || generando`, patrón
`setGenerando` en `try/finally`. Nombre de archivo:
`flujo-efectivo_${fechaDesde}_${fechaHasta}.xlsx` usando `fechaDesde`/`fechaHasta` del
response.

### 2.7 Página (container)

`flujo-efectivo-page.tsx` clona `evolucion-patrimonio-page.tsx`:
- H1: "Estado de Flujo de Efectivo" + subtítulo de 1 línea.
- Botón export (recibe `data`, `perfil` de `useEmpresa()`, `rango`).
- Card de filtros + tabla, con `filtros | null` lifted state.
- Header canónico §13.1 (sin padding propio, `space-y-6`).

### 2.8 Ruta

En `router.tsx`, después del bloque `/eeff/evolucion-patrimonio` (línea ~150):

```tsx
{
  path: '/eeff/flujo-efectivo',
  element: (
    <RequirePermission permission={PERMISSIONS.contabilidad.eeff.read}>
      <FlujoEfectivoPage />
    </RequirePermission>
  ),
},
```

### 2.9 Sidebar

En `nav-items.ts`, sección Contabilidad, inmediatamente después de "Evolución del
Patrimonio" (confirmado en repo: ese ítem usa `to: '/eeff/evolucion-patrimonio'`,
`icon: Landmark`, `requiredPermission: PERMISSIONS.contabilidad.eeff.read`,
`vertical: 'CONTABILIDAD'`):

```ts
{
  to: '/eeff/flujo-efectivo',
  label: 'Estado de Flujo de Efectivo',
  icon: Droplet,                                  // lucide — evoca liquidez
  requiredPermission: PERMISSIONS.contabilidad.eeff.read,
  vertical: 'CONTABILIDAD',
},
```

Importar `Droplet` de `lucide-react` en el archivo.

## 3. Resumen de diferencias con el EEPN (molde)

| # | EEPN | EFE |
|---|------|-----|
| 1 | filtro con modo `gestionId` posible | sin `gestionId`; query usa `desde`/`hasta` (no `fechaDesde`/`fechaHasta`) |
| 2 | tabla plana de componentes | 3 secciones con subtotal + bloque de conciliación |
| 3 | total = cuadre simple | efectivo = ancla de conciliación (inicial/variación/final), NO sección |
| 4 | sin enum en filas | `LineaFlujoDto.tipo` enum → etiqueta legible en español |
| 5 | sin señales de calidad | `advertencias[]` + `cuentasEfectivoDetectadasPorHeuristica[]` visibles |
| 6 | export 5 columnas | export 4 columnas (Actividad/Línea/Tipo/Monto) + bloque conciliación |

## 4. Reglas del proyecto que aplican

- §4.5 dinero: strings del backend, string→número solo en `construirHoja`/celda
  numérica del export. Nunca sumar en cliente.
- §4.6 fecha: sin UTC.
- Anti-F-07: submit/export disabled durante isFetching/generando.
- Anti-F-10: variables semánticas del tema (dark mode día 1).
- Anti-F-13: error de query → banner inline, nunca toast en el cuerpo.
- §14.7: gating del botón export = PermissionButton (disable + tooltip);
  ruta/sidebar se ocultan/bloquean.
- Componentes importan solo de `hooks/`; `hooks/` importa de `api/`; `api/` usa
  `@/lib/api.ts`.
