<!--
Change: documentos-fisicos-ui
Fase: tasks
Fecha: 2026-05-29
Status: COMPLETADO
-->

# Tasks: UI standalone de Documentos Físicos (Change B)

> TDD-first para funciones puras y esquemas. Tests de comportamiento para componentes.
> Patrón base: `frontend/src/features/tipos-documento-fisico/`.
> Comando tests: `cd frontend && pnpm exec vitest run`.

---

## Batch 0 — Pre-flight (no deps)

- [x] 0.1 Crear branch `feat/documentos-fisicos-ui` desde `main`. Verificar backend arriba (`/api/documentos-fisicos` responde).
- [x] 0.2 Confirmar icono lucide disponible: `FileStack` vs `Receipt`; anotar fallback `File` si ninguno existe. → `FileStack` disponible en lucide-react@1.16.0.
- [x] 0.3 Leer `tipos-documento-fisico/` completo como referencia de patrón antes de escribir código.

**REQs**: pre-condición de todos.

---

## Batch 1 — Tipos y función `mensajeDocumentosFisicos` (REQ-DF-UI-01, REQ-DF-UI-06)

> Sin estos tipos el resto no compila. Hacerlos primero.

- [x] 1.1 Agregar a `frontend/src/types/api.ts`: `EstadoAsociacion` (const + tipo), `TipoDocumentoFisicoEmbebido`, `ContactoEmbebido`, `ComprobanteAsociadoView`, `DocumentoFisico`, `DocumentoFisicoDetalle`, `DocumentoFisicoListResponse`, `CreateDocumentoFisicoRequest`, `UpdateDocumentoFisicoRequest`, `ListarDocumentosFisicosParams`. Nunca `any`, `monto: string | null`.
- [x] 1.2 Agregar `mensajeDocumentosFisicos(err: unknown): string` a `frontend/src/lib/error-messages.ts` — mapear los 8 codes de error del backend (ver REQ-DF-UI-06). Seguir el patrón de `mensajeComprobantes`.
- [x] 1.3 Verificar: `pnpm exec tsc --noEmit` desde `frontend/` pasa sin errores.

**REQs**: REQ-DF-UI-01, REQ-DF-UI-06. **Archivos**: `types/api.ts`, `lib/error-messages.ts`.

---

## Batch 2 — Función pura `buildDocumentosFisicosParams` — TDD (REQ-DF-UI-05)

> Función pura: test primero es directo.

- [x] 2.1 **[TEST PRIMERO — RED]** Crear `features/documentos-fisicos/lib/build-documentos-fisicos-params.test.ts`: 3 escenarios (sin filtros→solo page/pageSize; con estadoAsociacion+fechas; numero vacío omitido). Los tests fallan porque el archivo impl no existe.
- [x] 2.2 **[GREEN]** Crear `features/documentos-fisicos/lib/build-documentos-fisicos-params.ts`: `buildDocumentosFisicosParams(filtros, page)` con spread condicional omitiendo vacíos, exportar `PAGE_SIZE = 20`. Tests pasan.
- [x] 2.3 Verificar: `vitest run lib/build-documentos-fisicos-params.test.ts` verde.

**REQs**: REQ-DF-UI-05. **Archivos**: `features/documentos-fisicos/lib/build-documentos-fisicos-params.{ts,test.ts}`.

---

## Batch 3 — Schema Zod `buildFormSchema` — TDD (REQ-DF-UI-04)

> Factory dinámica según `esTributario`. Test de los 6 escenarios antes de la impl.

- [x] 3.1 **[TEST PRIMERO — RED]** Crear `features/documentos-fisicos/schemas/documento-fisico-form-schema.test.ts`: 6 escenarios de REQ-DF-UI-04 (tributario sin monto, tributario con monto cero, no-tributario sin monto OK, número con espacio inválido, número uppercase+guión válido, tributario con monto y moneda válidos).
- [x] 3.2 **[GREEN]** Crear `features/documentos-fisicos/schemas/documento-fisico-form-schema.ts`: factory `buildFormSchema(esTributario)` con `superRefine`, `MONTO_REGEX`, `NUMERO_REGEX`, `DEFAULT_CREATE_VALUES`, `mapDetalleToFormValues`. Tipo `DocumentoFisicoFormValues` derivado con `z.infer`. Sin `any`.
- [x] 3.3 Verificar: `vitest run documento-fisico-form-schema.test.ts` verde (8/8 — escenarios ampliados).

**REQs**: REQ-DF-UI-04. **Archivos**: `schemas/documento-fisico-form-schema.{ts,test.ts}`.

---

## Batch 4 — Capa de API (REQ-DF-UI-02)

> Funciones puras de request. Depend de Batch 1 (tipos).

- [x] 4.1 Crear `features/documentos-fisicos/api/create-documento-fisico.ts`: `POST /documentos-fisicos`, recibe `CreateDocumentoFisicoRequest`, retorna `Promise<DocumentoFisico>`.
- [x] 4.2 Crear `features/documentos-fisicos/api/get-documentos-fisicos.ts`: `GET /documentos-fisicos`, recibe `ListarDocumentosFisicosParams`, retorna `Promise<DocumentoFisicoListResponse>`.
- [x] 4.3 Crear `features/documentos-fisicos/api/get-documento-fisico-detalle.ts`: `GET /documentos-fisicos/:id`, recibe `id: string`, retorna `Promise<DocumentoFisicoDetalle>`.
- [x] 4.4 Crear `features/documentos-fisicos/api/update-documento-fisico.ts`: `PATCH /documentos-fisicos/:id`, recibe `id + UpdateDocumentoFisicoRequest`, retorna `Promise<DocumentoFisico>`.
- [x] 4.5 Crear `features/documentos-fisicos/api/eliminar-documento-fisico.ts`: `DELETE /documentos-fisicos/:id`, retorna `Promise<void>`. Sin body.

**REQs**: REQ-DF-UI-02. **Archivos**: `api/*.ts` (5 archivos). Importan solo desde `@/lib/api`.

---

## Batch 5 — Hooks de TanStack Query (REQ-DF-UI-03)

> Dependen de Batch 4 (api). Invalidan con `['documentos-fisicos']`.

- [x] 5.1 Crear `features/documentos-fisicos/hooks/use-documentos-fisicos.ts`: `queryKey: ['documentos-fisicos', params]`, `placeholderData: keepPreviousData`.
- [x] 5.2 Crear `features/documentos-fisicos/hooks/use-documento-fisico-detalle.ts`: `queryKey: ['documentos-fisicos', 'detalle', id]`, `enabled: id !== null`.
- [x] 5.3 Crear `features/documentos-fisicos/hooks/use-documento-fisico-mutations.ts`: `useCreateDocumentoFisico` (onSuccess→toast+invalidate, onError→toast), `useUpdateDocumentoFisico(id)` (ídem), `useEliminarDocumentoFisico` (onSuccess→toast+invalidate; **SIN `onError`** propio — lo maneja el dialog; Anti-F-13). Función interna `useInvalidateDocumentosFisicos`.

**REQs**: REQ-DF-UI-03. **Archivos**: `hooks/*.ts` (3 archivos).

---

## Batch 6 — `ContactoCombobox` (D5)

> Componente reutilizable. Debe existir antes del form.

- [x] 6.1 Crear `features/documentos-fisicos/components/contacto-combobox.tsx`: Popover+Command con `useContactos({ q, pageSize: 50 })`, debounce 350 ms en el input de búsqueda, muestra `razonSocial`, emite `onSelect(contactoId | null)`. Sin `any`.

**REQs**: REQ-DF-UI-10 (form field D5). **Archivos**: `components/contacto-combobox.tsx`.

---

## Batch 7 — Tabla y filtros — TDD (REQ-DF-UI-07)

> Componentes presentacionales. Tests de comportamiento.

- [x] 7.1 **[TEST PRIMERO — RED]** Crear `components/documento-fisico-list-table.test.tsx`: 6 escenarios REQ-DF-UI-07.2.
- [x] 7.2 **[GREEN]** Crear `components/documento-fisico-list-table.tsx`: columnas Número (badge monoespaciado), Tipo, Fecha (DD/MM/YYYY), Monto (o "—"), Contacto (o "—"), Acciones (Editar + Eliminar). Skeleton 8 filas fuera de TableBody. `overflow-x-auto min-w-[700px]`.
- [x] 7.3 **[TEST PRIMERO — RED]** Crear `components/documento-fisico-list-filters.test.tsx`: 4 escenarios REQ-DF-UI-07.1 — chips de estado en lugar de Select (JSDOM friendly).
- [x] 7.4 **[GREEN]** Crear `components/documento-fisico-list-filters.tsx`: inputs numero, select nativo tipo, chips estadoAsociacion (4 opciones), inputs date fechaDesde/fechaHasta. Responsivo (columna en mobile).
- [x] 7.5 Verificar: todos los tests verdes (10 tests en los 2 archivos).

**REQs**: REQ-DF-UI-07. **Archivos**: `components/documento-fisico-list-{table,filters}.{tsx,test.tsx}`.

---

## Batch 8 — Form con condicionalidad D1/D2/D7 — TDD (REQ-DF-UI-04, 08, 09, 11)

> El form es el componente más complejo. Tests primero.

- [x] 8.1 **[TEST PRIMERO — RED]** Crear `components/documento-fisico-form.test.tsx`: 7 escenarios REQ-DF-UI-17.3 (create habilitado; edit con CONTABILIZADO→numero disabled+texto ayuda; edit sin CONTABILIZADO→numero editable; isSubmitting→botón disabled; tipo tributario→monto/moneda visibles; tipo no-tributario→ocultos; tipear minúsculas→uppercase). Gotcha: `mock.calls[0]?.[0]` con optional chaining; `vi.mock('../../hooks/use-documentos-fisicos')`.
- [x] 8.2 **[GREEN]** Crear `components/documento-fisico-form.tsx`: react-hook-form + resolver `buildFormSchema(esTributario)` (useMemo). `watch('tipoDocumentoFisicoId')` → busca tipo → deriva `esTributario`. `onChange` de numero → `.toUpperCase()`. `onBlur` → `.trim()`. Al cambiar a no-tributario: `setValue('monto', null) + setValue('moneda', null)`. Campo glosa con Anti-F-14 className. ContactoCombobox para contactoId.
- [x] 8.3 Verificar: `vitest run documento-fisico-form.test.tsx` verde (7/7).

**REQs**: REQ-DF-UI-04, REQ-DF-UI-08, REQ-DF-UI-09, REQ-DF-UI-11. **Archivos**: `components/documento-fisico-form.{tsx,test.tsx}`.

---

## Batch 9 — FormSheet y DetalleDrawer (REQ-DF-UI-10, 11, 12)

> Wrappers de Sheet. Dependen de Batch 8 (form) y Batch 5 (hooks).

- [x] 9.1 Crear `components/documento-fisico-form-sheet.tsx`: Sheet `sm:max-w-3xl`. Props `open, onOpenChange, documento?`. Mode create/edit. Carga `useDocumentoFisicoDetalle(documento.id)` en edit para `comprobantesAsociados` (D2). Skeleton mientras carga. Botón submit deshabilitado en `isSubmitting` (Anti-F-07). `onSuccess`→`onOpenChange(false)`. Reset al cerrar.
- [x] 9.2 Crear `components/documento-fisico-detalle-drawer.tsx`: Sheet `sm:max-w-xl`. Secciones: Datos, Monto (solo si ≠ null), Estado derivado (badge Suelto/En borrador/Contabilizado), Comprobantes asociados. Badges solo con variables de tema (Anti-F-10). Skeleton si isLoading, error message si isError. Footer con botones Cerrar/Editar/Eliminar.

**REQs**: REQ-DF-UI-10, REQ-DF-UI-11, REQ-DF-UI-12. **Archivos**: `components/documento-fisico-form-sheet.tsx`, `components/documento-fisico-detalle-drawer.tsx`.

---

## Batch 10 — Dialog de eliminación — TDD (REQ-DF-UI-13)

- [x] 10.1 **[TEST PRIMERO — RED]** Crear `components/eliminar-documento-fisico-dialog.test.tsx`: 3 escenarios REQ-DF-UI-13 (texto de confirmación incluye numero; click Eliminar→preventDefault, dialog no cierra; isPending→botón disabled).
- [x] 10.2 **[GREEN]** Crear `components/eliminar-documento-fisico-dialog.tsx`: AlertDialog con botón destructive, `AlertDialogAction` con `e.preventDefault()` (§14.3). `onSuccess`→`onOpenChange(false)`. `onError` del call de mutate→`toast.error(mensajeDocumentosFisicos(err))`. `isPending`→disabled+"Eliminando…". Botón cancelar también presente.
- [x] 10.3 Verificar: `vitest run eliminar-documento-fisico-dialog.test.tsx` verde (3/3).

**REQs**: REQ-DF-UI-13. **Archivos**: `components/eliminar-documento-fisico-dialog.{tsx,test.tsx}`.

---

## Batch 11 — Página orquestadora (REQ-DF-UI-14)

> Integra todos los componentes anteriores.

- [x] 11.1 Crear `features/documentos-fisicos/pages/documentos-fisicos-page.tsx`: Header canónico §13.1 (h1 "Documentos físicos", subtítulo, botón "Nuevo documento" con `<Plus>`). Estado: `sheetOpen+documentoEditando`, `drawerOpen+documentoDetalle`, `eliminarDialogOpen+documentoEliminando`. Filtros en `useSearchParams` (D6); cambio resetea page=1. `useDebouncedValue(numero, 350)`. `buildDocumentosFisicosParams(filtros, page)` → `useDocumentosFisicos`. `PaginationBar` solo si `data !== undefined`. Montar `DocumentoFisicoFormSheet`, `DocumentoFisicoDetalleDrawer`, `EliminarDocumentoFisicoDialog`.
- [x] 11.2 Agregar TODO de permisos granulares si `useHasPermission` no existe aún (REQ-DF-UI-16): `// TODO: ocultar si !hasPermission('contabilidad.documentos-fisicos.create')`.

**REQs**: REQ-DF-UI-14, REQ-DF-UI-16. **Archivos**: `pages/documentos-fisicos-page.tsx`.

---

## Batch 12 — Router y nav-item (REQ-DF-UI-15)

- [x] 12.1 Modificar `frontend/src/routes/router.tsx`: agregar `{ path: '/documentos-fisicos', element: <DocumentosFisicosPage /> }` con el guard de autenticación existente.
- [x] 12.2 Modificar `frontend/src/components/nav-items.ts`: agregar item `{ to: '/documentos-fisicos', label: 'Documentos físicos', icon: FileStack }` (usar icono confirmado en Batch 0.2). Posición: después de "Tipos de documento", antes de "Períodos fiscales".

**REQs**: REQ-DF-UI-15. **Archivos**: `routes/router.tsx`, `components/nav-items.ts`.

---

## Batch 13 — Pasada de gotchas y verificación final (REQ-DF-UI-17, REQ-DF-UI-18)

- [x] 13.1 Revisar todos los tests generados: `mock.calls[0]?.[0]` con optional chaining en todos los accesos por índice (`noUncheckedIndexedAccess`).
- [x] 13.2 Verificar Radix en JSDOM: cualquier `getByText` sobre opciones de Select/Command → reemplazar con `getAllByText(...)[0]` o `getByRole('option', { name: ... })`.
- [x] 13.3 Verificar Anti-F-14 (glosa): `className="w-full max-w-full resize-y [field-sizing:fixed] min-h-[80px] text-base md:text-sm"`.
- [x] 13.4 Verificar Anti-F-10: ningún badge/color usa variables literales de Tailwind (`red-500`, `green-600`, etc.) — solo variables del tema.
- [x] 13.5 Verificar §4.5: input `monto` es `type="text"`, no `type="number"`.
- [x] 13.6 Correr `cd frontend && pnpm exec vitest run src/features/documentos-fisicos` — todos verdes.
- [x] 13.7 Correr `cd frontend && pnpm exec tsc --noEmit` — cero errores.
- [x] 13.8 Correr `cd frontend && pnpm run lint src/features/documentos-fisicos` — cero warnings (1 warning esperado: react-hooks/incompatible-library de watch(), mismo que tipos-documento-fisico-form, aceptado en el proyecto).
- [ ] 13.9 Completar checklist responsive/dark-mode del §7 del frontend CLAUDE.md en el PR body (REQ-DF-UI-18).
- [ ] 13.10 Crear PR con título `feat(documentos-fisicos): UI standalone CRUD de documentos físicos`. Secciones Qué / Por qué / Cómo probar (§9.4). Incluir checklist §7.

**REQs**: REQ-DF-UI-17, REQ-DF-UI-18. Verificación cruzada de todos los gotchas del design.

---

## Resumen de batches

| Batch | Tareas | Foco | REQs |
|-------|--------|------|------|
| 0 | 3 | Pre-flight | — |
| 1 | 3 | Tipos + mensajeDocumentosFisicos | 01, 06 |
| 2 | 3 | buildDocumentosFisicosParams (TDD) | 05 |
| 3 | 3 | buildFormSchema factory (TDD) | 04 |
| 4 | 5 | Capa api/ (5 funciones) | 02 |
| 5 | 3 | Hooks TanStack Query | 03 |
| 6 | 1 | ContactoCombobox | 10 (D5) |
| 7 | 5 | ListTable + ListFilters (TDD) | 07 |
| 8 | 3 | Form condicional D1/D2/D7 (TDD) | 04, 08, 09, 11 |
| 9 | 2 | FormSheet + DetalleDrawer | 10, 11, 12 |
| 10 | 3 | EliminarDialog 409 (TDD) | 13 |
| 11 | 2 | Página orquestadora | 14, 16 |
| 12 | 2 | Router + nav-item | 15 |
| 13 | 10 | Gotchas + verificación + PR | 17, 18 |
| **Total** | **48** | | |

> Tareas TDD marcadas (RED/GREEN): Batches 2, 3, 7, 8, 10. El resto son implementación directa o modificación de archivos existentes.
