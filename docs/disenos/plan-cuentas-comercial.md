# Plan de Cuentas — Decisiones Consolidadas

Documento de referencia con las 4 decisiones clave para la implementación del módulo `plan-cuentas` en el sistema contable multi-tenant.

---

## Pregunta 1: ¿Plan de cuentas pre-sembrado al crear organización?

**Decisión: Sí, mínimo obligatorio, filtrado por tipo de empresa.**

Al crear el tenant se pregunta su `TipoEmpresa` (COMERCIAL, SERVICIOS, TRANSPORTE, INDUSTRIAL, PETROLERA, CONSTRUCCION, AGROPECUARIA, MINERA). El seed inicial crea un plan de cuentas operativo aplicable a ese tipo, basado en el PUCT oficial del SIN.

### Flags en cada cuenta del seed

- `esSystemSeed: true` → vino del seed. El tenant puede editarla, renombrarla o desactivarla.
- `esRequeridaSistema: true` → no se puede desactivar sin re-mapear en `OrgConfiguracionContable`.

El plan es un **punto de partida editable**, no un modelo bloqueado. El tenant puede crear, renombrar, agregar sub-cuentas inmediatamente.

### Plantillas por tipo de empresa

```
prisma/seeds/prod/planes-cuentas/
├── comercial.ts          ← arranca Fase 0
├── servicios.ts          ← se agrega después
├── industrial.ts
├── transporte.ts
├── petrolera.ts
├── construccion.ts
├── agropecuaria.ts
└── minera.ts
```

Fase 0 arranca solo con `comercial.ts`. Las demás se agregan según demanda.

### Independencia de gestiones y períodos

El plan de cuentas es **independiente de gestiones y períodos**. Un tenant puede tener su plan completo y editado sin haber abierto ninguna gestión ni registrado un solo asiento. Las gestiones y períodos aparecen cuando se decide iniciar operaciones contables.

Las restricciones de inmutabilidad de atributos de la cuenta (`codigoInterno`, `claseCuenta`, `esDetalle`) se activan cuando la cuenta **tiene movimientos contabilizados**, no cuando existe una gestión.

### Orden de implementación recomendado

```
1. auth + tenant + usuario
2. plan-cuentas (seed + CRUD)
3. catalogo-puct (seed desde xlsx)
4. contactos
5. documento-fisico (tipos configurables)
6. gestion + periodo
7. comprobante + asiento
8. libros (mayor, compras-ventas)
9. reportes
```

---

## Pregunta 2: Multi-moneda — ¿nivel de cuenta o de comprobante?

**Decisión: A nivel de línea de comprobante, NO de cuenta.**

### Fundamento normativo boliviano

La contabilidad boliviana exige:

- **Moneda funcional: Bs siempre** — Código de Comercio Art. 37, Ley 843, Norma Contable N° 6 (CAUB).
- **Reportes oficiales al SIN: solo en Bs** — Balance, Estado de Resultados, Formulario 605.
- **Operaciones en moneda extranjera: tri-valor persistido** — moneda + tipoCambio + montoBob.

### Modelo de datos

```prisma
model Cuenta {
  monedaFuncional    Moneda  @default(BOB)  // metadata informativa
  permiteMultiMoneda Boolean @default(true)  // restricción opcional
}

model LineaComprobante {
  moneda     Moneda
  monto      Decimal @db.Decimal(18, 2)  // moneda original, inmutable
  tipoCambio Decimal @db.Decimal(14, 8)  // oficial BCB en fechaContable
  montoBob   Decimal @db.Decimal(18, 2)  // calculado, derivado
}
```

### Reglas operativas

- Partida doble se valida en `montoBob`, no en moneda original.
- `tipoCambio` se toma de tabla `TipoCambio` por la `fechaContable` del comprobante.
- Si no hay cotización para esa fecha → error `TIPO_CAMBIO_NO_ENCONTRADO`.
- La cuenta **no restringe moneda por default**. "Caja Moneda Nacional" puede tener `permiteMultiMoneda: false` para rechazar USD; cuentas como CxC/CxP permiten cualquier moneda.
- Diferencia de cambio al cancelar obligaciones en moneda extranjera → asiento automático contra cuenta mapeada como `difCambioGananciaId` o `difCambioPerdidaId` (según dirección del cambio).
- Reportes operativos (CxC, CxP, libro mayor) muestran **doble moneda**.
- Reportes oficiales al SIN muestran **solo Bs**.

### Configuración de presentación por tenant

```prisma
model ConfiguracionTenant {
  tenantId                String  @id
  mostrarMonedaExtranjera Boolean @default(true)
  monedasAdicionales      Moneda[]
}
```

- Backend **siempre** persiste y devuelve todos los valores (moneda original + Bs).
- Frontend decide qué mostrar según la configuración del tenant.
- Usuario puede hacer toggle runtime para mostrar/ocultar columnas extras.
- Nunca se oculta información en DB ni en API por motivos de UX.

### Tabla de decimales definitiva

| Campo | Tipo Prisma | Justificación |
|---|---|---|
| Montos moneda original | `@db.Decimal(18, 2)` | Hasta ~999 billones |
| Monto en BOB | `@db.Decimal(18, 2)` | Siempre 2 decimales |
| UFV (cotización) | `@db.Decimal(14, 5)` | 5 decimales por RND 10-0021-16 |
| Monto en UFV | `@db.Decimal(18, 5)` | Para montos grandes convertidos |
| Tipo de cambio | `@db.Decimal(14, 8)` | 8 decimales del BCB |
| Porcentajes | `@db.Decimal(5, 4)` | Ej. 0.1300 para 13% |
| Cantidades (inventario) | `@db.Decimal(18, 6)` | Unidades fraccionales |

---

## Pregunta 3: CatalogoPuct — seed completo desde xlsx oficial

**Decisión: Seed automático al boot desde `puct.xlsx` oficial del SIN, commiteado al repo.**

### Volumen del PUCT oficial

538 cuentas oficiales distribuidas en:

- 5 clases (nivel 1): ACTIVO, PASIVO, PATRIMONIO, INGRESO, EGRESO
- 15 grupos (nivel 2)
- 54 subgrupos (nivel 3)
- 464 cuentas principales (nivel 4)

El nivel 5 (Cuenta Analítica) es libre del tenant, no viene en el seed.

### Estructura de archivos

```
prisma/seeds/prod/puct/
├── source/
│   ├── puct.xlsx              ← archivo oficial del SIN
│   └── README.md              ← versión, fecha, URL origen
├── parser.ts                  ← procesa xlsx → records
├── catalogo-puct.seed.ts      ← upsert al DB
└── __tests__/
    └── parser.spec.ts         ← valida estructura
```

### Schema

```prisma
model CatalogoPuct {
  codigo        String         @id                 // "1.1.1.001"
  nivel         Int                                // 1, 2, 3 o 4
  nombre        String
  claseCuenta   ClaseCuenta
  padre         String?
  activo        Boolean        @default(true)      // false = deprecado por SIN
  tiposEmpresa  TipoEmpresa[]                      // Postgres array
  versionPuct   String         @default("2024-01") // versión del SIN que trajo el registro
  actualizadoEn DateTime       @updatedAt
  
  padreCuenta   CatalogoPuct?  @relation("Jerarquia", fields: [padre], references: [codigo])
  hijas         CatalogoPuct[] @relation("Jerarquia")
  
  @@index([nivel])
  @@index([padre])
  @@index([claseCuenta])
  @@index([tiposEmpresa], type: Gin)
}

enum ClaseCuenta {
  ACTIVO
  PASIVO
  PATRIMONIO
  INGRESO
  EGRESO
}

enum TipoEmpresa {
  COMERCIAL
  SERVICIOS
  TRANSPORTE
  INDUSTRIAL
  PETROLERA
  CONSTRUCCION
  AGROPECUARIA
  MINERA
}
```

**Tabla compartida sin `tenantId`** — es catálogo oficial, no data de tenant.

### Proceso del parser

1. Lee `puct.xlsx` con librería `xlsx`.
2. Ignora filas con nombre `XXX` (plantillas del 5to nivel).
3. Extrae los 4 niveles (C, G, SG, CP).
4. Mapea cada fila a un registro de `CatalogoPuct`.
5. Genera el array `tiposEmpresa` leyendo columnas COMERCIAL, SERVICIOS, etc.
6. Construye la jerarquía (`padre` FK).
7. Hace `upsert` al correr el seed (idempotente).

### Tests obligatorios del parser

- Mínimo 500 registros oficiales.
- Exactamente 5 clases de primer nivel.
- Cuentas específicas por industria (minería, agropecuaria, construcción).
- No incluye filas "XXX".
- Todos los registros tienen jerarquía válida (padre existente).

### Cache y actualización

- **Cache Redis al arrancar** con TTL 24h, invalidación explícita al re-seedear.
- **Actualización:** cuando el SIN publique nueva versión del PUCT, se reemplaza el xlsx, se actualiza README con fecha/versión, se corre `npm run seed:puct`, se commitea. CI aplica en producción.

### Versionado Slowly Changing Dimension (Type 2)

- Tabla principal `CatalogoPuct` con clave simple por `codigo` → queries rápidas.
- Campo `versionPuct` en la tabla principal para trazar qué versión trajo el registro.
- Snapshot embebido en `Cuenta` (`nombrePuctSnapshot`, `versionPuctMapeado`) → trazabilidad sin joins.
- Tabla `HistoricoCatalogoPuct` **diferida** hasta el primer cambio real del SIN.

```prisma
model Cuenta {
  codigoPuct         String?
  nombrePuctSnapshot String?   // nombre al momento del mapeo
  versionPuctMapeado String?   // versión del PUCT usada al mapear
}
```

---

## Pregunta 4: Niveles máximos de jerarquía

**Decisión: Dos sistemas de codificación coexistiendo.**

### Profundidad máxima

| Código | Niveles | Regla |
|---|---|---|
| **PUCT oficial** | 5 fijos | Impuesto por el SIN: C(1) + G(1) + SG(1) + CP(3) + CA(3) |
| **Código interno del tenant** | 8 máximo | Puede ser más profundo que el PUCT para granularidad interna |

### Convención de codificación

**Opción A confirmada:** código interno **igual al código PUCT hasta nivel 4**, con extensión libre del 5 al 8 para granularidad interna del tenant.

Ejemplo:

```
PUCT oficial:         1.1.1.001                (Caja — nivel 4, no-detalle)
Cuenta del tenant:    1.1.1.001.01             (Caja MN — nivel 5, detalle)
Sub-cuenta interna:   1.1.1.001.01.001         (Caja MN Sucursal SCZ — nivel 6, interno)
```

### Schema de la cuenta del tenant

```prisma
model Cuenta {
  id                        String       @id @default(cuid())
  tenantId                  String
  codigoInterno             String       // hasta 8 niveles
  codigoPuct                String?      // 5 niveles max, opcional pero recomendado
  nombrePuctSnapshot        String?      // snapshot al momento del mapeo
  versionPuctMapeado        String?      // versión del PUCT usada
  nombre                    String
  claseCuenta               ClaseCuenta
  esDetalle                 Boolean
  activa                    Boolean      @default(true)
  padreId                   String?
  
  monedaFuncional           Moneda       @default(BOB)
  permiteMultiMoneda        Boolean      @default(true)
  requiereContacto          Boolean      @default(false)
  
  esSystemSeed              Boolean      @default(false)
  esRequeridaSistema        Boolean      @default(false)
  
  padre                     Cuenta?      @relation("Jerarquia", fields: [padreId], references: [id])
  hijas                     Cuenta[]     @relation("Jerarquia")
  lineas                    LineaComprobante[]
  
  @@unique([tenantId, codigoInterno])
  @@index([tenantId, codigoPuct])  // para queries de consolidación
  @@index([padreId])
}
```

**Importante:** sin `@@unique([tenantId, codigoPuct])`. Múltiples cuentas internas pueden mapear al mismo código PUCT (ese es el propósito de la consolidación al SIN).

### Tabla de configuración contable (separada)

```prisma
model OrgConfiguracionContable {
  organizationId            String  @id
  
  // Requeridas (9 conceptos)
  ivaCreditoId              String?
  ivaDebitoId               String?
  itPorPagarId              String?
  iuePorPagarId             String?
  rcIvaRetenidoId           String?
  difCambioGananciaId       String?
  difCambioPerdidaId        String?
  resultadoEjercicioId      String?
  resultadosAcumuladosId    String?
  
  // Opcionales
  ivaCreditoImportacionesId String?
  cajaChicaDefaultId        String?
  ajustePorInflacionId      String?
  
  organization              Organization @relation(fields: [organizationId], references: [id])
  
  ivaCredito                Cuenta? @relation("ConfigIvaCredito", fields: [ivaCreditoId], references: [id], onDelete: Restrict)
  ivaDebito                 Cuenta? @relation("ConfigIvaDebito", fields: [ivaDebitoId], references: [id], onDelete: Restrict)
  // ... resto de relaciones con onDelete: Restrict
}
```

**Reemplaza el campo `cuentaAsientosAutomaticos: String?` en `Cuenta`.** Tipo seguro con FK, unicidad garantizada por diseño, re-mapeo trivial.

### Invariantes del plan de cuentas

**PUCT mapeado debe ser nivel 4.** Mapear al nivel 3 o superior pierde granularidad que el SIN necesita. Hard-error en el servicio si se intenta nivel < 4.

```ts
if (puct.nivel < 4) {
  throw new CodigoPuctNivelInsuficienteError(codigoPuct, puct.nivel);
}
```

**Validación de código interno:**

- Máximo 8 niveles separados por punto.
- Cada nivel es numérico.
- Niveles 1-4 deben coincidir con el PUCT si está mapeado.

**Inmutabilidad una vez que la cuenta tiene movimientos:**

| Atributo | Mutable sin movimientos | Mutable con movimientos |
|---|---|---|
| `codigoInterno` | ✅ | ❌ |
| `claseCuenta` | ✅ | ❌ |
| `esDetalle` | ✅ | ❌ |
| `nombre` | ✅ | ✅ |
| `activa` | ✅ | ✅ (ver regla especial) |
| `codigoPuct` | ✅ | ⚠️ solo dentro del mismo nivel PUCT |

**Regla especial para desactivar (`activa = false`):** no se puede desactivar una cuenta referenciada desde `OrgConfiguracionContable`. El servicio valida antes de intentar el update:

```ts
async desactivarCuenta(cuentaId: string, tenantId: string) {
  const conceptosAfectados = await this.config.conceptosUsando(cuentaId, tenantId);
  
  if (conceptosAfectados.length > 0) {
    throw new CuentaConfiguradaComoConceptoError(
      cuentaId,
      conceptosAfectados,
      `Esta cuenta está configurada como: ${conceptosAfectados.map(c => c.nombre).join(', ')}. ` +
      `Para desactivarla, re-mapeá estos conceptos a otra cuenta en Configuración Contable.`
    );
  }
}
```

### Tipo de empresa en Organization

```prisma
model Organization {
  // ...
  tipoEmpresaPrincipal TipoEmpresa           // para SIN, siempre 1, inmutable post-asientos
  tiposEmpresaActivos  TipoEmpresa[]         // para seed y sugerencias, ≥1, editable
}
```

**Invariantes:**

- `tipoEmpresaPrincipal ∈ tiposEmpresaActivos`.
- `tipoEmpresaPrincipal` es inmutable después del primer asiento contabilizado.
- `tiposEmpresaActivos` es editable (agregar o quitar perfiles activos) sin afectar data histórica.

**Uso:**

- **Reportar al SIN:** se usa `tipoEmpresaPrincipal` (un solo valor).
- **Seed inicial del plan:** mergea plantillas de todos los `tiposEmpresaActivos`.
- **Filtrar PUCT sugerido:** `tiposEmpresa: { hasSome: tiposEmpresaActivos }`.

---

## Resumen ejecutivo

| # | Pregunta | Decisión |
|---|---|---|
| 1 | Plan pre-sembrado | Sí, mínimo por `tipoEmpresa`. Cuentas `esSystemSeed` editables; `esRequeridaSistema` con 9 cuentas obligatorias. Plantilla inicial: COMERCIAL. |
| 2 | Multi-moneda | A nivel de línea de comprobante. Tri-valor `monto + tipoCambio + montoBob`. Partida doble en Bs. Cuenta tiene `monedaFuncional` y `permiteMultiMoneda` como metadata opcional. Backend siempre persiste todas las monedas; UI configurable por tenant. |
| 3 | CatalogoPuct | Seed completo desde `puct.xlsx` oficial commiteado al repo. Parser + upsert idempotente. 538 cuentas en 4 niveles oficiales + array `tiposEmpresa` por cuenta. Cache Redis 24h. Versionado SCD Type 2 con snapshot en `Cuenta`. |
| 4 | Niveles jerárquicos | PUCT fijo en 5 (regla SIN). Código interno del tenant hasta 8 niveles, **igual al PUCT en niveles 1-4**. Ambos persistidos en `Cuenta`. PUCT opcional; si presente, validado contra catálogo oficial y debe ser nivel 4. |

## Schema final consolidado

| Modelo | Rol clave |
|---|---|
| `CatalogoPuct` | PK simple por código, `versionPuct` field, `tiposEmpresa[]` con GIN index |
| `HistoricoCatalogoPuct` | Diferido hasta primer cambio del SIN |
| `Cuenta` | `codigoInterno` único por tenant, `codigoPuct` NO único (consolidación), `nombrePuctSnapshot` + `versionPuctMapeado` para trazabilidad |
| `OrgConfiguracionContable` | 12 FKs nullable a `Cuenta`. `onDelete: Restrict` + validación servicio |
| `Organization` | `tipoEmpresaPrincipal` (inmutable post-asiento) + `tiposEmpresaActivos: TipoEmpresa[]` |

## Próximos pasos de implementación

1. Schema Prisma con los 4 modelos nuevos + updates a `Organization`.
2. Migration + seed del `CatalogoPuct` desde el xlsx oficial (commitear xlsx + parser).
3. Seed plantilla COMERCIAL del plan de cuentas (~60 cuentas de detalle).
4. Módulo `cuentas/` hexagonal con CRUD + validaciones.
5. Módulo `configuracion-contable/` con CRUD para mapear conceptos.
6. Tests E2E del flujo completo: crear org COMERCIAL → ver plan auto-sembrado → editar config → reasignar concepto.
