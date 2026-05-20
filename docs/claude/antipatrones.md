<!--
Última edición: 2026-05-19
Última revisión contra core: 2026-05-19
Owner: backend-lead
-->

# Antipatrones — catálogo de cicatrices

> Este doc expande §8 del `CLAUDE.md`. 42 antipatrones organizados por área:
> cada uno lleva cuatro líneas — **Qué** (una línea), **Por qué duele**
> (cicatriz o principio), **Regla** (cómo hacerlo bien), **Enforcement**
> (cómo se previene). **"Cicatriz"** indica un bug real sufrido en el
> proyecto anterior o en producción.
>
> **Cuándo consultar este doc**:
> - Al revisar tu propio PR antes del squash merge (pasada completa sobre el diff).
> - Cuando detectás un smell: cálculo repetido, mock sospechoso, `new Date()`
>   en dominio, `any`, query sin `tenantId`, cualquier cosa que "se siente" mal.
> - Antes de normalizar un patrón nuevo en el código — buscá por keyword si
>   ya hay un antipatrón que lo prohíba.
> - Buscá por keyword (Ctrl+F) con el nombre del antipatrón o con la regla
>   que pensás aplicar.
>
> **Regla anti-drift**: si agregás un antipatrón nuevo que toca un invariante
> duro del core, el invariante debe ir primero al core (CLAUDE.md §4-core)
> y recién después se agrega el Anti-NN acá.

---

## 8. Qué NO hacer (antipatrones)

Cada antipatrón lleva cuatro líneas: **Qué** (una línea), **Por qué duele** (cicatriz o principio), **Regla** (cómo hacerlo bien), **Enforcement** (cómo se previene: test, constraint, lint, code review).

**"Cicatriz"** indica un bug real sufrido en el proyecto anterior o en producción.

### 8.1 Dominio contable

#### Anti-01: Cálculo de dominio replicado en múltiples archivos

- **Qué**: la misma regla (merma, cálculo de IVA, redondeo UFV) implementada en dos o más archivos.
- **Por qué duele**: cicatriz — merma calculada en `dispatch.service`, `dispatch.repository` y `purchase.service` → desincronización silenciosa al tocar una copia.
- **Regla**: cada regla vive en **un solo lugar** (value object o servicio propietario). Otros módulos la importan, no la re-implementan.
- **Enforcement**: code review + test positivo/negativo en el owner + lint contra funciones de nombres similares en varios archivos.

#### Anti-02: Critical path sin tests ni documentación

- **Qué**: flujos que mueven plata o alteran estado contable sin cobertura.
- **Por qué duele**: cicatriz — FIFO de pagos del proyecto anterior sin tests ni spec.
- **Regla**: todo flujo de plata o estado contable tiene (a) tests de integración con invariante, (b) referencia a la regla/RND, (c) al menos un test negativo por violación posible.
- **Enforcement**: coverage mínimo 95% en dominio contable + revisión en PR.

#### Anti-03: `Date` de JS para fecha contable

- **Qué**: usar `new Date()` o `Date` nativo para fechas de asientos, facturas, cotizaciones UFV.
- **Por qué duele**: el 31-dic en La Paz se vuelve 01-ene en UTC y rompe el cierre. Los reportes cambian retroactivamente cerca de medianoche.
- **Regla**: `FechaContable` value object (sección 4.3). Nunca se convierte a `Date` nativo ni pasa por UTC.
- **Enforcement**: lint prohíbe `new Date()` en `src/modules/**/domain/` — sólo permitido en infraestructura/presentación.

#### Anti-04: Redondeo ad-hoc

- **Qué**: `Math.round(x * 0.13 * 100) / 100` esparcido en el código.
- **Por qué duele**: cada expresión redondea un poquito distinto. Auditor encuentra diferencia de Bs 0.01 entre columnas.
- **Regla**: `common/domain/money.ts` expone `redondear(monto, modo)`. Única fuente de verdad.
- **Enforcement**: lint prohíbe `Math.round(` sobre montos + code review.

#### Anti-05: Guardar estado derivable

- **Qué**: persistir `totalDebe`, `totalHaber`, `balanceado` como columnas.
- **Por qué duele**: se desincroniza con las líneas cuando se edita sin recalcular todo.
- **Regla**: calcular al leer, o **vista materializada** con invalidación explícita documentada. Nunca columna denormalizada silenciosa.
- **Enforcement**: PR review + test de integridad (after write, compute and compare).

#### Anti-06: Soft-delete en entidades contables

- **Qué**: `deletedAt` en `Comprobante`, `Asiento`, `Factura`.
- **Por qué duele**: contabilidad NO elimina. Elimina ≠ anula. Auditor no acepta datos "desaparecidos".
- **Regla**: **prohibido** `deletedAt` en entidades contables. Anular es `ANULADO` con reversión de balances.
- **Enforcement**: code review + convención documentada + ausencia del campo en schema.

#### Anti-07: Conversión de moneda sin redondeo definido

- **Qué**: `usd * tipoCambio` sin política de redondeo explícita.
- **Por qué duele**: una diferencia de centavo por línea multiplicada por 1000 líneas es un descuadre reportable.
- **Regla**: toda conversión pasa por `Money.toBob(tipoCambio)` que aplica `toDecimalPlaces(2)` con `ROUND_HALF_EVEN`.
- **Enforcement**: test de propiedad (property-based) sobre `Money.toBob`.

#### Anti-08: Cálculo de período fiscal por fecha del servidor

- **Qué**: `format(new Date(), 'yyyy-MM')` para determinar el período actual.
- **Por qué duele**: contenedor en UTC, Bolivia en -4. A las 20h La Paz ya es día siguiente en UTC.
- **Regla**: `ClockPort.hoyEnLaPaz()` inyectable. Tests usan `FakeClock`.
- **Enforcement**: lint prohíbe `new Date()` en dominio. `ClockPort` es el único camino.

#### Anti-09: Enums como strings dispersos

- **Qué**: `if (estado === 'CONTABILIZADO')` esparcido.
- **Por qué duele**: typo se convierte en `false` silencioso. IDE no ayuda.
- **Regla**: siempre `EstadoComprobante.CONTABILIZADO`.
- **Enforcement**: TypeScript strict + lint `no-magic-strings` en enums del dominio.

#### Anti-10: Validación de invariantes sólo en DTO

- **Qué**: confiar en que el DTO validó "débitos ≥ 0" y omitir el chequeo en el servicio.
- **Por qué duele**: cualquier caller interno (cron, otro módulo, migración) salta el DTO y corrompe datos.
- **Regla**: **los DTOs validan formato**, los **servicios/entidades validan reglas de dominio**. Defense in depth.
- **Enforcement**: test de integración que llama al servicio con input inválido directamente (sin pasar por controller).

#### Anti-11: Sumar débito/haber en memoria cargando filas

- **Qué**: `findMany({...})` y después `reduce` sobre las filas para obtener totales.
- **Por qué duele**: cicatriz — no escala, y entre `SELECT` y `reduce` otra transacción puede insertar/borrar líneas (race).
- **Regla**: agregar en SQL con `SUM()` dentro de la misma transacción.
- **Enforcement**: code review + test de performance sobre datasets grandes.

#### Anti-12: Validación de cierre de período fuera de la transacción

- **Qué**: validar "no hay borradores" antes, cerrar después, sin lock.
- **Por qué duele**: cicatriz F-03 — entre validación y cierre, otro usuario crea un borrador. Terminás cerrando con datos inconsistentes.
- **Regla**: validación llamada **pre-TX** (fail fast) **y dentro de TX** con `FOR UPDATE` sobre el período.
- **Enforcement**: integration test con concurrencia simulada.

#### Anti-13: `fechaContable` sin `periodoFiscalId` persistido

- **Qué**: derivar el período al leer desde `fechaContable`.
- **Por qué duele**: cicatriz — edits cerca de medianoche mutaban reportes retroactivos.
- **Regla**: FK `periodoFiscalId` **calculado al write**, persistido, inmutable tras primer CONTABILIZADO.
- **Enforcement**: constraint `NOT NULL` + trigger / hook del repositorio.

#### Anti-14: Void de asiento auto-generado desde el módulo de asientos

- **Qué**: anular un asiento originado por venta/compra/pago llamando directo a `AsientoService.void()`.
- **Por qué duele**: el dominio origen (venta) queda inconsistente con su asiento.
- **Regla**: anulación se dispara desde el módulo **origen**. Campo `origenTipo` + `origenId` en `Comprobante`. El módulo origen orquesta void + reversión.
- **Enforcement**: guard en el `AsientoService.void` que rechaza calls sin `origenContext` cuando el asiento tiene `origenTipo`.

#### Anti-15: Cambio de contacto post-contabilización

- **Qué**: editar el NIT del cliente/proveedor después de contabilizar.
- **Por qué duele**: rompe CxC/CxP, LCV, aging, reconciliación SIN.
- **Regla**: NIT de cliente/proveedor **inmutable tras CONTABILIZADO**. Edits requieren anulación + re-creación.
- **Enforcement**: guard en el servicio + test negativo.

#### Anti-16: Línea sin `contactoId` en cuenta que requiere contacto

- **Qué**: permitir asiento contra "Clientes por cobrar" sin especificar cliente.
- **Por qué duele**: aging rompe, conciliación imposible.
- **Regla**: flag `requiereContacto` en `Cuenta`. Validación en `AsientoService.create`.
- **Enforcement**: test de integración con cuenta marcada + línea sin contacto → rechazo.

#### Anti-17: Auto-entry no idempotente

- **Qué**: un job que genera asientos automáticos corre dos veces y duplica.
- **Por qué duele**: duplicación silenciosa, conciliación rota.
- **Regla**: `UNIQUE(origenTipo, origenId)` en `Comprobante`. Generador usa `upsert`, nunca `create` ciego.
- **Enforcement**: constraint DB + test de idempotencia explícito.

#### Anti-18: Recalcular IVA/UFV/tipo de cambio en el frontend

- **Qué**: frontend hace `subtotal * 0.13` para mostrar IVA.
- **Por qué duele**: frontend y backend pueden divergir. Si el backend usa más precisión, el usuario ve un número y el sistema guarda otro.
- **Regla**: se calcula **una vez en backend** al write, se persiste. Frontend **muestra**, no recalcula.
- **Enforcement**: el DTO de respuesta incluye todos los valores derivados. Code review.

#### Anti-19: `Number` (float) para dinero

- **Qué**: `amount: number`, `total: number` en entidades/DTOs.
- **Por qué duele**: IEEE-754 pierde precisión en decimales. `0.1 + 0.2 !== 0.3`.
- **Regla**: `Decimal` en Prisma, `Money` (decimal.js) en TypeScript. DTOs cruzan HTTP como `string`.
- **Enforcement**: lint custom que prohíbe `number` para campos llamados `*Monto|*amount|*total|*precio|*iva`.

#### Anti-20: `new Date()` en el dominio

- **Qué**: generar timestamps o fechas directamente en servicios de dominio.
- **Por qué duele**: imposible testear con tiempo congelado.
- **Regla**: `ClockPort` inyectable con adaptador `SystemClock` en prod y `FakeClock` en test.
- **Enforcement**: lint prohíbe `new Date()` y `Date.now()` en `src/modules/**/domain/` y `src/modules/**/*.service.ts`.

---

### 8.2 Concurrencia e integridad de BD

#### Anti-21: Transacciones dispersas sin Unit of Work

- **Qué**: `db.$transaction` abierta y cerrada dentro de cada servicio.
- **Por qué duele**: cicatriz — lógica de compensación entrelazada, imposible componer casos de uso atómicos.
- **Regla**: servicios **no conocen Prisma**. Transacciones se orquestan vía `UnitOfWork` explícito en el caso de uso o controller.
- **Enforcement**: lint prohíbe `$transaction` fuera de `UnitOfWorkService`.

#### Anti-22: Migraciones que revierten decisiones anteriores

- **Qué**: `remove_credit_consumption` → luego `add_credit_consumption`.
- **Por qué duele**: cicatriz — 33 migraciones con undo en el proyecto anterior. Schema con cicatrices, reviews confusas.
- **Regla**: **forward-only** en producción. Schema se discute y diseña antes de codificar. Pre-release podés resetear; post-release nunca.
- **Enforcement**: revisión obligatoria de PR de schema + política documentada.

#### Anti-23: Unicidad enforced por un solo mecanismo

- **Qué**: confiar solo en constraint DB, o solo en guard de servicio.
- **Por qué duele**: cicatriz F-01 — sin constraint + guard simultáneos, se duplicaban `(organizationId, year, month)` en concurrencia.
- **Regla**: **ambos**. Constraint en DB (hard) + guard en servicio (friendly error). Defense in depth.
- **Enforcement**: test de integración que genera colisión esperada y verifica que ambos caminos rechazan.

#### Anti-24: Correlativos con `max(numero) + 1`

- **Qué**: generar el siguiente número leyendo `SELECT MAX(numero)` y sumando uno.
- **Por qué duele**: cicatriz `VOUCHER_NUMBER_CONTENTION` — en concurrencia, dos transacciones ven el mismo max y asignan el mismo número.
- **Regla**: tabla `SecuenciaComprobante` con `FOR UPDATE`, atómica por `(tenantId, tipo, year, month)`.
- **Enforcement**: test de concurrencia con N transacciones simultáneas verificando unicidad.

---

### 8.3 Seguridad multi-tenant

#### Anti-25: Checks de autorización manuales repetidos

- **Qué**: llamar `requirePermission()` a mano al inicio de cada endpoint.
- **Por qué duele**: cicatriz — `requirePermission()` invocado 129 veces en 76 rutas. Olvidarlo = agujero silencioso.
- **Regla**: autorización **declarativa** con decorator (`@RequirePermission('comprobante.edit')`) + guard global. **Deny-by-default** si no hay decorator.
- **Enforcement**: guard global registrado en `main.ts`. Test que verifica que endpoint sin decorator retorna 403.

#### Anti-26: Queries sin `tenantId` en el `where`

- **Qué**: `prisma.asiento.findMany()` sin filtro por tenant.
- **Por qué duele**: leak de datos entre tenants. Bug de seguridad.
- **Regla**: repositorio base recibe `tenantId` como parámetro obligatorio y lo inyecta al where. Defense in depth: también el servicio lo pasa explícito.
- **Enforcement**: tests de integración con dos tenants verificando aislamiento. Lint que prohíbe `prisma.<entidad>` directo en servicios.

#### Anti-27: Impersonation silenciosa

- **Qué**: admin edita "como si fuera" el usuario del tenant sin señal explícita.
- **Por qué duele**: indistinguible de acción del usuario real en auditoría. Legal y compliance inviable.
- **Regla**: toda acción durante impersonation se audita **doble**: auditoría del dominio (usuario impersonado) + `AccionImpersonada` (admin real, `impersonationId`). Ver sección 5.6.
- **Enforcement**: filter/interceptor que detecta claim `impersonatedBy` y escribe en ambas tablas.

#### Anti-28: Paginación opcional

- **Qué**: `findMany({ where: {...} })` sin `take`/`skip`.
- **Por qué duele**: N+1 memoria, timeouts en producción, DoS accidental por UI pidiendo "todo".
- **Regla**: repositorio base **rechaza queries sin paginación** sobre tablas de dominio. Listas completas solo en catálogos acotados (`TipoComprobante`, `Moneda`).
- **Enforcement**: abstracción del repo lanza si no viene `PaginationParams`.

---

### 8.4 Arquitectura y flujo

#### Anti-29: Lógica de negocio en controllers

- **Qué**: cálculos, validaciones de dominio, llamadas a múltiples repositorios desde un controller.
- **Por qué duele**: imposible de testear sin HTTP. Un CLI o cron no puede reutilizarla.
- **Regla**: controllers solo parsean/validan input, llaman **un método de servicio**, serializan output.
- **Enforcement**: code review + regla: controller nunca inyecta repositorios.

#### Anti-30: Dependencias cíclicas entre módulos

- **Qué**: módulo A importa de B, B importa de A.
- **Por qué duele**: NestJS explota en runtime. Arquitectura implícitamente rota.
- **Regla**: romper con port. El módulo "consumidor" define el port que necesita; el "proveedor" lo implementa.
- **Enforcement**: lint `import/no-cycle`.

#### Anti-31: `PrismaClient` directo en servicios

- **Qué**: `new PrismaClient()` o `import { prisma } from '...'` dentro de un service.
- **Por qué duele**: imposible de mockear, imposible de participar en transacción superior.
- **Regla**: inyectar `PrismaService` (singleton de NestJS) + usar `UnitOfWork` para transacciones.
- **Enforcement**: lint prohíbe import/instantiation de `PrismaClient` fuera de `infrastructure/prisma/`.

#### Anti-32: Efectos colaterales síncronos en transacción crítica

- **Qué**: enviar email, llamar webhook o publicar a message bus **dentro** del `$transaction`.
- **Por qué duele**: si el email falla, se revierte el asiento. Si el email tarda, la TX se cae por timeout.
- **Regla**: efectos colaterales **fuera** de TX vía cola de jobs. Publicar evento dentro de TX (transactional outbox), despachar fuera.
- **Enforcement**: code review + test que simula fallo de side-effect y verifica que la TX principal commite.

#### Anti-33: UPDATE directo en producción sin pasar por la aplicación

- **Qué**: entrar a Postgres y hacer `UPDATE asiento SET ...` para corregir un dato.
- **Por qué duele**: saltea validaciones, invariantes, auditoría, balances. Corrompe silenciosamente.
- **Regla**: **prohibido**. Correcciones siempre vía sistema, con endpoint admin y auditoría.
- **Enforcement**: política de accesos a prod + auditoría de conexiones a BD.

#### Anti-34: Errores de Prisma sin mapear al cliente

- **Qué**: dejar salir `PrismaClientKnownRequestError` con mensajes internos a la respuesta HTTP.
- **Por qué duele**: exposición de estructura interna, mensajes no internacionalizados, códigos inestables para el cliente.
- **Regla**: `GlobalExceptionFilter` mapea errores de Prisma a `DomainError` equivalentes con code estable.
- **Enforcement**: filter global + test que verifica respuesta de error ante colisión de unique constraint.

#### Anti-35: `async`/`await` en loops sin manejo

- **Qué**: `for (const item of items) { await doSomething(item); }` sin try/catch.
- **Por qué duele**: un fallo corta el loop sin limpiar estado. Nadie sabe cuántos procesaron.
- **Regla**: elegir explícitamente entre:
  - Secuencial con `for..of` + try/catch granular, registrando éxito/fallo por item.
  - Paralelo con `Promise.allSettled` si el orden no importa.
- **Enforcement**: code review + lint `no-await-in-loop` con excepción comentada cuando es intencional.

---

### 8.5 Código táctico

#### Anti-36: `any` en código de producción

- **Qué**: `let x: any = ...`.
- **Por qué duele**: apagás el compilador donde más lo necesitás.
- **Regla**: `unknown` + narrowing, o `.d.ts` mínimo. Ver sección 2.5.
- **Enforcement**: ESLint `@typescript-eslint/no-explicit-any: error`.

#### Anti-37: Mutación de parámetros recibidos

- **Qué**: una función recibe `dto` y setea `dto.foo = ...`.
- **Por qué duele**: el caller no espera que su objeto cambie.
- **Regla**: spread para crear copias modificadas: `{ ...dto, foo: x }`.
- **Enforcement**: code review + linter `no-param-reassign`.

#### Anti-38: `console.log` en producción

- **Qué**: cualquier `console.log`, `console.error`, etc. fuera de scripts de infraestructura.
- **Por qué duele**: no pasa por el logger, no llega a Loki, no tiene correlación.
- **Regla**: usar el `LoggerPort` inyectable.
- **Enforcement**: ESLint `no-console: error` con excepción en `infrastructure/**` y `scripts/**`.

#### Anti-39: Mockear el reloj con `Date.now = ...`

- **Qué**: sobreescribir `Date.now` globalmente en un test.
- **Por qué duele**: leaks entre tests, causa flakes misteriosos en suites paralelas.
- **Regla**: `ClockPort` inyectable. `FakeClock` en tests.
- **Enforcement**: lint contra reasignación de `Date.now` o `globalThis.Date`.

#### Anti-40: Mocks que codifican cómo el productor **debería** comportarse

- **Qué**: `prismaMock.asiento.findMany.mockResolvedValue([...])` con data inventada por el autor del test.
- **Por qué duele**: el mock diverge del comportamiento real de Prisma/Postgres. Cicatriz F-03/W-01.
- **Regla**: preferir **integration tests** con Postgres real (sección 7.1). Mock solo adapters externos bien contractualizados.
- **Enforcement**: coverage de integración ≥ 60% del total + revisión en PR.

---

### 8.6 Plan de cuentas y configuración contable

#### Anti-41: Desactivar cuenta configurada como concepto contable

- **Qué**: permitir `DELETE /cuentas/:id` (o setear `activa=false`) en una cuenta que está mapeada en `OrgConfiguracionContable` como concepto (ej. cuenta de IVA Crédito Fiscal, Resultado del Ejercicio, Diferencia de Cambio).
- **Por qué duele**: los asientos automáticos que dependen del concepto (cálculo IVA de venta, cierre de gestión, diferencia de cambio) empiezan a fallar silenciosamente o con 500 en el próximo uso. El admin desactivó la cuenta sin saber que estaba "enchufada" a procesos internos.
- **Regla**: `CuentasService.desactivar` consulta `OrgConfiguracionContable` y rechaza con `CUENTA_CONFIGURADA_COMO_CONCEPTO` devolviendo en `details.conceptos` la lista de campos que apuntan a la cuenta (ej. `['ivaCreditoId', 'resultadoEjercicioId']`). El usuario debe remapear primero vía `PATCH /api/configuracion-contable`.
- **Enforcement**: validación en el service + FK `onDelete: Restrict` en cada relación de `OrgConfiguracionContable` (defense in depth) + test unitario `cuentas.service.spec.ts#desactivar › rechaza con lista de conceptos`.

#### Anti-42: Inventar códigos/nombres de cuenta en la plantilla del seed sin verificar la numeración contable real

- **Qué**: asumir un código o nombre de cuenta (por ejemplo "5.3.1.001 INTERESES PAGADOS") basado en memoria, convención o suposición, e inlinearlo en la plantilla del seed (`prisma/seeds/prod/planes-cuentas/comercial.ts`) sin verificarlo contra la numeración contable boliviana real.
- **Por qué duele**: cicatriz — durante el seed inicial de la plantilla COMERCIAL (Fase 1.0.6), >50% de los códigos propuestos a primera vista no existían o tenían otro nombre en la numeración estándar (ej. 5.3.1.001 es SUELDOS Y SALARIOS, no INTERESES PAGADOS). De haber pasado a producción, el LCV y los EEFF habrían sido inconsistentes con lo que revisa el SIN.
- **Regla**: todo código/nombre que se inlinea en `comercial.ts` se verifica contra la numeración contable boliviana antes de commitearlo. El `codigoInterno` es la fuente de verdad: `nivel` se deriva de la cantidad de segmentos y `claseCuenta` del primer dígito; el `nombre` es texto libre que debe corresponder al código.
- **Enforcement**: en seed — test de coherencia `prisma/seeds/prod/planes-cuentas/__tests__/codigo-a-concepto.spec.ts` (toda cuenta `esRequeridaSistema: true` debe estar en `MAPEO_CODIGO_A_CONCEPTO` y vice-versa); guarda de regresión del seed: 61 hojas, jerarquía y distribución por nivel idénticas, 8 conceptos requeridos.
