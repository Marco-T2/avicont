# Archive report — migrar-a-pnpm

**Archivado**: 2026-05-22
**Merge**: PR #18, squash commit `6a67fb7`
**Artifact store**: openspec

## Resumen

Migración del gestor de paquetes **npm → pnpm 11.2.2** en el monorepo (backend
NestJS + frontend Vite, dos proyectos Node independientes), con endurecimiento de
seguridad **nivel MÁXIMO**. Motivación: seguridad de supply-chain. Scope `infra`.

## Resultado

- 6 commits (artefactos SDD + backend + frontend + CI/Docker + docs + fix lint).
- Backend: typecheck + build + lint ✓, **1051 unit/integración + 152 e2e** ✓,
  bcrypt + Prisma ✓, boot real ✓.
- Frontend: lint ✓, **86 vitest** ✓, build ✓, 0 vulnerabilidades.
- CI (backend 2m11s + frontend 40s) en verde antes del merge.
- Stack completo levantado y verificado post-merge: backend `/api/health` ok,
  frontend :5173, grafana :3001 + observabilidad, build Docker pnpm
  `avicont-app:latest` (188MB) end-to-end.

## Sincronización de spec

**Ninguna.** Es un change de **tooling/infra**, no una capability de producto.
El `spec.md` describe requisitos de comportamiento del tooling (pnpm, CI, audit
gate, cooldown), no una capacidad del dominio → no hay delta que sincronizar en
`openspec/specs/`. (A diferencia de contactos-ui, que sí era una capability.)

## Configuración resultante (nivel MÁXIMO)

- `allowBuilds` conservador: backend permite `bcrypt`, `prisma`, `@prisma/client`,
  `@prisma/engines`; bloquea `@scarf/scarf` + 3 postinstall. Frontend `allowBuilds: {}`.
- Cooldown `minimumReleaseAge: 4320` (72h) + `minimumReleaseAgeStrict: true`.
- Audit gate bloqueante `pnpm audit --audit-level high` en CI.
- Provisioning: `pnpm/action-setup@v4` (CI), `npm i -g pnpm@11.2.2` (Docker),
  `packageManager` (local). Sin corepack (se remueve en Node 25).

## Desvíos / hallazgos notables

- **2 phantom deps cazadas por pnpm estricto**: `express@^5.2.1` (la usaba
  `main.ts` e interceptors; rompía producción y los e2e no lo agarraban, solo el
  boot smoke test) y `@eslint/js@^9.39.4` (eslint config del backend).
- **Bump OTel 0.211→0.218** requerido por el audit gate Máximo: OTel 0.218
  eliminó `protobufjs` (paquete vulnerable) → resolvió 1 critical + 8 high.
- **xlsx (2 high, sin fix en npm)**: SheetJS movió los fixes a su registro
  comercial. `xlsx` está declarado pero sin uso en `src/` → riesgo runtime 0.
  Puesto en `auditConfig.ignoreGhsas` (pnpm-workspace.yaml) con justificación.
- **GOTCHA lockfile + cooldown estricto**: con `minimumReleaseAgeStrict`, el
  lockfile debe generarse CON el cooldown activo y estado limpio (rm -rf
  node_modules + sin package-lock.json), no agregar el cooldown después. El
  `design.md` original tenía el orden invertido; corregido en su §4.
- **GOTCHA `--if-present`**: no se mapea 1:1 npm→pnpm (pnpm lo pasa al comando,
  eslint lo rechaza). Lo cazó la 1ra corrida de CI; fix `94f4316`.

## Deudas / decisiones abiertas

- **xlsx**: decidir remover la dep (no se usa) o migrar a `exceljs`. Hoy en ignore-list.
- **nodemailer 7→8** (major, 1 low + 1 moderate): no bloquea el gate; follow-up.
- **`fix(infra)` pre-existente** (NO de esta migración): el servicio Docker `app`
  no arranca — CMD `node dist/main.js` vs build en `dist/src/main.js` (mismo bug
  en scripts `start`/`start:prod`). La imagen buildea; el contenedor crashea.
- Deuda menor: `pnpm/action-setup@v4` corre sobre Node 20 (deprecado jun-2026).

## Próximo en el roadmap

periodos-fiscales UI → comprobantes (vertical contable). El change activo
`seeding-por-tipo` sigue pendiente de verify + archive.
