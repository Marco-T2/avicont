# Proposal: UI standalone de Documentos Físicos (Change B)

## Intent

El backend de `documentos-fisicos` está mergeado (PRs #45/#46) pero no hay UI para gestionarlo de forma independiente. El contador necesita un CRUD standalone para registrar, listar, editar y eliminar documentos tributarios físicos (facturas recibidas, recibos) antes y fuera del flujo de asociación a comprobantes. Sin esta pantalla, el papel solo puede crearse inline desde un comprobante, lo que impide pre-cargar lotes de documentos o limpiar documentos sueltos.

## Scope

### In Scope
- Feature folder `frontend/src/features/documentos-fisicos/` (api, hooks, components, pages, schemas, lib) replicando el patrón canónico de `tipos-documento-fisico`.
- Listado paginado con filtros, tabla, drawer de detalle (con comprobantes asociados), form sheet crear/editar, dialog de eliminación.
- Tipos del backend en `types/api.ts`, ruta `/documentos-fisicos` en `router.tsx`, item en `nav-items.tsx`.
- Selector de contacto reutilizable (combobox con búsqueda server-side) y selector de tipo (reusa `useTiposDocumentoFisico`).
- Manejo de los 6 error codes del backend vía `error-messages.ts`.

### Out of Scope
- UI de asociación de documentos en el editor de comprobante (Change A / brief `documento-fisico-ui-asociacion.md`).
- Backend (ya existe). No se toca ningún endpoint ni DTO.
- Bulk import / carga masiva de documentos.
- Visor/upload de archivo adjunto del documento (no existe en el dominio).

## Capabilities

### New Capabilities
- `documentos-fisicos-ui`: pantalla CRUD standalone (listar con filtros + paginación, crear, ver detalle con comprobantes asociados, editar, eliminar) del recurso documentos físicos en el frontend.

### Modified Capabilities
- None.

## Approach

Feature-folder por capas (api puro → hooks TanStack Query → componentes presentacionales → page contenedora), idéntico a `tipos-documento-fisico`. Server state en TanStack Query (queryKey `['documentos-fisicos', ...]`), forms con react-hook-form + zod, dinero como `string`. Filtros y paginación en `useSearchParams`. UI y errores en español.

## Decisiones cerradas

**D1 — Condicionalidad monto/moneda según `esTributario`.** zod `superRefine` con `esTributario` inyectado al schema vía factory `buildFormSchema(esTributario: boolean)`, recreado cuando cambia el tipo seleccionado (`watch('tipoDocumentoFisicoId')` → lookup en la lista de tipos ya cargada → `useMemo`).
- *Rationale*: el backend valida ambos casos (422 si falta en tributario, 422 si sobra en no-tributario). El form debe espejar exactamente esa regla para fallar rápido sin round-trip. El factory mantiene el schema como única fuente de verdad (tipado con `z.infer`).
- *Tradeoff vs. validación manual post-parse*: post-parse dispersa la regla fuera del schema y obliga a `setError` imperativo. El factory es ligeramente más verboso pero mantiene la validación declarativa y testeable en `lib/`/`schemas/`.
- *Decisión UX*: cuando el tipo NO es tributario, los campos monto/moneda se ocultan (no solo deshabilitan) y el form limpia sus valores al cambiar de tipo, para no enviar residuos que el backend rechazaría.

**D2 — Editabilidad de `numero` en edición.** El input `numero` se deshabilita en modo edit SI y solo si el documento tiene ≥1 comprobante asociado en estado `CONTABILIZADO`; editable en cualquier otro caso. La señal viene del detalle (`comprobantesAsociados`), que el form sheet ya carga para precargar valores.
- *Rationale*: el backend marca el documento inmutable (409 `DOCUMENTO_FISICO_INMUTABLE_POR_COMPROBANTE_CONTABILIZADO`) exactamente bajo esa condición. Deshabilitar siempre en edit sería más restrictivo que el backend y bloquearía correcciones legítimas de documentos sueltos o solo-en-borrador.
- *UX*: input deshabilitado + texto `El número no se puede modificar: el documento está en un comprobante contabilizado.` (patrón del campo `codigo` de tipos-documento-fisico).

**D3 — Mostrar `estadoAsociacion` en la tabla.** CONFIRMADO contra `documento-fisico-response.dto.ts`: el DTO de lista (`DocumentoFisicoDto`) NO trae `estadoAsociacion` (es solo un filtro de query, no un campo de salida); solo el detalle trae `comprobantesAsociados`. Decisión: la columna de estado NO se muestra en la tabla. El estado de asociación se ofrece como **filtro** de la lista (D6) y se muestra dentro del **drawer de detalle**, derivado de `comprobantesAsociados` (vacío → Suelto; algún CONTABILIZADO → Contabilizado; si no → En borrador).
- *Rationale*: derivar por fila exigiría un fetch de detalle por cada registro (N+1) o un cambio de backend. Ninguno justificado para el MVP. El filtro + el drawer cubren la necesidad real (encontrar sueltos para eliminar, ver dónde está usado un documento).
- *Tradeoff*: el usuario no ve el estado de un vistazo en la grilla. Aceptable; anotado como posible deuda (agregar `estadoAsociacion` al DTO de lista en backend si se vuelve necesario).

**D4 — Deshabilitar Eliminar y feedback de error.** El botón Eliminar está **siempre visible y habilitado** en el drawer de detalle. NO se intenta predecir si fallará por fila (la lista no trae el dato — ver D3). Al confirmar, si el backend responde 409 `DOCUMENTO_FISICO_REFERENCIADO_POR_COMPROBANTE`, se muestra toast (en `onError` de la mutation, Anti-F-13) con mensaje claro: `No se puede eliminar: el documento está asociado a uno o más comprobantes.` El AlertDialog permanece abierto (preventDefault) para que el usuario lea el error.
- *Rationale*: DELETE falla con CUALQUIER asociación (cualquier estado), pero la grilla no expone el conteo; deshabilitar requeriría el detalle. Dejar que el backend sea la autoridad y traducir el 409 es la opción correcta y consistente con defense-in-depth. La edición de campos sigue la regla de D2 (solo `numero` se bloquea con contabilizados).

**D5 — Selector de contacto: combobox con búsqueda server-side.** Componente `ContactoCombobox` (Popover + Command de shadcn) con input de búsqueda debounced (350 ms) que consume `useContactos({ search, pageSize: 50 })`. Campo opcional en el form (contacto puede ser null).
- *Rationale*: contactos usa índice GIN trigram en backend (búsqueda server-side ya soportada); un `Select` simple no escala más allá de ~50 contactos y un tenant real tendrá cientos. El combobox es el patrón correcto y `command.tsx`/`popover.tsx` ya están disponibles.
- *Tradeoff vs. Select simple*: más código (un composite nuevo), pero evita la deuda inmediata de un select que no pagina. Se ubica en `features/documentos-fisicos/components/contacto-combobox.tsx` con comentario `// Cross-feature:` (§14.6) por consumir el hook de contactos.

**D6 — Filtros de la lista (MVP).** Se incluyen los 5 que el backend ya soporta: `numero` (input con debounce 350 ms), `tipoDocumentoFisicoId` (select alimentado por `useTiposDocumentoFisico`), `estadoAsociacion` (select SUELTO/EN_BORRADOR/CONTABILIZADO), `fechaDesde` + `fechaHasta` (dos inputs `type="date"`). `contactoId` se difiere del MVP (requeriría otro combobox en la barra de filtros; bajo valor inicial).
- *Rationale*: cubrir el contrato del backend sin sobre-construir. Cambiar cualquier filtro resetea la página a 1; estado en `useSearchParams`.

**D7 — UX de normalización de `numero` (uppercase).** El input transforma a mayúsculas **en vivo** (`onChange` aplica `.toUpperCase()` + trim al blur) para que lo que el usuario ve coincida con lo que el backend persiste. El schema zod valida el regex `^[A-Z0-9./-]+$` sobre el valor ya normalizado.
- *Rationale*: el backend normaliza silenciosamente (trim+uppercase); si la UI no lo refleja, el usuario escribe `f-001` y luego ve `F-001` guardado, generando confusión y falsos "no coincide" en búsquedas. Normalizar en vivo elimina la sorpresa y alinea validación cliente↔servidor.

## Affected Areas

| Área | Impacto | Descripción |
|------|--------|-------------|
| `frontend/src/features/documentos-fisicos/**` | New | Feature completa (api, hooks, components, pages, schemas, lib + tests) |
| `frontend/src/types/api.ts` | Modified | Tipos: `EstadoAsociacion`, `TipoDocumentoFisicoEmbebido`, `ContactoEmbebido`, `ComprobanteAsociadoView`, `DocumentoFisico`, `DocumentoFisicoDetalle`, `DocumentoFisicoListResponse`, `Create/UpdateDocumentoFisicoRequest`, `ListarDocumentosFisicosParams` |
| `frontend/src/routes/router.tsx` | Modified | Ruta `/documentos-fisicos` |
| `frontend/src/components/nav-items.tsx` | Modified | Item de navegación |
| `frontend/src/lib/error-messages.ts` | Modified | Traducciones de los 6 error codes |

## Risks

| Riesgo | Probabilidad | Mitigación |
|------|------------|------------|
| Schema dinámico (D1) genera desincronía de tipos con `z.infer` al recrear el resolver | Med | Factory tipado + tests de schema con ambos casos (tributario/no); cast `Resolver<T>` como en tipos-documento-fisico |
| Combobox de contacto (D5) sin debounce dispara muchas requests | Med | Debounce 350 ms + `pageSize:50` + `enabled` cuando hay texto; queryKey por `search` |
| `numero` normalizado en vivo rompe la posición del cursor al tipear | Low | Aplicar uppercase en `onChange` sin reordenar; trim solo en blur/submit |
| Mostrar estado por fila tienta a hacer N+1 (D3) | Med | Decisión explícita: estado solo en filtro + detalle; deuda documentada |

## Rollback Plan

Revertir es trivial: la feature es aditiva (carpeta nueva + 4 archivos modificados de forma puramente incremental). `git revert <sha-del-squash>` elimina la carpeta `features/documentos-fisicos/`, la ruta, el nav item, los tipos y las traducciones nuevas. No hay migración, ni cambio de backend, ni estado persistido — sin efectos colaterales.

## Dependencies

- Backend `documentos-fisicos` mergeado (PRs #45/#46) — cumplido.
- Hooks `useTiposDocumentoFisico` y `useContactos` existentes — cumplido.
- Primitivos `command`, `popover`, `select` en `components/ui/` — cumplido.

## Success Criteria

- [ ] El contador puede crear, listar (con filtros + paginación), ver detalle, editar y eliminar documentos físicos desde `/documentos-fisicos`.
- [ ] monto/moneda son obligatorios solo si el tipo es tributario y se ocultan si no (D1); el form falla antes del round-trip.
- [ ] `numero` se deshabilita en edit solo con comprobantes contabilizados (D2) y se normaliza a uppercase en vivo (D7).
- [ ] Eliminar con asociación muestra el 409 traducido en toast sin desloggear ni romper la UI (D4).
- [ ] Tests de schema (D1) y de componentes presentacionales pasan; sin `any`; tsc/lint limpios.
- [ ] Checklist responsive/dark-mode (§7 frontend) cumplido antes del merge.
