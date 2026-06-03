<!--
Última edición: 2026-06-03
Última revisión contra core: 2026-04-23
Owner: backend-lead
-->

# Errores y logs — detalle

> Este doc expande las reglas de manejo de errores del `CLAUDE.md`. Acá vive
> la jerarquía `DomainError`, la convención de `code`, el formato de respuesta
> estándar, y las reglas de logging y redacción.
>
> **Cuándo leer este doc**: antes de editar código en
> `backend/src/common/{errors,filters}/**`, agregar una `DomainError` nueva,
> tocar `GlobalExceptionFilter`, o mapear errores de Prisma.
>
> **Regla anti-drift**: si al editar este doc descubrís algo que contradice
> el formato estándar de respuesta de error, el cambio debe ir primero al
> core (si hay invariante relacionado) y recién después propagarse acá.

---

## 6. Manejo de errores y logs

### 6.1 Infraestructura existente (documentación)

El starter ya provee:

| Componente | Qué hace |
|-----------|---------|
| `LoggerModule` (puerto + adapters) | Pino, Winston, Loki, Console. Configurable por `LOG_PROVIDER` |
| `HttpLoggingInterceptor` | Loguea request/response con `tenantId`, `userId`, `traceId`, `spanId`, `duration`, `status` |
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
