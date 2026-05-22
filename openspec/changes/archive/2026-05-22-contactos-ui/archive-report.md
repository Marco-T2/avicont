# Archive report — contactos-ui

**Archivado**: 2026-05-22
**Merge**: PR #16, squash commit `c866c0d`
**Artifact store**: openspec

## Resumen

Primer slice del vertical contable en el frontend: UI completa de Contactos
(clientes/proveedores), espejo 1:1 de `plan-cuentas` con 5 adaptaciones, más un
cambio menor de backend (exponer `activo='all'` en el listado para el toggle
"Incluir inactivos").

## Resultado

- 15 commits (planning + Fase 0 backend `activo='all'` + 12 frontend + fix e2e).
- Verde: 86 tests vitest (18 archivos) + 152 e2e backend + tsc + lint + build.
- CI (backend + frontend) en verde antes del merge.
- Verificación visual aprobada por el usuario (responsive 375/768/1440 + dark mode).

## Sincronización de spec

`spec.md` sincronizado a la fuente de verdad: `openspec/specs/contactos-ui/spec.md`.

## Desvíos / hallazgos notables

- **Fase 0 backend** (`activo='all'`): se descubrió en planning que el DTO HTTP
  solo aceptaba boolean; el toggle "Incluir inactivos" necesitaba la unión. El
  service y el repo ya lo soportaban; solo se destapó en `ListarContactosQueryDto`
  (transform `toBoolOrAll` + `@IsIn([true,false,'all'])`).
- **Fix e2e de orden de suites**: agregar tests a `contactos.e2e` reordenó el
  sequencer de Jest y destapó que `periodos-fiscales.e2e` usaba un cleanup local
  incompleto (no borraba comprobantes antes de `periodoFiscal`). Migrado al
  `cleanupTestData` compartido (commit `93c2ede`).

## Deudas abiertas por el slice

- DELETE físico de contacto: **diferido** a un slice posterior (no testeable hasta
  que existan comprobantes que referencien contactos → 409 CONTACTO_REFERENCIADO).
- `fix(infra)` aparte (no de este slice): la imagen Docker prod arranca
  `dist/main.js` pero el build genera `dist/src/main.js`.

## Próximo en el vertical

periodos-fiscales → comprobantes.
