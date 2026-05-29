# Proposal: Selector de Contacto por línea de comprobante (UI)

## Intent

El editor de líneas de comprobantes NO tiene selector de Contacto, pero el backend EXIGE `contactoId` al CONTABILIZAR líneas contra cuentas con `requiereContacto = true` (`comprobantes.service.ts:361` → `ContactoRequeridoError`). Flujo roto: se guarda el borrador pero NO se puede contabilizar desde la UI. Hay que cerrar el gap agregando el input de contacto por línea.

## Scope

### In Scope
- Columna/selector de Contacto por línea en `linea-row.tsx`, reutilizando un `ContactoCombobox` (server-side search).
- Feedback temprano en la UI cuando la cuenta de la línea tiene `requiereContacto = true` y falta contacto (validación blanda, no bloquea guardar borrador).
- Mostrar el nombre del contacto en el detalle read-only (`comprobante-detail-page.tsx`) — hoy no aparece.

### Out of Scope
- Cambios de backend (contrato, validación y endpoint `GET /api/contactos` ya existen).
- Endurecer el enforcement: se mantiene SOLO al contabilizar; guardar borrador con contacto faltante sigue permitido.
- Alta de contacto inline desde el comprobante (el directorio se gestiona en `features/contactos`).

## Capabilities

### New Capabilities
- None (es un gap de UI sobre una capacidad existente).

### Modified Capabilities
- None a nivel spec backend. (Si se requiere delta spec de UI, se acota en la fase de specs como comportamiento de `comprobante-documentos-respaldo-ui` análogo.)

## Approach

Reutilizar el `ContactoCombobox` ya existente en `documentos-fisicos/components` (mismo patrón que `cuenta-autocomplete` / `documento-fisico-combobox`): server-side search vía `useContactos({ q, activo: true })` con debounce. Decisiones a cerrar en design:

1. **Visibilidad de la columna**: siempre visible vs. solo cuando la cuenta de la línea tiene `requiereContacto`. Recomendación: columna siempre presente, pero resaltar/requerir solo cuando aplica (evita layout que salta al cambiar cuenta).
2. **Validación**: requerido condicional en Zod (cuando `requiereContacto`) vs. blanda + dejar que el backend rechace. Recomendación: validación blanda + aviso visual temprano; el enforcement duro queda en backend al contabilizar (single source of truth, §4.1).
3. **Componente compartido**: promover `ContactoCombobox` a `components/shared` o importarlo cross-feature (`// Cross-feature:`). Recomendación: evaluar en design; hoy vive en `documentos-fisicos`.
4. **Detalle read-only**: resolver nombre vía `useContactos` (la respuesta de línea solo trae `contactoId`, no el nombre).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/features/comprobantes/components/linea-row.tsx` | Modified | Agregar selector de Contacto + error inline |
| `frontend/src/features/comprobantes/schemas/linea-schema.ts` | Modified | Validación blanda condicional (opcional) |
| `frontend/src/features/comprobantes/components/comprobante-detail-page.tsx` | Modified | Mostrar nombre del contacto en read-only |
| `frontend/src/features/comprobantes/components/contacto-combobox.tsx` o `components/shared` | New/Reused | Combobox de contacto (promover el de docs-físicos) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Foco salta en la tabla al setear contacto (igual que el bug de `debitoBob`) | Med | Usar `setValue(..., { shouldValidate })` sin `useEffect`; no tocar `field.id` del `useFieldArray` |
| Requerido condicional necesita la flag `requiereContacto` por línea | Med | El tipo `Cuenta` ya la trae; `useCuentas` la expone — leerla por `cuentaId` |
| Columna extra rompe layout en mobile (tabla ya ancha) | Med | Scroll-x + `min-w`; verificar 375/768/1440 + dark (§7 checklist) |
| Combobox compartido entre 2 features acopla | Low | Importar solo del hook con comentario `// Cross-feature:` o promover a `shared` |

## Rollback Plan

Revertir el PR (squash). El backend no cambia, así que los borradores ya guardados con `contactoId` persisten; quitar el input solo revierte la capacidad de cargarlo desde la UI. Sin migraciones que deshacer.

## Dependencies

- `GET /api/contactos` con búsqueda `q` (existe) y hook `useContactos` (existe).
- Tipo `Cuenta.requiereContacto` en el frontend (existe, `types/api.ts:99`).

## Success Criteria

- [ ] El usuario puede asignar un contacto a una línea desde el editor.
- [ ] Una línea con cuenta `requiereContacto=true` y sin contacto muestra aviso antes de contabilizar.
- [ ] Contabilizar un comprobante con contactos asignados ya no falla con `ContactoRequeridoError` por falta de input.
- [ ] El detalle read-only muestra el nombre del contacto de cada línea.
- [ ] Checklist responsive (375/768/1440) + dark mode verificado.
