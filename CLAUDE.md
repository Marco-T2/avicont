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
- `Asiento`, `AsientoLinea`, `Cuenta`, `PlanCuentas`
- `Comprobante`, `LibroDiario`, `LibroMayor`
- `PeriodoFiscal`, `CierreMensual`
- `BalanceGeneral`, `EstadoResultados`

**Términos tributarios/legales bolivianos:**
- `nit`, `razonSocial`, `representanteLegal`, `nroPatronal`
- `numeroFactura`, `codigoAutorizacion`, `codigoControl`
- `estadoSIN`, `glosa`, `dosificacion`
- `libroCompras`, `libroVentas` (IVA)

**Entidades del módulo granja:**
- `Lote`, `TipoRegistro`, `MovimientoInversion`, `MovimientoCantidad`

**Enums de dominio:**
- Nombre Y **valores** en español: `EstadoAsiento.BORRADOR | CONTABILIZADO | BLOQUEADO | ANULADO`.
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
  - `/api/libro-compras`, `/api/libro-ventas`
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
│   └── disenos/
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
├── modules/                 Cada dominio de negocio en su propio módulo
│   ├── auth/
│   ├── organizations/
│   ├── users/
│   ├── memberships/
│   ├── invitations/
│   ├── asientos/
│   ├── plan-cuentas/
│   ├── libro-mayor/
│   ├── ...
│   └── granja/
│
├── infrastructure/          Adaptadores a sistemas externos
│   ├── prisma/              PrismaService, migraciones, seed
│   ├── redis/               RedisService
│   ├── logger/              Adaptadores Pino/Winston/Loki
│   ├── metrics/             Adaptador Prometheus
│   ├── tracing/             Bootstrap + adaptador OpenTelemetry
│   └── mailer/              Adaptadores SMTP/Resend/Console
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

## 4. Reglas contables bolivianas

Cada invariante listado acá se codifica como **test obligatorio**. Si un invariante falla en runtime, el sistema debe rechazar la operación con un mensaje claro al usuario. No hay excepciones "porque el contador me dijo".

### 4.1 Invariantes del dominio

#### Partida doble y estructura de asientos

- `SUM(débitos en BOB) === SUM(créditos en BOB)` en todo comprobante **CONTABILIZADO**. Los borradores pueden estar desbalanceados mientras se editan.
- Débitos y créditos `>= 0`. Nunca negativos.
- Una línea tiene débito O crédito, nunca ambos, nunca ninguno.
- Todo comprobante contabilizado tiene `>= 2` líneas.
- La suma total del comprobante `> 0`. No se contabiliza un comprobante de Bs 0.
- Glosa obligatoria y no vacía en comprobantes contabilizados.
- Cada línea debe referenciar una cuenta con `activa = true` Y `esDetalle = true`.

#### Estados y transiciones del comprobante

- Un comprobante en **BORRADOR** no tiene número ni consume correlativo.
- El número se asigna **atómicamente** al pasar a **CONTABILIZADO**, con formato `{prefijo}{YY}{MM}-{correlativo:6}`.
- Correlativo consecutivo dentro de `(tenantId, tipo, year, month)`, sin saltos, reinicia cada mes.
- Número asignado es **inmutable**. No cambia con ediciones ni anulaciones.
- Comprobantes anulados conservan número — no se reutiliza.
- Un **CONTABILIZADO** es editable si y solo si su período está **ABIERTO**.
- `fechaContable` y `periodoFiscalId` son inmutables desde el primer CONTABILIZADO. Corrección de período se hace con **anulación + re-creación**.
- Toda edición de un CONTABILIZADO registra auditoría con timestamp actual, usuario, diff de campos, razón opcional.
- **Transiciones válidas**: `BORRADOR → CONTABILIZADO`, `BORRADOR → (eliminar)`, `CONTABILIZADO → ANULADO`, `CONTABILIZADO → BLOQUEADO` (automático al cerrar período).
- **Transiciones prohibidas**: `BLOQUEADO → CONTABILIZADO`, `ANULADO → *`, `CONTABILIZADO → BORRADOR`.

#### Períodos y cierre

- Un período es único por `(tenantId, year, month)`.
- No se permiten comprobantes con `fechaContable` en períodos **CERRADO** o **BLOQUEADO**.
- Para cerrar el período N, todos los comprobantes de ese período deben estar en CONTABILIZADO o ANULADO. **No se cierra con borradores pendientes.**
- Para cerrar el período N, el período N-1 debe estar CERRADO. **No se saltean períodos.**
- Al cerrar, todos los CONTABILIZADO del período pasan atómicamente a BLOQUEADO.
- Reapertura requiere permiso específico, motivo escrito y auditoría completa hasta el re-cierre.
- Cierre anual (gestión) requiere los 12 meses cerrados previamente. Genera asientos de cierre automáticos para cuentas de resultado.

#### Plan de cuentas

- Código interno único por tenant.
- Código PUCT opcional, pero si está presente debe respetar estructura jerárquica de 5 niveles y los 4 primeros niveles deben existir en el catálogo PUCT oficial.
- Cuenta con movimientos no se puede eliminar, solo desactivar.
- No se puede cambiar el tipo (Activo/Pasivo/Patrimonio/Ingreso/Egreso) de una cuenta con movimientos.
- Cambio de `esDetalle: true → false` solo si la cuenta no tiene movimientos.
- Código jerárquico: cada cuenta no raíz debe tener un padre válido y activo.

#### Documentos tributarios (registrados, no emitidos por el sistema)

- NIT emisor válido: 7-12 dígitos numéricos, formato correcto. Sin consulta a padrón SIN.
- NIT receptor válido o `0` (ventas sin nominativa).
- `fechaEmision <= fechaActual`.
- Unicidad por `(tenantId, tipo, nitEmisor, numero, fecha)` para facturas recibidas y emitidas. Evita duplicados en LCV.
- IVA calculado `= 13% del subtotal gravado`, con tolerancia `±Bs 0.01` por redondeo.
- IT calculado `= 3%` cuando aplica, con misma tolerancia.

#### Documentos físicos

- Número ingresado por el usuario, no generado por el sistema.
- Unicidad por `(tenantId, tipoDocumentoId, numero)`.
- Tipos de documento físico configurables por tenant.
- Un documento físico puede existir sin comprobante contable asociado (pendiente de contabilizar).
- Un comprobante puede referenciar cero, uno o varios documentos físicos.
- Al anular comprobante, documentos físicos asociados se **desasocian** (no se eliminan) y quedan disponibles para re-asociar.

#### Libros contables

- **Libro Mayor**: saldo de cuenta en momento T `= saldoInicial + SUM(movimientos en BOB hasta T)`. Debe reconciliar contra comprobantes contabilizados.
- **Balance de Comprobación**: `SUM(saldosDeudores) === SUM(saldosAcreedores)` siempre, en BOB.
- **Balance de Sumas y Saldos al SIN**: se exporta con libros abiertos y saldos ajustados (sin asientos de cierre de gestión).
- **LCV**: cada fila referencia un documento tributario único `(NIT + número + fecha + tipo)`, no duplicados dentro del período.

#### UFV y conversiones

- Toda operación con UFV requiere **fecha de cotización explícita**. No se asume "UFV de hoy".
- Cotización UFV se toma de tabla `CotizacionUfv` para la fecha del hecho económico.
- `montoUfv = montoBob / ufvFecha`, redondeado a 5 decimales (RND 10-0021-16).
- Si no existe cotización UFV para la fecha requerida, la operación **falla** con mensaje claro. No se asume valor por defecto.

#### Multi-moneda

- Toda cuenta, comprobante y documento tiene moneda (enum: BOB, USD, extensible).
- Toda línea con `moneda !== BOB` tiene `tipoCambio > 0` y `montoBob = monto × tipoCambio`.
- **Partida doble se valida en `montoBob`**, no en moneda original. Permite asientos mixtos.
- Diferencias de cambio se registran en cuenta específica del plan de cuentas (configuración del tenant).
- Tipo de cambio tomado de tabla `TipoCambio` por fecha, o ingresado manualmente con justificación.

#### Multi-tenant (CRÍTICO)

- Todo registro tiene `tenantId` no nulo.
- **Query sin filtro por `tenantId` es bug de seguridad.** Se enforza en el repositorio base, no en el servicio.
- Un usuario no puede leer ni escribir datos de un tenant al que no pertenece. Verificación en guard + repositorio (**defense in depth**).
- Tablas compartidas (`CatalogoPuct`, `CotizacionUfv`, `TipoCambio` oficial del BCB) **no tienen `tenantId`**. Se leen en modo solo-lectura desde cualquier tenant.

---

### 4.2 Moneda y decimales

#### Multi-moneda desde el inicio (BOB funcional, USD necesario)

En Bolivia se registran facturas en USD con frecuencia (importaciones, servicios internacionales, alquileres). Migrar después duele mucho.

```prisma
enum Moneda {
  BOB
  USD
  // extensible: EUR, etc.
}

model Comprobante {
  // ...
  monedaPrincipal Moneda @default(BOB)
}

model LineaComprobante {
  // ...
  moneda     Moneda
  monto      Decimal  @db.Decimal(18, 2)
  tipoCambio Decimal  @db.Decimal(14, 8)  // 1.0 si moneda = BOB
  montoBob   Decimal  @db.Decimal(18, 2)  // = monto × tipoCambio
}
```

#### Tabla de decimales (definitiva)

| Campo | Tipo Prisma | Justificación |
|-------|-------------|---------------|
| Montos en moneda original (BOB, USD) | `@db.Decimal(18, 2)` | 18 dígitos totales → cubre hasta ~999 billones. Suficiente para empresas grandes. |
| Monto en BOB calculado (`montoBob`) | `@db.Decimal(18, 2)` | Mismo criterio, siempre redondeado a 2 decimales. |
| UFV (valor de cotización) | `@db.Decimal(14, 5)` | 5 decimales por RND 10-0021-16. |
| Monto expresado en UFV | `@db.Decimal(18, 5)` | 18 totales + 5 decimales para montos grandes. |
| Tipo de cambio | `@db.Decimal(14, 8)` | 8 decimales evita pérdida en re-cálculos. |
| Porcentajes (IVA 13%, IT 3%) | `@db.Decimal(5, 4)` | `0.1300` para 13%. |
| Cantidades (inventario) | `@db.Decimal(18, 6)` | 6 decimales para unidades fraccionales. |

#### Regla de oro inmutable

**Nunca `Float` ni `Double` para plata ni para porcentajes.** En Prisma es `Decimal`. En TypeScript se maneja con `decimal.js` encapsulado dentro del value object `Money`.

```typescript
// common/domain/money.ts
import Decimal from 'decimal.js';

export class Money {
  private constructor(
    private readonly amount: Decimal,
    private readonly currency: Moneda,
  ) {}

  static of(amount: string | number, currency: Moneda): Money {
    return new Money(new Decimal(amount), currency);
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('No se pueden sumar montos de distinta moneda sin conversión');
    }
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  toBob(tipoCambio: Decimal): Money {
    if (this.currency === Moneda.BOB) return this;
    return new Money(this.amount.mul(tipoCambio).toDecimalPlaces(2), Moneda.BOB);
  }

  // equals, lessThan, isZero, toString, etc.
}
```

- Los servicios reciben y devuelven `Money`, **no `number`**.
- Los DTOs que cruzan HTTP usan **`string`** (ej: `"1250.50"`) para evitar pérdida de precisión en JSON.

---

### 4.3 Fechas y timezone

**Distinción crítica entre dos tipos de "fecha":**

| Concepto | Tipo Prisma | Tipo TS conceptual | Ejemplo |
|----------|-------------|--------------------|---------|
| **Fecha contable** (Comprobante, factura, documento físico, cotización UFV, tipo de cambio) | `@db.Date` | `FechaContable` (value object, calendario puro) | `2026-04-22` — sin hora, sin zona |
| **Timestamp de auditoría** (`createdAt`, `updatedAt`, `auditoria.timestamp`) | `DateTime @db.Timestamptz` | `Date` nativo, renderizado en `America/La_Paz` en presentación | `2026-04-22T14:30:00Z` → usuario ve `10:30 La Paz` |
| **Período fiscal** | `year: Int`, `month: Int` | `PeriodoFiscal` (value object) | No es fecha, es el par `(2026, 4)` |

#### Value object `FechaContable`

```typescript
// common/domain/fecha-contable.ts
export class FechaContable {
  private constructor(
    private readonly year: number,
    private readonly month: number,
    private readonly day: number,
  ) {}

  static create(iso: string): FechaContable {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) throw new Error(`Fecha inválida: ${iso}`);
    const [, y, m, d] = match;
    // validar rango de días según mes y año bisiesto
    return new FechaContable(Number(y), Number(m), Number(d));
  }

  toPeriodoFiscal(): PeriodoFiscal {
    return PeriodoFiscal.of(this.year, this.month);
  }

  toString(): string {
    return `${this.year}-${String(this.month).padStart(2, '0')}-${String(this.day).padStart(2, '0')}`;
  }
  // isBefore, isAfter, equals, etc. — comparaciones calendario, no timestamp
}
```

- Esta clase **nunca** se convierte a `Date` nativo.
- **Nunca** pasa por UTC.
- **Nunca** tiene hora.
- Es calendario puro. El 31/12/2025 siempre es 31/12/2025 en Bolivia, en el servidor, en el test, en el reporte impreso.

#### Serialización en DTOs

- `FechaContable` se serializa como `string` ISO `"2026-04-22"` y punto.
- Nada de ISODate con hora.
- Si el frontend envía `"2026-04-22T00:00:00.000Z"`, se rechaza o se trunca.

#### Configuración del servidor

- TZ del contenedor Docker: `UTC`. Forzar explícito en el Dockerfile (`ENV TZ=UTC`). No depender del default del host.
- Postgres: `timezone = 'UTC'`. Los `timestamptz` se guardan en UTC.
- `America/La_Paz` solo aparece en capa de presentación (frontend, o render de PDFs en backend).

#### Regla mental para el equipo

- Si un contador o auditor lee esta fecha impresa en un reporte y tiene que ser **exactamente esa fecha sin ambigüedad** → `FechaContable` (`Date` en SQL).
- Si es "cuándo ocurrió este evento en el sistema" → `Timestamp` (UTC en SQL, La Paz en presentación).

#### Validaciones

- `fechaContable del comprobante <= FechaContable.today()` del servidor (ajustada a La Paz). No asientos al futuro.
- `FechaContable.today()` toma `new Date()`, convierte a zona `America/La_Paz`, extrae año/mes/día, y construye la `FechaContable`. **Nunca usa UTC directamente para esto.**

---

---

## 5. Seguridad y permisos

### 5.1 Tokens

| Aspecto | Decisión |
|---------|----------|
| **Access token** | JWT firmado, vida 1h, revocable vía blocklist Redis |
| **Refresh token** | Hash SHA-256 en Postgres, rotativo con detección de reuso, 30 días |
| **Fuente de `tenantId`** | `JWT.activeTenantId`; header `X-Tenant-ID` solo para super-admin |
| **Switch de tenant** | Endpoint explícito `POST /auth/switch-tenant`, emite JWT nuevo, auditado |
| **Impersonation** | Flujo explícito, JWT dedicado 30 min, auditoría doble |
| **Resolución por subdomain** | Descartada, remover del starter |

### 5.2 Access token (JWT)

- Vida 1h. 15 min es overkill; 4h es laxo para sistema con plata.
- Firmado con `JWT_ACCESS_SECRET`. Algoritmo HS256 (el starter viene así).
- Claims mínimos: `sub` (userId), `email`, `activeTenantId`, `roles`, `iat`, `exp`.
- **Revocación inmediata**: blocklist en Redis, key `saas:revoked:access:{jti}`, TTL = `exp - now`. El guard consulta la blocklist en cada request (una sola roundtrip a Redis).

### 5.3 Refresh token

- Token opaco (no JWT), 256 bits de entropía, enviado al cliente una sola vez.
- **Almacenado hasheado** (SHA-256) en tabla `RefreshToken`: `{ tokenHash, userId, tenantId?, familyId, expiresAt, revokedAt?, replacedById? }`.
- **Rotación obligatoria**: cada uso emite nuevo token y marca el anterior como `replacedById`.
- **Detección de reuso**: si llega un refresh ya rotado (su `replacedById` no es null), **revocar toda la familia** (todos los tokens con ese `familyId`). Caso clásico de token robado.
- Vida 30 días.
- Logout en un dispositivo: revoca el token actual. Logout en todos: revoca toda la familia del usuario.

### 5.4 Resolución de `tenantId` en un request autenticado

**Precedencia:**
1. `JWT.activeTenantId` — fuente normal para usuarios regulares.
2. Header `X-Tenant-ID` — válido **solo si** `JWT.role === 'super_admin'`, siempre con auditoría.
3. Subdomain — **eliminar del starter** (no se usa).

Un usuario puede pertenecer a varios tenants con roles distintos. La tabla `Membership` refleja eso.

### 5.5 Switch de tenant

```
POST /auth/switch-tenant
Body: { tenantId: string }
```

Flujo:
1. Verificar que el usuario tiene `Membership` en ese tenant.
2. Emitir nuevo access token con `activeTenantId` actualizado.
3. Registrar en `AuditLog` el switch: `{ userId, fromTenantId, toTenantId, timestamp }`.

Los refresh tokens existentes no se invalidan. El cliente descarta el access token viejo.

### 5.6 Impersonation (admin entra a cuenta de otro usuario)

**Flujo explícito, nunca implícito.**

```
POST /admin/impersonate
Body: { targetUserId: string, reason: string }
Response: { impersonationToken: string, expiresAt: string }
```

- Backend emite JWT especial:
  - `sub = targetUserId` (el impersonado).
  - Claim `impersonatedBy = adminUserId` (el admin real).
  - Claim `impersonationId` (UUID único de la sesión).
  - Vida 30 min. **No refrescable.**
- Cada acción durante la sesión se audita **en dos lugares**:
  - Tabla del dominio (`userId = impersonado`).
  - Tabla `AccionImpersonada` (`adminRealId, impersonationId, accion, timestamp`).
- Cierre explícito: `POST /admin/impersonate/end`.

**Restricciones de impersonation:**

- No impersonar a otro super-admin.
- No impersonar usuarios desactivados.
- No abrir una impersonation sin cerrar la anterior (máximo una activa por admin).

**Acciones prohibidas durante impersonation aunque el rol permita:**

- Cambiar email/password del impersonado.
- Emitir tokens API en nombre del impersonado.
- Modificar billing del tenant.

### 5.7 Defense in depth

- **Guard (JWT + Permisos)**: primera línea. Rechaza requests sin auth o con permisos insuficientes.
- **Servicio**: usa `TenantContext` inyectado para enforce `tenantId` en queries.
- **Repositorio**: todo método de repositorio recibe `tenantId` como parámetro obligatorio y lo añade al `where`. Un método sin filtro por `tenantId` es **bug de seguridad** y debe romper tests.

Ninguna capa confía en que la anterior hizo su trabajo.

### 5.8 Secrets y configuración

- Nunca commitear secrets al repo. `.env` en `.gitignore`, `.env.example` con placeholders.
- Secrets obligatorios: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `REDIS_PASSWORD` (si aplica).
- Var de entorno obligatoria para CORS: `FRONTEND_URL` (ej. `http://localhost:5173` en dev). CORS se abre con `credentials: true` **solo** a ese origin — necesario para que la cookie `refreshToken` viaje entre frontend y backend.
- Rotación de secrets documentada en `docs/security/secret-rotation.md` (pendiente).

---

---

## 6. Manejo de errores y logs

### 6.1 Infraestructura existente (documentación)

El starter ya provee:

| Componente | Qué hace |
|-----------|---------|
| `LoggerModule` (puerto + adapters) | Pino, Winston, Loki, Console. Configurable por `LOG_PROVIDER` |
| `HttpLoggingInterceptor` | Loguea request/response con `tenantId`, `userId`, `traceId`, `spanId`, `duration`, `status` |
| `AuditInterceptor` | Registra acciones importantes en `AuditLog` |
| `TenantContextInterceptor` | Extrae `tenantId` y lo pone en `AsyncLocalStorage` |
| Integración OpenTelemetry | Todos los logs traen `traceId` para correlation con traces en Grafana |

**No rehacer nada de lo de arriba.** Extender cuando haga falta.

### 6.2 Jerarquía de errores de dominio (por agregar)

Viven en `src/common/errors/`. Extienden una clase base `DomainError`.

```typescript
// common/errors/domain.error.ts
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
  }
}
```

**Subclases estándar:**

| Clase | HTTP | Cuándo usar |
|-------|------|-------------|
| `NotFoundError` | 404 | Entidad no existe |
| `ValidationError` | 400 | Regla de negocio violada (input) |
| `ConflictError` | 409 | Conflicto de estado (ej: duplicado) |
| `UnauthorizedError` | 401 | No autenticado |
| `ForbiddenError` | 403 | Autenticado pero sin permisos |
| `InvalidStateError` | 422 | Transición de estado inválida |
| `ExternalServiceError` | 502 | Falla de servicio externo (SIN, BCB) |

Los servicios **lanzan estos errores**, nunca `HttpException` directa. El `GlobalExceptionFilter` los mapea.

### 6.3 Convención de `code` de error

Formato: `{MODULO}_{SUBDOMINIO}_{CONDICION}` en `SCREAMING_SNAKE_CASE`.

**Ejemplos:**
```
ASIENTO_PARTIDA_DOBLE_VIOLATED
ASIENTO_PERIODO_CERRADO
ASIENTO_TRANSICION_INVALIDA
CUENTA_NOT_FOUND
CUENTA_NO_DETALLE
CUENTA_CON_MOVIMIENTOS
CUENTA_CODIGO_INTERNO_INVALIDO
CUENTA_CODIGO_INTERNO_DUPLICADO
CUENTA_NIVEL_MAXIMO_EXCEDIDO
CUENTA_PADRE_INVALIDA
CUENTA_PADRE_INACTIVA
CUENTA_PADRE_ES_DETALLE
CUENTA_SUBCLASE_INCONSISTENTE
CUENTA_CONTRARIA_NATURALEZA_INVALIDA
CUENTA_CODIGO_PUCT_INVALIDO
CUENTA_CODIGO_PUCT_NIVEL_INSUFICIENTE
CUENTA_CONFIGURADA_COMO_CONCEPTO
CUENTA_REQUERIDA_SISTEMA_INMUTABLE
CONFIG_CONCEPTO_INVALIDO
CONFIG_CUENTA_NO_ENCONTRADA
CONFIG_CUENTA_INACTIVA
CONFIG_CUENTA_NO_DETALLE
CONFIG_CUENTA_CLASE_INCORRECTA
CONFIG_DIF_CAMBIO_MISMA_CUENTA
PERIODO_FISCAL_CERRADO
PERIODO_ANTERIOR_ABIERTO
AUTH_INVALID_CREDENTIALS
AUTH_TOKEN_EXPIRED
AUTH_TOKEN_REVOKED
AUTH_REFRESH_REUSED
RBAC_PERMISSION_DENIED
TENANT_NOT_MEMBER
INVITATION_EXPIRED
INVITATION_ALREADY_ACCEPTED
IVA_CALCULO_FUERA_TOLERANCIA
UFV_COTIZACION_NO_ENCONTRADA
TIPO_CAMBIO_NO_ENCONTRADO
NIT_INVALIDO
```

**Regla**: el `code` es **estable** — una vez publicado a un cliente, no cambia aunque cambie el mensaje. Clientes pueden identificar el error por `code` sin parsear strings.

### 6.4 Formato estándar de respuesta de error

```json
{
  "error": {
    "code": "ASIENTO_PARTIDA_DOBLE_VIOLATED",
    "message": "Los débitos deben igualar a los créditos",
    "details": {
      "totalDebito": "1000.00",
      "totalCredito": "950.00",
      "diferencia": "50.00"
    },
    "traceId": "abc123def456...",
    "timestamp": "2026-04-22T14:30:00.000Z"
  }
}
```

- `code`: string estable.
- `message`: en **español**, dirigido al usuario final.
- `details`: opcional, info contextual (nunca datos sensibles).
- `traceId`: del contexto OpenTelemetry actual, para correlación.
- `timestamp`: UTC ISO 8601.

### 6.5 `GlobalExceptionFilter` (por agregar)

Ubicación: `src/common/filters/global-exception.filter.ts`.

**Responsabilidades:**
1. Mapear `DomainError` → formato estándar (6.4) con su `httpStatus`.
2. Mapear `HttpException` (NestJS) → formato estándar con code inferido del status.
3. Mapear `PrismaClientKnownRequestError` → `ConflictError` / `NotFoundError` según el caso.
4. Cualquier otro `Error` → 500 con code `INTERNAL_ERROR`, mensaje genérico **(sin leak de stack trace al cliente)**, pero **sí** loguear stack completo al logger con nivel `error`.

```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // ... mapeo ...
  }
}
```

Se registra global en `main.ts` vía `app.useGlobalFilters(new GlobalExceptionFilter(...))`.

### 6.6 Niveles de log

| Nivel | Cuándo usar | Ejemplo |
|-------|-------------|---------|
| `trace` | Ultra verboso, flujo paso a paso (dev profundo) | `"Entrando a validarPartidaDoble con 3 líneas"` |
| `debug` | Dev debugging | `"CuentaService.findByCodigo cache HIT"` |
| `info` | Eventos normales de negocio | `"Asiento AS-2604-000123 contabilizado por userId=X"` |
| `warn` | Situación inesperada pero manejada | `"Retry 2/3 de llamada a tabla cotización UFV"` |
| `error` | Fallo con impacto en la operación | `"Error al contabilizar asiento: partida doble violada"` |
| `fatal` | Sistema inutilizable | `"No se puede conectar a Postgres después de 10 reintentos"` |

**Reglas:**
- Producción default: `info`.
- Un `error` **siempre** incluye el error completo en el contexto: `logger.error(msg, { err, ...ctx })`.
- Nunca loggear con `console.log` directo. Usar el port `LoggerPort`.

### 6.7 Redacción de datos sensibles en logs

**Jamás loggear estos campos:**
- `password`, `hashedPassword`, `passwordHash`
- `token`, `accessToken`, `refreshToken`, `tokenHash`
- `secret`, `apiKey`, `jwtSecret`, `encryptionKey`
- Header `authorization`

**Implementación**: redactor automático en el adapter del logger. Lista configurable en `src/common/logger/redact.ts`. Si un campo matchea (por nombre exacto o regex `/password|token|secret|authorization/i`), se reemplaza por `"[REDACTED]"`.

### 6.8 Qué loggea cada capa

| Capa | Qué loggea |
|------|-----------|
| **Controller** | Nada extra. El `HttpLoggingInterceptor` ya cubre request/response. |
| **Service** | Eventos de negocio importantes (`info`): asiento contabilizado, período cerrado, pago recibido, invitación aceptada. Errores de dominio al vuelo (`warn` si son expected, `error` si no). |
| **Repository** | Solo operaciones costosas o destructivas (`info`): bulk insert, cascade delete, recomputo de saldos. No loggear reads individuales. |
| **Adapters externos** | Llamadas salientes: URL, duración, status. `warn` en retry, `error` en fallo definitivo. |
| **Guards** | Rechazos: `warn` con `userId`, `tenantId`, permiso requerido, permiso presente. |

### 6.9 Correlation ID

- **Fuente primaria**: `traceId` del contexto OpenTelemetry actual.
- **Fallback si OTel está deshabilitado**: generar UUID v4 en un middleware `RequestIdMiddleware` y almacenarlo en `AsyncLocalStorage`.
- Siempre incluirlo en la respuesta de error (`error.traceId`) y en cada log del request.

---

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
src/modules/asientos/
├── asiento.service.ts
├── asiento.service.spec.ts              ← unitario (al lado)
├── asiento.service.integration.spec.ts  ← integración contra Postgres (al lado)
├── asiento.controller.ts
└── asiento.controller.spec.ts

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
- **Dominio contable** (`src/modules/asientos`, `plan-cuentas`, `libro-mayor`, `cierre-mensual`, etc.): **95%**.
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

- Ubicación: `src/modules/<modulo>/__fixtures__/` o `test/fixtures/` si es compartido.
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

---

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

#### Anti-42: Proponer códigos del PUCT/SIN sin validar contra catálogo real

- **Qué**: asumir un código PUCT (por ejemplo "5.3.1.001 INTERESES PAGADOS") basado en memoria, convención o suposición sin verificar contra el xlsx/catálogo oficial (`prisma/seeds/prod/puct/source/puct.xlsx`).
- **Por qué duele**: cicatriz — durante el seed inicial de la plantilla COMERCIAL (Fase 1.0.6), >50% de los códigos propuestos a primera vista no existían o tenían otro nombre en el PUCT real (ej. 5.3.1.001 es SUELDOS Y SALARIOS, no INTERESES PAGADOS). De haber pasado a producción, el LCV y los EEFF habrían sido inconsistentes con el catálogo que revisa el SIN.
- **Regla**: todo código PUCT se verifica en `CatalogoPuct` (o se greppea en el xlsx oficial) antes de usarlo en código o seeds. Nunca pasar `codigoPuct` sin que haya atravesado `CatalogoPuctReaderPort.findByCodigo` + `validarNivelPuct(4)`.
- **Enforcement**: en runtime — lookup obligatorio en `CuentasService.resolverPuctSnapshot` antes de persistir; en seed — test de coherencia `prisma/seeds/prod/planes-cuentas/__tests__/puct-a-concepto.spec.ts` (toda cuenta `esRequeridaSistema: true` debe estar en `MAPEO_PUCT_A_CONCEPTO` y vice-versa); en ingesta del catálogo — `catalogo-puct.seed.ts` upsertea directo desde el xlsx oficial.

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
| Nombre del módulo (`asiento`, `comprobante`, `plan-cuentas`, `periodo`, `puct`, `ufv`, `rbac`, `auth`, `tenant`, `granja`, etc.) | Cambios dentro de un módulo específico |
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
feat(db): agregar tabla CatalogoPuct
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

Este índice existe para que el próximo lector (vos en 6 meses o un dev nuevo) obtenga el 80% del contexto sin releer las 9 secciones. Si necesita detalle, salta a la sección referenciada.

### 10.1 Arquitectura

| Decisión | Resumen | Sección |
|----------|---------|---------|
| Arquitectura de módulos | Hexagonal estricto (ports + adapters en cada módulo) | §3.2 |
| Comunicación entre módulos | Port para lecturas síncronas; eventos para efectos colaterales | §3.7 |
| Value objects del dominio | `src/common/domain/` (Money, Nit, Ufv, FechaContable, PeriodoFiscal) | §3.4 |
| Path aliases | `@/` para imports desde `src/` | §3.6 |
| Regla de imports | Nunca subir más de un nivel con `../`. Cross-module vía `@/` | §3.6 |
| Separación dominio/infra | Dominio puro, sin NestJS ni Prisma | §3.5 |

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
| Estados de comprobante | BORRADOR → CONTABILIZADO → BLOQUEADO / ANULADO | §4.1 |
| Cierre mensual | Manual, bloquea al ejecutar, requiere período N-1 cerrado | §4.1 |
| Fecha contable | `FechaContable` value object calendario puro, nunca UTC | §4.3 |
| Timestamps de auditoría | UTC en BD, renderizados en America/La_Paz en presentación | §4.3 |
| Moneda | Multi-moneda desde día 1, BOB como funcional | §4.2 |
| Decimales | BOB: (18,2), UFV: (14,5), TC: (14,8), %: (5,4), cantidades: (18,6) | §4.2 |
| Numeración | `{prefijo}{YY}{MM}-{correlativo}`, `SecuenciaComprobante` con `FOR UPDATE` | §4.1 |
| PUCT | Catálogo compartido (no por tenant), adopción opcional no estricta | §4.1 |
| Integración SIN | **Fuera de scope**: sistema no emite facturas ni envía LCV | §4.1 |

### 10.4 Seguridad

| Decisión | Resumen | Sección |
|----------|---------|---------|
| Autenticación | Auth propio (JWT + refresh en BD) | §5.1 |
| Access token | JWT 1h, revocable vía blocklist Redis | §5.2 |
| Refresh token | 30d, hash SHA-256, rotativo con detección de reuso | §5.3 |
| Fuente de `tenantId` | `JWT.activeTenantId`; header `X-Tenant-ID` solo para super-admin | §5.4 |
| Switch de tenant | Endpoint explícito emite JWT nuevo | §5.5 |
| Impersonation | Flujo explícito, JWT dedicado 30 min, auditoría doble | §5.6 |
| Defense in depth | Guard + servicio + repositorio chequean `tenantId` | §5.7 |
| Subdomain resolver | Descartado, remover del starter | §5.4 |

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
| Envío directo del LCV al portal SIN | El contador lo sube manualmente |
| Validación online de NIT con padrón SIN | Solo formato (7-12 dígitos), sin consulta externa |
| Alertas por período abierto demasiado tiempo | Descartado — no lo piden los contadores |

### 10.10 Decisiones diferidas (a re-evaluar en el futuro)

| Tema | Estado | Disparador para re-evaluar |
|------|--------|----------------------------|
| Migrar a Vitest | Diferido | Cuando haya >500 tests y la velocidad de Jest moleste |
| Mutation testing (Stryker) | Diferido | Fase 1+, una vez estabilizado el core |
| Feature flags para trunk-based | Diferido | Si el equipo crece a >3 devs |
| Integración SIN (facturación electrónica) | Fuera de scope | Si un cliente lo pide como upsell de pago |
| Cookie `refreshToken` `SameSite=Strict` → `Lax` | Deuda | Cuando se integre OAuth/SSO externo — Strict bloquea el callback del provider |
| Logout multi-tab vía `BroadcastChannel('auth')` en frontend | Deuda | Fase 1.1+ — hoy logout en una tab no purga las otras |
| `openapi-typescript` para tipos compartidos frontend↔backend | Deuda | Cuando haya 4-5 features consumiendo la API con DTOs duplicados a mano |
| Migración de `accessToken` en memoria a un worker/SW con rotación background | Diferido | Si el proyecto escala a múltiples frontends/apps móviles |
| Refactor de los ~80 `throw new *Exception(...)` viejos a `DomainError` (§6.2) | Deuda técnica | **Regla de oro**: al tocar un módulo para agregar features, migrar primero sus errores a la nueva jerarquía. El `GlobalExceptionFilter` ya mapea los `HttpException` viejos al formato estándar (§6.4), así que el refactor no es bloqueante — pero no agregues throws nuevos con `*Exception` de NestJS en código nuevo |

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

> Todos los comandos Prisma se corren **desde `backend/`** (o con `-p backend/` en el caso de npm scripts). La raíz del repo es el monorepo; cada carpeta de stack es un proyecto Node independiente.

`DATABASE_URL` vive en `backend/.env` (gitignored). Los scripts npm (`prisma:migrate`, `seed`) lo leen de ahí automáticamente.

**Cuando Claude Code corre los comandos**, NO tiene acceso al `.env` por restricciones de permisos del entorno sandboxed. Debe pasarlo **inline** en la invocación, y correr desde `backend/`:

```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" npx prisma migrate dev --name <nombre>
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" npx prisma migrate deploy
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" npx prisma migrate status
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" npx prisma generate
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" npx ts-node prisma/seeds/prod/puct/catalogo-puct.seed.ts
```

Para el caller humano, los scripts npm funcionan sin exportar variables porque leen del `.env`:
```bash
cd backend
npm run prisma:migrate          # equivale a: prisma migrate dev
npm run prisma:generate         # genera el cliente Prisma
npm run prisma:studio           # UI web de Prisma en localhost:5555
```

### 11.3 Tests

Correr **desde `backend/`**:

**Unitarios + integración**:
```bash
cd backend
npx jest src/                    # todos los .spec.ts del código
npm test                         # equivalente
```

**E2E (requieren Postgres arriba + CatalogoPuct sembrado)**:
```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
JWT_ACCESS_SECRET="test-secret" \
JWT_REFRESH_SECRET="test-refresh" \
npx jest test/ --runInBand --forceExit
```

`--runInBand` es necesario para que los tests E2E de distintos módulos no pisen el mismo Postgres en paralelo. `--forceExit` porque PrismaClient deja handles que Jest no detecta (patrón consistente con el resto de los E2E del proyecto).

`ensurePuctSeeded()` en `test/helpers/test-factory.ts` se llama en `beforeAll` de cada suite que necesite el catálogo — idempotente, solo siembra si `CatalogoPuct` está vacío.

### 11.4 Lint y typecheck

Correr **desde `backend/`**:

```bash
cd backend
npx tsc --noEmit -p tsconfig.json    # typecheck
npm run lint                         # eslint src/
npx eslint <path> --fix              # auto-fix
npm run format                       # prettier sobre src/ y test/
```

### 11.5 Checklist antes de arrancar a codear desde cero

1. Desde la raíz del repo: `docker compose up -d postgres redis` (mínimo viable)
2. Si es la primera vez, desde `backend/`:
   `DATABASE_URL=... npx prisma migrate deploy` +
   `DATABASE_URL=... npx ts-node prisma/seeds/prod/puct/catalogo-puct.seed.ts`
3. Desde `backend/`: `npm run start:dev` para el backend en watch mode
4. Abrir http://localhost:3000/api/docs para el Swagger

Para agregar observabilidad al dev, desde la raíz: `docker compose up -d` (todo el stack), entrar a Grafana http://localhost:3001.

---

**Fin del documento.** Para dudas que no resuelve este archivo: preguntar antes de decidir. Este documento se versiona en git — cualquier cambio se discute en PR.
