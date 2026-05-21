<!--
Última edición: 2026-05-21
Última revisión contra core: 2026-05-21
Owner: backend-lead
-->

# Dominio contable — detalle

> Este doc expande §4-core del `CLAUDE.md`. Los 9 invariantes no-negociables
> viven en el core como referencia imperativa. Acá va el detalle: edge cases,
> ejemplos, tablas de decimales, value objects, justificación regulatoria.
>
> **Cuándo leer este doc**: antes de editar código en
> `backend/src/modules/{asientos,comprobantes,libro-*,periodo-fiscal,cierre-*,plan-cuentas,facturas,ufv,tipo-cambio}/**`
> o `backend/prisma/migrations/**` o `schema.prisma`.
>
> **Regla anti-drift**: si al editar este doc descubrís algo que contradice
> un invariante del core, el cambio debe ir primero al core (CLAUDE.md §4-core)
> y recién después propagarse acá.

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

- Código interno único por tenant. `codigoInterno` es el código propio de la cuenta; respeta una estructura jerárquica de hasta 5 niveles (un segmento por nivel, separados por punto).
- Cuenta con movimientos no se puede eliminar, solo desactivar.
- No se puede cambiar el tipo (Activo/Pasivo/Patrimonio/Ingreso/Egreso) de una cuenta con movimientos.
- Cambio de `esDetalle: true → false` solo si la cuenta no tiene movimientos.
- Código jerárquico: cada cuenta no raíz debe tener un padre válido y activo.

#### Documentos tributarios (registrados, no emitidos por el sistema)

- NIT emisor válido: 7-12 dígitos numéricos, formato correcto. Sin consulta a padrón SIN.
- NIT receptor válido o `0` (ventas sin nominativa).
- `fechaEmision <= fechaActual`.
- Unicidad por `(tenantId, tipo, nitEmisor, numero, fecha)` para facturas recibidas y emitidas. Evita duplicados en el registro tributario interno (el RCV/SIN es externo — ver `CLAUDE.md §10.9`).
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
- **LCV/RCV** ⊘ **fuera de scope**: el SIN reemplazó el LCV por el RCV y lo genera con sus propias herramientas (SIAT). El sistema no construye el libro (decisión 2026-05-21, `CLAUDE.md §10.9`). La unicidad de documentos tributarios `(NIT + número + fecha + tipo)` igual aplica para el control interno.

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
- Tablas compartidas (`CotizacionUfv`, `TipoCambio` oficial del BCB) **no tienen `tenantId`**. Se leen en modo solo-lectura desde cualquier tenant.

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
