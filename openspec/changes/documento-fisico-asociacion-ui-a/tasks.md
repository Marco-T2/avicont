# Tasks: Asociación inline de documentos físicos en el comprobante (Change A)

## Phase 1: Foundation — Types, error messages, API layer

- [x] 1.1 Verificar que `DocumentoFisico`, `TipoDocumentoFisico`, `EstadoAsociacion`, `TipoComprobante` ya existen en `frontend/src/types/api.ts` — no redefinir
- [x] 1.2 Agregar 4 `case` a `mensajeComprobantes` en `frontend/src/lib/error-messages.ts`: `TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE`, `DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO`, `COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO`, `COMPROBANTE_DOCUMENTO_FISICO_NO_EXISTE` (D6)
- [x] 1.3 Crear `features/comprobantes/api/get-documentos-asociados.ts` — `GET /api/comprobantes/:id/documentos-fisicos` → `DocumentoFisico[]`
- [x] 1.4 Crear `features/comprobantes/api/asociar-documentos.ts` — `POST /api/comprobantes/:id/documentos-fisicos` body `{ documentoFisicoIds: string[] }` → `void`
- [x] 1.5 Crear `features/comprobantes/api/desasociar-documento.ts` — `DELETE /api/comprobantes/:id/documentos-fisicos/:docId` → `void` (204)

## Phase 2: Hooks

- [x] 2.1 Crear `features/comprobantes/hooks/use-documentos-asociados.ts` — `useQuery` key `['comprobantes','documentos-fisicos',id]`, reusa `getDocumentosAsociados`
- [x] 2.2 Crear `features/comprobantes/hooks/use-asociar-documentos.ts` — `useMutation`, invalida `['comprobantes','documentos-fisicos',id]` + `['documentos-fisicos']` en `onSuccess` (D7); sin `onError` propio (Anti-F-13)
- [x] 2.3 Crear `features/comprobantes/hooks/use-desasociar-documento.ts` — `useMutation`, misma invalidación (D7)

## Phase 3: Components

- [x] 3.1 Crear `features/comprobantes/components/documento-asociado-card.tsx` — ítem de lista; props: `documento: DocumentoFisico`, `editable: boolean`, `onDesasociar`: muestra tipo/número/fecha/monto-si-tributario; botón desasociar solo si `editable`; cubre Req lista + Req desasociar (scenarios read-only no muestra botón)
- [x] 3.2 Crear `features/comprobantes/components/documento-fisico-combobox.tsx` — Popover+Command; búsqueda via `useDocumentosFisicos(q)` (hook B); filtra resultados cruzando `doc.tipoDocumentoFisico.id` contra tipos compatibles de `useTiposDocumentoFisico()` (D4, D8); ítem fijo "Crear «{q}»" abre vista alterna mini-form dentro del mismo Popover; mini-form: campos tipo/número/fecha + monto/moneda condicional (`esTributario`) usando `buildFormSchema` + `DEFAULT_CREATE_VALUES` (B); al confirmar: `useCreateDocumentoFisico` (B) → `onSuccess` → `useAsociarDocumentos.mutate([nuevoId])` encadenado (D3); si create OK pero asociar falla, toast explica que el doc quedó suelto; al seleccionar existente: `useAsociarDocumentos.mutate([id])` + cierra combobox y limpia input; errores de mutación mapeados vía `mensajeComprobantes`
- [x] 3.3 Crear `features/comprobantes/components/documentos-respaldo-section.tsx` — orquesta `useDocumentosAsociados`, renderiza lista de `DocumentoAsociadoCard`, muestra skeleton en loading, estado vacío sin error; si `editable`: muestra `DocumentoFisicoCombobox`; gating: `editable = !anulado && estado∈{BORRADOR,CONTABILIZADO} && (BORRADOR ‖ puedeEditarContabilizado)` (D5)

## Phase 4: Integration — páginas existentes

- [x] 4.1 Modificar `features/comprobantes/components/comprobante-detail-page.tsx` — insertar `<DocumentosRespaldoSection comprobante={comprobante} editable={editable} />` tras tabla de Líneas (aprox. L323); calcular `editable` según D5
- [x] 4.2 Modificar `features/comprobantes/components/editar-comprobante-page.tsx` — insertar `<DocumentosRespaldoSection>` en `EditorForm` tras `LineasEditor` solo si `!isNuevo` (requiere `comprobante.id`); pasar `editable` alineado con `mode` existente

## Phase 5: Tests

- [x] 5.1 Crear `features/comprobantes/components/documentos-respaldo-section.test.tsx` — (a) BORRADOR muestra combobox y botones desasociar; (b) CONTABILIZADO período abierto muestra combobox; (c) BLOQUEADO oculta combobox y botones; (d) anulado oculta combobox y botones; (e) lista vacía sin error; (f) skeletons en loading — usa `QueryClient` mock, `as unknown as`, `getAllByText`
- [x] 5.2 Crear `features/comprobantes/components/documento-fisico-combobox.test.tsx` — (a) solo muestra docs con tipo compatible (pre-filtro D4/D8); (b) búsqueda sin resultados muestra "Crear nuevo documento"; (c) seleccionar existente llama `useAsociarDocumentos.mutate` y cierra; (d) mini-form tipo no tributario oculta monto/moneda; (e) mini-form tipo tributario muestra monto/moneda obligatorios; (f) create+asociar encadenado exitoso; (g) toast de doc suelto si create OK pero asociar falla; (h) botón Confirmar disabled mientras pending
- [x] 5.3 Crear `lib/error-messages-comprobantes-docs.test.ts` (o ampliar el existente) — verificar los 4 codes nuevos en `mensajeComprobantes` retornan el mensaje español esperado del spec Req errores

## Phase 6: Verificación CI

- [x] 6.1 Correr `cd frontend && pnpm exec tsc -b` — cero errores de tipo; verificar: Zod v4 `.issues` (no `.errors`), `noUncheckedIndexedAccess` narrowing en arrays, `as unknown as` en mocks de hooks
- [x] 6.2 Correr `cd frontend && pnpm vitest run` — todos los tests pasan; sin `no-restricted-imports` entre features (Anti-F-12)
- [x] 6.3 Checklist manual: viewports 375/768/1440 + dark mode; flujo completo buscar→asociar, crear→asociar, desasociar, error 409/403/422
