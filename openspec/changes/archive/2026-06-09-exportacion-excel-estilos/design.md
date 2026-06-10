# Design: Estilos esenciales en exportación a Excel

## Technical Approach

Extender la infra compartida `frontend/src/lib/export-excel/` con props de estilo OPCIONALES en `Celda`, propagarlas en `construirHoja` al objeto de `write-excel-file` (ya las soporta, sin instalar nada), y hacer que los 5 ensambladores + la cabecera fiscal marquen negrita y alineación donde corresponde. Sin estilo explícito → bytes idénticos a hoy. Cero backend, cero migración, frontend-puro (§4.5/§4.6 intactos: el estilo es ortogonal al value).

> NOTA de alcance: el orquestador AMPLIÓ el proposal — las etiquetas fiscales (`NIT:`, `Dirección:`, …) AHORA están EN scope (el proposal las listaba como out-of-scope/pregunta abierta; el usuario confirmó incluirlas).

## Architecture Decisions

### Decision: Props de estilo planas en `Celda`, no sub-objeto `estilo`

**Choice**: agregar `fontWeight?: 'bold'` y `align?: 'left' | 'center' | 'right'` PLANAS a `CeldaNumero` y `CeldaTexto`.

**Alternatives**: sub-objeto `estilo?: CeldaEstilo`.

**Rationale**: write-excel-file consume props planas (`{ type, value, fontWeight, align }`). Props planas en `Celda` → el `.map` de `construirHoja` las re-emite con spread directo, sin desempaquetar un sub-objeto. En los ensambladores, `{ type:'texto', value:'TOTAL', fontWeight:'bold' }` se lee de un vistazo. Un sub-objeto añade indirección sin beneficio (no hay agrupación lógica que justifique anidar). Como ambas variantes comparten exactamente las mismas props de estilo, se extrae una base:

```ts
export interface CeldaEstilo {
  fontWeight?: 'bold';
  align?: 'left' | 'center' | 'right';
}
export interface CeldaNumero extends CeldaEstilo { type: 'numero'; value: string; }
export interface CeldaTexto  extends CeldaEstilo { type: 'texto';  value: string; }
export type Celda = CeldaNumero | CeldaTexto;
```

### Decision: `align: 'right'` por DEFAULT en `construirHoja` para toda `CeldaNumero`

**Choice**: `construirHoja` aplica `align:'right'` a toda celda numérica salvo override explícito; los ensambladores NO repiten `align:'right'` por celda de monto.

**Alternatives**: cada ensamblador setea `align:'right'` por cada CeldaNumero.

**Rationale**: DRY — un monto SIEMPRE se alinea a la derecha en un informe contable; setearlo en 5 archivos × N celdas es ruido y fuente de drift (una celda olvidada). El default vive en un solo punto. Trade-off aceptado: "magia implícita" (quien lea un ensamblador no ve el `align`); se mitiga con comentario en `construirHoja` y un test que fija el default. El `fontWeight` NO se defaultea (no hay regla universal "todo número en negrita") — lo marca cada ensamblador en la fila de totales.

### Decision: `cabecera-fiscal.ts` importa `CeldaTexto` extendida, elimina el duplicado

**Choice**: borrar `interface CeldaTextoLocal` y usar `CeldaTexto` de `construir-hoja.ts` (ya re-exportada por `index.ts`).

**Rationale**: el duplicado existía para no acoplar; ahora la cabecera NECESITA `fontWeight` (razón social en negrita), que ya vive en `CeldaTexto`. Mantener el duplicado obligaría a copiarle la prop → dos fuentes de verdad. La dependencia es interna al mismo módulo (`./construir-hoja`), no cross-feature.

### Decision: cabecera fiscal con etiquetas vía mapa campo→etiqueta

**Choice**: razón social = encabezado en negrita SIN etiqueta; resto = `"<Etiqueta>: <valor>"` con etiqueta fija por campo. Campos null se omiten (sin fila), orden actual preservado.

**Rationale**: las etiquetas dan contexto ("NIT: 123" vs un número suelto). Se modela como lista ordenada de `{ valor, etiqueta? }`; `razonSocial` sin etiqueta + `fontWeight:'bold'`, el resto con etiqueta. El filtro `null` se mantiene ANTES de componer el string (nunca `"NIT: null"`).

## Interfaces / Contracts

**`construir-hoja.ts` — map con spread condicional** (`exactOptionalPropertyTypes`: nunca pasar `undefined`):

```ts
fila.map((celda) => {
  const estilo = {
    ...(celda.fontWeight !== undefined ? { fontWeight: celda.fontWeight } : {}),
    // align por default 'right' en numérico; el override explícito gana
    ...(celda.type === 'numero'
      ? { align: celda.align ?? 'right' }
      : celda.align !== undefined ? { align: celda.align } : {}),
  };
  if (celda.type === 'numero') {
    return { type: Number, value: parsearMontoCelda(celda.value), format: '#,##0.00', ...estilo };
  }
  return { type: String, value: celda.value, ...estilo };
});
```

**`cabecera-fiscal.ts`** (forma):

```ts
const CAMPOS: { valor: string | null; etiqueta?: string }[] = [
  { valor: perfil.razonSocial },                         // encabezado, negrita, sin etiqueta
  { valor: perfil.nit, etiqueta: 'NIT' },
  { valor: perfil.direccion, etiqueta: 'Dirección' },
  { valor: perfil.representanteLegal, etiqueta: 'Representante Legal' },
  { valor: perfil.telefono, etiqueta: 'Teléfono' },
  { valor: perfil.email, etiqueta: 'Email' },
];
// filtra valor !== null → primera fila (sin etiqueta) negrita; resto "etiqueta: valor"
// razón social = índice 0 del array YA filtrado (la primera presente es el encabezado).
```

> Detalle: la negrita del encabezado se ata a "primer campo presente sin etiqueta" (razón social). Si `razonSocial` es null, la primera fila presente NO es encabezado (no se le pone negrita): solo razón social lleva negrita; si falta, ninguna fila va en negrita. Mantener simple — la negrita es exclusiva de `razonSocial`.

**Ensambladores** (los 5): la fila de encabezados de columna → cada `CeldaTexto` con `fontWeight:'bold'`. La(s) fila(s) de totales (`TOTAL`, `TOTAL ACTIVO`, `Resultado del Ejercicio`, subtotales de `aplanarArbol`) → celdas con `fontWeight:'bold'`. Montos: NO tocar `align` (lo defaultea `construirHoja`). `aplanar-arbol.ts` también marca sus filas de subtotal de sección/subsección en negrita.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `lib/export-excel/construir-hoja.ts` | Modify | Base `CeldaEstilo`; `Celda` extiende; map propaga estilo + default `align:'right'` en numérico |
| `lib/export-excel/cabecera-fiscal.ts` | Modify | Usa `CeldaTexto`; razón social negrita; etiquetas por campo |
| `lib/export-excel/aplanar-arbol.ts` | Modify | Filas de subtotal (sección/subsección) en negrita |
| `features/libro-diario/lib/exportar-libro-diario.ts` | Modify | Encabezados + fila TOTAL en negrita |
| `features/libro-mayor/lib/exportar-libro-mayor.ts` | Modify | Encabezados + fila TOTAL en negrita |
| `features/balance-general/lib/exportar-balance-general.ts` | Modify | Encabezados + filas de cuadre en negrita |
| `features/estado-resultados/lib/exportar-estado-resultados.ts` | Modify | Encabezados + filas de resultado en negrita |
| `features/comprobantes/lib/exportar-comprobantes.ts` | Modify | Encabezados en negrita (este informe no tiene fila de totales) |
| `*.test.ts` de cada archivo anterior | Modify/Create | Cobertura del nuevo formato |

## Testing Strategy

Vitest, TDD RED→GREEN. Los tests de `construirHoja` ya capturan `sheetData` (arg pasado a `writeXlsxFile`) → assertar props propagadas es directo.

| Archivo | Caso nuevo (assert concreto) |
|---------|------------------------------|
| `construir-hoja.test.ts` | (a) celda con `fontWeight:'bold'` → `sheetData[r][c].fontWeight === 'bold'`. (b) `CeldaNumero` SIN `align` → output `align === 'right'` (default). (c) `CeldaTexto` SIN estilo → output SIN `fontWeight` ni `align` (retrocompat: `'fontWeight' in celda === false`, idem `align`). (d) override: `CeldaNumero` con `align:'left'` → output `align === 'left'`. (e) §4.5 intacto: con estilo, `value === parsearMontoCelda(...)` y `format === '#,##0.00'` |
| `cabecera-fiscal.test.ts` | (a) razón social → fila con `fontWeight:'bold'` y value === razonSocial SIN etiqueta. (b) nit presente → value === `'NIT: <valor>'` SIN fontWeight. (c) campo null (ej. direccion) → no genera fila, nunca `'Dirección: null'`. (d) todos null salvo email → solo 1 fila `'Email: ...'`, sin negrita. (e) orden preservado |
| `aplanar-arbol.test.ts` | filas de subtotal de sección/subsección → `fontWeight:'bold'`; filas de cuenta de detalle → SIN fontWeight |
| `exportar-libro-diario.test.ts` | fila de encabezados (índice tras cabecera fiscal) → toda celda `fontWeight:'bold'`; fila TOTAL → celdas `fontWeight:'bold'` |
| `exportar-libro-mayor.test.ts` | encabezados + fila TOTAL en negrita |
| `exportar-balance-general.test.ts` | encabezados + filas `TOTAL ACTIVO/PASIVO/PATRIMONIO` + cuadre en negrita |
| `exportar-estado-resultados.test.ts` | encabezados + `TOTAL INGRESOS/EGRESOS` + `Resultado del Ejercicio` en negrita |
| `exportar-comprobantes.test.ts` | fila de encabezados en negrita (sin fila de totales) |

Gate final: `pnpm exec tsc -b` y `pnpm run lint` en 0; suite vitest verde.

## Migration / Rollout

No migration required. Frontend-puro, sin estado persistente ni contrato backend. Rollback = revert del PR.

## Open Questions

- Ninguna. (La pregunta abierta del proposal — etiquetas fiscales — fue resuelta por el orquestador: INCLUIRLAS.)
