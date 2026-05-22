# Archive report — seeding-por-tipo

**Archivado**: 2026-05-22
**Merges**: PR #6 (squash `2d8234a`) + PR #12 (squash `3002f26`) + PR #21 pendiente (fix Docker)
**Artifact store**: openspec

## Resumen

Change que introdujo el seeding condicional al crear una organización: el `POST /api/tenants`
pasó a requerir el campo `modulo` (`CONTABILIDAD | GRANJA | OTROS`) y a correr dentro de
una `prisma.$transaction` que siembra datos por defecto según el vertical elegido.
Entregó: `CreateTenantDto` con `modulo` requerido, `TenantsService.create` con switch
en TX, `PlanCuentasSeederPort` + `PrismaPlanCuentasSeederAdapter` en módulo `cuentas`,
y el fix de firma de `comercial.ts` (`PrismaClient | Prisma.TransactionClient`).

## Reconciliación clave: la Opción 1 de deferral fue superada

El spec y el design fueron escritos (2026-05-20) asumiendo **Opción 1**: el alta
CONTABILIDAD sembraría SOLO el plan de cuentas; el seeder de tipos-documento-físico
(`TipoDocumentoFisicoSeederPort`) quedaba diferido a `documento-fisico` task 9.1.

**Esa decisión fue superada por la implementación real.**

El change `documento-fisico` (PR #12, squash `3002f26`) entregó el
`PrismaTiposDocumentoFisicoSeederAdapter` y lo wireó en `TenantsModule` junto al
`PlanCuentasSeederPort`. Al mergearse, `tenants.service.ts` quedó con el `case CONTABILIDAD`
llamando a AMBOS seeders dentro de la misma TX:

```typescript
case ModuloOrganizacion.CONTABILIDAD:
  await planCuentasSeeder.seedDefaultsForTenant(org.id, tx);
  await tiposDocSeeder.seedDefaultsForTenant(org.id, tx);
  // Los tipos de documento físico respaldan comprobantes contables...
  // Dentro de la misma TX: el tenant nace con los 8 tipos universales
  // o no nace (design §D3, §7.2)
  break;
```

La integration spec `tenants.service.integration.spec.ts` verifica:
`tipoDocumentoFisico.count === 8` para una org CONTABILIDAD (además de 111 cuentas en
`cuenta.count`). Esto matchea exactamente lo que el spec original describía como
comportamiento ideal (REQ-SEED-02, E-CONT-04) antes del deferral.

El spec fue reconciliado a esa realidad: los marcadores `⚠️ DIFERIDO` en REQ-SEED-02,
E-CONT-01, E-CONT-04, E-ATOM-02, E-PORT-02, E-GRAN-02, E-OTROS-02 fueron actualizados
a `(implementado — la Opción 1 de deferral fue superada; ver archive-report)`.

## Relocate de `comercial.ts` a `src/`

El archivo `backend/prisma/seeds/prod/planes-cuentas/comercial.ts` fue relocado a
`backend/src/cuentas/adapters/seed/comercial.ts` vía el branch `fix/infra-build-output-dist-main`
(commit `13db4c9`, PR #21 pendiente de merge al momento del archive).

**Por qué**: `nest build` emite `dist/src/main.js` pero el Dockerfile arrancaba
`node dist/main.js`. El fix corrige la ruta de arranque de la imagen Docker de producción.
Mover `comercial.ts` a `src/` fue parte del mismo fix (el archivo necesitaba quedar dentro
del árbol de compilación de TypeScript para que el adapter que lo importa funcione
correctamente en el build de producción).

Las rutas en el spec, design, tasks y proposal del change fueron actualizadas a la
ubicación real (`src/cuentas/adapters/seed/`).

## Warnings del verify (deuda menor abierta)

Los siguientes gaps de cobertura quedaron abiertos como deuda menor:

- **E-MT-03** (org GRANJA intenta acceder a `/api/plan-cuentas` → 403): cubierto en
  integration spec pero no existe escenario E2E explícito que lo verifique end-to-end.
- **E-ATOM-01** (fallo del seeder → rollback total): cubierto en unit spec con mock TX;
  el escenario E2E equivalente no existe.
- **E-CONT-04** (8 tipos-doc sembrados al alta CONTABILIDAD): el E2E de `POST /api/tenants`
  verifica 111 cuentas pero no verifica el conteo de `TipoDocumentoFisico` explícitamente;
  la verificación vive en la integration spec.
- **Alineación `tx?` en `TipoDocumentoFisicoSeederPort`**: el port declara `tx?` opcional
  mientras que `PlanCuentasSeederPort` lo declara `tx` obligatorio. Deuda de alineación
  menor documentada en design D3; no bloquea el comportamiento actual.

Ninguno de estos gaps es CRITICAL — los escenarios core (siembra atómica, rollback,
multi-tenancy, flags derivados) están cubiertos en integration specs contra Postgres real.

## Estado

Implementación completa y verificada en `main`. El spec reconciliado vive en
`openspec/specs/seeding-por-tipo/spec.md` como fuente de verdad canónica.
