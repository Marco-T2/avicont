<!--
Última edición: 2026-04-23
Última revisión contra core: 2026-04-23
Owner: backend-lead
-->

# Testing — detalle

> Este doc expande las reglas de testing del `CLAUDE.md`. Acá viven las
> decisiones sobre pirámide Honeycomb, Testcontainers para Postgres real,
> ubicación de archivos, coverage por capa, qué NO mockear.
>
> **Cuándo leer este doc**: antes de crear o modificar `*.spec.ts`,
> `*.integration.spec.ts`, `*.e2e-spec.ts`, o factories en `test/` /
> `__fixtures__/`.
>
> **Regla anti-drift**: si al editar este doc descubrís que una regla de
> testing contradice un invariante del core (ej. coverage mínimo del
> dominio contable), el cambio debe ir primero al core y recién después
> propagarse acá.

---

## 7. Testing

### 7.1 Pirámide: Honeycomb

En contabilidad, los bugs viven en la interacción con Postgres (decimals, locks, constraints, transacciones), no en lógica pura. **Mockear Prisma es mockear justo lo que querés probar.**

| Tipo | Proporción objetivo | Qué valida |
|------|---------------------|-----------|
| **Integración** (contra Postgres real) | **60%** | Repositorios, servicios atravesando la BD, transacciones, constraints, queries complejas |
| **Unitarios** puros | **25%** | Value objects, cálculos aislados (UFV, IVA, merma), validadores de dominio sin BD |
| **E2E** | **10%** | Flujos críticos completos: login → switch tenant → crear asiento → cerrar período |
| **Contract** | **5%** | Bordes de adapters externos (tipos de cambio BCB, mailer, etc.) |

### 7.2 Tests de integración: Postgres real con Testcontainers

**SQLite miente** (semántica distinta de tipos, sin `timestamptz`, sin `Decimal` con precisión real). **Mockear Prisma es re-escribir Prisma.**

- Setup: `@testcontainers/postgresql` levanta un Postgres efímero por suite.
- Patrón: **contenedor por suite, transacción + rollback por test**. Rápido y aislado.
- Migrations se aplican al inicio de la suite.
- Seed mínimo por test, usando factories.

```typescript
// asiento.integration.spec.ts
describe('AsientoService (integration)', () => {
  let db: PrismaClient;
  let rollback: () => Promise<void>;

  beforeAll(async () => {
    db = await setupTestDatabase();  // levanta container, corre migrations
  });

  beforeEach(async () => {
    rollback = await beginTransaction(db);  // savepoint
  });

  afterEach(async () => {
    await rollback();  // deshace cambios del test
  });

  it('debe rechazar asiento con partida doble violada', async () => {
    // ...
  });
});
```

### 7.3 Ubicación de archivos

**Unitarios e integración: al lado del código.** Cohesión + refactors baratos.
**E2E: en `test/` en la raíz del proyecto.** Por convención del starter — comparten fixtures, helpers y bootstrap entre suites E2E de distintos módulos.

```
src/comprobantes/
├── comprobantes.service.ts
├── comprobantes.service.spec.ts              ← unitario (al lado)
├── comprobantes.service.integration.spec.ts  ← integración contra Postgres (al lado)
├── comprobantes.controller.ts
└── comprobantes.controller.spec.ts

test/
├── helpers/test-factory.ts              ← fixtures compartidas entre E2E
├── asientos.e2e-spec.ts                 ← E2E end-to-end
└── cuentas.e2e-spec.ts
```

**Sufijos:**

| Sufijo | Tipo | Cuándo | Ubicación |
|--------|------|--------|-----------|
| `.spec.ts` | Unitario puro (sin BD, sin red, sin filesystem) | Value objects, cálculos, validadores | al lado del código |
| `.integration.spec.ts` | Integración contra Postgres real | Repositorios, servicios con BD | al lado del código |
| `.e2e-spec.ts` | E2E end-to-end vía HTTP con JWT real | Flujos completos con auth | `test/` |

### 7.4 Framework: Jest (mantener starter)

Migrar a Vitest = horas sin ganancia real en Fase 0. Si en Fase 2+ pesa la velocidad de Jest, reevaluamos.

### 7.5 Coverage

- **Global**: 80%.
- **Dominio contable** (`src/comprobantes`, `src/cuentas`, `src/periodos-fiscales`, `src/configuracion-contable`, etc.): **95%**.
- **Cada invariante de sección 4.1**: test positivo **+** test negativo (no cuenta si solo tenés el happy path).

**CI falla si coverage baja del umbral.** El número no es el objetivo — los invariantes son. El número es piso.

**Mutation testing (Stryker)**: para Fase 1+. En Fase 0 no justifica el overhead.

### 7.6 Idioma en los tests del dominio

- `describe` y `it` del **dominio contable** en **español**. Así los contadores leen los tests como documentación viva.
- Tests de infraestructura pura (cache, guards, interceptors) pueden estar en inglés.

```typescript
describe('AsientoService', () => {
  describe('create', () => {
    it('debe rechazar asientos con débitos distintos a créditos', async () => { ... });
    it('debe asignar correlativo al pasar de BORRADOR a CONTABILIZADO', async () => { ... });
    it('no debe permitir contabilizar en período CERRADO', async () => { ... });
  });
});
```

### 7.7 Factories y fixtures

- Ubicación: `src/<modulo>/__fixtures__/` o `test/fixtures/` si es compartido.
- Preferir **factories tipadas** (funciones que devuelven entidades válidas) sobre fixtures JSON estáticos.
- Factories aceptan overrides parciales: `createAsiento({ glosa: 'custom' })`.

### 7.8 Qué NO mockear

- **Prisma**: integración real (Testcontainers).
- **Value objects**: usarlos reales.
- **Guards**: en tests de controller, usarlos reales o overrides explícitos.

### 7.9 Qué SÍ mockear

- Adapters hacia servicios externos (mailer, tipos de cambio BCB, SIN).
- `Date.now()` / reloj — usar `jest.useFakeTimers()` o inyección de `ClockPort`.
- Redis en tests unitarios de lógica que lo usa como cache (no en integración).
