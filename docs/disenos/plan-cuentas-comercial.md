# Plan de Cuentas — Decisiones Consolidadas

Documento de referencia con las 4 decisiones clave para la implementación del módulo `plan-cuentas` en el sistema contable multi-tenant.

---

## Pregunta 1: ¿Plan de cuentas pre-sembrado al crear organización?

**Decisión: Sí, mínimo obligatorio, filtrado por tipo de empresa.**

Al crear el tenant se pregunta su `TipoEmpresa` (COMERCIAL, SERVICIOS, TRANSPORTE, INDUSTRIAL, PETROLERA, CONSTRUCCION, AGROPECUARIA, MINERA). El seed inicial crea un plan de cuentas operativo aplicable a ese tipo, con la numeración contable boliviana estándar inlineada en la plantilla del seed.

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
3. contactos
4. documento-fisico (tipos configurables)
5. gestion + periodo
6. comprobante + asiento
7. libros (mayor, compras-ventas)
8. reportes
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

## Pregunta 3: Catálogo de cuentas — ¿catálogo PUCT separado? (DECISIÓN REVERTIDA)

> **OBSOLETO (2026-05-19).** La decisión original — sembrar un catálogo
> `CatalogoPuct` separado desde un `puct.xlsx` oficial del SIN, mapear cada
> `Cuenta` contra él y persistir un snapshot (`codigoPuct`,
> `nombrePuctSnapshot`, `versionPuctMapeado`) — **se revirtió** en el change
> `remover-catalogo-puct`. Se eliminaron la tabla `CatalogoPuct`, las 3
> columnas de snapshot en `Cuenta`, su índice, el endpoint
> `POST /cuentas/:id/mapear-puct`, el VO/port/adapter/validador asociados y el
> pipeline de seed (`prisma/seeds/prod/puct/`). Esta sección se conserva como
> registro histórico; **no describe el estado actual del sistema.**

**Decisión vigente: NO hay catálogo separado. La plantilla del seed es
autocontenida.**

El plan de cuentas se siembra directamente desde la plantilla por tipo de
empresa (`prisma/seeds/prod/planes-cuentas/comercial.ts`). El nombre de cada
cuenta hoja viene inlineado en la plantilla; el `nivel` se deriva de la cantidad
de segmentos del código y la `claseCuenta` del primer dígito (helpers locales
`claseCuentaDe` / `nombreDe`). El `codigoInterno` ES el código propio de la
cuenta — no existe un código externo contra el cual mapear.

El mapeo de conceptos del sistema a cuentas (`OrgConfiguracionContable`) opera
sobre `codigoInterno` mediante la constante `MAPEO_CODIGO_A_CONCEPTO` (antes
`MAPEO_PUCT_A_CONCEPTO`). No hay tabla compartida, ni snapshot, ni versión de
catálogo, ni cache Redis del catálogo: el seed es la única fuente de verdad de
los nombres y la jerarquía.

### Motivo de la reversión

El catálogo PUCT separado introducía una dependencia de infraestructura (xlsx +
parser + tabla + cache) y un acoplamiento (snapshot embebido en `Cuenta`) cuyo
único valor era la futura consolidación al SIN — que está **fuera de scope**
(CLAUDE.md §10.9). La numeración estándar boliviana ya queda capturada en la
plantilla del seed; mantener un segundo catálogo redundante solo agregaba
superficie que podía desincronizarse.

---

## Pregunta 4: Niveles máximos de jerarquía

**Decisión: Un único sistema de codificación interno por tenant.**

> **Nota (2026-05-19).** La versión original describía DOS sistemas de
> codificación coexistiendo (PUCT oficial + código interno) y un mapeo entre
> ellos. Tras la reversión del catálogo PUCT (ver Pregunta 3) queda **un solo
> código**: `codigoInterno`, propio de la cuenta.

### Profundidad máxima

| Código | Niveles | Regla |
|---|---|---|
| **Código interno del tenant** | 8 máximo | Numeración propia de la cuenta, jerárquica por segmentos |

### Convención de codificación

Código jerárquico por segmentos separados por punto, hasta 8 niveles. La
plantilla del seed arranca con la numeración contable boliviana estándar
(niveles 1-4); el tenant extiende libremente del nivel 5 al 8 para granularidad
interna.

Ejemplo:

```
Cuenta sembrada:      1.1.1.001                (Caja — nivel 4, no-detalle)
Cuenta del tenant:    1.1.1.001.01             (Caja MN — nivel 5, detalle)
Sub-cuenta interna:   1.1.1.001.01.001         (Caja MN Sucursal SCZ — nivel 6, interno)
```

### Schema de la cuenta del tenant

```prisma
model Cuenta {
  id                        String       @id @default(cuid())
  tenantId                  String
  codigoInterno             String       // hasta 8 niveles
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
  @@index([padreId])
}
```

> **Nota (2026-05-19).** El schema original incluía `codigoPuct`,
> `nombrePuctSnapshot`, `versionPuctMapeado` y un `@@index([tenantId, codigoPuct])`.
> Las tres columnas y el índice se eliminaron con el change `remover-catalogo-puct`.

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

**Validación de código interno:**

- Máximo 8 niveles separados por punto.
- Cada nivel es numérico.
- Cada cuenta no raíz debe tener un padre válido y activo cuyo código sea el prefijo del propio.

**Inmutabilidad una vez que la cuenta tiene movimientos:**

| Atributo | Mutable sin movimientos | Mutable con movimientos |
|---|---|---|
| `codigoInterno` | ✅ | ❌ |
| `claseCuenta` | ✅ | ❌ |
| `esDetalle` | ✅ | ❌ |
| `nombre` | ✅ | ✅ |
| `activa` | ✅ | ✅ (ver regla especial) |

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

---

## Resumen ejecutivo

| # | Pregunta | Decisión |
|---|---|---|
| 1 | Plan pre-sembrado | Sí, mínimo por `tipoEmpresa`. Cuentas `esSystemSeed` editables; `esRequeridaSistema` con 9 cuentas obligatorias. Plantilla inicial: COMERCIAL. |
| 2 | Multi-moneda | A nivel de línea de comprobante. Tri-valor `monto + tipoCambio + montoBob`. Partida doble en Bs. Cuenta tiene `monedaFuncional` y `permiteMultiMoneda` como metadata opcional. Backend siempre persiste todas las monedas; UI configurable por tenant. |
| 3 | Catálogo de cuentas | **Revertido (2026-05-19).** Sin catálogo `CatalogoPuct` separado. La plantilla del seed (`comercial.ts`) es autocontenida: nombres inlineados, `nivel`/`claseCuenta` derivados del código. Mapeo de conceptos por `MAPEO_CODIGO_A_CONCEPTO` sobre `codigoInterno`. |
| 4 | Niveles jerárquicos | Un único código interno por tenant, hasta 8 niveles, jerárquico por segmentos. Sembrado con numeración boliviana estándar (niveles 1-4); tenant extiende del 5 al 8. |

## Schema final consolidado

| Modelo | Rol clave |
|---|---|
| `Cuenta` | `codigoInterno` único por tenant (`@@unique([tenantId, codigoInterno])`), jerarquía por `padreId` |
| `OrgConfiguracionContable` | 12 FKs nullable a `Cuenta`. `onDelete: Restrict` + validación servicio |
| `Organization` | `tipoEmpresaPrincipal` (inmutable post-asiento) + `tiposEmpresaActivos: TipoEmpresa[]` |

## Próximos pasos de implementación

1. Schema Prisma con los modelos nuevos + updates a `Organization`.
2. Seed plantilla COMERCIAL del plan de cuentas autocontenida (~60 cuentas de detalle, nombres inlineados).
3. Módulo `cuentas/` hexagonal con CRUD + validaciones.
4. Módulo `configuracion-contable/` con CRUD para mapear conceptos.
5. Tests E2E del flujo completo: crear org COMERCIAL → ver plan auto-sembrado → editar config → reasignar concepto.
