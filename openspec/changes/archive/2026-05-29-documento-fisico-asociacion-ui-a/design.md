# Design: Asociación inline de documentos físicos en el comprobante (Change A)

## Technical Approach

Frontend-only en `features/comprobantes/`. Nueva capa `api/` (3 fns) + `hooks/` (1 query, 2 mutations) + `components/` (sección + combobox "buscar o crear" + card read-only). Reusa de B SOLO sus hooks (búsqueda, create, `buildFormSchema`, `mensajeDocumentosFisicos`) — §14.6. Gating con `usePuedeEditarContabilizado` (ya existe). La sección se monta en 3 contextos derivados del par `(estado, anulado, período)`.

## Architecture Decisions

| # | Decisión | Alternativa rechazada | Rationale |
|---|----------|----------------------|-----------|
| D1 | Capa `api/` propia en comprobantes (`asociar/desasociar/get`) | Reusar api de B | Endpoints viven bajo `/comprobantes/:id/documentos-fisicos`; son de comprobantes. §8 1-archivo-por-endpoint |
| D2 | Combobox = búsqueda (lista B) + ítem fijo "Crear «{q}»" que abre mini-form inline | Modal separado / 2 pantallas | El intent es "tipea el número, créalo si no existe" sin saltar de pantalla |
| D3 | Crear+asociar = 2 mutations encadenadas (create de B → asociar de A en `onSuccess`) | 1 endpoint atómico backend | El backend no expone create+asociar atómico; encadenar en cliente es lo disponible. Si create OK pero asociar falla, el doc queda SUELTO (recuperable vía Change B) — toast lo explica |
| D4 | Pre-filtro de compatibilidad client-side sobre la lista de B | Param backend nuevo | El backend de B no expone filtro por `tiposComprobanteAplicables`; agregar param es scope backend. El tipo embebido del doc trae `tipoDocumentoFisico` pero NO `tiposComprobanteAplicables` → ver D8 |
| D5 | Gating: `editable = !anulado && estado∈{BORRADOR,CONTABILIZADO} && (BORRADOR ‖ puedeEditarContabilizado)` | Replicar lógica ad-hoc | Alinea con `esEditable` de `editar-comprobante-page` (filtra anulado/BLOQUEADO). `puedeEditarContabilizado` cubre el permiso `edit-posted` |
| D6 | Mapear codes de asociación en `mensajeComprobantes` (no helper nuevo) | Helper `mensajeAsociacion` | Los 4 codes son del módulo comprobantes; hoy caen al fallback genérico. Agregar `case` resuelve el toast 422 genérico |
| D7 | Invalidar `['comprobantes','detail',id]` + `['documentos-fisicos']` tras mutar | Solo refetch local | El detail del comprobante y la lista standalone de B deben reflejar la asociación. Query key de asociados: `['comprobantes','documentos-fisicos',id]` |
| D8 | El combobox carga tipos vía `useTiposDocumentoFisico` (hook de B) para conocer `tiposComprobanteAplicables` y filtrar | Filtrar por doc | El `DocumentoFisico` embebido NO trae `tiposComprobanteAplicables`; sí el `TipoDocumentoFisico` completo. Se cruza `doc.tipoDocumentoFisico.id` contra los tipos compatibles |

## Data Flow

    EditarComprobantePage / ComprobanteDetailPage
        │ (pasa comprobante + flag editable)
        ▼
    DocumentosRespaldoSection ──┬─ useDocumentosAsociados(id) ── GET .../documentos-fisicos
        │ editable?             │
        ├── DocumentoFisicoCombobox (buscar/crear)
        │     ├─ useDocumentosFisicos(q)        [hook B: búsqueda]
        │     ├─ useTiposDocumentoFisico()      [hook B: filtro compat]
        │     ├─ select existente → useAsociarDocumentos.mutate([id])
        │     └─ "Crear «q»" → mini-form → useCreateDocumentoFisico [B]
        │                          └─onSuccess→ useAsociarDocumentos.mutate([nuevoId])
        └── lista asociados (Card) → useDesasociarDocumento.mutate(docId)
                                          │
              invalidate ['comprobantes','documentos-fisicos',id] + ['documentos-fisicos']

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `features/comprobantes/api/get-documentos-asociados.ts` | Create | GET `/api/comprobantes/:id/documentos-fisicos` → `DocumentoFisico[]` |
| `features/comprobantes/api/asociar-documentos.ts` | Create | POST body `{ documentoFisicoIds: string[] }` |
| `features/comprobantes/api/desasociar-documento.ts` | Create | DELETE `.../:documentoFisicoId` (204) |
| `features/comprobantes/hooks/use-documentos-asociados.ts` | Create | `useQuery` key `['comprobantes','documentos-fisicos',id]` |
| `features/comprobantes/hooks/use-asociar-documentos.ts` | Create | `useMutation` + invalidación (D7); sin `onError` propio (Anti-F-13, la sección lo maneja) |
| `features/comprobantes/hooks/use-desasociar-documento.ts` | Create | `useMutation` + invalidación |
| `features/comprobantes/components/documentos-respaldo-section.tsx` | Create | Orquesta combobox + lista; recibe `comprobante` + `editable` |
| `features/comprobantes/components/documento-fisico-combobox.tsx` | Create | Popover+Command "buscar o crear" + mini-form inline |
| `features/comprobantes/components/documento-asociado-card.tsx` | Create | Ítem de lista (read-only o con botón desasociar) |
| `features/comprobantes/components/comprobante-detail-page.tsx` | Modify | Insertar `<DocumentosRespaldoSection>` tras la tabla de Líneas (L323), `editable` según D5 |
| `features/comprobantes/components/editar-comprobante-page.tsx` | Modify | Insertar sección en `EditorForm` tras `LineasEditor` solo si `!isNuevo` (necesita `comprobante.id`); `editable` según `mode` |
| `lib/error-messages.ts` | Modify | Agregar 4 `case` a `mensajeComprobantes` (D6) |
| `features/comprobantes/components/*.test.tsx` | Create | Tests de section + combobox (ver Testing) |

## Interfaces / Contracts

```ts
// api/asociar-documentos.ts
export async function asociarDocumentos(comprobanteId: string, ids: string[]): Promise<void>;
// hooks
export function useDocumentosAsociados(comprobanteId: string); // DocumentoFisico[]
export function useAsociarDocumentos(comprobanteId: string);    // mutate(ids: string[])
export function useDesasociarDocumento(comprobanteId: string);  // mutate(docId: string)
```

Codes a mapear en `mensajeComprobantes` (D6): `TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE`, `DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO`, `COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO`, `COMPROBANTE_DOCUMENTO_FISICO_NO_EXISTE` (+ `MISSING_PERMISSION_EDIT_POSTED` ya existe).

El mini-form reusa `buildFormSchema(esTributario)` + `DEFAULT_CREATE_VALUES` de B; `esTributario` se deriva del tipo seleccionado en el combo. Tipos del backend ya en `types/api.ts` (`DocumentoFisico`, `TipoDocumentoFisico`, `EstadoAsociacion`, `TipoComprobante`) — NO redefinir.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Component | `documentos-respaldo-section`: editable muestra combobox+desasociar; read-only (BLOQUEADO/anulado) oculta botones | RTL, render con QueryClient mock; `getAllByText` (Anti JSDOM) |
| Component | `documento-fisico-combobox`: filtra por `tiposComprobanteAplicables`; "Crear «q»" abre mini-form; create+asociar encadenado | `user-event`; mock hooks vía `as unknown as` |
| Unit | 4 codes nuevos en `mensajeComprobantes` | test directo de la fn (Zod no aplica; es switch) |
| Manual | viewports 375/768/1440 + dark mode (checklist §7) | pre-merge |

No e2e (frontend-only). Verificación CI: `pnpm exec tsc -b && vite build`.

## Migration / Rollout

No migration. Frontend-only, sin schema. Rollback = revert del PR squash.

## Open Questions

- [ ] Ninguna que bloquee. Confirmar en `sdd-tasks` si el mini-form vive embebido en el combobox (`PopoverContent` con vista alterna) o como `Dialog` aparte disparado desde el ítem "Crear" — preferencia del diseño: vista alterna dentro del Popover para no perder el contexto del número tipeado.
