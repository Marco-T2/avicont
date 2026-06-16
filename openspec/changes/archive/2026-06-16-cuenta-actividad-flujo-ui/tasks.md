# Tasks — `cuenta-actividad-flujo-ui`

> TDD estricto: en cada fase de código, el test va PRIMERO (rojo), luego la
> implementación (verde). Conventional commits con scope `cuentas` (backend) y
> `plan-cuentas-ui` (frontend), o `cuentas` para el slice vertical.

## 1. Backend — tests primero (TDD)

- [ ] 1.1 En `cuentas.service.spec.ts`: agregar `actividadFlujo: null` a `cuentaFactory`.
- [ ] 1.2 Test `actualizar`: clasificar con un valor válido (`INVERSION`) → el port
      recibe `{ actividadFlujo: 'INVERSION' }` y el response lo refleja.
- [ ] 1.3 Test `actualizar`: enviar `actividadFlujo: null` → el port recibe
      `{ actividadFlujo: null }` (limpiar clasificación).
- [ ] 1.4 Test `actualizar`: omitir `actividadFlujo` → el port NO recibe la clave
      (spread condicional, omitir ≠ limpiar).
- [ ] 1.5 (Opcional) Test del mapper en `enum-mappers`: round-trip de los 4 valores
      dominio↔Prisma.

## 2. Backend — implementación (hacer pasar los tests)

- [ ] 2.1 `domain/cuenta.ts`: agregar `actividadFlujo: ActividadFlujo | null`.
- [ ] 2.2 `adapters/enum-mappers.ts`: agregar `toDominioActividadFlujo` y
      `toPrismaActividadFlujo` (duplicado deliberado, §3.3 — no importar de reportes).
- [ ] 2.3 `ports/cuenta.repository.port.ts`: agregar `actividadFlujo?: ActividadFlujo | null`
      a `ActualizarCuentaData`.
- [ ] 2.4 `adapters/prisma-cuenta.repository.ts`: mapear `actividadFlujo` en
      `toDominio` (null passthrough) y persistirlo en `actualizar`.
- [ ] 2.5 `dto/update-cuenta.dto.ts`: agregar `actividadFlujo?: ActividadFlujo | null`
      con `@ApiPropertyOptional({ enum: ActividadFlujo, nullable: true })` +
      `@IsOptional()` + `@ValidateIf((o) => o.actividadFlujo !== null)` + `@IsEnum`.
- [ ] 2.6 `dto/cuenta-response.dto.ts`: agregar `actividadFlujo` a `CuentaResponseDto`
      y mapearlo en `toCuentaResponse()`.
- [ ] 2.7 `cuentas.service.ts` `actualizar`: agregar el spread condicional
      `...(dto.actividadFlujo !== undefined ? { actividadFlujo: dto.actividadFlujo } : {})`.
      NO agregar a `CAMPOS_PROTEGIDOS_ESTRUCTURALES`.
- [ ] 2.8 Correr los tests de la fase 1 → verde.

## 3. Regenerar OpenAPI (backend)

- [ ] 3.1 Desde `backend/`: `pnpm run openapi:dump` → actualizar `openapi.json`.
- [ ] 3.2 Verificar que `CuentaResponseDto.actividadFlujo` aparece en el schema.

## 4. Frontend — tipos + schema

- [ ] 4.1 Desde `frontend/`: `pnpm run gen:api-types` → regenerar `api.generated.ts`
      (NO editar a mano). Requiere el `openapi.json` de la fase 3.
- [ ] 4.2 `types/api.ts`: agregar `ActividadFlujo` como `const satisfies Record<...>`
      anclado a `Schemas['CuentaResponseDto']['actividadFlujo']`.
- [ ] 4.3 `schemas/cuenta-form-schema.ts`: agregar `actividadFlujo` al zod (`.optional()`),
      constante `LABELS_ACTIVIDAD_FLUJO` (es), y campo en `mapCuentaToFormValues`
      (spread condicional como subClaseCuenta).

## 5. Frontend — form

- [ ] 5.1 `components/cuenta-form.tsx`: `useWatch` del campo `actividadFlujo` (izar a const).
- [ ] 5.2 Clonar el `<Select>` de subClaseCuenta con sentinel `__none__`; item none
      con label "— Sin clasificar (heurística automática) —"; las 4 opciones desde
      `LABELS_ACTIVIDAD_FLUJO`.
- [ ] 5.3 Renderizar el bloque SOLO en modo edición (en create no se monta).
- [ ] 5.4 `api/update-cuenta.ts`: agregar `actividadFlujo: values.actividadFlujo ?? null`
      al body del PATCH.

## 6. Frontend — tests

- [ ] 6.1 `cuenta-form-schema.test.ts`: agregar `actividadFlujo: null` al fixture y un
      caso que valide el campo opcional.
- [ ] 6.2 `cuenta-form.test.tsx`: agregar `actividadFlujo: null` al fixture `SAMPLE`;
      test que en modo edición el `<Select>` aparece con las opciones; test que en
      modo create NO se renderiza.

## 7. Regenerar api types (cierre de contrato)

- [ ] 7.1 Confirmar que `openapi.json` + `api.generated.ts` están commiteados y
      coinciden (sin diff pendiente).

## 8. Verificación

- [ ] 8.1 Backend: `pnpm exec tsc --noEmit` + `pnpm run lint` limpios.
- [ ] 8.2 Backend: `pnpm exec jest src/cuentas/` verde (unit + integration si aplica).
- [ ] 8.3 Frontend: `pnpm exec tsc -b` + `pnpm run lint` limpios.
- [ ] 8.4 Frontend: `pnpm exec vitest run` verde (incluye los nuevos tests).
- [ ] 8.5 Contract-drift local: regenerar ambos artefactos y `git diff --exit-code`
      sobre `openapi.json` + `api.generated.ts` → sin cambios (= verde en CI).
