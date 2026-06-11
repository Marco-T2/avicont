# Avicont — Constitución del Proyecto

> SaaS contable multi-tenant para asociaciones de avicultores en Bolivia.
> Este documento es la fuente de verdad sobre cómo se construye el proyecto.
> Claude Code lee este archivo al inicio de cada sesión y debe respetar TODAS las reglas.

## Contexto rápido

- **Dominio**: Contabilidad boliviana (control interno, sin integración SIAT/SIN por ahora) + operaciones avícolas.
- **Arquitectura**: Backend NestJS + Prisma + PostgreSQL. Frontend Vite + React (separado).
- **Multi-tenancy**: Flat. Cada organización es una isla. Admins pueden crear/administrar múltiples organizaciones.
- **Módulos principales**: Contabilidad (full accounting) y Granja (operativo simple con IA). Independientes, activables por flag.

---

## 1. Idioma y nomenclatura

### Regla general

| Capa | Idioma |
|------|--------|
| Framework/infraestructura (Service, Controller, Repository, DTO, Guard, Pipe, Interceptor) | **Inglés** |
| Dominio (entidades, value objects, enums del negocio) | **Español** |
| Términos fiscales/legales bolivianos | **Español** (forzado) |
| Conceptos técnicos genéricos (amount, total, quantity, user, product) | **Inglés** |
| Métodos genéricos de CRUD (`create`, `findAll`, `update`) | **Inglés** |
| Comentarios del código | **Español** |
| Mensajes de commit | **Inglés** (conventional commits) |
| Textos de UI | **Español** |
| Mensajes de error al usuario | **Español** |
| Logs técnicos (console, Winston, Loki) | **Inglés** |
| Documentación del proyecto (README, docs/) | **Español** |

### Filosofía del naming

**El dominio habla el idioma del negocio. El framework habla el idioma del framework.**

- `JournalEntry` suena traducido. En contabilidad boliviana es `Asiento`.
- `AsientoService`, `AsientoRepository`, `AsientoController`, `CreateAsientoDto` — la entidad en español, el sufijo en inglés.
- Methods genéricos (`create`, `findById`, `update`, `delete`) en inglés. Métodos con lógica de dominio específica pueden mezclar: `validarPartidaDoble()`, `calcularSaldo()`, `postAsiento()`, `voidAsiento()`.

### Ejemplos

✅ **Correcto:**
```typescript
class AsientoService {
  /**
   * Crea un asiento contable validando partida doble.
   * Los débitos deben igualar a los créditos.
   */
  async create(dto: CreateAsientoDto): Promise<Asiento> {
    if (!this.validarPartidaDoble(dto.lineas)) {
      throw new BadRequestException('Los débitos deben igualar a los créditos');
    }
    return this.repository.create(dto);
  }

  private validarPartidaDoble(lineas: AsientoLinea[]): boolean {
    // RND 10-0025-14 art. 12: partida doble, débito = crédito
    const totalDebito = lineas.reduce((acc, l) => acc + l.debito, 0);
    const totalCredito = lineas.reduce((acc, l) => acc + l.credito, 0);
    return totalDebito === totalCredito;
  }
}
```

❌ **Incorrecto:**
```typescript
class JournalEntryService {  // dominio traducido al inglés — NO
  async crear(dto: CrearAsientoDto): Promise<JournalEntry> {  // "crear" en vez de "create" — NO
    throw new Error('Debits must equal credits');  // error en inglés al usuario — NO
  }
}
```

### Lista de términos del dominio que SIEMPRE van en español

**Entidades contables:**
- `Comprobante`, `LineaComprobante`, `Cuenta`, `PlanCuentas`
- `LibroDiario`, `LibroMayor`
- `PeriodoFiscal`, `GestionFiscal`, `CierreMensual`
- `BalanceGeneral`, `EstadoResultados`

**Nota — Comprobante vs "asiento"**: internamente la entidad se llama
`Comprobante` (cabecera) + `LineaComprobante` (detalle). "Asiento" es
**sinónimo user-facing** que usa el contador boliviano — aparece en textos
de UI, en el catálogo de permisos (`contabilidad.asientos.{read,create,post,...}`),
en logs orientados al usuario y en el glosario. No es inconsistencia: es
vocabulario de dominio. Regla: en código, schema y tests → `Comprobante`;
en RBAC, UI y mensajes al usuario → "asiento". Ver
`docs/disenos/comprobantes-asientos.md` §1.

**Términos tributarios/legales bolivianos:**
- `nit`, `razonSocial`, `representanteLegal`, `nroPatronal`
- `numeroFactura`, `codigoAutorizacion`, `codigoControl`
- `estadoSIN`, `glosa`, `dosificacion`

**Entidades del módulo granja:**
- `Lote`, `TipoRegistro`, `MovimientoInversion`, `MovimientoCantidad`

**Enums de dominio:**
- Nombre Y **valores** en español: `EstadoComprobante.BORRADOR | CONTABILIZADO | BLOQUEADO | ANULADO`.
- Razón: si un auditor o contador lee los logs o inspecciona la BD, debe entender sin traducir mentalmente.
- **Excepción**: enums de conceptos técnicos no-dominio siguen en inglés: `LogLevel.ERROR`, `HttpMethod.POST`, `SpanKind.SERVER`.

### Regla de decisión para casos nuevos

1. ¿Es una entidad/value object del dominio de negocio? → **español**
2. ¿Es un término legal o fiscal específico de Bolivia? → **español**
3. ¿Es un concepto genérico de programación o una abstracción técnica? → **inglés**
4. ¿Tengo dudas? → preguntar antes de decidir unilateralmente.

### Sufijos de clase

- `Service`, `Controller`, `Repository`, `Dto`, `Guard`, `Pipe`, `Interceptor`, `Module` — sufijos estándar NestJS, siempre en inglés.
- **Entidades de dominio puro**: SIN sufijo. `Asiento`, `Cuenta`, `Lote`, no `AsientoEntity`.
- Sufijo `OrmEntity` o similar SOLO si hay ambigüedad con un modelo de BD que convive con una entidad de dominio en memoria. Ej: `AsientoOrmEntity` (Prisma) vs `Asiento` (entidad de dominio pura).

### Naming de archivos

- **Kebab-case**, con doble dot cuando aplica (convención NestJS):
  - `asiento.service.ts`, `asiento.controller.ts`, `asiento.repository.ts`
  - `create-asiento.dto.ts`, `update-asiento.dto.ts`
  - `plan-cuentas.service.ts`, `libro-mayor.controller.ts`

### Naming de endpoints (URLs)

- URLs en **español** siguiendo el dominio:
  - `/api/asientos`, `/api/plan-cuentas`, `/api/libro-mayor`
  - `/api/lotes`, `/api/granja/chat`
- URLs en inglés SOLO para recursos puramente técnicos:
  - `/api/auth/login`, `/api/auth/refresh`, `/api/metrics`, `/api/health`

---

---

## 2. Convenciones de código

### 2.1 Comentarios

**Regla general: código autodocumentado > comentarios.**

- Si necesitás un comentario para explicar **QUÉ hace** el código, el nombre del método/variable está mal. Arreglá el nombre antes que agregar un comentario.
- Los comentarios SOLO se escriben para explicar el **POR QUÉ** no obvio: un workaround, una restricción externa, una decisión contra-intuitiva.

❌ **No hacer:**
```typescript
// Calcula la merma multiplicando el peso por el porcentaje
const merma = peso * (porcentaje / 100);
```

✅ **Hacer:**
```typescript
const merma = peso * (porcentaje / 100);
```

✅ **Comentario válido (POR QUÉ no obvio):**
```typescript
// El SIN exige redondeo hacia abajo, no redondeo estándar (RND 10-0021-16).
// Math.round() daría resultados diferentes al auditor.
return Math.floor(amount * 100) / 100;
```

### 2.2 Comentarios de trazabilidad regulatoria (OBLIGATORIOS)

**Excepción crítica al principio anterior**: cualquier regla tributaria, contable o legal boliviana que se implementa en código **DEBE llevar un comentario con la referencia normativa**.

Esto no es un comentario de "qué hace el código" — es trazabilidad regulatoria. Si el SIN cambia la norma o un auditor pregunta "¿por qué aplican este criterio?", el siguiente dev (o vos en 6 meses) tiene que poder ir directo a la RND/ley/resolución.

✅ **Ejemplos correctos:**
```typescript
// RND 10-0021-16 art. 6: la UFV se redondea a 5 decimales.
const montoUfv = Math.round((monto / tipoCambioUfv) * 100000) / 100000;

// Ley 843 art. 15: alícuota IVA 13% sobre monto neto.
const iva = montoNeto * 0.13;

// Código Tributario art. 47: los débitos y créditos de un asiento deben ser iguales.
if (totalDebito !== totalCredito) throw new Error('...');

// RND 10-0025-14: el NIT tiene entre 7 y 12 dígitos numéricos.
const NIT_REGEX = /^\d{7,12}$/;
```

**Formato del comentario regulatorio:**
```
// <norma> <artículo o referencia>: <descripción breve de la regla>
```

### 2.3 JSDoc

- **Obligatorio** en puertos/interfaces del dominio (contratos públicos de módulos).
- **Opcional** en el resto — preferí nombres claros.

✅ **JSDoc en puerto:**
```typescript
export interface AsientoRepository {
  /**
   * Crea un asiento contable persistiéndolo atómicamente con sus líneas.
   * Valida partida doble antes de persistir (Código Tributario art. 47).
   * @throws BadRequestException si débito ≠ crédito.
   */
  create(asiento: Asiento): Promise<Asiento>;
}
```

### 2.4 Estilo: funcional pragmático

**"Inmutable hacia afuera, pragmático hacia adentro."**

- **Objetos planos por default**. NO usar `new X()` salvo que la clase tenga comportamiento real (entidades con invariantes, value objects).
- **DTOs son objetos planos**. No se hace `new CreateAsientoDto()`.
- **Inmutabilidad donde no cuesta**: `const` siempre que no se reasigne. `readonly` en propiedades de DTOs y value objects. Spread (`{...obj, campo: x}`) en lugar de mutación cuando es claro.
- **Arrays**: `.map`, `.filter`, `.reduce`, `.flatMap` sobre `for` mutando — SALVO que el loop sea genuinamente más claro o haya un problema de performance **medido**.
- **Mutación permitida** dentro del cuerpo de un método cuando es local y no escapa (acumuladores, builders temporales).
- **Mutación PROHIBIDA** sobre parámetros recibidos. Una función nunca debe modificar lo que le pasan.
- **Value objects del dominio** (`Money`, `Ufv`, `Nit`, `Porcentaje`) SÍ son clases con invariantes y métodos, no objetos planos. Acá la OO gana.

✅ **Ejemplo correcto:**
```typescript
class AsientoService {
  async create(dto: CreateAsientoDto): Promise<Asiento> {
    const lineas = dto.lineas.map((l) => ({
      ...l,
      cuentaId: this.normalizarCuentaId(l.cuentaId),
    }));

    const totalDebito = lineas.reduce((acc, l) => acc + l.debito, 0);
    const totalCredito = lineas.reduce((acc, l) => acc + l.credito, 0);

    // Código Tributario art. 47: partida doble obligatoria
    if (totalDebito !== totalCredito) {
      throw new BadRequestException('Los débitos deben igualar a los créditos');
    }

    return this.repository.create({ ...dto, lineas });
  }
}
```

❌ **Ejemplo con problemas:**
```typescript
class AsientoService {
  async create(dto: CreateAsientoDto) {
    dto.lineas.forEach((l) => {                         // mutación de param
      l.cuentaId = this.normalizarCuentaId(l.cuentaId); // MAL
    });

    let totalDebito = 0;                                 // mutación innecesaria
    let totalCredito = 0;
    for (let i = 0; i < dto.lineas.length; i++) {        // for explícito sin justificación
      totalDebito += dto.lineas[i].debito;
      totalCredito += dto.lineas[i].credito;
    }
    // ...
  }
}
```

### 2.5 Tipado estricto: cero tolerancia a `any`

- **`any` está prohibido** en todo el código de producción.
- Si el tipo es genuinamente desconocido (parsing de JSON externo, respuestas del SIN, webhooks), usar **`unknown`** y hacer **narrowing** antes de operar.
- Si una librería no trae tipos, escribir un **`.d.ts` mínimo** en `types/` del proyecto.
- **Excepción**: en tests (`*.spec.ts`, `*.e2e-spec.ts`) un `any` ocasional en un mock es tolerable, pero siempre preferir `Partial<T>` o factories tipadas.

✅ **Uso correcto de `unknown`:**
```typescript
async function procesarRespuestaSIN(raw: unknown): Promise<RespuestaSIN> {
  if (!isRespuestaSIN(raw)) {
    throw new BadRequestException('Respuesta del SIN con formato inválido');
  }
  return raw;
}
```

### 2.5.1 Flags estrictos activos

`tsconfig.json` tiene activos los siguientes flags además de `strict: true`:

- `noUncheckedIndexedAccess`: chequear `array[i]` antes de usarlo (devuelve `T | undefined`).
- `exactOptionalPropertyTypes`: distinguir `prop?: string` de `prop: string | undefined`.
  Para campos opcionales (DTOs, payloads de Prisma) usar **spread condicional** en
  vez de pasar `undefined`: `...(value !== undefined ? { field: value } : {})`.
- `noImplicitOverride`: usar keyword `override` al sobreescribir métodos.

### 2.6 Imports

- Imports absolutos con alias de TS (`@/modules/asientos/...`) en lugar de relativos profundos (`../../../asientos/...`).
- Agrupar imports en este orden:
  1. Librerías externas (`@nestjs/*`, `prisma`, etc.)
  2. Imports internos absolutos (`@/common/*`, `@/modules/*`)
  3. Imports relativos (`./*`, `../*`)
- Una línea en blanco entre grupos.

### 2.7 Early return > nesting

Preferir early returns sobre pirámides de ifs.

❌ **Nesting:**
```typescript
function procesarPago(pago: Pago) {
  if (pago.monto > 0) {
    if (pago.estado === 'PENDIENTE') {
      if (pago.cuentaId) {
        // lógica
      }
    }
  }
}
```

✅ **Early return:**
```typescript
function procesarPago(pago: Pago) {
  if (pago.monto <= 0) return;
  if (pago.estado !== 'PENDIENTE') return;
  if (!pago.cuentaId) return;
  // lógica
}
```

---

---

## 3. Arquitectura

### 3.1 Estructura general del proyecto

El repositorio es un **monorepo** con carpetas separadas para backend y frontend.
La documentación transversal y la configuración de infraestructura viven en la raíz;
cada stack es autocontenido en su carpeta.

```
avicont/                     Raíz del monorepo
├── backend/                 API NestJS (este es el foco de esta constitución)
│   ├── src/                 Ver árbol abajo
│   ├── prisma/              Schema, migrations, seeds
│   ├── test/                E2E tests (fixtures compartidas entre suites)
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── ...
│
├── frontend/                Vite + React (se agrega cuando arranque el slice UI)
│
├── docs/                    Diseños de dominio transversales
│   ├── disenos/
│   └── claude/              Docs extendidos del CLAUDE.md (ver §12)
│
├── observability/           Configs de Grafana, Loki, Prometheus, Tempo
├── docker-compose.yml       Stack local (app + postgres + redis + obs)
├── CLAUDE.md                Esta constitución (aplica al repo entero)
└── README.md                Overview del monorepo
```

Estructura interna del backend (`backend/src/`):

```
backend/src/
├── common/                  Código compartido transversalmente
│   ├── domain/              Value objects globales (Money, Nit, Ufv, Porcentaje)
│   ├── errors/              Excepciones de dominio reutilizables
│   ├── guards/              Guards globales (JwtAuthGuard, PermissionsGuard)
│   ├── interceptors/        Interceptors globales (logging, tenant-context)
│   ├── decorators/          Decoradores comunes (@CurrentUser, @RequirePermissions)
│   └── pipes/               Pipes globales de validación
│
├── auth/                    Autenticación y tokens
├── comprobantes/            Comprobantes contables
├── configuracion-contable/  Configuración contable por tenant
├── contactos/               Contactos (clientes/proveedores)
├── cuentas/                 Plan de cuentas
├── custom-roles/            Roles personalizados por tenant
├── documentos-fisicos/      Documentos tributarios físicos
├── impersonation/           Flujo de impersonation auditada
├── invitations/             Invitaciones a tenant
├── memberships/             Membresías de usuario en tenant
├── periodos-fiscales/       Períodos y gestiones fiscales
├── permissions/             Catálogo de permisos RBAC
├── rbac/                    Guards y resolución de permisos
├── tenants/                 Organizaciones / tenants
├── tipos-documento-fisico/  Tipos de documento tributario
├── users/                   Usuarios
│
├── audit/                   Infraestructura de auditoría
├── billing/                 Facturación / billing
├── cache/                   Abstracción de cache (Redis)
├── logger/                  Adaptadores de logging
├── metrics/                 Adaptador Prometheus
├── notifications/           Notificaciones (email)
├── tracing/                 Bootstrap + adaptador OpenTelemetry
│
├── health/                  Health checks (terminus)
├── app.module.ts
└── main.ts
```

> Los paths en el resto de este documento (`src/...`, `prisma/...`, `test/...`)
> son relativos a `backend/`. Los comandos operativos del §11 se corren
> desde `backend/` salvo que se indique lo contrario.

### 3.2 Estructura interna de un módulo (hexagonal ESTRICTO)

**Regla obligatoria**: todo módulo sigue esta estructura, **incluso con un solo adapter**. La consistencia es el beneficio — no esperamos a "necesitar" el puerto para tenerlo.

```
modules/asientos/
├── domain/                  Entidades puras del módulo (Asiento, AsientoLinea)
│   ├── asiento.ts
│   └── asiento-linea.ts
│
├── ports/                   Interfaces (contratos)
│   ├── asiento.repository.port.ts
│   └── validation.port.ts
│
├── adapters/                Implementaciones de los puertos
│   └── prisma-asiento.repository.ts
│
├── dto/                     Data Transfer Objects
│   ├── create-asiento.dto.ts
│   ├── update-asiento.dto.ts
│   └── asiento-response.dto.ts
│
├── asiento.service.ts       Lógica de negocio (usa puertos, no adapters)
├── asiento.controller.ts    Expone endpoints HTTP
└── asiento.module.ts        Inyección de dependencias NestJS
```

### 3.3 Regla de importación entre módulos

**Prohibido**: un módulo NO importa directamente desde otro módulo.

❌ **Incorrecto:**
```typescript
// modules/asientos/asiento.service.ts
import { PlanCuentasRepository } from '../plan-cuentas/adapters/prisma-plan-cuentas.repository';
```

✅ **Correcto** (depender del puerto, inyectado vía NestJS):
```typescript
// modules/asientos/ports/plan-cuentas-reader.port.ts
export interface PlanCuentasReaderPort {
  findByCodigo(codigo: string): Promise<Cuenta | null>;
}
```

Cada módulo declara los puertos que necesita consumir; el módulo proveedor registra el adapter concreto en su `*.module.ts`.

### 3.4 Value objects del dominio

Viven en `src/common/domain/` si son compartidos (`Money`, `Nit`, `Ufv`, `Porcentaje`).
Viven dentro del módulo si son específicos (`CodigoCuenta` dentro de `plan-cuentas/domain/`).

**Reglas de un value object:**
- Inmutable: `readonly` en todas las propiedades.
- Self-validating: el constructor rechaza estados inválidos.
- Sin dependencias de infraestructura (no Prisma, no NestJS decorators).
- Métodos de dominio directamente en el value object (`money.add()`, `nit.isValid()`).

```typescript
// common/domain/nit.ts
export class Nit {
  private constructor(private readonly value: string) {}

  // RND 10-0025-14: el NIT tiene entre 7 y 12 dígitos.
  static create(raw: string): Nit {
    const cleaned = raw.trim();
    if (!/^\d{7,12}$/.test(cleaned)) {
      throw new BadRequestException('NIT inválido: debe tener entre 7 y 12 dígitos');
    }
    return new Nit(cleaned);
  }

  toString(): string {
    return this.value;
  }

  equals(other: Nit): boolean {
    return this.value === other.value;
  }
}
```

### 3.5 Separación dominio vs infraestructura

- **Dominio** (`domain/`, puertos, value objects, entidades): NO importa NestJS, Prisma, ni librerías externas. Es código puro testeable sin contenedor ni BD.
- **Infraestructura** (`adapters/`, `infrastructure/`): importa lo que haga falta. Es la capa sucia.
- **Servicios** (`*.service.ts`): inyectan puertos, NO adapters concretos. Así se pueden testear con mocks triviales.

### 3.6 Path aliases

Configurado en `tsconfig.json`: `@/*` → `src/*`.

**Regla de imports:**
- Nunca imports relativos que suban más de un nivel (`../`).
- Si necesitás `../../`, usá `@/`.
- Imports dentro del mismo módulo sí pueden ser relativos: `./dto/create-asiento.dto`.

✅ **Correcto:**
```typescript
import { Nit } from '@/common/domain/nit';
import { PlanCuentasReaderPort } from '@/modules/plan-cuentas/ports/plan-cuentas-reader.port';
import { CreateAsientoDto } from './dto/create-asiento.dto';
```

❌ **Incorrecto:**
```typescript
import { Nit } from '../../../common/domain/nit';
```

### 3.7 Comunicación entre módulos

**Regla mental**: ¿si esto falla, debe fallar la operación principal?
- **Sí → Port** (síncrono, bloqueante).
- **No → Evento** (asíncrono, desacoplado).

#### Port para lecturas síncronas

El **módulo dueño del dominio define qué puede leerse de él**. Así controla su superficie pública y no expone métodos internos por accidente.

```typescript
// modules/plan-cuentas/ports/plan-cuentas-reader.port.ts
export abstract class PlanCuentasReaderPort {
  abstract existeCuenta(codigo: string): Promise<boolean>;
  abstract obtenerCuenta(codigo: string): Promise<Cuenta | null>;
}

// modules/asientos/asiento.service.ts
constructor(private readonly planCuentas: PlanCuentasReaderPort) {}
```

Cuando falla, falla el asiento. Es correcto: no se crea un asiento apuntando a una cuenta inexistente.

#### Eventos para efectos colaterales

Usar `EventEmitter2` de NestJS para dispatch asíncrono:

```typescript
// asientos publica
await this.events.emit('asiento.contabilizado', { asientoId, ... });

// auditoría, notificación, regeneración de caché suscriben
@OnEvent('asiento.contabilizado')
async handleAsientoContabilizado(payload) { ... }
```

Si falla la notificación al contador, el asiento YA ESTÁ GUARDADO. Eso es lo que queremos.

#### Excepción a la regla de no acople directo

Dentro del **mismo bounded context** (mismo módulo), servicios que son sub-piezas del módulo pueden inyectarse directo sin port:

```typescript
// modules/asientos/
@Injectable()
class AsientoService {
  constructor(
    private readonly validator: AsientoValidatorService,  // ← mismo módulo, OK
    private readonly repo: AsientoRepositoryPort,         // ← repo SÍ por port
    private readonly planCuentas: PlanCuentasReaderPort,  // ← otro módulo SÍ por port
  ) {}
}
```

**Regla**: cruzar frontera de módulo → port o evento. Dentro del módulo → inyección directa OK.

---

---

## 4. Invariantes no-negociables del dominio

Estos 9 invariantes son las reglas duras que, **si se violan, corrompen datos o son bug de seguridad**. Viven en el core porque no hay "depende" — se enforzan en DB, test y servicio simultáneamente (defense in depth).

**El detalle completo** (edge cases, ejemplos, value objects, tablas de decimales, justificación regulatoria, sub-reglas de plan de cuentas, LCV, UFV, multi-moneda, etc.) vive en **`docs/claude/dominio-contable.md`**. **LEÉ ese doc antes de editar código contable** — ver §12 Triggers.

### 4.1 Partida doble en BOB

- Todo comprobante `CONTABILIZADO` cumple `SUM(débitos BOB) === SUM(créditos BOB)`, tolerancia `±Bs 0.01` por redondeo.
- Débitos y créditos `≥ 0`. Una línea tiene débito O crédito, nunca ambos, nunca ninguno.
- Comprobante contabilizado tiene `≥ 2` líneas. Suma total `> 0`. Glosa obligatoria y no vacía.
- Cada línea referencia una cuenta con `activa = true` Y `esDetalle = true`.

### 4.2 Multi-tenant estricto (bug de seguridad si se viola)

- Todo registro tiene `tenantId` no nulo. Toda query de entidad de dominio filtra por `tenantId`.
- **Query sin filtro por `tenantId` es bug de seguridad.** Defense in depth: guard + servicio + repositorio. Ninguna capa confía en que la anterior hizo su trabajo.
- Fuente de `tenantId`: `JWT.activeTenantId`. Header `X-Tenant-ID` solo para super-admin, siempre auditado.
- Excepción: catálogos compartidos (`CotizacionUfv`, `TipoCambio` BCB) no tienen `tenantId` — solo lectura desde cualquier tenant.

### 4.3 Edición post-CONTABILIZADO (mientras el período esté abierto)

- Comprobantes en estado `CONTABILIZADO` son **editables** si el `PeriodoFiscal` está abierto. Aplica a cabecera (glosa, tipo, `fechaContable`, etc.) y a líneas (que se borran físicamente y se re-insertan en bloque — la cabecera con su `id` se preserva).
- **Excepción inviolable**: el número correlativo (`D2605-000042`) es **inmutable desde la primera contabilización**. Es código interno del sistema; NO se presenta al usuario como referencia editable. Para referencias humanas usar `documentoFisico` o `numeroReferencia`.
- Mover `fechaContable` a otro período exige que el período destino también esté abierto (ver §4.4).
- Toda modificación queda auditada vía triggers Postgres en tabla `comprobantes_audit` (capturan `OLD` y `NEW` row completos, usuario, timestamp, motivo opcional). Triggers, no audit en código, para que un `UPDATE` directo en BD también quede trazado.
- `UPDATE` directo en BD bypasseando triggers → **prohibido**. Siempre vía sistema.
- Transiciones prohibidas: `BLOQUEADO → CONTABILIZADO`, `CONTABILIZADO → BORRADOR`.

### 4.4 Period lock

- Prohibido crear, editar o anular comprobante con `fechaContable` en período `CERRADO` o `BLOQUEADO`.
- Cerrar período N requiere N-1 cerrado y cero borradores en N. No se saltean períodos.
- Validación del cierre debe estar **dentro de la transacción** con `FOR UPDATE` sobre el período — no sólo pre-TX. Cicatriz F-03.
- **Sin bypass de admin**: para tocar algo de un período cerrado, el admin pasa por el flujo de reapertura (`PeriodoFiscalReopening`) → el período vuelve a estado abierto → los usuarios con permisos editan/anulan → admin cierra de nuevo. El flag `fueDuranteReapertura` en `comprobantes_audit` distingue cambios normales de los hechos durante una reapertura excepcional.

### 4.5 Dinero = Decimal, nunca Float

- Prisma: `@db.Decimal(18, 2)` para BOB/USD. Tabla completa de decimales en `docs/claude/dominio-contable.md` §4.2.
- TypeScript: value object `Money` (`decimal.js`). **Prohibido** `number` para dinero.
- DTOs cruzan HTTP como `string` (`"1250.50"`) — evita pérdida IEEE-754 en JSON.
- Lint prohíbe `number` en campos `*monto|*amount|*total|*precio|*iva`.

### 4.6 FechaContable ≠ timestamp

- `FechaContable` (calendario puro, sin UTC, sin hora) para fechas del dominio contable: comprobantes, facturas, cotizaciones UFV, tipo de cambio.
- `timestamptz` en UTC solo para `createdAt`, `updatedAt`, `auditoria.timestamp`.
- `new Date()` **prohibido** en `src/**/domain/` y `src/**/*.service.ts`. Usar `ClockPort.hoyEnLaPaz()` inyectable.
- Contenedor Docker `TZ=UTC`. `America/La_Paz` solo en capa de presentación.

### 4.7 Anulación de comprobantes vía flag (no reversa automática)

- Anulación de comprobantes mediante flag `anulado BOOLEAN` + `fechaAnulacion`, `motivoAnulacion` (mínimo 10 caracteres significativos), `anuladoPorUserId`.
- El comprobante anulado **se preserva en BD para siempre**. No se elimina, no se actualiza su contenido. Su número correlativo se conserva y no se reutiliza.
- **Excluido de estados financieros y reportes oficiales por default**. Toggle "incluir anulados" disponible en reportes para auditoría interna; en reportes oficiales aparece con marca visual (línea diagonal + nota "Anulado el dd/mm/yyyy — motivo: …").
- **No se generan contra-asientos automáticos**. El tipo `AJUSTE` queda reservado para su semántica contable real (depreciaciones, diferenciales de cambio, devengamientos, regulaciones de inventario).
- Auditoría de anulación vía triggers Postgres en `comprobantes_audit` (mismo mecanismo que edit — ver §4.3).
- `Factura` sigue sin `deletedAt`. `LineaComprobante` se borra físicamente solo como parte del re-insert atómico durante edit del comprobante padre (ver §4.3); fuera de ese flujo, no se borra.
- Posicionamiento: este modelo se eligió conscientemente para PyMEs bolivianas con control interno (estilo QuickBooks/Sage default). NO aplica a empresas con auditoría externa rígida (ver §10.9).

### 4.8 Unicidad de documentos tributarios (defense in depth)

- Facturas recibidas y emitidas son únicas por `(tenantId, tipoDocumento, nitEmisor, numero, fecha)`.
- Documentos físicos: unicidad `(tenantId, tipoDocumentoId, numero)`.
- Enforcement **simultáneo**: constraint `UNIQUE` en DB (hard) + guard en servicio (friendly error). **Nunca solo uno.** Cicatriz F-01: enforcement solo en servicio falla bajo concurrencia.

### 4.9 Correlativos atómicos

- Número de comprobante se asigna **al pasar a CONTABILIZADO**, formato `{prefijo}{YY}{MM}-{correlativo:6}`, consecutivo por `(tenantId, tipo, year, month)`, reinicia cada mes.
- Asignación bajo `FOR UPDATE` en tabla `SecuenciaComprobante`. Atómica.
- **Prohibido** `SELECT MAX(numero) + 1` o equivalentes — cicatriz `VOUCHER_NUMBER_CONTENTION`.
- Auto-entries (asientos generados por venta/compra/pago) exigen `UNIQUE(origenTipo, origenId)` + `upsert`, nunca `create` ciego.
- El número correlativo es **inmutable**: una vez asignado, no se edita ni siquiera por admin en período abierto. Es identificador interno del sistema (ver §4.3). Para referencias humanas usar `documentoFisico` o `numeroReferencia`.

---

> **§5 Seguridad, §6 Errores y logs, §7 Testing, §8 Antipatrones** viven ahora en `docs/claude/`. Ver §12 para los triggers de lectura.

---

## 9. Git y commits

### 9.1 Formato de commit (Conventional Commits con scope)

```
<tipo>(<scope>): <descripción en imperativo, minúscula, sin punto final>

[body opcional: el POR QUÉ, no el qué — el diff ya dice qué]

[footer opcional: BREAKING CHANGE:, Refs #123]
```

**Tipos permitidos**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `style`, `build`, `ci`, `revert`.

**Scopes válidos:**

| Scope | Cuándo |
|-------|--------|
| Nombre del módulo (`asiento`, `comprobante`, `plan-cuentas`, `periodo`, `cuentas`, `ufv`, `rbac`, `auth`, `tenant`, `granja`, etc.) | Cambios dentro de un módulo específico |
| `common` | Cambios en `src/common/*` |
| `infra` | Docker, CI, scripts, configs de deploy |
| `deps` | Actualización de dependencias |
| `db` | Migraciones Prisma, schema, seeds |
| `docs` | Documentación, `CLAUDE.md`, `README` |
| `test` | Tests sin cambio funcional |

**Regla estricta**: el scope es **el módulo afectado**. Si tocás dos módulos en un commit, partilo en dos. Si realmente es indivisible, preferí el scope del módulo dominante, o `common` si es transversal. **No se usa scope doble.**

Ejemplos:

```
feat(comprobante): agregar numeración correlativa por mes
fix(common): corregir redondeo en Money.toBob
chore(infra): forzar TZ=UTC en Dockerfile
chore(deps): bump decimal.js to 10.4.3
feat(db): agregar tabla SecuenciaComprobante
docs: actualizar sección 8 con Anti-31
test(comprobante): agregar cobertura de anulación
```

### 9.2 Branches (GitHub Flow)

- `main` siempre deployable. **Push directo a `main` prohibido.**
- Branch por feature/fix, nombre descriptivo.
- PR obligatorio aunque seas único dev. El PR es el checkpoint — leer tu propio diff con cabeza fría atrapa bugs.
- Branch corta: idealmente ≤ 3 días. Si va a durar más, partirla.

**Convención de nombres de branch:**

```
feat/<scope>-<descripción-corta>       # feat/comprobante-numeracion
fix/<scope>-<descripción-corta>        # fix/cierre-periodo-concurrencia
refactor/<scope>-<descripción-corta>   # refactor/rbac-custom-roles
chore/<scope>-<descripción-corta>      # chore/infra-tz-utc
test/<scope>-<descripción-corta>       # test/asiento-partida-doble
```

Nada de `marco/trabajo-del-martes`. **Los branches son documentación.**

### 9.3 Integración de PRs: squash merge only

**Reglas:**

1. Squash por default, **sin excepciones**. Si una branch creció tanto que un squash pierde información relevante, la branch era demasiado grande y había que partirla antes.
2. El título del PR pasa a ser el título del commit squash (siguiendo el formato de 9.1).
3. `git bisect` queda determinístico: cada commit de `main` es un estado completo y testeado.
4. Revertir es trivial: `git revert <sha>` revierte todo el PR.

**Configuración del repo en GitHub:**

- ✅ Allow squash merging
- ❌ Allow merge commits
- ❌ Allow rebase merging
- Default merge commit message: **PR title and description** (no los commits individuales)
- ✅ Require PR before merging to `main`
- ✅ Require status checks to pass (CI: tests + lint + build)
- ✅ Require conversation resolution
- ✅ Automatically delete head branches (tras merge)

### 9.4 Regla del PR

Todo PR debe responder tres preguntas en su descripción:

```markdown
## Qué
[qué cambia funcionalmente, en 2-3 líneas]

## Por qué
[motivación / bug que resuelve / referencia a issue / regulación si aplica]

## Cómo probar
[pasos manuales o nombre del test que cubre el cambio]
```

Sin esas tres preguntas respondidas, no se mergea.

---

## 10. Decisiones cerradas (referencia rápida)

Este índice existe para que el próximo lector (vos en 6 meses o un dev nuevo) obtenga el 80% del contexto sin releer las secciones. Si necesita detalle, salta a la sección referenciada.

> **Nota de navegación**: las referencias `§4.x`, `§5.x`, `§6.x`, `§7.x` y `§8.x` apuntan a los docs extendidos en `docs/claude/` (ver §12 para el mapping). Las referencias `§1`, `§2`, `§3`, `§9`, `§11` viven en este archivo.

### 10.1 Arquitectura

| Decisión | Resumen | Sección |
|----------|---------|---------|
| Arquitectura de módulos | Hexagonal estricto (ports + adapters en cada módulo) | §3.2 |
| Comunicación entre módulos | Port para lecturas síncronas; eventos para efectos colaterales | §3.7 |
| Value objects del dominio | `src/common/domain/` (Money, Nit, Ufv, FechaContable, PeriodoFiscal) | §3.4 |
| Path aliases | `@/` para imports desde `src/` | §3.6 |
| Regla de imports | Nunca subir más de un nivel con `../`. Cross-module vía `@/` | §3.6 |
| Separación dominio/infra | Dominio puro, sin NestJS ni Prisma | §3.5 |
| Riel de packs (eje 2) | Catálogo global `Pack` + entitlement `OrgPackEntitlement` (activación embebida) + `@RequirePack`/`PackEnabledGuard` (cache Redis `org-packs:<id>` TTL 300, 404 deliberado) + `packsActivos` en `/me/permissions` + catálogo RBAC filtrado por packs. Módulo en `backend/src/packs/`. `OrgPacksReaderPort` = superficie cross-módulo. Change `packs-riel` (2026-06-02, PRs #150–#157). Diseño: `docs/disenos/packs-eje2.md`. Spec viva: `openspec/specs/packs-riel/spec.md`. | — |
| Dashboard portfolio cross-tenant (consola super-admin) | Dos endpoints en `GET /admin/platform/dashboard` (KPIs: orgs por status/plan/vertical, total usuarios, serie altas 12 meses) y `GET /admin/platform/activity` (timeline cursor-paginado sobre `platform_audit`, sin exponer `payload`). Ports: `PlatformStatsReaderPort` (adapter en `tenants/`) + `PlatformActivityReaderPort` (adapter en `platform/`). Cursor opaco base64 `{createdAt,id}` estable ante inserts concurrentes. Excepción cross-tenant DELIBERADA a Anti-31 (documentada en JSDoc de los ports): queries agregan TODAS las orgs sin `tenantId`; enforcement en `SuperAdminGuard`. Frontend: `PlatformHomePage` reemplazada (hooks `usePlatformDashboard`/`usePlatformActivity`, primer `useInfiniteQuery` del repo). Sin migración. Change `portfolio-cross-tenant` (2026-06-02, PR #159). Spec viva: `openspec/specs/portfolio-cross-tenant/spec.md`. Change archivado: `openspec/changes/archive/2026-06-02-portfolio-cross-tenant/`. | — |
| Perfil fiscal de la organización (datos-empresa) | 6 campos nullable en `Organization` (`razonSocial`, `nit`, `direccion`, `representanteLegal`, `telefono`, `email`) para cabecera de informes contables bolivianos. Editables por Owner vía `PATCH /tenants/current` (permiso `organizacion.configuracion.update`). Validación NIT `/^\d{7,12}$/` (RND 10-0025-14) y email en service con `DomainError` codes estables `TENANT_NIT_INVALIDO`/`TENANT_EMAIL_INVALIDO`. Pantalla `/settings/empresa` (react-hook-form + zod, nav-item gateado). Change `datos-empresa` (2026-06-03, PRs #175-#176). Spec viva: `openspec/specs/datos-empresa/spec.md`. | — |
| Exportación a Excel — Fases A + B + C + Estilos (capability cerrada) | Infraestructura frontend reutilizable (`frontend/src/lib/export-excel/`): builder `write-excel-file`, cabecera fiscal nullable desde `useEmpresa`, formateo es-BO, fecha `YYYY-MM-DD` → `dd/mm/yyyy` sin UTC (§4.6), monto string → celda numérica sin recalcular (§4.5). **Fase A** (PR #178): Libro Diario piloto, botón gateado por `contabilidad.libro-diario.read`, 33 tests nuevos. **Fase B** (PR #180): Libro Mayor (botón gateado por `contabilidad.libro-mayor.read`, aplanado cuenta → movimientos, `saldoCorrienteBob` del backend), Balance General y Estado de Resultados (ambos gateados por `contabilidad.eeff.read`, aplanado vía helper `aplanarArbol` árbol jerárquico 3 niveles `Sección → Subsección → Cuenta`), `construirHoja` parametrizado con `columns` opcional retrocompatible. 44 tests nuevos en Fase B (1176 total). Fases A y B: frontend-puro, sin backend ni migración. **Fase C** (PR #183): rompe el patrón frontend-puro de A/B porque el listado de comprobantes pagina — primera fase con backend. Endpoint `GET /api/comprobantes/export` en módulo `comprobantes/` (hexagonal): 2 métodos nuevos en el port (`listarParaExport`+`contarParaExport`), helper `construirWhereListado` compartido (Anti-31 sin drift), cap `COMPROBANTES_EXPORT_MAX` env default 1000 → `ComprobanteExportRangoExcedidoError` (422, code `COMPROBANTE_EXPORT_RANGO_EXCEDIDO`), orden cronológico ASC (vs DESC del listado). Frontend: botón único gateado por `contabilidad.asientos.read`, fetch on-demand (no cache del listado), `mapearComprobantesAFilas` → 9 columnas (Fecha, Número, Tipo, Documento respaldo, Nro. Ref., Contacto, Glosa, Estado, Total BOB), arrays concatenados con `" / "`. **Estilos** (PR #185, 2026-06-09): formato visual esencial agregado post-A/B/C — negritas en cabeceras de columna y filas de totales/subtotales, montos alineados a la derecha por default, cabecera fiscal con `razonSocial` en negrita y demás campos con etiqueta fija (`"NIT: <v>"`, `"Dirección: <v>"`, etc.); mecánica: tipo `CeldaEstilo` base con `fontWeight?`/`align?` props opcionales propagadas en `construirHoja` vía spread condicional, retrocompatible; sin deps nuevas; frontend-puro sin backend ni migración; §4.5/§4.6 preservados. 1220 tests (44 nuevos). Change `exportacion-excel-fase-c` (2026-06-05). Changes `exportacion-excel-fase-a` (2026-06-03) + `exportacion-excel-fase-b` (2026-06-05). Change `exportacion-excel-estilos` (2026-06-09, PR #185). Spec viva: `openspec/specs/exportacion-excel/spec.md`. | — |
| Pack "Adjuntos a comprobantes" (primer pack concreto del riel) | PRIMER pack concreto sobre el riel `packs-riel`. Entidad `AdjuntoComprobante` (metadata + `storageKey`; binario en MinIO vía `StoragePort` hexagonal — `@aws-sdk/client-s3`, swap a S3/R2 = solo endpoint+creds). 5 endpoints sub-recurso bajo `@RequirePack('contabilidad.adjuntos')`: `POST`/`GET` (lista)/`GET download`/`PUT` (reemplazar)/`DELETE`. Validación MIME por **magic bytes** (`file-type`), NO por header spoofeable. Topes: 10 adjuntos/comprobante + 25 MB/archivo. Download vía `StreamableFile` (NO presigned URL — saltaría guard tenant/pack). **D-01**: comprobante `ANULADO` = read-only (subir/borrar → `ADJUNTO_COMPROBANTE_ANULADO`). **D-02**: cascada aplica solo a `BORRADOR` (no existe borrado físico de `CONTABILIZADO`). RBAC heredado sin permisos nuevos: `asientos.read` (ver/descargar), `asientos.update` (subir/reemplazar/borrar). MinIO en `docker-compose.yml` + `ci.yml`. Key del objeto: `{tenantId}/{comprobanteId}/{uuid}-{nombreSaneado}`. Change `pack-adjuntos-comprobantes` (2026-06-10, PR #187). Spec viva: `openspec/specs/pack-adjuntos-comprobantes/spec.md`. | — |
| Gestión de packs en organización (UI entitlement + activación) | UI del riel `packs-riel` en sus 2 niveles. **Slice 0 — GAP-1**: endpoint `GET /admin/platform/packs` en `platform-admin.controller.ts` — expone `PackService.listarCatalogo`, `SuperAdminGuard`, `@ApiOkResponse({type:[PackResponseDto]})`, tipos regenerados (`openapi.json` + `api.generated.ts` + aliases en `api.ts`). **Slice 1 — SA entitlement**: `org-packs-sheet.tsx` en `/platform-admin/orgs` — catálogo filtrado por vertical (D-04), habilitar con `clave` (R-07), revocar con `pack.id` del catálogo (fix C-01 crítico: apply usaba `entitlement.id` → no-op silencioso; corregido en código + test antes del merge). **Slice 2 — Owner activación**: feature `frontend/src/features/packs/` — `complementos-page.tsx` + `complemento-row.tsx` + `use-activar-pack.ts`; ruta `/settings/complementos` gateada por `RequireSystemRole(['OWNER','ADMIN'])`; switch ON/OFF → `PATCH /api/packs/:clave`; invalida `me-permissions` + `mis-packs-gestion`; naming user-facing "Complementos". **`NavItem.requiredSystemRole?`** campo nuevo; `NavList` filtra con `useHasSystemRole`, fail-closed. **`RequireSystemRole`** nuevo componente routing. Separación entitlement→activación: SA habilita `activo=false`, Owner enciende, frontera `PACK_NO_HABILITADO`. Frontend-puro salvo Slice 0, sin migración. 1266 vitest + 4 e2e + contract-drift verde. PR #189 (2026-06-11) + deps #190 (@grpc/grpc-js 1.14.4). Spec viva: `openspec/specs/packs-gestion-ui/spec.md`. | — |

### 10.2 Código

| Decisión | Resumen | Sección |
|----------|---------|---------|
| Naming de clases/archivos | PascalCase clases con sufijo; kebab-case archivos con doble dot | §1 |
| Idioma del dominio | Español (entidades, enums, tests describe/it) | §1 |
| Idioma de código genérico | Inglés (Services, Controllers, Repositories, DTOs) | §1 |
| Términos fiscales BO | Español forzado (NIT, glosa, estadoSIN, razonSocial, …) | §1 |
| Inmutabilidad | Objetos planos + `const`/`readonly`, inmutable hacia afuera | §2.4 |
| Tipado | `strict: true`, cero `any`, `unknown` con narrowing | §2.5 |
| Comentarios | Código autodocumentado; comentario sólo para *por qué* no obvio | §2.1 |
| Comentarios regulatorios | Obligatorios con referencia a norma (RND, Ley, art.) | §2.2 |
| Early return | Preferir sobre nesting | §2.7 |

### 10.3 Dominio contable

| Decisión | Resumen | Sección |
|----------|---------|---------|
| Partida doble | Validada en `montoBob`, tolerancia ±Bs 0.01 | §4.1 |
| Estados de comprobante | BORRADOR → CONTABILIZADO → BLOQUEADO. Flag `anulado` ortogonal al estado | §4.1 / §4.7 |
| Cierre mensual | Manual, bloquea al ejecutar, requiere período N-1 cerrado | §4.1 |
| Fecha contable | `FechaContable` value object calendario puro, nunca UTC | §4.3 |
| Timestamps de auditoría | UTC en BD, renderizados en America/La_Paz en presentación | §4.3 |
| Moneda | Multi-moneda desde día 1, BOB como funcional | §4.2 |
| Decimales | BOB: (18,2), UFV: (14,5), TC: (14,8), %: (5,4), cantidades: (18,6) | §4.2 |
| Numeración | `{prefijo}{YY}{MM}-{correlativo}`, `SecuenciaComprobante` con `FOR UPDATE` | §4.1 |
| Integración SIN | **Fuera de scope**: el sistema no emite facturas ni genera el RCV (ex-LCV). El SIN los maneja con sus propias herramientas (SIAT) | §4.1 |

### 10.4 Seguridad

| Decisión | Resumen | Sección |
|----------|---------|---------|
| Autenticación | Auth propio (JWT + refresh en BD) | §5.1 |
| Access token | JWT 1h, revocable vía blocklist Redis | §5.2 |
| Refresh token | 30d, hash SHA-256, rotativo con detección de reuso | §5.3 |
| Fuente de `tenantId` | `JWT.activeTenantId`; header `X-Tenant-ID` solo si `JWT.isSuperAdmin === true` | §5.4 |
| Switch de tenant | Endpoint explícito emite JWT nuevo | §5.5 |
| Impersonation | Flujo explícito, JWT dedicado 30 min, auditoría doble; super-admin puede impersonar cross-tenant | §5.6 |
| Defense in depth | Guard + servicio + repositorio chequean `tenantId` | §5.7 |
| Subdomain resolver | Descartado, remover del starter | §5.4 |
| Super-admin | `User.isSuperAdmin` booleano; `SuperAdminGuard` + `TenantGuard` bypass + short-circuit RBAC; auditoría en `platform_audit`; change `super-admin` (2026-06-02) | §5.4 / `docs/disenos/super-admin-plataforma.md` |
| Revocación epoch — logout-all | Mecanismo generalizado de revocación de access tokens: clave Redis `revoked:access:{userId}`, TTL 1h, check corre para TODOS los usuarios en `JwtStrategy.validate`. `POST /auth/logout-all` (self-only) revoca access epoch + todos los refresh tokens activos. `revocarTokensSuperAdmin` es caso particular (delega al mismo mecanismo). Change `logout-all` (2026-06-02). | `auth.service.ts`, `jwt.strategy.ts`, `auth.controller.ts` |
| Enforcement de `Organization.status` | `OrgStatusGuard` global (`APP_GUARD`); org SUSPENDED/ARCHIVED → mutaciones 403 (`ORG_STATUS_NO_ACTIVE`), lecturas siempre permitidas; SuperAdmin bypassa (`isSuperAdmin === true`); guard decodifica JWT con `jwt.verify` propio (corre antes de los guards de controller); cache Redis `org-status:<tenantId>` invalidado en `actualizarStatus`; decorator `@AllowOnNonActiveOrg()` para eximir endpoints. Change `org-status-enforcement` (2026-06-02). | `org-status.guard.ts` + `openspec/specs/org-status-enforcement/` |

### 10.5 Errores y logs

| Decisión | Resumen | Sección |
|----------|---------|---------|
| Jerarquía | `DomainError` abstracta + subclases por caso (NotFound, Conflict, etc.) | §6.2 |
| Códigos de error | `{MODULO}_{SUBDOMINIO}_{CONDICION}`, estables públicamente | §6.3 |
| Formato de respuesta | `{ error: { code, message, details?, traceId, timestamp } }` | §6.4 |
| Global Exception Filter | Mapea `DomainError`, `HttpException`, Prisma errors | §6.5 |
| Niveles de log | `info` para eventos normales, `warn` para esperable-anormal, `error` para fallos | §6.6 |
| Redacción | Passwords, tokens, secrets, `authorization` → `[REDACTED]` automático | §6.7 |
| Correlation ID | Primaria: `traceId` de OTel; fallback: UUID v4 en middleware | §6.9 |

### 10.6 Testing

| Decisión | Resumen | Sección |
|----------|---------|---------|
| Pirámide | Honeycomb: 60% integración / 25% unit / 10% E2E / 5% contract | §7.1 |
| Integración | Postgres real vía Testcontainers, contenedor por suite + TX por test | §7.2 |
| Ubicación | Al lado del código, sufijos `.spec.ts` / `.integration.spec.ts` / `.e2e-spec.ts` | §7.3 |
| Framework | Jest (mantener starter) | §7.4 |
| Coverage | 80% global, 95% dominio contable; invariantes con + y − | §7.5 |
| Idioma de tests | Español en `describe`/`it` del dominio | §7.6 |
| Mocks | Nunca Prisma. Sólo adapters externos. Tiempo vía `ClockPort` | §7.8 / §7.9 |

### 10.7 Observabilidad (infra ya provista)

| Decisión | Resumen | Sección |
|----------|---------|---------|
| Logger | Puerto + adapters Pino/Winston/Loki/Console (ya en starter) | §6.1 |
| HTTP logging | `HttpLoggingInterceptor` cubre request/response (ya en starter) | §6.1 |
| Cache | Redis ya instalado — feature flags hoy, permisos RBAC en Fase 0.6 | — |
| Métricas | Prometheus scrape en `/api/metrics` (ya en starter) | — |
| Tracing | OpenTelemetry → Tempo (bootstrap standalone en `otel-bootstrap.ts`) | — |

### 10.8 Git

| Decisión | Resumen | Sección |
|----------|---------|---------|
| Commits | Conventional Commits + scope por módulo o categoría (`infra`, `deps`, `db`, …) | §9.1 |
| Branches | GitHub Flow, naming `tipo/scope-descripción` | §9.2 |
| Integración | Squash merge only, branches auto-delete | §9.3 |
| PR description | Qué / Por qué / Cómo probar — sin eso, no se mergea | §9.4 |

### 10.9 Lo que NO hace el sistema

| Fuera de scope | Motivo |
|----------------|--------|
| Facturación electrónica con SIN (emisión de CUF/CUFD) | No es el problema que estamos resolviendo |
| Libro/Registro de Compras y Ventas IVA (ex-LCV → **RCV**) | El SIN reemplazó el LCV por el RCV y lo genera/consume con sus propias herramientas (SIAT). No se construye módulo in-house (decisión 2026-05-21) |
| Módulo `Factura` (desglose IVA/IT, NIT emisor/receptor, código de autorización) | Su único destino era alimentar el LCV/RCV, ahora externo. `documentos-fisicos` ya cubre el control interno del papel. Descartado/diferido junto con el RCV |
| Validación online de NIT con padrón SIN | Solo formato (7-12 dígitos), sin consulta externa |
| Alertas por período abierto demasiado tiempo | Descartado — no lo piden los contadores |
| Auditoría externa rígida (IFRS full, SOX, reproducibilidad bitemporal estricta de reportes) | Avicont está diseñado para PyMEs bolivianas con control contable interno (estilo QuickBooks/Sage default). El modelo de anulación (§4.7), edición post-CONTABILIZADO (§4.3) y trazabilidad vía triggers prioriza velocidad operativa sobre reproducibilidad bitemporal estricta. Empresas que requieran ese nivel de rigor deben evaluar productos enterprise (SAP, Oracle, Sage Compliance Mode). Decidido 2026-05-26 |

### 10.10 Decisiones diferidas (a re-evaluar en el futuro)

| Tema | Estado | Disparador para re-evaluar |
|------|--------|----------------------------|
| Migrar a Vitest | Diferido | Cuando haya >500 tests y la velocidad de Jest moleste |
| Mutation testing (Stryker) | Diferido | Fase 1+, una vez estabilizado el core |
| Feature flags para trunk-based | Diferido | Si el equipo crece a >3 devs |
| Integración SIN (facturación electrónica) | Fuera de scope | Si un cliente lo pide como upsell de pago |
| Cookie `refreshToken` `SameSite=Strict` → `Lax` | Deuda | Cuando se integre OAuth/SSO externo — Strict bloquea el callback del provider |
| Logout multi-tab vía `BroadcastChannel('auth')` en frontend | ✅ RESUELTA — PR #170 (2026-06-03) | La pestaña que cierra sesión emite `logout` por `BroadcastChannel('auth')` y las demás limpian el store (el `ProtectedRoute` redirige a `/login` al ver `accessToken === null`). Hook compartido `useLogout` (DRYea Topbar + PlatformShell) + `useAuthBroadcastSync` montado en `App`. Scope acotado al logout explícito: el fallo de refresh del interceptor NO emite broadcast (puede ser transitorio → cascada). Ver `frontend/src/lib/auth-channel.ts`. |
| `openapi-typescript` para tipos compartidos frontend↔backend | ✅ RESUELTA — change `tipos-compartidos-openapi` (2026-06-02) | `backend/openapi.json` (dump Swagger) + `frontend/src/types/api.generated.ts` (`gen:api-types`) + fachada `types/api.ts`; job CI `contract-drift` rompe el build ante desincronización. Regla operativa: tocar un DTO backend → regenerar ambos artefactos y commitear. Ver `openspec/changes/archive/2026-06-02-tipos-compartidos-openapi/`. |
| Migración de `accessToken` en memoria a un worker/SW con rotación background | Diferido | Si el proyecto escala a múltiples frontends/apps móviles |
| Refactor de los ~80 `throw new *Exception(...)` viejos a `DomainError` (§6.2) | Deuda técnica | **Regla de oro**: al tocar un módulo para agregar features, migrar primero sus errores a la nueva jerarquía. El `GlobalExceptionFilter` ya mapea los `HttpException` viejos al formato estándar (§6.4), así que el refactor no es bloqueante — pero no agregues throws nuevos con `*Exception` de NestJS en código nuevo |
| Generalizar revocación epoch a logout-all | ✅ RESUELTA — change `logout-all` (2026-06-02) | Clave unificada `revoked:access:{userId}`, TTL 1h, check general en `JwtStrategy.validate` para todos los usuarios. Endpoint `POST /auth/logout-all` (self-only). Sin `jti` — epoch por usuario es suficiente para el caso de uso (cuenta comprometida / cambio de contraseña). Ver `openspec/changes/archive/2026-06-02-logout-all/` + `openspec/specs/logout-all/`. |
| `GET /tenants/current` sin `@ApiOkResponse` tipado en OpenAPI | Deuda menor — WARNING-1 del verify de `datos-empresa` (2026-06-03). El frontend hand-tipeó el response. El job `contract-drift` no lo detecta porque el endpoint no tiene `@ApiOkResponse`. | Cuando se decore el GET con `@ApiOkResponse` o se toque su response DTO — regenerar `openapi.json` + `api.generated.ts` |

---

## 11. Entorno local y comandos operativos

Sección runbook: **qué comando correr para cada tarea común** en el entorno local. Aplica tanto a devs humanos como a Claude Code (ver nota sobre `DATABASE_URL` más abajo).

### 11.1 Stack de servicios (Docker Compose)

8 servicios definidos en `docker-compose.yml`:

| Servicio | Puerto host | Rol |
|----------|-------------|-----|
| `app` | 3000 | Backend NestJS (`/api/health`, `/api/docs` Swagger) |
| `postgres` | 5432 | BD principal (db `saas`, user `postgres/postgres`) |
| `redis` | 6379 | Cache + blocklist de JWT revocados |
| `dbgate` | 3100 | UI web para explorar Postgres y Redis |
| `grafana` | 3001 | Dashboards de logs/métricas/traces (login `admin/admin`) |
| `loki` | 3101 | Agregador de logs (datasource de Grafana) |
| `prometheus` | 9090 | Scrape de `/api/metrics` |
| `tempo` | 3200 / OTLP 4317-4318 | Traces OpenTelemetry |

**Levantar todo el stack**:
```bash
docker compose up -d
```

**Levantar solo BD y Redis** (suficiente para dev y tests E2E sin observabilidad):
```bash
docker compose up -d postgres redis
```

**Ver estado y puertos**:
```bash
docker compose ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}"
```

**Bajar todo** (mantiene volúmenes con datos):
```bash
docker compose down
```

**Bajar y limpiar datos** (⚠️ destructivo, pedir confirmación):
```bash
docker compose down -v
```

### 11.2 Prisma: migraciones y seeds

> Todos los comandos Prisma se corren **desde `backend/`** (o con `-p backend/` en el caso de pnpm scripts). La raíz del repo es el monorepo; cada carpeta de stack es un proyecto Node independiente.

`DATABASE_URL` vive en `backend/.env` (gitignored). Los scripts pnpm (`prisma:migrate`, `seed`) lo leen de ahí automáticamente.

**Cuando Claude Code corre los comandos**, NO tiene acceso al `.env` por restricciones de permisos del entorno sandboxed. Debe pasarlo **inline** en la invocación, y correr desde `backend/`:

```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec prisma migrate dev --name <nombre>
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec prisma migrate deploy
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec prisma migrate status
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec prisma generate
```

Para el caller humano, los scripts pnpm funcionan sin exportar variables porque leen del `.env`:
```bash
cd backend
pnpm run prisma:migrate          # equivale a: prisma migrate dev
pnpm run prisma:generate         # genera el cliente Prisma
pnpm run prisma:studio           # UI web de Prisma en localhost:5555
```

### 11.3 Tests

Correr **desde `backend/`**:

**Unitarios + integración**:
```bash
cd backend
pnpm exec jest src/                                                           # solo unit (.spec.ts sin DB)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
  pnpm exec jest src/                                                         # unit + integración (.integration.spec.ts vs Postgres real)
pnpm test                                                                     # equivalente al primero
```

**Convención de sufijos** (CLAUDE.md §7.3):
- `*.spec.ts` — unit puro, sin DB ni NestJS. Corre con `pnpm exec jest src/` sin env.
- `*.integration.spec.ts` — integración contra infra real (Postgres). Requiere `DATABASE_URL` en el ambiente. Vive al lado del adapter que testea.
- `*.e2e-spec.ts` — E2E full stack a través de HTTP (Supertest + AppModule). Vive en `test/`.

**E2E (requieren Postgres arriba)**:
```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
JWT_ACCESS_SECRET="test-secret" \
JWT_REFRESH_SECRET="test-refresh" \
pnpm exec jest test/ --runInBand --forceExit
```

`--runInBand` es necesario para que los tests E2E de distintos módulos no pisen el mismo Postgres en paralelo. `--forceExit` porque PrismaClient deja handles que Jest no detecta (patrón consistente con el resto de los E2E del proyecto).

### 11.4 Lint y typecheck

Correr **desde `backend/`**:

```bash
cd backend
pnpm exec tsc --noEmit -p tsconfig.json    # typecheck
pnpm run lint                              # eslint src/
pnpm exec eslint <path> --fix              # auto-fix
pnpm run format                            # prettier sobre src/ y test/
```

### 11.5 Checklist antes de arrancar a codear desde cero

1. Desde la raíz del repo: `docker compose up -d postgres redis` (mínimo viable)
2. Si es la primera vez, desde `backend/`:
   `DATABASE_URL=... pnpm exec prisma migrate deploy`
3. Desde `backend/`: `pnpm run start:dev` para el backend en watch mode
4. Abrir http://localhost:3000/api/docs para el Swagger

Para agregar observabilidad al dev, desde la raíz: `docker compose up -d` (todo el stack), entrar a Grafana http://localhost:3001.

### 11.6 Protocolo: revisar migrations regeneradas (DROP de objetos raw SQL)

Algunos objetos Postgres no se expresan en `schema.prisma` y viven como raw
SQL al final de su migration original (extensiones, índices GIN trigram,
índices y uniques parciales con `WHERE`, CHECK constraints multi-columna).
Cada vez que se regenera una migration, Prisma los detecta como **drift** y
mete un `DROP EXTENSION` o `DROP INDEX` al inicio del `migration.sql` nuevo.
Si se aplica tal cual, se rompen invariantes de la BD.

Ver deuda **§3.4 (A8)** en `docs/deudas-arquitecturales.md`.

**Protocolo obligatorio antes de aplicar una migration regenerada:**

1. Abrir `prisma/migrations/<timestamp>_<nombre>/migration.sql` recién generado.
2. `grep -E "^DROP (INDEX|EXTENSION|TYPE)" migration.sql`.
3. Para cada match, verificar si el objeto está en la lista de objetos raw SQL legítimos (abajo). Si lo está, **borrar la línea `DROP …`** y dejar un comentario corto explicando por qué (referenciar la migration de origen).
4. Si el match es legítimo (un objeto que de verdad debe borrarse), dejarlo.
5. Aplicar con `DATABASE_URL=... pnpm exec prisma migrate dev` (o `migrate deploy` si la migration ya fue editada y solo querés aplicar pending sin re-detección de drift).
6. Verificar post-apply que los objetos siguen presentes:
   `docker compose exec postgres psql -U postgres -d saas -c "\d <tabla>"`
   o
   `SELECT indexname FROM pg_indexes WHERE tablename = '<tabla>' ORDER BY indexname;`.

**Lista de objetos raw SQL vivos (al 2026-05-27):**

| Objeto | Tipo | Migration de origen |
|--------|------|---------------------|
| `pg_trgm` | EXTENSION | `20260424020927_fase_1_4_contactos` |
| `contactos_razonSocial_trgm_idx` | INDEX (GIN trigram) | `20260424020927_fase_1_4_contactos` |
| `contactos_nombreComercial_trgm_idx` | INDEX (GIN trigram) | `20260424020927_fase_1_4_contactos` |
| `contactos_organizationId_documento_partial_key` | UNIQUE PARCIAL `WHERE documento IS NOT NULL` | `20260424020927_fase_1_4_contactos` |
| CHECK `("esCliente" = true OR "esProveedor" = true)` en `contactos` | CHECK constraint | `20260424020927_fase_1_4_contactos` |
| `comprobante_documento_fisico_unique_contabilizado` | UNIQUE PARCIAL `WHERE comprobanteEstado = 'CONTABILIZADO'` | `20260425163325_add_documento_fisico_and_tipo_and_asociacion` |
| `organizations_vertical_exclusivo_check` | CHECK `NOT ("contabilidadEnabled" AND "granjaEnabled")` | `20260531180000_organization_vertical_exclusivo_check` |
| `comprobantes_audit` | TABLE (audit raw) | `20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers` |
| `comprobantes_audit_comprobante_id_ts_idx` | INDEX | `20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers` |
| `comprobantes_audit_organization_id_ts_idx` | INDEX | `20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers` |
| `trg_comprobantes_audit` | FUNCTION (plpgsql) | `20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers` |
| `trg_audit_comprobantes` | TRIGGER en `comprobantes` | `20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers` |
| `trg_audit_lineas_comprobante` | TRIGGER en `lineas_comprobante` | `20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers` |
| `lotes_cantidad_inicial_positiva_check` | CHECK `"cantidadInicial" > 0` en `lotes` | `20260601145425_granja_v1_schema` |

**Nota especial sobre `comprobante_documento_fisico_unique_contabilizado`:** Este índice
parcial usa `WHERE comprobanteEstado = 'CONTABILIZADO'::"EstadoComprobante"` — cuando se
regenera una migration que altera `EstadoComprobante`, el índice DEBE ser dropeado antes
del rename de tipo y recreado después. Ver migration `20260527190718_*` como precedente.

Mantener esta tabla actualizada cuando se agregue un objeto nuevo en raw SQL.

---

## 12. Docs extendidos — cuándo cargar cuál

Las reglas duras de cada área viven arriba (§1–§4, §9–§11). **El detalle operativo** — ejemplos, justificaciones, catálogos completos, los 42 antipatrones — vive en `docs/claude/`.

Antes de editar código que caiga en los paths de la tabla, o antes de las operaciones listadas, **LEÉ el doc correspondiente COMPLETO**. No es "consultar si tenés dudas" — es **requisito de entrada**.

### 12.1 Por path (LEER ANTES de editar)

| Si tocás… | LEER ANTES |
|-----------|------------|
| `backend/src/{comprobantes,periodos-fiscales,cuentas,configuracion-contable,documentos-fisicos,tipos-documento-fisico,contactos}/**` | `docs/claude/dominio-contable.md` |
| `backend/src/{auth,memberships,invitations}/**` o código que toque JWT / refresh / impersonation / `tenantId` / guards de permisos | `docs/claude/seguridad.md` |
| `backend/src/rbac/**`, agregás permisos al catálogo, tocás `CustomRole`, modificás guards que chequean permisos | `docs/claude/seguridad.md` + `docs/claude/antipatrones.md` Anti-25 |
| `backend/src/common/{errors,filters}/**`, agregás una `DomainError` nueva, tocás `GlobalExceptionFilter`, mapeás errores de Prisma | `docs/claude/errores-y-logs.md` |
| Creás o modificás `*.spec.ts`, `*.integration.spec.ts`, `*.e2e-spec.ts`, factories en `test/` o `__fixtures__/` | `docs/claude/testing.md` |
| `backend/prisma/migrations/**` o `schema.prisma` | `docs/claude/dominio-contable.md` §4.1–4.2 + `docs/claude/antipatrones.md` Anti-22, Anti-23 |

### 12.2 Por operación (LEER / CONSULTAR antes o durante)

| Operación | LEER / CONSULTAR |
|-----------|------------------|
| Revisar PR propio antes del squash merge | Pasada completa sobre `docs/claude/antipatrones.md` contra el diff |
| Detectás cálculo repetido, mock sospechoso, `new Date()` en dominio, `any`, query sin `tenantId`, o cualquier smell contable | Buscar en `docs/claude/antipatrones.md` por keyword antes de normalizar el patrón |
| Escribís un asiento automático generado por otro módulo (venta→asiento, pago→asiento) | `docs/claude/dominio-contable.md` §4.1 + `docs/claude/antipatrones.md` Anti-14, Anti-17 |
| Tocás cálculo de IVA, IT, UFV, conversión de moneda, cierre mensual/anual | `docs/claude/dominio-contable.md` completo, no solo la sección relevante |
| Creás o modificás un seed (`prisma/seeds/**`), especialmente plan de cuentas | `docs/claude/dominio-contable.md` §4.1 (plan de cuentas) + `docs/claude/antipatrones.md` Anti-42 |

### 12.3 Regla anti-drift entre core y docs extendidos

Cuando editás un doc de `docs/claude/`, chequeá si el cambio **contradice**, **completa** o **invalida** algún invariante del core (§4-core):

- **Contradice** → el cambio va al core PRIMERO, y recién después se propaga al doc extendido. **Nunca al revés.**
- **Completa** → vive en el doc extendido, pero agregá una nota referenciando qué invariante del core amplía.
- **Invalida** (el invariante ya no aplica) → discusión explícita en PR antes de tocar nada. Un invariante que se invalida es un cambio grande; requiere consenso.

Cada doc en `docs/claude/` tiene un header de versionado:

```markdown
<!--
Última edición: YYYY-MM-DD
Última revisión contra core: YYYY-MM-DD
Owner: backend-lead
-->
```

- `Última edición` se actualiza cada vez que se toca el contenido del doc.
- `Última revisión contra core` se actualiza cuando alguien hace el chequeo de drift explícito — permite detectar docs que llevan meses sin reconciliarse.

---

**Fin del documento.** Para dudas que no resuelve este archivo: preguntar antes de decidir. Este documento se versiona en git — cualquier cambio se discute en PR.
