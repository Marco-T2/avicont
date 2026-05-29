<!--
Change: documentos-fisicos-ui
Fase: spec
Fecha: 2026-05-29
Status: COMPLETADO
Última revisión contra core: 2026-05-29
Owner: frontend-lead
-->

# Spec: UI standalone de Documentos Físicos (Change B)

> Delta spec — todos los REQs son nuevos (no modifican specs existentes).
> El backend ya está mergeado (PRs #45/#46). Esta spec cubre solo el frontend.

---

## REQ-DF-UI-01 — Tipos compartidos en `types/api.ts`

**Descripción**: Agregar los tipos TypeScript que espejean los DTOs del backend de documentos físicos. Son la fuente de verdad de tipado compartida entre api/, hooks/ y componentes de la feature.

**Criterios de aceptación**:
- `EstadoAsociacion` exportado como objeto const + tipo derivado con valores `SUELTO | EN_BORRADOR | CONTABILIZADO`.
- `TipoDocumentoFisicoEmbebido` con campos `id, nombre, codigo, esTributario`.
- `ContactoEmbebido` con campos `id, razonSocial`.
- `ComprobanteAsociadoView` con campos `id, numero (string | null), estado (string)`.
- `DocumentoFisico` espeja `DocumentoFisicoDto` del backend: `id, numero, fechaEmision (YYYY-MM-DD), monto (string | null), moneda (string | null), glosa (string | null), tipoDocumentoFisico (TipoDocumentoFisicoEmbebido), contacto (ContactoEmbebido | null), organizationId, createdAt`.
- `DocumentoFisicoDetalle` extiende `DocumentoFisico` con `comprobantesAsociados: ComprobanteAsociadoView[]`.
- `DocumentoFisicoListResponse` con `items: DocumentoFisico[], total, page, pageSize`.
- `CreateDocumentoFisicoRequest` con `tipoDocumentoFisicoId (requerido), numero (requerido), fechaEmision (requerido), monto? (string | null), moneda? (Moneda | null), contactoId? (string | null), glosa? (string | null)`.
- `UpdateDocumentoFisicoRequest` idéntico a Create pero todos los campos opcionales.
- `ListarDocumentosFisicosParams` con todos los query params del backend: `tipoDocumentoFisicoId?, fechaDesde?, fechaHasta?, contactoId?, estadoAsociacion?, numero?, page?, pageSize?`.
- `monto` es `string | null` en todos los tipos — NUNCA `number`.
- Sin `any` en ninguno de los tipos.

**Escenario 1 — Tipos no rompen compilación**
- Dado: se agregan los tipos a `types/api.ts`.
- Cuando: se corre `pnpm exec tsc --noEmit` desde `frontend/`.
- Entonces: cero errores de TypeScript.

---

## REQ-DF-UI-02 — Capa de API (`features/documentos-fisicos/api/`)

**Descripción**: Funciones puras de request, una por endpoint, que usan `src/lib/api.ts`. Sin lógica de negocio, sin estado.

**Criterios de aceptación**:
- `create-documento-fisico.ts` — `POST /documentos-fisicos`, recibe `CreateDocumentoFisicoRequest`, retorna `Promise<DocumentoFisico>`.
- `get-documentos-fisicos.ts` — `GET /documentos-fisicos`, recibe `ListarDocumentosFisicosParams`, retorna `Promise<DocumentoFisicoListResponse>`.
- `get-documento-fisico-detalle.ts` — `GET /documentos-fisicos/:id`, recibe `id: string`, retorna `Promise<DocumentoFisicoDetalle>`.
- `update-documento-fisico.ts` — `PATCH /documentos-fisicos/:id`, recibe `id: string` + `UpdateDocumentoFisicoRequest`, retorna `Promise<DocumentoFisico>`.
- `eliminar-documento-fisico.ts` — `DELETE /documentos-fisicos/:id`, recibe `id: string`, retorna `Promise<void>`.
- Todos los archivos importan exclusivamente desde `@/lib/api`.
- Ningún componente ni hook importa desde `api/` directamente — solo los hooks de la feature (Anti-F-12).

**Escenario 1 — Función de lista pasa params correctamente**
- Dado: `getDocumentosFisicos({ estadoAsociacion: 'SUELTO', page: 2 })`.
- Cuando: se ejecuta la función.
- Entonces: la request sale a `GET /documentos-fisicos?estadoAsociacion=SUELTO&page=2`.

**Escenario 2 — Función eliminar no envía body**
- Dado: `eliminarDocumentoFisico('uuid-123')`.
- Cuando: se ejecuta.
- Entonces: la request es `DELETE /documentos-fisicos/uuid-123` sin body.

---

## REQ-DF-UI-03 — Capa de hooks (`features/documentos-fisicos/hooks/`)

**Descripción**: Wrappers de TanStack Query que encapsulan el cache, invalidación y toasts. Los componentes solo consumen estos hooks.

**Criterios de aceptación**:
- `use-documentos-fisicos.ts` — `useDocumentosFisicos(params)`:
  - `queryKey: ['documentos-fisicos', params]`.
  - `placeholderData: keepPreviousData` para evitar parpadeo al cambiar filtros.
  - Retorna el resultado de `useQuery`.
- `use-documento-fisico-detalle.ts` — `useDocumentoFisicoDetalle(id: string | null)`:
  - `queryKey: ['documentos-fisicos', 'detalle', id]`.
  - `enabled: id !== null` — no fetcha si no hay id seleccionado.
- `use-documento-fisico-mutations.ts` — exporta:
  - `useCreateDocumentoFisico()`: `useMutation` con `onSuccess` → `toast.success('Documento creado')` + invalidar `['documentos-fisicos']`. `onError` → `toast.error(mensajeDocumentosFisicos(err))`.
  - `useUpdateDocumentoFisico(id: string | null)`: `useMutation` para PATCH. `onSuccess` → `toast.success('Documento actualizado')` + invalidar `['documentos-fisicos']`. `onError` → `toast.error(mensajeDocumentosFisicos(err))`.
  - `useEliminarDocumentoFisico()`: `useMutation` para DELETE. `onSuccess` → `toast.success('Documento eliminado')` + invalidar `['documentos-fisicos']`. `onError` → NO disparar toast (lo maneja el dialog de confirmación en su `onError`).
  - Función interna `useInvalidateDocumentosFisicos()` usada por todas las mutations.
- Toast solo en `onError/onSuccess` de mutations — NUNCA en el cuerpo de un componente (Anti-F-13).

**Escenario 1 — Lista usa keepPreviousData**
- Dado: la lista cargó datos con `page=1`.
- Cuando: el usuario cambia a `page=2` y la query está `isFetching`.
- Entonces: los datos del `page=1` siguen visibles (no se muestra skeleton) hasta que llegan los nuevos.

**Escenario 2 — Detalle no fetcha sin id**
- Dado: `useDocumentoFisicoDetalle(null)`.
- Cuando: el hook se monta.
- Entonces: no se dispara ninguna request HTTP.

**Escenario 3 — Create invalida el cache**
- Dado: el usuario completó el form de creación.
- Cuando: la mutation de create tiene `onSuccess`.
- Entonces: se invalida `queryKey: ['documentos-fisicos']` y la lista se refresca automáticamente.

---

## REQ-DF-UI-04 — Schema Zod del form con condicionalidad monto/moneda (D1)

**Descripción**: El schema zod valida los campos del form de documentos físicos. `monto` y `moneda` son requeridos si el tipo seleccionado es tributario (`esTributario = true`) y deben estar ausentes si no lo es. El schema se construye vía factory `buildFormSchema(esTributario: boolean)` recreado con `useMemo` al cambiar el tipo seleccionado.

**Criterios de aceptación**:
- Archivo: `features/documentos-fisicos/schemas/documento-fisico-form-schema.ts`.
- `buildFormSchema(esTributario: boolean)` retorna un schema zod con:
  - `tipoDocumentoFisicoId`: string UUID, requerido.
  - `numero`: string `^[A-Z0-9./-]+$` (1-50 chars), mensaje de error en español. La validación aplica sobre el valor ya normalizado (uppercase + trim).
  - `fechaEmision`: string `YYYY-MM-DD`, requerida.
  - `glosa`: string max 500 chars, opcional (puede ser `null | ''`).
  - `contactoId`: string UUID, opcional (puede ser `null | ''`).
  - Si `esTributario = true`: `monto` requerido con regex decimal `/^(?!0+(\.0+)?$)\d+(\.\d+)?$/` (nunca cero, solo dígitos y punto), `moneda` requerida con `z.enum(['BOB', 'USD'])`.
  - Si `esTributario = false`: `monto` ausente del schema (campo eliminado, no `null`), `moneda` ausente.
- `buildFormSchema` usa `superRefine` (no validación manual en `onSubmit`).
- Tipo `DocumentoFisicoFormValues` derivado con `z.infer` del schema (la factory retorna un schema con tipo fijo — ver patrón de cast en tipos-documento-fisico si necesario).
- `DEFAULT_CREATE_VALUES` exportado con valores vacíos para mode=create.
- `mapDetalleToFormValues(d: DocumentoFisicoDetalle): DocumentoFisicoFormValues` — mapper para precargar el form en mode=edit.
- Sin `any`.

**Escenario 1 — Tipo tributario sin monto falla**
- Dado: `buildFormSchema(true)`.
- Cuando: se parsea `{ tipoDocumentoFisicoId: 'uuid', numero: 'F-001', fechaEmision: '2026-05-01', monto: null, moneda: null }`.
- Entonces: zod retorna error en `monto` con mensaje "El monto es requerido para documentos tributarios".

**Escenario 2 — Tipo no tributario con monto falla**
- Dado: `buildFormSchema(false)`.
- Cuando: se parsea un objeto que incluye `monto: '100.00'`.
- Entonces: el schema no acepta el campo `monto` (el tipo no lo incluye) — el objeto no pasa validación o el campo se ignora según la implementación. La UI nunca envía `monto` para no-tributarios porque el campo está oculto y no registrado en el form.

**Escenario 3 — Número con espacio no válido**
- Dado: `buildFormSchema(false)`.
- Cuando: se parsea `{ numero: 'fac 0042', ... }`.
- Entonces: error en `numero` — regex `^[A-Z0-9./-]+$` no acepta espacios ni minúsculas.

**Escenario 4 — Número uppercase con guión válido**
- Dado: `buildFormSchema(false)`.
- Cuando: se parsea `{ numero: 'FAC-0042', ... }` con fecha y tipo válidos.
- Entonces: el schema parsea correctamente sin errores.

**Escenario 5 — Monto cero no válido**
- Dado: `buildFormSchema(true)`.
- Cuando: se parsea `{ ..., monto: '0.00', moneda: 'BOB' }`.
- Entonces: error en `monto` — el regex `(?!0+(\.0+)?$)` rechaza cero.

**Escenario 6 — Tipo tributario con monto y moneda válidos**
- Dado: `buildFormSchema(true)`.
- Cuando: se parsea `{ tipoDocumentoFisicoId: 'uuid', numero: 'F-001', fechaEmision: '2026-05-01', monto: '1250.50', moneda: 'BOB' }`.
- Entonces: el schema parsea correctamente.

---

## REQ-DF-UI-05 — Función `buildDocumentosFisicosParams` (lib)

**Descripción**: Función pura que mapea el estado de los filtros de UI a los query params del backend. Sin lógica de presentación.

**Criterios de aceptación**:
- Archivo: `features/documentos-fisicos/lib/build-documentos-fisicos-params.ts`.
- `buildDocumentosFisicosParams(filtros, page)` retorna `ListarDocumentosFisicosParams`.
- Omite `numero` si es string vacío (el backend lo trataría como búsqueda vacía inútil).
- Omite `tipoDocumentoFisicoId`, `estadoAsociacion`, `fechaDesde`, `fechaHasta` si son `undefined | ''`.
- Siempre incluye `page` y `pageSize` (constante `PAGE_SIZE = 20`).
- Es una función pura: mismas entradas → mismo output, sin side effects.
- Exporta `PAGE_SIZE` para uso en `PaginationBar`.

**Escenario 1 — Sin filtros, solo página**
- Dado: filtros todos vacíos, `page=1`.
- Cuando: se llama `buildDocumentosFisicosParams({}, 1)`.
- Entonces: resultado = `{ page: 1, pageSize: 20 }` (sin campos extra).

**Escenario 2 — Con estadoAsociacion y fechas**
- Dado: filtros `{ estadoAsociacion: 'SUELTO', fechaDesde: '2026-01-01', fechaHasta: '2026-05-31' }`.
- Cuando: se llama con `page=2`.
- Entonces: resultado incluye `estadoAsociacion: 'SUELTO'`, `fechaDesde: '2026-01-01'`, `fechaHasta: '2026-05-31'`, `page: 2`, `pageSize: 20`.

**Escenario 3 — Número vacío omitido**
- Dado: filtro `numero: ''`.
- Cuando: se llama `buildDocumentosFisicosParams`.
- Entonces: el resultado NO incluye la clave `numero`.

---

## REQ-DF-UI-06 — Función `mensajeDocumentosFisicos` en `error-messages.ts`

**Descripción**: Función de mapeo de errores específicos del backend de documentos físicos, integrada en `src/lib/error-messages.ts`.

**Criterios de aceptación**:
- Función `mensajeDocumentosFisicos(err: unknown): string` exportada desde `src/lib/error-messages.ts`.
- Mapea los 8 codes de error del backend con mensajes en español:
  - `DOCUMENTO_FISICO_NUMERO_DUPLICADO` → `'Ya existe un documento con ese número para el tipo seleccionado.'`
  - `DOCUMENTO_FISICO_NUMERO_FORMATO_INVALIDO` → `'El número solo puede contener letras mayúsculas, dígitos, puntos, guiones y barras.'`
  - `DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO` → `'El monto y la moneda son obligatorios para documentos tributarios.'`
  - `DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO` → `'Los documentos no tributarios no llevan monto.'`
  - `DOCUMENTO_FISICO_INMUTABLE_POR_COMPROBANTE_CONTABILIZADO` → `'El documento no puede modificarse: está en un comprobante contabilizado.'`
  - `DOCUMENTO_FISICO_REFERENCIADO_POR_COMPROBANTE` → `'No se puede eliminar: el documento está asociado a uno o más comprobantes.'`
  - `TIPO_DOCUMENTO_FISICO_NO_ENCONTRADO` → `'El tipo de documento seleccionado no existe o fue desactivado.'`
  - `CONTACTO_NO_ENCONTRADO` → `'El contacto seleccionado no existe en esta organización.'`
  - `default` → `p.message ?? FALLBACK_GENERICO`.

**Escenario 1 — Mapeo de número duplicado**
- Dado: error del backend con `code: 'DOCUMENTO_FISICO_NUMERO_DUPLICADO'`.
- Cuando: se llama `mensajeDocumentosFisicos(err)`.
- Entonces: retorna `'Ya existe un documento con ese número para el tipo seleccionado.'`.

**Escenario 2 — Fallback para code desconocido**
- Dado: error del backend con `code: 'OTRO_CODE_DESCONOCIDO'`, `message: 'Error del servidor'`.
- Cuando: se llama `mensajeDocumentosFisicos(err)`.
- Entonces: retorna `'Error del servidor'`.

---

## REQ-DF-UI-07 — Listado paginado con filtros (`DocumentosFisicosListFilters` + `DocumentosFisicosListTable`)

**Descripción**: La pantalla principal muestra la lista de documentos físicos con filtros de búsqueda y paginación. El estado de los filtros vive en `useSearchParams` (URL state).

### 07.1 — Filtros

**Criterios de aceptación**:
- Componente `DocumentoFisicoListFilters` recibe props: `numero, onNumeroChange, tipoId, onTipoChange, estadoAsociacion, onEstadoAsociacionChange, fechaDesde, onFechaDesdeChange, fechaHasta, onFechaHastaChange, tipos (TipoDocumentoFisico[])`.
- Campo `numero`: input de texto con placeholder "Buscar por número…". Debounce 350 ms aplicado en la page (no en el componente), usando `useDebouncedValue`. Emite `onNumeroChange` en cada keystroke; la page debouncea el valor antes de pasarlo a `buildDocumentosFisicosParams`.
- Campo `tipoDocumentoFisicoId`: `<Select>` alimentado por `useTiposDocumentoFisico({ pageSize: 50 })` (Cross-feature). Opción vacía "Todos los tipos" que limpia el filtro.
- Campo `estadoAsociacion`: `<Select>` con opciones "Todos", "Sueltos", "En borrador", "Contabilizados" mapeando a `undefined | 'SUELTO' | 'EN_BORRADOR' | 'CONTABILIZADO'`.
- Campos `fechaDesde` + `fechaHasta`: dos inputs `type="date"` con labels "Desde" y "Hasta".
- Cambiar cualquier filtro resetea la página a 1.
- Los filtros son responsivos: en mobile, el layout colapsa a columna única.
- No hay filtro `contactoId` en el MVP (diferido — D6).

**Escenario 1 — Cambiar estadoAsociacion resetea página**
- Dado: la lista está en página 3, estadoAsociacion en "Todos".
- Cuando: el usuario selecciona "Sueltos".
- Entonces: `page` vuelve a 1 y la query se emite con `estadoAsociacion: 'SUELTO', page: 1`.

**Escenario 2 — Búsqueda por número debounceada**
- Dado: el usuario teclea "F-00" rápidamente.
- Cuando: el debounce de 350 ms transcurre sin nuevos cambios.
- Entonces: la query se emite con `numero: 'F-00'`. Antes del debounce no se emiten requests.

**Escenario 3 — Filtro de tipo alimentado por catálogo activo**
- Dado: la feature monta y `useTiposDocumentoFisico` devuelve 5 tipos.
- Cuando: el usuario abre el `<Select>` de tipo.
- Entonces: ve 5 opciones más "Todos los tipos" como opción de reset.

### 07.2 — Tabla

**Criterios de aceptación**:
- Componente `DocumentoFisicoListTable` es presentacional: recibe `items: DocumentoFisico[], isLoading: boolean, onEditar, onEliminar`.
- Columnas: **Número** (badge monoespaciado), **Tipo** (nombre del tipo), **Fecha emisión** (formato DD/MM/YYYY), **Monto** (monto + moneda si no null; "—" si null), **Contacto** (razonSocial si no null; "—" si null).
- Columna de **Acciones**: botón "Editar" (outline sm) + botón "Eliminar" (outline sm, color destructivo).
- Estado loading (primera carga): skeleton de 8 filas (`Skeleton h-10 w-full`) FUERA del `<TableBody>`, reemplazando la tabla entera.
- Empty state (sin resultados): `<div h-40 flex items-center justify-center rounded-md border border-dashed>` con texto "No hay documentos físicos para los filtros aplicados."
- La tabla tiene `overflow-x-auto` + `min-w-[700px]` para scroll horizontal en mobile.
- Sin columna de estado de asociación (D3 — el DTO de lista no trae ese campo).

**Escenario 1 — Loading con datos vacíos → skeleton**
- Dado: `isLoading=true, items=[]`.
- Cuando: se renderiza `DocumentoFisicoListTable`.
- Entonces: se muestran skeletons, no se renderiza la tabla ni el empty state.

**Escenario 2 — Sin resultados → empty state**
- Dado: `isLoading=false, items=[]`.
- Cuando: se renderiza.
- Entonces: empty state visible con el texto definido.

**Escenario 3 — Con items → tabla con filas**
- Dado: `isLoading=false, items=[{id:'x', numero:'F-001', ...}]`.
- Cuando: se renderiza.
- Entonces: tabla con 1 fila visible. Columna Número muestra "F-001". Acciones con botones "Editar" y "Eliminar".

**Escenario 4 — Click en Editar invoca callback**
- Dado: tabla con 1 fila, `onEditar` es un spy.
- Cuando: el usuario hace click en "Editar" de esa fila.
- Entonces: `onEditar` se llama con el `DocumentoFisico` correspondiente.

---

## REQ-DF-UI-08 — Normalización de `numero` en tiempo real (D7)

**Descripción**: El input del campo `numero` aplica uppercase en vivo y trim al perder foco, para que lo que el usuario ve coincida con lo que persiste el backend.

**Criterios de aceptación**:
- El input `numero` tiene un `onChange` handler que aplica `.toUpperCase()` inmediatamente sobre el valor antes de pasárselo a react-hook-form (`field.onChange(e.target.value.toUpperCase())`).
- El `onBlur` aplica trim: `field.onChange(field.value.trim())`.
- La posición del cursor NO se reordena al aplicar uppercase (el valor crece/decrece siempre al final del caret si es append).
- El schema zod valida el regex `^[A-Z0-9./-]+$` sobre el valor ya normalizado — no re-aplica uppercase ni trim.
- El placeholder del input sugiere el formato: `'Ej: F-001, REC-2026-01'`.

**Escenario 1 — Tipeo de minúsculas se convierte en tiempo real**
- Dado: el form está abierto en mode=create, campo `numero` vacío.
- Cuando: el usuario teclea `"f-001"`.
- Entonces: el input muestra `"F-001"` en tiempo real.

**Escenario 2 — Trim al perder foco**
- Dado: el campo `numero` contiene `"  F-001  "` (con espacios).
- Cuando: el usuario hace blur sobre el input.
- Entonces: el valor queda `"F-001"` (sin espacios).

---

## REQ-DF-UI-09 — Condicionalidad de monto/moneda en el form (D1)

**Descripción**: Los campos `monto` y `moneda` se muestran u ocultan según `esTributario` del tipo seleccionado. Al cambiar de tipo, los campos se limpian para no enviar residuos.

**Criterios de aceptación**:
- El form observa `watch('tipoDocumentoFisicoId')` y busca el tipo correspondiente en la lista cargada por `useTiposDocumentoFisico`.
- El schema se recrea con `useMemo` cuando cambia `esTributario` del tipo seleccionado: `useMemo(() => buildFormSchema(esTributario), [esTributario])`. El `resolver` se actualiza con `useForm` o `reset` según corresponda.
- Cuando `esTributario = true`: los campos `monto` y `moneda` son **visibles y requeridos**. El input `monto` es `type="text"` (nunca `type="number"`) con placeholder `"Ej: 1250.50"`. El select `moneda` ofrece opciones "BOB" y "USD".
- Cuando `esTributario = false`: los campos `monto` y `moneda` son **ocultados** (no renderizados en el DOM — no solo `display:none`). El form limpia los valores de ambos campos via `setValue('monto', null)` + `setValue('moneda', null)` al detectar el cambio de tipo a no-tributario.
- La limpieza de valores al cambiar tipo aplica en ambas transiciones: tributario→no-tributario (limpia) y no-tributario→tributario (los campos aparecen vacíos, listos para llenar).
- `monto` se envía como string decimal, nunca como número. El input acepta `"1250.50"` y el form lo envía así al hook de mutations.

**Escenario 1 — Seleccionar tipo tributario muestra campos monto/moneda**
- Dado: el form está abierto, tipo seleccionado es no-tributario (campos ocultos).
- Cuando: el usuario cambia a un tipo tributario.
- Entonces: los campos `monto` y `moneda` aparecen en el form, vacíos, listos para llenar.

**Escenario 2 — Seleccionar tipo no-tributario oculta y limpia**
- Dado: el form tiene `monto='1250.50'`, `moneda='BOB'`, tipo tributario activo.
- Cuando: el usuario cambia a un tipo no-tributario.
- Entonces: los campos desaparecen del DOM y los valores internos del form se limpian (no se enviarán al backend).

**Escenario 3 — Submit con tipo tributario sin monto muestra error**
- Dado: tipo tributario seleccionado, campo `monto` vacío.
- Cuando: el usuario intenta hacer submit.
- Entonces: el form muestra el error de validación zod en el campo `monto` sin llamar a la mutation.

---

## REQ-DF-UI-10 — Form Sheet de crear/editar (`DocumentoFisicoFormSheet`)

**Descripción**: Sheet contenedor que orquesta las mutations de create/update y cierra el panel tras éxito. El form es puramente presentacional; el sheet maneja el estado de envío.

**Criterios de aceptación**:
- Componente `DocumentoFisicoFormSheet` con props: `open: boolean, onOpenChange: (boolean) => void, documento?: DocumentoFisico | null`.
- `modo = documento != null ? 'edit' : 'create'`.
- En mode=edit: carga el detalle con `useDocumentoFisicoDetalle(documento.id)` para obtener `comprobantesAsociados` (necesario para D2 — editabilidad del `numero`).
- Ancho del Sheet: `sm:max-w-3xl` (el form tiene 7+ campos con selects de texto largo — §14.2 frontend CLAUDE.md).
- Título: `"Nuevo documento físico"` en create, `"Editar documento"` en edit.
- El botón submit muestra `"Crear documento"` en create y `"Guardar cambios"` en edit.
- El botón submit está deshabilitado cuando `isSubmitting` es `true` (Anti-F-07).
- Al hacer submit con éxito (onSuccess de la mutation): llama `onOpenChange(false)`.
- Al cerrar el sheet sin submit: el form se resetea (valores limpios para la próxima apertura).
- En mode=edit y mientras carga el detalle: el sheet muestra un skeleton de los campos del form.

**Escenario 1 — Create: submit cierra el sheet**
- Dado: el sheet está abierto en mode=create con datos válidos.
- Cuando: el usuario hace submit y la mutation tiene éxito.
- Entonces: el sheet se cierra (`open=false`).

**Escenario 2 — Edit: submit deshabilitado durante envío**
- Dado: el sheet está en mode=edit y el usuario hizo submit.
- Cuando: la mutation está `isPending`.
- Entonces: el botón "Guardar cambios" tiene `disabled` y muestra feedback visual de carga.

**Escenario 3 — Edit: precarga los datos del documento**
- Dado: se abre el sheet con `documento={id:'uuid', numero:'F-001', ...}`.
- Cuando: el detalle carga.
- Entonces: el campo `numero` muestra `"F-001"`, `fechaEmision` muestra la fecha correcta, etc.

---

## REQ-DF-UI-11 — Editabilidad condicional de `numero` en mode=edit (D2)

**Descripción**: En mode=edit, el campo `numero` es editable a menos que el documento tenga al menos un comprobante en estado `CONTABILIZADO`. Esta señal viene de `comprobantesAsociados` del detalle.

**Criterios de aceptación**:
- `numeroEsInmutable = detalle.comprobantesAsociados.some(c => c.estado === 'CONTABILIZADO')`.
- Si `numeroEsInmutable = true`: el input `numero` tiene `disabled={true}` y muestra texto de ayuda `"El número no puede modificarse: el documento está en un comprobante contabilizado."` (patrón del campo `codigo` deshabilitado en tipos-documento-fisico).
- Si `numeroEsInmutable = false` (solo borradores o suelto): el input es editable normalmente.
- La condición se evalúa con los datos del detalle. Si el detalle aún está cargando, el input se muestra deshabilitado temporalmente hasta que el detalle esté disponible (comportamiento conservador).

**Escenario 1 — Documento con CONTABILIZADO — número deshabilitado**
- Dado: el detalle tiene `comprobantesAsociados: [{id:'c1', estado:'CONTABILIZADO', ...}]`.
- Cuando: el form sheet está en mode=edit.
- Entonces: el input `numero` tiene `disabled` y el texto de ayuda es visible.

**Escenario 2 — Documento solo en borradores — número editable**
- Dado: el detalle tiene `comprobantesAsociados: [{id:'c1', estado:'BORRADOR', ...}]`.
- Cuando: el form sheet está en mode=edit.
- Entonces: el input `numero` está habilitado y editable.

**Escenario 3 — Documento suelto — número editable**
- Dado: `comprobantesAsociados: []`.
- Cuando: el form sheet está en mode=edit.
- Entonces: el input `numero` está habilitado.

---

## REQ-DF-UI-12 — Drawer de detalle (`DocumentoFisicoDetalleDrawer`)

**Descripción**: Drawer lateral (Sheet) que muestra el detalle completo de un documento físico, incluyendo los comprobantes asociados y el estado de asociación derivado.

**Criterios de aceptación**:
- Componente `DocumentoFisicoDetalleDrawer` con props: `documentoId: string | null, open: boolean, onOpenChange, onEditar: () => void, onEliminar: () => void`.
- Usa `useDocumentoFisicoDetalle(documentoId)` para cargar el detalle (`enabled: documentoId !== null`).
- Ancho: `sm:max-w-xl` (§14.1 frontend CLAUDE.md).
- Mientras `isLoading`: muestra skeleton de campos.
- Si `isError`: mensaje `"No se pudo cargar el documento. Intentá de nuevo."` con botón "Cerrar".
- Secciones del detalle (con headers de sección `<h3>` siguiendo §13.2 del frontend CLAUDE.md):
  - **Datos del documento**: tipo, número, fecha emisión, glosa, contacto.
  - **Monto**: visible solo si `monto !== null` (muestra `monto moneda`). Si null, no renderizar la sección de monto.
  - **Estado de asociación** (derivado de `comprobantesAsociados`):
    - Lista vacía → badge "Suelto" (neutral).
    - Al menos un `CONTABILIZADO` → badge "Contabilizado" (semántico positivo — verde).
    - Solo borradores → badge "En borrador" (semántico advertencia — amarillo/orange).
  - **Comprobantes asociados**: lista de comprobantes con número (o "Sin número" si null) y badge de estado. Si vacía: texto "Sin comprobantes asociados."
- Footer: botón "Cerrar" (outline, izquierda) + botones "Editar" y "Eliminar" (derecha).
- Colores de badges solo con variables del tema (Anti-F-10 — sin colores hardcoded de Tailwind).

**Escenario 1 — Detalle cargando → skeleton**
- Dado: `documentoId='uuid'`, detalle en `isLoading`.
- Cuando: se renderiza el drawer abierto.
- Entonces: se muestran skeletons de campos.

**Escenario 2 — Documento suelto → badge Suelto**
- Dado: `comprobantesAsociados: []`.
- Cuando: se renderiza el detalle.
- Entonces: la sección de estado muestra badge "Suelto".

**Escenario 3 — Documento con CONTABILIZADO → badge Contabilizado**
- Dado: `comprobantesAsociados: [{estado:'CONTABILIZADO', ...}]`.
- Cuando: se renderiza.
- Entonces: badge "Contabilizado".

**Escenario 4 — Solo en borradores → badge En borrador**
- Dado: `comprobantesAsociados: [{estado:'BORRADOR', ...}]`.
- Cuando: se renderiza.
- Entonces: badge "En borrador".

**Escenario 5 — Monto null → sección monto no renderizada**
- Dado: el documento tiene `monto: null`.
- Cuando: se renderiza.
- Entonces: la sección de monto no está presente en el DOM.

---

## REQ-DF-UI-13 — Dialog de eliminación con manejo de 409 (D4)

**Descripción**: AlertDialog de confirmación para eliminar un documento físico. El backend es la autoridad: si el documento tiene asociaciones, responde con 409; la UI traduce el error en toast y mantiene el dialog abierto.

**Criterios de aceptación**:
- Componente `EliminarDocumentoFisicoDialog` con props: `documento: DocumentoFisico | null, open: boolean, onOpenChange: (boolean) => void`.
- Texto del dialog: `"¿Eliminar documento ${documento.numero}? Esta acción es permanente y no puede deshacerse."`.
- Botón de confirmación: "Eliminar" con `variant="destructive"` (§14.3 + §14.4 del frontend CLAUDE.md — acción irreversible).
- `AlertDialogAction` lleva `e.preventDefault()` para evitar cierre automático del dialog (§14.3 frontend CLAUDE.md).
- Al confirmar: llama `useEliminarDocumentoFisico().mutate(documento.id)`.
  - `onSuccess`: cierra el dialog (`onOpenChange(false)`) + toast de éxito emitido desde el hook.
  - `onError`: el dialog permanece abierto (gracias al `preventDefault`). Se dispara `toast.error(mensajeDocumentosFisicos(err))` desde el `onError` del call de mutation (no desde el hook — el hook de eliminar no tiene `onError` propio para este caso específico; el dialog lo maneja).
- El botón de confirmación está deshabilitado mientras `mutation.isPending` (Anti-F-07).
- Mientras `isPending`: el botón muestra `"Eliminando…"`.

**Escenario 1 — Eliminación exitosa → dialog se cierra**
- Dado: el dialog está abierto con `documento={id:'uuid', numero:'F-001'}`.
- Cuando: el usuario confirma y la mutation tiene éxito.
- Entonces: el dialog se cierra y la lista se refresca (por invalidación del cache).

**Escenario 2 — Eliminación con 409 → dialog queda abierto + toast**
- Dado: el documento tiene asociaciones activas; el backend responde 409 `DOCUMENTO_FISICO_REFERENCIADO_POR_COMPROBANTE`.
- Cuando: el usuario confirma en el dialog.
- Entonces: el dialog permanece abierto, se muestra toast.error con `"No se puede eliminar: el documento está asociado a uno o más comprobantes."`.

**Escenario 3 — Submit deshabilitado durante eliminación**
- Dado: el usuario hizo click en "Eliminar" y la mutation está `isPending`.
- Cuando: se re-renderiza el dialog.
- Entonces: el botón de confirmación tiene `disabled` y muestra `"Eliminando…"`.

---

## REQ-DF-UI-14 — Página orquestadora (`DocumentosFisicosPage`)

**Descripción**: Componente de página que orquesta filtros, tabla, paginación, sheet de form, drawer de detalle y dialog de eliminación. Es el único componente con lógica de estado; los demás son presentacionales.

**Criterios de aceptación**:
- Archivo: `features/documentos-fisicos/pages/documentos-fisicos-page.tsx`.
- Header canónico (§13.1 del frontend CLAUDE.md): `h1` "Documentos físicos", subtítulo "Registros de documentos tributarios y no tributarios del tenant.", botón "Nuevo documento" (con `<Plus>` icon).
- La página NO agrega padding propio (el `DashboardShell` ya lo provee).
- Estado de filtros en `useSearchParams` o `useState` — a criterio del implementador; la propuesta recomienda `useState` si la URL compartida de filtros no es un requisito de negocio para el MVP.
- Debounce de `numero`: la page aplica `useDebouncedValue(numero, 350)` y pasa el valor debouncado a `buildDocumentosFisicosParams`.
- Paginación: usa `PaginationBar` (componente shared). Solo renderiza si `data !== undefined`.
- Estados de UI que gestiona:
  - `sheetOpen: boolean` + `documentoEditando: DocumentoFisico | null` → para el form sheet.
  - `drawerOpen: boolean` + `documentoDetalle: DocumentoFisico | null` → para el drawer de detalle.
  - `eliminarDialogOpen: boolean` + `documentoEliminando: DocumentoFisico | null` → para el dialog de eliminación.
- Al hacer click en la fila de la tabla: abre el drawer de detalle.
- Al hacer click en "Editar" de una fila: abre el form sheet en mode=edit.
- Al hacer click en "Eliminar" de una fila: abre el dialog de eliminación.
- Al hacer click en "Nuevo documento": abre el form sheet en mode=create (`documentoEditando=null`).
- Al cerrar el form sheet: limpia `documentoEditando`.
- Al cerrar el drawer: limpia `documentoDetalle`.

**Escenario 1 — Click en "Nuevo documento" abre sheet en create**
- Dado: la página está montada.
- Cuando: el usuario hace click en "Nuevo documento".
- Entonces: el `DocumentoFisicoFormSheet` está abierto con `documento=null` (mode=create).

**Escenario 2 — Click en "Editar" de una fila abre sheet en edit**
- Dado: la tabla tiene documentos.
- Cuando: el usuario hace click en "Editar" de la primera fila.
- Entonces: el sheet se abre con `documento=<el ítem de esa fila>` (mode=edit).

**Escenario 3 — Paginación solo visible cuando hay datos**
- Dado: la query devolvió resultados.
- Cuando: `data !== undefined`.
- Entonces: `PaginationBar` se renderiza con `page`, `pageSize`, `total`.

---

## REQ-DF-UI-15 — Navegación: ruta y nav item

**Descripción**: Registrar la ruta `/documentos-fisicos` en el router y agregar el item correspondiente en la navegación lateral.

**Criterios de aceptación**:
- `frontend/src/routes/router.tsx`: agregar `{ path: '/documentos-fisicos', element: <DocumentosFisicosPage /> }`.
- `frontend/src/components/nav-items.tsx`: agregar item `{ to: '/documentos-fisicos', label: 'Documentos físicos', icon: FileStack }` (o `Receipt` si `FileStack` no está disponible en la versión de `lucide-react` instalada; fallback final: `File`).
- Posición del nav item: después del item de "Tipos de documento" (módulo del catálogo padre) y antes de "Períodos fiscales".
- La ruta está protegida por el guard de autenticación existente (mismo que el resto de rutas del área contable).

**Escenario 1 — Navegar a /documentos-fisicos renderiza la page**
- Dado: el usuario está autenticado con acceso al módulo contable.
- Cuando: navega a `/documentos-fisicos`.
- Entonces: `DocumentosFisicosPage` se monta y la lista inicia su carga.

**Escenario 2 — Nav item visible en el sidebar**
- Dado: la app está cargada en el layout de dashboard.
- Cuando: se inspecciona el sidebar.
- Entonces: existe un item con label "Documentos físicos" que navega a `/documentos-fisicos`.

---

## REQ-DF-UI-16 — Permisos: ocultar/deshabilitar acciones según RBAC

**Descripción**: Las acciones de crear, editar y eliminar se condicionan al permiso del usuario. El backend es la autoridad; la UI oculta/deshabilita acciones como hint de UX para no confundir al usuario.

**Nota sobre el patrón de permisos vigente**: `tipos-documento-fisico` no implementa gating de permisos por permiso granular — el proyecto no tiene aún un hook `useHasPermission('contabilidad.documentos-fisicos.create')` implementado. Si no existe para el momento de la implementación, aplicar el mismo patrón que el resto del módulo contable (sin gating en cliente, el backend rechaza con 403 y `mensajeDocumentosFisicos` cubre el fallback). Si el hook sí existe, aplicarlo.

**Criterios de aceptación**:
- **Botón "Nuevo documento"**: visible para todos los usuarios autenticados. Si en el momento de implementación existe un hook `useHasPermission('contabilidad.documentos-fisicos.create')`, usarlo para condicionar la visibilidad.
- **Botón "Editar"** en la tabla: ídem para `contabilidad.documentos-fisicos.update`.
- **Botón "Eliminar"** en la tabla y en el drawer: ídem para `contabilidad.documentos-fisicos.delete`.
- Si el backend responde 403 a cualquier acción: la respuesta de error llega al `onError` del hook, que llama `mensajeDocumentosFisicos(err)` → el mensaje del backend (en español) se muestra en toast.
- No se implementa ocultación en el MVP si el hook de permisos granulares no existe — documentar como deuda en un comentario `// TODO: ocultar si !hasPermission('contabilidad.documentos-fisicos.create')`.

**Escenario 1 — Usuario sin permiso de crear: backend responde 403**
- Dado: usuario sin `contabilidad.documentos-fisicos.create` que logra hacer click en "Nuevo documento".
- Cuando: el form se completa y hace submit.
- Entonces: el backend responde 403, `mensajeDocumentosFisicos(err)` retorna el `message` del backend (en español) y se muestra en toast. La UI no fuerza logout ni rompe el flujo.

---

## REQ-DF-UI-17 — Tests de componentes y lógica pura

**Descripción**: Tests que cubren los escenarios críticos del form, la tabla, los filtros, el dialog de eliminación, el schema zod y la función de params. Patrón de `tipos-documento-fisico`.

**Stack**: Vitest + `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom`. Tests al lado del código.

### 17.1 — `documento-fisico-form-schema.test.ts`

Cubre todos los escenarios de REQ-DF-UI-04 (tributario sin monto, no-tributario con monto, número inválido, número válido, monto cero).

### 17.2 — `build-documentos-fisicos-params.test.ts`

Cubre todos los escenarios de REQ-DF-UI-05 (sin filtros, con filtros, número vacío omitido).

### 17.3 — `documento-fisico-form.test.tsx`

- mode=create: campos habilitados, botón "Crear documento" visible.
- mode=edit con `comprobantesAsociados` vacíos: `numero` editable.
- mode=edit con comprobante CONTABILIZADO: `numero` deshabilitado + texto de ayuda visible.
- `isSubmitting=true` → botón submit deshabilitado.
- Tipo tributario seleccionado: campos `monto` y `moneda` visibles.
- Tipo no-tributario seleccionado: campos `monto` y `moneda` no renderizados.
- Tipear minúsculas en `numero` → se convierte a uppercase en tiempo real.

**Gotcha `noUncheckedIndexedAccess`**: usar optional chaining en accesos a arrays en mocks: `onSubmit.mock.calls[0]?.[0]`.

**Gotcha JSDOM + Radix Select**: en tests donde se selecciona el tipo via `Select` de shadcn, el DOM puede renderizar el texto de la opción dos veces (trigger + opción en popover). Usar `getAllByText` o buscar por rol más específico.

### 17.4 — `documento-fisico-list-table.test.tsx`

- `isLoading=true, items=[]` → skeletons visibles, tabla no renderizada.
- `isLoading=false, items=[]` → empty state visible.
- `isLoading=false, items=[docFisico]` → fila con datos correctos.
- Click "Editar" → `onEditar` llamado con el ítem.
- Click "Eliminar" → `onEliminar` llamado con el ítem.

### 17.5 — `documento-fisico-list-filters.test.tsx`

- Chips de `estadoAsociacion`: click "Sueltos" → activo visualmente, `onEstadoAsociacionChange` llamado con `'SUELTO'`.
- Limpiar el filtro (opción "Todos") → `onEstadoAsociacionChange` llamado con `undefined`.
- Input de número: typing → `onNumeroChange` llamado.

### 17.6 — `eliminar-documento-fisico-dialog.test.tsx`

- Render del dialog con texto de confirmación que incluye el número del documento.
- Click en "Eliminar": `e.preventDefault()` ejecutado (el dialog no se cierra).
- Botón deshabilitado cuando `isPending`.

**Criterios transversales a todos los tests**:
- Sin `any` en código de tests (excepto mocks donde `Partial<T>` sea impráctico).
- Usar `screen.getByRole`, `getByLabelText`, `getByText` — no `data-testid` como primera opción.
- `afterEach(() => vi.clearAllMocks())`.

---

## REQ-DF-UI-18 — Cumplimiento de checklist responsive y dark mode

**Descripción**: Antes del merge, el PR debe incluir el checklist §7 del frontend CLAUDE.md completado. Esta spec lo hace requisito explícito y verificable.

**Criterios de aceptación**:
- El PR body incluye el checklist de §7 del frontend CLAUDE.md con cada ítem verificado:
  - [ ] Renderizado correcto en 375 px (iPhone SE).
  - [ ] Renderizado correcto en 768 px (iPad).
  - [ ] Renderizado correcto en 1440 px (laptop).
  - [ ] Tap targets ≥ 44×44 px en botones/items interactivos mobile.
  - [ ] Modo oscuro verificado — sin colores literales de Tailwind.
  - [ ] Navegación accesible en < md.
  - [ ] Inputs no disparan auto-zoom en iOS (`text-base` en mobile).
  - [ ] Tabla con estrategia explícita (overflow-x-auto + min-w).
  - [ ] Modales/Sheets no atrapan al usuario en mobile.
  - [ ] Submit deshabilitado con `isPending`.
- `tsc --noEmit` y `eslint src/` pasan sin errores.

---

## Índice de escenarios por REQ

| REQ | Título | Escenarios |
|-----|--------|-----------|
| REQ-DF-UI-01 | Tipos compartidos en `types/api.ts` | 1 |
| REQ-DF-UI-02 | Capa de API | 2 |
| REQ-DF-UI-03 | Capa de hooks | 3 |
| REQ-DF-UI-04 | Schema Zod con condicionalidad monto/moneda (D1) | 6 |
| REQ-DF-UI-05 | Función `buildDocumentosFisicosParams` | 3 |
| REQ-DF-UI-06 | Función `mensajeDocumentosFisicos` | 2 |
| REQ-DF-UI-07 | Listado con filtros y tabla | 7 |
| REQ-DF-UI-08 | Normalización de `numero` (D7) | 2 |
| REQ-DF-UI-09 | Condicionalidad monto/moneda en form (D1) | 3 |
| REQ-DF-UI-10 | Form Sheet crear/editar | 3 |
| REQ-DF-UI-11 | Editabilidad condicional de `numero` (D2) | 3 |
| REQ-DF-UI-12 | Drawer de detalle | 5 |
| REQ-DF-UI-13 | Dialog de eliminación con 409 (D4) | 3 |
| REQ-DF-UI-14 | Página orquestadora | 3 |
| REQ-DF-UI-15 | Navegación: ruta y nav item | 2 |
| REQ-DF-UI-16 | Permisos RBAC | 1 |
| REQ-DF-UI-17 | Tests de componentes y lógica pura | Sub-escenarios en §17.1–17.6 |
| REQ-DF-UI-18 | Checklist responsive y dark mode | (checklist) |

---

## Decisiones cerradas reflejadas (trazabilidad)

| Decisión de la propuesta | REQ que la implementa |
|--------------------------|----------------------|
| D1 — schema factory `buildFormSchema(esTributario)` + ocultar campos | REQ-DF-UI-04, REQ-DF-UI-09 |
| D2 — `numero` deshabilitado si ≥1 CONTABILIZADO | REQ-DF-UI-11 |
| D3 — sin columna estadoAsociacion en tabla; solo filtro + drawer | REQ-DF-UI-07 (tabla), REQ-DF-UI-12 (drawer) |
| D4 — Eliminar siempre habilitado; 409 → toast + dialog abierto | REQ-DF-UI-13 |
| D5 — Selector de contacto = `ContactoCombobox` server-side debounce | REQ-DF-UI-10 (dentro del form) |
| D6 — Filtros MVP (5 filtros; contactoId diferido) | REQ-DF-UI-07.1 |
| D7 — `numero` uppercase en vivo + trim al blur | REQ-DF-UI-08 |
