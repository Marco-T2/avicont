# Archive report — documentos-fisicos-ui

**Archivado**: 2026-05-29
**Merge**: PR #49, squash commit `bf56255`
**Artifact store**: openspec

## Resumen

Segundo slice del vertical contable en el frontend: UI standalone CRUD de Documentos Físicos
(papeles que respaldan asientos: facturas, recibos, notas, etc.) más integración inline
de asociación a comprobantes. El backend ya estaba completo (PRs #45–#48); este change
cubre solo el frontend.

## Resultado

- Estructura modular replicada de contactos-ui: feature con api/, hooks/, components/, pages/, schemas/.
- Tipos compartidos en `types/api.ts` sin `any`.
- Capa de API: 5 endpoints (GET lista, GET detalle, POST create, PATCH update, DELETE eliminar).
- Hooks con TanStack Query: `keepPreviousData`, invalidaciones automáticas, toasts en mutations.
- Componentes: tabla de lista con filtros, form modal, dialogs de confirmación.
- Integración con comprobantes: sección inline de asociación (picker + crear embebido).
- Validaciones Zod: número normalizado, monto obligatorio para tipos tributarios, etc.
- Tests: componentes principales testeados, patrones de mocking establecidos.

## Sincronización de spec

No existe `openspec/specs/documentos-fisicos-ui/spec.md` principal. El backend de documentos
físicos ya cuenta con su spec principal en `openspec/specs/documento-fisico/spec.md` (actualizada
en PR #47 con REQ-A-02/03/06/12/13/14 y REQ-P-09/10 de asociación post-contabilizado).

El `spec.md` de este change cubre los REQs de implementación del frontend (REQ-DF-UI-01 a -10,
tipos compartidos, capa de API, hooks, componentes, validaciones, integración con comprobante).
**NO se sincroniza a una fuente principal** porque los requisitos de UI no generalizan: cada
feature del frontend tiene su próprio `spec.md` dentro del change de implementación, documentando
qué se construyó y en qué orden. Si en el futuro otros módulos necesitaran acceso a documentos
físicos (por ej. desde granja, o desde reportes), esos cambios serían separados.

## Desvíos / hallazgos notables

- **Manejo de `monto` como string**: en DTOs HTTP los decimales cruzan como string (§4.5 CLAUDE.md)
  para preservar precisión IEEE-754. La UI recibe y envía `monto: string | null`, transformándolo
  correctamente en formularios (Zod schema valida el formato decimal).
- **Pre-filtro de compatibilidad**: el picker de documentos filtra por `tiposComprobanteAplicables`,
  evitando ofertar opciones que el backend rechazaría con 422.
- **Cardinalidad N:1**: un comprobante puede tener hasta 50 documentos físicos (asiento con
  múltiples respaldos). La UI lista items, no un campo único.
- **Edición post-CONTABILIZADO**: la sección de asociación es editable (asociar/desasociar) en
  comprobantes CONTABILIZADO **si el período está abierto**. Esto requiere el permiso
  `contabilidad.asientos.edit-posted` que el backend ya valida; la UI obtiene el estado del
  comprobante y del período desde la API y muestra u oculta controles según corresponda.

## Deudas abiertas por el slice

- **Toast de 422 con detalle**: cuando el backend rechaza con 422 `TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE`
  u otro código, el toast genérico hoy oculta el `error.message` real. Ver Anti-F-29 en docs/disenos.
  El service de error del frontend (`mensajeDocumentosFisicos`) actualmente retorna un string genérico.
  **Acción**: mejorar luego con toast que renderice el `error.code` o parse automático de `error.message`.

## Próximo en el vertical

Reportes y libros contables (Diario, Mayor). La UI de documentos físicos queda lista para:
- Asociación embebida en el form del comprobante (ya implementada en este PR).
- Uso desde reportes/búsquedas de auditoría (vía filtros).
- Reuso en otros modules que necesiten documentos tributarios (planeado para versiones futuras).
