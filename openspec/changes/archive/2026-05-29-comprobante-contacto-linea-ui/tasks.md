# Tasks: Selector de Contacto por línea de comprobante (UI)

_Change: comprobante-contacto-linea-ui | Strict TDD: test ANTES de implementación_

---

## Grupo A — Promover ContactoCombobox a shared (prerequisito de todos los demás grupos)

- [x] A-T1 (RED) Mover test existente: copiar `frontend/src/features/documentos-fisicos/components/contacto-combobox.tsx` a `frontend/src/components/shared/contacto-combobox.test.tsx` y verificar que falla desde nueva ruta (`cd frontend && pnpm exec vitest run src/components/shared/contacto-combobox.test.tsx`)
- [x] A-1 (GREEN) Mover componente: copiar `contacto-combobox.tsx` a `frontend/src/components/shared/contacto-combobox.tsx`; eliminar el original de `documentos-fisicos/components/`
- [x] A-2 Ajustar import en `documentos-fisicos`: actualizar todos los `import … from './contacto-combobox'` en `frontend/src/features/documentos-fisicos/` al nuevo path `@/components/shared/contacto-combobox`
- [x] A-3 Verificar: `cd frontend && pnpm exec vitest run src/components/shared/contacto-combobox.test.tsx`

---

## Grupo B — Integrar selector en LineaRow + activar prop cuentas en LineasEditor

- [x] B-T1 (RED) Crear `frontend/src/features/comprobantes/components/linea-row.test.tsx`: escenarios REQ-CCL-UI-01 (combobox visible por fila), REQ-CCL-UI-02 (aviso `aria-invalid` con `requiereContacto=true` y sin contacto; sin `aria-invalid` con `requiereContacto=false`), REQ-CCL-UI-03 (combobox muestra `razonSocial` al abrir comprobante existente). Verificar que todos fallan.
- [x] B-1 (GREEN) Modificar `linea-row.tsx`: agregar prop `cuentas: Cuenta[]`; añadir celda `<ContactoCombobox>` con `value={watch('lineas.${index}.contactoId')}` + `onSelect={(id) => setValue('lineas.${index}.contactoId', id ?? undefined, { shouldValidate: false })}`; agregar `aria-invalid` y borde ambar cuando `requiereContacto && !contactoId`
- [x] B-2 Modificar `lineas-editor.tsx`: agregar `<th>Contacto</th>` en el header de la tabla; bajar `cuentas` (ya declarada como prop) a cada `<LineaRow>`
- [x] B-3 Verificar: `cd frontend && pnpm exec vitest run src/features/comprobantes/components/linea-row.test.tsx`

---

## Grupo C — Aviso pre-contabilizar de contacto faltante

- [x] C-T1 (RED) Extender `frontend/src/features/comprobantes/components/contabilizar-comprobante-dialog.test.tsx`: escenario REQ-CCL-UI-02 "Intento de contabilizar con contacto faltante muestra aviso" — mock de líneas con `requiereContacto=true` y `contactoId` vacío; verificar que se muestra aviso y la mutación no se despacha
- [x] C-1 (GREEN) Modificar `contabilizar-comprobante-dialog.tsx`: guard pre-submit que detecta líneas con `requiereContacto=true` y `!contactoId`; mostrar aviso inline en español por cada línea afectada; bloquear el dispatch de la mutación hasta que estén completas
- [x] C-2 Verificar: `cd frontend && pnpm exec vitest run src/features/comprobantes/components/contabilizar-comprobante-dialog.test.tsx`

---

## Grupo D — Read-only nombre en detalle

- [x] D-T1 (RED) Extender `frontend/src/features/comprobantes/components/comprobante-detail-page.test.tsx`: escenarios REQ-CCL-UI-04 (razonSocial visible; "—" en línea sin contacto; skeleton mientras carga `useContactos`)
- [x] D-1 (GREEN) Modificar `comprobante-detail-page.tsx`: agregar `useContactos({ activo: true, pageSize: 50 })`; construir `Map<id, razonSocial>`; agregar columna Contacto en la tabla read-only con `map.get(linea.contactoId) ?? linea.contactoId ?? '—'` y skeleton durante loading
- [x] D-2 Verificar: `cd frontend && pnpm exec vitest run src/features/comprobantes/components/comprobante-detail-page.test.tsx`

---

## Grupo E — Mapeo de error codes del backend en el helper de mensajes

- [x] E-T1 (RED) Extender `frontend/src/lib/error-messages.test.ts` (o crear `error-messages-contacto-linea.test.ts`): tres escenarios de REQ-CCL-UI-05 (`CONTACTO_REQUERIDO`, `CONTACTO_INACTIVO`, `CONTACTO_REFERENCIADO_NO_EXISTE`) con el número de línea interpolado — YA EXISTÍAN en batch previo
- [x] E-1 (GREEN) Modificar `frontend/src/lib/error-messages.ts`: agregar los tres code mappings con los mensajes exactos del spec — YA EXISTÍAN: `COMPROBANTE_CONTACTO_REQUERIDO`, `COMPROBANTE_CONTACTO_INACTIVO`, `COMPROBANTE_CONTACTO_NO_EXISTE`
- [x] E-2 Verificar: `cd frontend && pnpm exec vitest run src/lib/error-messages` — 58 tests passed

---

## Grupo F — Checklist responsive y dark

- [ ] F-1 Verificar visualmente en 375 px que la columna Contacto hace scroll-x sin romper layout (`overflow-x-auto` ya en `lineas-editor.tsx:135` y en `comprobante-detail-page.tsx:265`)
- [ ] F-2 Verificar en 768 px y 1440 px que la columna aparece sin overflow horizontal innecesario
- [ ] F-3 Verificar en dark mode que borde ambar del aviso blando y el combobox son legibles (clases `dark:` correctas)
- [ ] F-4 Verificar que el label Contacto tiene asociación `htmlFor`/`aria-label` correcta (REQ-CCL-UI-06) — NOTA: en la tabla read-only del detalle la accesibilidad la provee el `<th>Contacto</th>` estándar HTML; en linea-row.tsx el combobox tiene `aria-label` implícito via placeholder

---

## Tarea final de verificación verde completa

- [x] Z-1 `cd frontend && pnpm exec tsc -b` — 0 errores
- [x] Z-2 `cd frontend && pnpm exec vitest run src/components/shared/contacto-combobox.test.tsx src/features/comprobantes/components/linea-row.test.tsx src/features/comprobantes/components/contabilizar-comprobante-dialog.test.tsx src/features/comprobantes/components/comprobante-detail-page.test.tsx src/lib/error-messages` — 102 passed (6 test files). Suite completa: 551 passed (73 files)
- [x] Z-3 `cd frontend && pnpm exec eslint ...` — 0 warnings/errores
