# Design: Selector de Contacto por línea de comprobante (UI)

## Technical Approach

Cerrar un gap de UI sobre infraestructura ya completa: `LineaFormValues.contactoId` ya existe (`types.ts:23`), el payload lo propaga vía `...l` spread (`editar-comprobante-page.tsx:184,210`), `mapComprobanteToFormValues` ya hidrata `contactoId` desde la respuesta (`:58`), y la línea read-only (`LineaComprobante.contactoId`) lo trae. Faltan solo tres piezas de presentación: (1) input de contacto por línea en `LineaRow`, (2) aviso blando cuando la cuenta `requiereContacto`, (3) nombre del contacto en el detalle read-only. Cero cambios de backend, cero cambios de payload.

## Architecture Decisions

### Decisión 1: Columna Contacto siempre visible
**Choice**: Columna presente en toda fila; el input solo se resalta/marca obligatorio cuando la cuenta de la línea tiene `requiereContacto = true`.
**Alternatives**: Columna condicional que aparece/desaparece según la cuenta.
**Rationale**: Una cuenta puede pasar a requerir contacto al cambiar `cuentaId`; columna condicional haría saltar el layout de la tabla en cada cambio de cuenta (regresión de UX peor que el ancho extra). La tabla ya usa `overflow-x-auto` (`lineas-editor.tsx:135`), así que el scroll-x absorbe la columna en mobile (§7 tablas). Affected: `lineas-editor.tsx` (header), `linea-row.tsx` (celda).

### Decisión 2: Validación blanda, no Zod required condicional
**Choice**: NO agregar `contactoId` requerido en `lineaSchema`. Aviso visual inline (borde/texto ambar) cuando `requiereContacto && !contactoId`. El enforcement duro queda en backend al contabilizar.
**Alternatives**: `superRefine` que exige `contactoId` cuando la cuenta lo requiere.
**Rationale**: El backend solo exige contacto AL CONTABILIZAR (`comprobantes.service.ts:361`), no al guardar borrador. Un Zod required bloquearía guardar borradores válidos — contradice el scope (proposal §Out of Scope) y la regla single-source-of-truth (raíz §4.1). El schema necesitaría leer `requiereContacto` de la cuenta, dato que no vive en el form; meterlo ahí acopla el schema a `useCuentas`. Mantener Zod agnóstico al estado del servidor. Affected: `linea-schema.ts` (sin cambios de required), `linea-row.tsx` (aviso).

### Decisión 3: Promover `ContactoCombobox` a `components/shared/`
**Choice**: Mover `documentos-fisicos/components/contacto-combobox.tsx` → `components/shared/contacto-combobox.tsx`. Actualizar el import en `documentos-fisicos`.
**Alternatives**: Import cross-feature `// Cross-feature:` desde `documentos-fisicos`.
**Rationale**: El componente es 100% neutral al dominio (props `value: string | null`, `onSelect`, ya consume el hook `useContactos` cross-feature internamente — `contacto-combobox.tsx:20`). Sería el segundo consumidor; §14.6 permite el import cross-feature, pero §2 reserva `components/shared/` para "componentes cross-feature reutilizables" — un combobox de contacto usado por 2+ features es exactamente eso. Promover evita que `comprobantes` dependa de `documentos-fisicos` (acople lateral entre dos features de dominio, peor que depender de `shared/`). Contrato de props ya neutral, no cambia. Affected: mover archivo + su test, ajustar 1 import.

### Decisión 4: Read-only resuelve nombre via `useContactos`
**Choice**: En `comprobante-detail-page.tsx`, cargar `useContactos({ activo: true, pageSize: 50 })`, construir `Map<id, razonSocial>`, mostrar `razonSocial` con fallback al UUID si no está (mismo patrón que cuentas, `:115,288`).
**Alternatives**: Pedir al backend embeber el nombre (full-stack, fuera de scope frontend-only).
**Rationale**: Espeja exactamente el patrón ya aceptado para cuentas en esa misma página. Mismo riesgo conocido (cap de pageSize) con la misma mitigación (fallback al id). Mantener el change frontend-only. Affected: `comprobante-detail-page.tsx`.

### Decisión 5: Patrón anti-regresión de foco
**Choice**: Integrar el combobox con `value={watch(lineas.${index}.contactoId)}` + `onSelect={(id) => setValue(lineas.${index}.contactoId, id ?? undefined, { shouldValidate: false })}`. SIN `useEffect`, SIN tocar campos que el `useFieldArray` trackea para `field.id`.
**Alternatives**: `useEffect + setValue` para sincronizar.
**Rationale**: Espeja exacto a `CuentaAutocomplete` (`linea-row.tsx:54-60`), que ya funciona sin perder foco. El bug histórico (`linea-schema.ts:25-29`) fue por `setValue` de campos derivados (`debitoBob`) dentro de efectos durante keystroke; el contacto se setea por evento de usuario (select), no en render, así que no regenera `field.id`. `shouldValidate: false` porque la validación es blanda (Decisión 2). Affected: `linea-row.tsx`.

## Data Flow

    Usuario → ContactoCombobox.onSelect(id)
       │
       └→ setValue('lineas.i.contactoId', id)   (RHF, sin re-mount de fila)
              │
              └→ onSubmit → poblarBobEnLineas → {...l} (contactoId ya incluido) → payload

    Detail read-only:
    useContactos → Map<id,razonSocial> → linea.contactoId → nombre | fallback(UUID)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/components/shared/contacto-combobox.tsx` | Create (move) | Promovido desde `documentos-fisicos/components/`. Sin cambios de contrato |
| `frontend/src/components/shared/contacto-combobox.test.tsx` | Create (move) | Test acompaña al componente |
| `frontend/src/features/documentos-fisicos/components/contacto-combobox.tsx` | Delete | Reemplazado por el de `shared/` |
| `frontend/src/features/documentos-fisicos/**` | Modify | Ajustar import al nuevo path |
| `frontend/src/features/comprobantes/components/linea-row.tsx` | Modify | Celda Contacto (combobox + aviso blando); leer `requiereContacto` de la cuenta |
| `frontend/src/features/comprobantes/components/lineas-editor.tsx` | Modify | `<th>Contacto</th>`; pasar `cuentas` a `LineaRow` (ya recibe prop `cuentas` no usada) |
| `frontend/src/features/comprobantes/components/comprobante-detail-page.tsx` | Modify | Columna Contacto en tabla read-only + resolución de nombre |
| `frontend/src/features/comprobantes/components/linea-row.test.tsx` | Create | Nuevo test del combobox + aviso |

## Interfaces / Contracts

`ContactoCombobox` (sin cambios — ya neutral):
```ts
interface ContactoComboboxProps {
  value: string | null;
  onSelect: (contactoId: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}
```

`LineaRow` recibe la cuenta para leer `requiereContacto`. La flag vive en `Cuenta` (`types/api.ts:99`); `LineasEditor` ya recibe `cuentas: Cuenta[]` (prop hoy sin uso) y la baja a cada fila:
```ts
interface LineaRowProps {
  index: number;
  cuentas: Cuenta[];   // nuevo: para resolver requiereContacto por cuentaId
  onRemove: () => void;
  isOnlyRow: boolean;
  disabled?: boolean;
}
```

Schema: **sin cambios**. `contactoId: z.string().optional()` ya existe (`linea-schema.ts:18`). El combobox emite `null` al limpiar → mapear a `undefined` antes de `setValue` (`exactOptionalPropertyTypes`).

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (component) | `LineaRow`: selecciona contacto y persiste en form; aviso aparece cuando `requiereContacto` y falta contacto, desaparece al elegirlo; NO bloquea con cuenta sin requerimiento | Testing Library + `user-event`, `getByRole('combobox')`/`getByText` (§9) |
| Unit (component) | `ContactoCombobox` movido: test existente sigue verde en `shared/` | Re-run del test movido |
| Unit (component) | Detail read-only: muestra `razonSocial`; fallback a UUID si fuera del cap | render con contacto presente/ausente |
| Foco (regresión) | Tipear en Debe tras elegir contacto NO pierde foco | `lineas-editor.test.tsx` extendido |

No integration/E2E nuevos: cero cambios de backend ni de contrato HTTP.

## Migration / Rollout

No migration required. Revert = revert del PR squash; borradores con `contactoId` ya guardados persisten (proposal §Rollback).

## Open Questions

- None.
