# Proposal: Asociación inline de documentos físicos en el comprobante (Change A)

## Intent

El contador tiene el papel (factura/recibo) en la mano mientras registra el asiento. Hoy no puede asociarlo sin saltar de pantalla. Este change agrega una sección **"Documentos de respaldo"** dentro del form/detalle del comprobante con un combobox **"buscar o crear"**: tipea el número, lo selecciona si existe, o lo crea inline si no. El backend ya está mergeado (PR #45); falta solo la UI.

## Scope

### In Scope
- Sección "Documentos de respaldo" en form (editar) y detalle del comprobante.
- Combobox Popover+Command "buscar o crear" con mini-form inline (tipo, número, fecha, monto/moneda solo si `esTributario`) que crea+asocia en un paso.
- Lista de asociados (hasta 50) con desasociar; dos contextos: editable (BORRADOR / CONTABILIZADO período abierto) vs read-only (BLOQUEADO / anulado → card sin botones).
- Pre-filtro por `tipo.tiposComprobanteAplicables` que incluya el tipo del comprobante.
- API/hooks de asociación (`get`/`asociar`/`desasociar`) en `features/comprobantes/`.
- Manejo de errores accionables (409 ya-asociado, 403 sin permiso, 409 período cerrado, 422 incompatible).

### Out of Scope
- CRUD standalone de documentos físicos (Change B, ya en main #49).
- Item 2 backstop de race en `contabilizar` (deuda backend, post-UI).
- Numeración SISTEMA vs MANUAL y auto-entries de ventas (Fase 1.5+).

## Capabilities

### New Capabilities
- `comprobante-documentos-respaldo-ui`: sección inline en el comprobante para buscar/crear/asociar/desasociar documentos físicos, con gating editable/read-only y pre-filtro de compatibilidad.

### Modified Capabilities
- None. El backend (`documento-fisico` spec) no cambia su comportamiento; este change consume el contrato ya vivo.

## Approach

Frontend-only, screaming architecture en `features/comprobantes/`. Nuevos `api/` (get/asociar/desasociar) + `hooks/` (useQuery lista asociados; useMutation asociar/desasociar con invalidations) + componentes (`documentos-respaldo-section`, `documento-fisico-combobox`, mini-form inline). **Reusa de B** (importando solo desde sus hooks, §14.6): `useDocumentosFisicos` (búsqueda), mutation de create, `documento-fisico-form-schema` (`buildFormSchema`), `mensajeDocumentosFisicos`. Gating con `usePuedeEditarContabilizado` (ya existe). Insertar la sección en `comprobante-detail-page.tsx` (read-only/editable) y `editar-comprobante-page.tsx`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/features/comprobantes/api/` | New | get/asociar/desasociar documentos |
| `frontend/src/features/comprobantes/hooks/` | New | hooks query+mutation de asociación |
| `frontend/src/features/comprobantes/components/` | New | sección, combobox, mini-form, card read-only |
| `frontend/src/features/comprobantes/components/comprobante-detail-page.tsx` | Modified | insertar sección |
| `frontend/src/features/comprobantes/components/editar-comprobante-page.tsx` | Modified | insertar sección en el form |
| `frontend/src/lib/error-messages.ts` | Modified | codes nuevos de asociación si faltan |
| `frontend/src/features/documentos-fisicos/hooks/` | Reuse | búsqueda + create (solo import) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Toast 422 genérico oculta `TIPO_DOCUMENTO_INCOMPATIBLE` | Med | Pre-filtrar por `tiposComprobanteAplicables` + mostrar `code`/`message` real |
| Asociar en CONTABILIZADO sin `edit-posted` → 403 | Med | Gating con `usePuedeEditarContabilizado`; traducir `SIN_PERMISO_EDITAR_CONTABILIZADO` |
| Importar de `api/`/`components/` de B (rompe §12 Anti-F-12) | Low | Importar solo desde hooks de B, comentario `// Cross-feature:` |
| Combobox sin media queries en JSDOM | Low | `getAllByText`; `tsc -b` para CI |

## Rollback Plan

Frontend-only, sin migraciones ni cambios de schema/dominio. Revertir el PR squash (`git revert <sha>`) restaura el comprobante sin la sección. No hay estado persistido nuevo: las asociaciones creadas siguen válidas vía backend y Change B.

## Dependencies

- Backend de asociación mergeado (PR #45) — disponible.
- Capa de datos de Change B en `features/documentos-fisicos/` (#49) — en main.

## Success Criteria

- [ ] En BORRADOR y CONTABILIZADO-período-abierto se puede buscar, crear inline y asociar/desasociar documentos.
- [ ] En BLOQUEADO/anulado se ve card read-only sin botones.
- [ ] El combobox solo ofrece tipos compatibles con el tipo del comprobante.
- [ ] Errores 409/403/422 muestran mensaje accionable en español.
- [ ] `pnpm exec tsc -b && vite build` verde + tests vitest de los componentes nuevos.
