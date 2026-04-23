# Gestiones y Períodos Fiscales — Fase 1.2

Documento de referencia para la implementación del módulo de gestiones y períodos fiscales. Sigue el dominio contable boliviano (Ley 843, Art. 46) y se integra con el módulo de comprobantes (Fase 1.3).

---

## 1. Conceptos

**Gestión Fiscal** — Ejercicio anual del tenant. Contenedor de los 12 períodos mensuales. El mes de inicio/cierre es normativo por tipo de empresa, no elegible por el usuario.

**Período Fiscal** — Mes calendario dentro de una gestión. Es la unidad operativa donde se registran comprobantes. Se cierra mensualmente para consolidar operaciones.

**Reapertura** — Acción excepcional y auditada que devuelve un período cerrado al estado `ABIERTO` para correcciones. Solo OWNER/ADMIN.

**Cierre definitivo** — Flag que marca un período como irreversible (ej. período declarado al SIN). Un período definitivo no puede reabrirse por ningún medio.

---

## 2. Cierre fiscal por tipo de empresa (Art. 46 Ley 843)

El mes de inicio/cierre de cada gestión fiscal está determinado por el `tipoEmpresaPrincipal` del tenant, según normativa del SIN:

| Tipo de empresa | Cierre fiscal | Inicio de gestión | mesInicio | mesCierre |
|---|---|---|---|---|
| COMERCIAL, SERVICIOS, TRANSPORTE | 31 de diciembre | 1 de enero | 1 | 12 |
| INDUSTRIAL, CONSTRUCCION, PETROLERA | 31 de marzo | 1 de abril | 4 | 3 |
| AGROPECUARIA | 30 de junio | 1 de julio | 7 | 6 |
| MINERA | 30 de septiembre | 1 de octubre | 10 | 9 |

**Regla de diseño:** al crear una `GestionFiscal`, `mesInicio` NO es input del usuario — se deriva automáticamente del `tipoEmpresaPrincipal` del tenant. El tenant no puede elegir un cierre fiscal distinto al que le corresponde por su actividad.

El `tipoEmpresaPrincipal` es **inmutable una vez que el tenant registra el primer comprobante contabilizado**. Esto previene que un cambio de tipo rompa gestiones ya iniciadas.

### 2.1 Tabla de derivación

```typescript
// common/domain/cierre-fiscal-por-tipo-empresa.ts
export const CIERRE_FISCAL_POR_TIPO: Record<TipoEmpresa, { mesInicio: number; mesCierre: number }> = {
  COMERCIAL:    { mesInicio: 1,  mesCierre: 12 },
  SERVICIOS:    { mesInicio: 1,  mesCierre: 12 },
  TRANSPORTE:   { mesInicio: 1,  mesCierre: 12 },
  INDUSTRIAL:   { mesInicio: 4,  mesCierre: 3  },
  CONSTRUCCION: { mesInicio: 4,  mesCierre: 3  },
  PETROLERA:    { mesInicio: 4,  mesCierre: 3  },
  AGROPECUARIA: { mesInicio: 7,  mesCierre: 6  },
  MINERA:       { mesInicio: 10, mesCierre: 9  },
};

export function calcularMesInicio(tipoEmpresa: TipoEmpresa): number {
  return CIERRE_FISCAL_POR_TIPO[tipoEmpresa].mesInicio;
}
```

### 2.2 Ejemplos de gestiones por tipo de empresa

**Empresa COMERCIAL — Gestión 2026:**

```
mesInicio: 1
├── Período 1  (orden 1):  01/01/2026 - 31/01/2026 (enero 2026)
├── Período 2  (orden 2):  01/02/2026 - 28/02/2026 (febrero 2026)
├── ...
└── Período 12 (orden 12): 01/12/2026 - 31/12/2026 (diciembre 2026)
```

**Empresa INDUSTRIAL — Gestión 2026:**

```
mesInicio: 4
├── Período (orden 1):  01/04/2026 - 30/04/2026 (abril 2026)
├── Período (orden 2):  01/05/2026 - 31/05/2026 (mayo 2026)
├── ...
├── Período (orden 9):  01/12/2026 - 31/12/2026 (diciembre 2026)
├── Período (orden 10): 01/01/2027 - 31/01/2027 (enero 2027)
├── Período (orden 11): 01/02/2027 - 28/02/2027 (febrero 2027)
└── Período (orden 12): 01/03/2027 - 31/03/2027 (marzo 2027) ← cierre 31/03
```

**Empresa AGROPECUARIA — Gestión 2026:**

```
mesInicio: 7
├── Período (orden 1):  01/07/2026 - 31/07/2026 (julio 2026)
├── ...
└── Período (orden 12): 01/06/2027 - 30/06/2027 (junio 2027) ← cierre 30/06
```

**Empresa MINERA — Gestión 2026:**

```
mesInicio: 10
├── Período (orden 1):  01/10/2026 - 31/10/2026 (octubre 2026)
├── ...
└── Período (orden 12): 01/09/2027 - 30/09/2027 (septiembre 2027) ← cierre 30/09
```

---

## 3. Flujo operativo completo

### 3.1 Inicio de operaciones

El tenant crea su primera `GestionFiscal` (ej. 2026). El sistema determina el `mesInicio` según el `tipoEmpresaPrincipal` del tenant y genera automáticamente los 12 períodos mensuales en estado `ABIERTO`.

### 3.2 Caso: inicio tardío de operaciones

Si la empresa empieza a operar a mitad de gestión (ej. tenant COMERCIAL creado en abril con gestión enero-diciembre):

1. Tenant registra un comprobante de apertura en abril con los saldos iniciales (balance de apertura).
2. Los meses enero, febrero, marzo **existen pero están vacíos** (0 comprobantes).
3. Tenant va a "Cerrar período" para cada uno de los meses enero, febrero, marzo individualmente.
4. El sistema valida: "0 comprobantes en borrador, 0 contabilizados" → permite cerrar un período vacío sin problema.
5. Queda el histórico: "enero 2026 cerrado sin movimientos" — trazabilidad intacta.

### 3.3 Operación normal durante el mes

Durante un período abierto:

- Tenant registra comprobantes con `fechaContable` dentro del período.
- Estados de comprobantes fluyen: `BORRADOR` → `CONTABILIZADO`.
- Todo editable/modificable/anulable **mientras el período esté `ABIERTO`**.
- Cada edición deja auditoría con timestamp, usuario, diff de cambios.

### 3.4 Cierre de período al final del mes

Tenant va a "Cerrar período":

1. Sistema muestra resumen pre-cierre:
   - X comprobantes `CONTABILIZADO`
   - Y comprobantes `BORRADOR` (lista con link a cada uno)
   - Z comprobantes `ANULADO`
   - Suma total de débitos / créditos en BOB
   - Balance verificado (partida doble OK)
2. Tenant puede ir a cada borrador y decidir: completarlo (contabilizar) o eliminarlo.
3. Cuando todos los borradores están resueltos (0 pendientes), el botón "Cerrar período" se habilita.
4. Al cerrar: todos los comprobantes `CONTABILIZADO` del período pasan automáticamente a `BLOQUEADO` en una sola transacción.
5. Período queda `CERRADO`.

### 3.5 Intentos de operar fuera de período cerrado

- Nuevo comprobante con `fechaContable` en un período `CERRADO` → rechazado con `PERIODO_CERRADO`.
- Edición de comprobante `BLOQUEADO` → rechazado con `COMPROBANTE_BLOQUEADO`.
- Único camino para modificar algo del período cerrado: reapertura.

### 3.6 Reapertura de período

Solo OWNER o ADMIN puede:

1. Va a "Reabrir período".
2. Debe ingresar un motivo obligatorio (mínimo 20 caracteres).
3. Sistema registra en `PeriodoFiscalReopening` con timestamp, usuario, motivo.
4. Período vuelve a `ABIERTO`, comprobantes vuelven a `CONTABILIZADO` (desbloqueados).
5. Durante la ventana de reapertura, todas las ediciones se auditan con marca `fueDuranteReapertura: true`.
6. Cuando se vuelve a cerrar, se actualiza `reclosedAt` en la tabla de reapertura.

### 3.7 Cierre de gestión

Al cerrar los 12 meses:

1. Tenant va a "Cerrar gestión".
2. Sistema valida que los 12 períodos estén `CERRADO`.
3. Si alguno está abierto: rechaza con listado de períodos pendientes.
4. Gestión pasa a `CERRADA`.

**En Fase 1.2 NO se generan asientos automáticos de cierre.** La generación automática de asientos (depreciación, cierre de resultados, apertura de gestión siguiente) queda para Fase 1.5 con wizard dedicado.

---

## 4. Modelo de datos (Prisma)

### 4.1 GestionFiscal

```prisma
model GestionFiscal {
  id              String   @id @default(uuid())
  organizationId  String
  year            Int                      // año fiscal (no necesariamente calendario)
  mesInicio       Int                      // derivado de Organization.tipoEmpresaPrincipal
  status          GestionFiscalStatus @default(ABIERTA)
  closedAt        DateTime?
  closedByUserId  String?
  
  periodos        PeriodoFiscal[]
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  organization    Organization @relation(fields: [organizationId], references: [id])
  
  @@unique([organizationId, year])
  @@index([organizationId, status])
  @@map("gestiones_fiscales")
}

enum GestionFiscalStatus {
  ABIERTA
  CERRADA
}
```

**Observaciones sobre `GestionFiscal.year`:**

- Representa el **año fiscal**, no el año calendario.
- Para tenants con `mesInicio = 1` (COMERCIAL, SERVICIOS, TRANSPORTE): año fiscal = año calendario.
- Para tenants con `mesInicio ≠ 1`: el año fiscal es el del mes de inicio. Ej. una empresa INDUSTRIAL con gestión que va de abril/2026 a marzo/2027 tiene `year = 2026`.

### 4.2 PeriodoFiscal

```prisma
model PeriodoFiscal {
  id               String   @id @default(uuid())
  organizationId   String
  gestionId        String
  year             Int                     // año CALENDARIO real del mes
  month            Int                     // mes calendario real (1-12)
  ordenEnGestion   Int                     // posición dentro de la gestión (1-12)
  status           PeriodoFiscalStatus @default(ABIERTO)
  esDefinitivo     Boolean  @default(false)
  
  closedAt         DateTime?
  closedByUserId   String?
  
  reopenings       PeriodoFiscalReopening[]
  
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  organization     Organization @relation(fields: [organizationId], references: [id])
  gestion          GestionFiscal @relation(fields: [gestionId], references: [id])
  
  @@unique([organizationId, year, month])
  @@unique([gestionId, ordenEnGestion])
  @@index([organizationId, status])
  @@index([gestionId])
  @@map("periodos_fiscales")
}

enum PeriodoFiscalStatus {
  ABIERTO
  CERRADO
}
```

**Observaciones:**

- NO persistimos `fechaInicio` ni `fechaFin`. Son derivables de `(year, month)` con el helper puro `rangoCalendario()`. Persistirlos duplica fuente de verdad y abre puerta a bugs de timezone.
- `year` y `month` son el **año calendario y mes calendario reales** del período, no los de la gestión.
- `ordenEnGestion` (1-12) permite ordenar los períodos dentro de la gestión sin confusión.

### 4.3 PeriodoFiscalReopening

```prisma
model PeriodoFiscalReopening {
  id                 String   @id @default(uuid())
  periodoId          String
  reopenedAt         DateTime @default(now())
  reopenedByUserId   String
  motivo             String                 // obligatorio, mínimo 20 caracteres
  reclosedAt         DateTime?
  reclosedByUserId   String?
  
  periodo            PeriodoFiscal @relation(fields: [periodoId], references: [id])
  
  @@index([periodoId])
  @@map("periodo_fiscal_reopenings")
}
```

### 4.4 Ejemplo concreto de datos

Gestión 2026 de una empresa INDUSTRIAL (`mesInicio = 4`):

```
GestionFiscal:
  id: "g-xyz"
  year: 2026
  mesInicio: 4
  status: ABIERTA

PeriodoFiscal (12 filas):
  ordenEnGestion | year | month | representa
  ---------------|------|-------|-------------
  1              | 2026 |   4   | abril 2026
  2              | 2026 |   5   | mayo 2026
  3              | 2026 |   6   | junio 2026
  4              | 2026 |   7   | julio 2026
  5              | 2026 |   8   | agosto 2026
  6              | 2026 |   9   | septiembre 2026
  7              | 2026 |  10   | octubre 2026
  8              | 2026 |  11   | noviembre 2026
  9              | 2026 |  12   | diciembre 2026
  10             | 2027 |   1   | enero 2027
  11             | 2027 |   2   | febrero 2027
  12             | 2027 |   3   | marzo 2027
```

Al mostrar en UI:

- "Gestión 2026 (Abril 2026 - Marzo 2027)"
- "Período 10 - Enero 2027"

---

## 5. Encapsulamiento módulo-a-módulo

El módulo `periodos-fiscales` NO puede escribir ni leer directamente tablas del módulo `comprobantes`. Toda interacción cross-módulo pasa por puertos.

### 5.1 ComprobantesLockPort

Definido en el módulo `comprobantes`, consumido por `periodos-fiscales`:

```typescript
// comprobantes/ports/comprobantes-lock.port.ts
export abstract class ComprobantesLockPort {
  abstract bloquearPorPeriodo(tx: PrismaTx, periodoId: string): Promise<number>;
  abstract desbloquearPorPeriodo(tx: PrismaTx, periodoId: string): Promise<number>;
  abstract contarBorradoresEnPeriodo(tx: PrismaTx, periodoId: string): Promise<number>;
  abstract obtenerResumenEnPeriodo(tx: PrismaTx, periodoId: string): Promise<ResumenPeriodo>;
}

export interface ResumenPeriodo {
  contabilizados: number;
  borradores: number;
  anulados: number;
  totalDebeBob: string;
  totalHaberBob: string;
  borradoresList: Array<{
    id: string;
    fechaContable: string;
    glosa: string;
    totalBob: string;
  }>;
}
```

### 5.2 Helper puro: rangoCalendario

```typescript
// common/domain/rango-periodo-fiscal.ts
export function rangoCalendario(year: number, month: number): { inicio: string; fin: string } {
  const inicio = `${year}-${String(month).padStart(2, '0')}-01`;
  const ultimoDia = diasEnMes(year, month);
  const fin = `${year}-${String(month).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  return { inicio, fin };
}

function diasEnMes(year: number, month: number): number {
  if (month === 2) {
    return esBisiesto(year) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

function esBisiesto(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
```

Funciones puras, testeables, sin `Date` nativo, sin problemas de timezone.

---

## 6. Endpoints

### 6.1 Gestiones

| Método | Path | Permiso | Propósito |
|---|---|---|---|
| `POST` | `/api/gestiones` | `contabilidad.gestiones.create` | Crear gestión; genera los 12 períodos automáticamente |
| `GET` | `/api/gestiones` | `contabilidad.gestiones.read` | Listar (filtro `?status=ABIERTA`) |
| `GET` | `/api/gestiones/:id` | `contabilidad.gestiones.read` | Detalle con períodos incluidos |
| `POST` | `/api/gestiones/:id/cerrar` | `contabilidad.gestiones.cerrar` | Valida los 12 períodos cerrados y cierra |

### 6.2 Períodos

| Método | Path | Permiso | Propósito |
|---|---|---|---|
| `GET` | `/api/periodos` | `contabilidad.periodos.read` | Listar (filtros `?gestionId=x&status=ABIERTO`) |
| `GET` | `/api/periodos/:id` | `contabilidad.periodos.read` | Detalle |
| `GET` | `/api/periodos/:id/resumen-precierre` | `contabilidad.periodos.read` | Resumen antes de cerrar |
| `POST` | `/api/periodos/:id/cerrar` | `contabilidad.periodos.cerrar` | Cerrar (valida 0 borradores) |
| `POST` | `/api/periodos/:id/reabrir` | `contabilidad.periodos.reabrir` | Solo OWNER/ADMIN, body: `{ motivo }` |
| `POST` | `/api/periodos/:id/marcar-definitivo` | `contabilidad.periodos.marcar-definitivo` | Solo OWNER, hace irreversible |

### 6.3 Body de creación de gestión

```json
POST /api/gestiones
{
  "year": 2026
}
```

**`mesInicio` NO se envía desde el cliente** — se deriva del `tipoEmpresaPrincipal` del tenant.

Response:

```json
{
  "id": "uuid",
  "year": 2026,
  "mesInicio": 4,
  "mesCierre": 3,
  "status": "ABIERTA",
  "tipoEmpresaPrincipal": "INDUSTRIAL",
  "fechaInicio": "2026-04-01",
  "fechaFin": "2027-03-31",
  "periodos": [
    {
      "id": "uuid",
      "year": 2026,
      "month": 4,
      "ordenEnGestion": 1,
      "status": "ABIERTO",
      "fechaInicio": "2026-04-01",
      "fechaFin": "2026-04-30"
    }
  ]
}
```

### 6.4 Endpoint: resumen pre-cierre

Es el endpoint más importante de UX. Le da confianza al contador antes de cerrar.

**Response:**

```json
{
  "periodo": {
    "id": "uuid",
    "year": 2026,
    "month": 4,
    "ordenEnGestion": 1,
    "fechaInicio": "2026-04-01",
    "fechaFin": "2026-04-30"
  },
  "comprobantes": {
    "contabilizados": 127,
    "borradores": 5,
    "anulados": 3
  },
  "totalesBob": {
    "totalDebe": "1234567.89",
    "totalHaber": "1234567.89",
    "balanceado": true
  },
  "borradoresPendientes": [
    {
      "id": "uuid",
      "numero": null,
      "fechaContable": "2026-04-15",
      "glosa": "Venta a cliente X",
      "total": "500.00"
    }
  ],
  "puedeCerrar": false,
  "razonNoPuedeCerrar": "Hay 5 comprobantes en borrador. Contabilízalos o elimínalos antes de cerrar."
}
```

El frontend muestra el resumen con links clickeables a cada borrador pendiente. El botón "Cerrar período" aparece habilitado solo si `puedeCerrar: true`.

---

## 7. Invariantes críticos

### 7.1 Al crear gestión

- El tenant debe tener `tipoEmpresaPrincipal` definido.
- `mesInicio` se deriva automáticamente de `tipoEmpresaPrincipal` (no se acepta input del cliente).
- No puede existir otra gestión con el mismo `(organizationId, year)`.
- Se crean exactamente 12 períodos automáticamente.
- Todos los períodos nacen en `ABIERTO`.
- Los `year` y `month` de cada período reflejan el año y mes calendario reales.

### 7.2 Al cerrar período

- No debe haber comprobantes en `BORRADOR` dentro del período (validado vía `ComprobantesLockPort.contarBorradoresEnPeriodo`).
- Todos los comprobantes `CONTABILIZADO` pasan a `BLOQUEADO` atómicamente (misma transacción, vía `ComprobantesLockPort.bloquearPorPeriodo`).
- Período pasa a `CERRADO`.
- Campos `closedAt` y `closedByUserId` se setean.

### 7.3 Al reabrir período

- Solo si `esDefinitivo: false`.
- Solo OWNER o ADMIN (verificado por RBAC).
- Requiere motivo no vacío (mínimo 20 caracteres).
- Se crea fila en `PeriodoFiscalReopening`.
- Período vuelve a `ABIERTO`.
- Comprobantes `BLOQUEADO` del período vuelven a `CONTABILIZADO` (vía `ComprobantesLockPort.desbloquearPorPeriodo`).

### 7.4 Al marcar definitivo

- Solo período en estado `CERRADO`.
- Solo OWNER.
- Una vez marcado, no hay endpoint de "desmarcar". Irreversible por diseño.

### 7.5 Al cerrar gestión

- Los 12 períodos deben estar `CERRADO`.
- Si alguno está `ABIERTO`, rechaza con listado de pendientes (`GESTION_CON_PERIODOS_ABIERTOS`).
- No genera asientos automáticos (diferido a Fase 1.5).

### 7.6 Al crear/editar comprobante (Fase 1.3)

*Nota para Fase 1.3 — anotado acá para referencia cruzada:*

- `Comprobante.periodoFiscalId` es FK NOT NULL.
- Se calcula al write basado en `fechaContable` + gestión activa del tenant.
- Es inmutable tras primer `CONTABILIZADO` (Anti-13 del CLAUDE.md).
- `fechaContable` debe estar dentro de un período `ABIERTO` del tenant.
- Si el período está `CERRADO`: `PERIODO_CERRADO`.
- Si no existe período para esa fecha: `GESTION_NO_ABIERTA`.

---

## 8. Códigos de error

| Código | HTTP | Módulo | Cuándo |
|---|---|---|---|
| `GESTION_DUPLICADA` | 409 | gestiones | Ya existe gestión para `(tenant, year)` |
| `GESTION_NO_ENCONTRADA` | 404 | gestiones | ID inválido |
| `GESTION_CON_PERIODOS_ABIERTOS` | 422 | gestiones | Intento de cerrar con períodos abiertos |
| `GESTION_NO_ABIERTA` | 422 | comprobante | Comprobante con fecha fuera de gestiones existentes |
| `TENANT_SIN_TIPO_EMPRESA` | 422 | gestiones | Tenant sin `tipoEmpresaPrincipal` definido |
| `PERIODO_NO_ENCONTRADO` | 404 | periodos | ID inválido |
| `PERIODO_CERRADO` | 409 | periodos | Operación en período cerrado |
| `PERIODO_CON_BORRADORES` | 422 | periodos | Intento de cerrar con borradores pendientes |
| `PERIODO_DEFINITIVO_NO_REABRIBLE` | 409 | periodos | Intento de reabrir período marcado definitivo |
| `PERIODO_YA_ABIERTO` | 409 | periodos | Intento de reabrir período ya abierto |
| `MOTIVO_REAPERTURA_INVALIDO` | 400 | periodos | Motivo vacío o menos de 20 caracteres |
| `SOLO_OWNER_ADMIN_PUEDE_REABRIR` | 403 | periodos | Rol insuficiente |
| `SOLO_OWNER_PUEDE_MARCAR_DEFINITIVO` | 403 | periodos | Rol insuficiente |

---

## 9. Scope de Fase 1.2 vs Fase 1.5+

| Feature | Fase 1.2 | Fase 1.5+ |
|---|---|---|
| Crear gestión con 12 períodos auto | ✅ | — |
| `mesInicio` derivado del tipo de empresa | ✅ | — |
| Cerrar período mensual | ✅ | — |
| Resumen pre-cierre de período | ✅ | — |
| Reabrir período (con motivo) | ✅ | — |
| Marcar período definitivo | ✅ | — |
| Cerrar gestión (validando 12 períodos) | ✅ (sin asientos auto) | — |
| Wizard de cierre con asientos automáticos | — | ✅ |
| Asiento automático de cierre de resultados | — | ✅ |
| Distribución de resultados (Reserva Legal, Dividendos) | — | ✅ |
| Comprobante de apertura automático en nueva gestión | — | ✅ |
| Asistentes separados (depreciación, ajustes) | — | ✅ |

---

## 10. Permisos RBAC involucrados

Nuevos permisos a agregar al catálogo:

```typescript
export const CATALOGO_PERMISOS = {
  contabilidad: {
    gestiones: ['read', 'create', 'cerrar'],
    periodos: ['read', 'cerrar', 'reabrir', 'marcar-definitivo'],
  },
};
```

### 10.1 Distribución sugerida por rol

| Rol | Permisos de gestiones/períodos |
|---|---|
| OWNER | Todos (incluye `marcar-definitivo`) |
| ADMIN | Todos excepto `marcar-definitivo` |
| CONTADOR SENIOR | `read`, `create`, `cerrar` (no `reabrir`) |
| CONTADOR JUNIOR | `read` solamente |
| AUDITOR EXTERNO | `read` solamente |

---

## 11. Implementación de servicios clave

### 11.1 Crear gestión

```typescript
async crearGestion(tenantId: string, year: number, userId: string) {
  return this.prisma.$transaction(async (tx) => {
    // Obtener tipo de empresa del tenant
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: tenantId },
      select: { tipoEmpresaPrincipal: true },
    });
    
    if (!org.tipoEmpresaPrincipal) {
      throw new TenantSinTipoEmpresaError(tenantId);
    }
    
    const { mesInicio } = CIERRE_FISCAL_POR_TIPO[org.tipoEmpresaPrincipal];
    
    // Validar unicidad
    const existente = await tx.gestionFiscal.findUnique({
      where: { organizationId_year: { organizationId: tenantId, year } },
    });
    if (existente) {
      throw new GestionDuplicadaError(tenantId, year);
    }
    
    // Crear gestión
    const gestion = await tx.gestionFiscal.create({
      data: {
        organizationId: tenantId,
        year,
        mesInicio,
        status: 'ABIERTA',
      },
    });
    
    // Generar 12 períodos
    const periodos = [];
    for (let i = 0; i < 12; i++) {
      const mesReal = ((mesInicio - 1 + i) % 12) + 1;
      const yearReal = mesInicio + i > 12 ? year + 1 : year;
      
      periodos.push({
        organizationId: tenantId,
        gestionId: gestion.id,
        year: yearReal,
        month: mesReal,
        ordenEnGestion: i + 1,
        status: 'ABIERTO' as const,
      });
    }
    
    await tx.periodoFiscal.createMany({ data: periodos });
    
    return tx.gestionFiscal.findUniqueOrThrow({
      where: { id: gestion.id },
      include: { periodos: { orderBy: { ordenEnGestion: 'asc' } } },
    });
  });
}
```

### 11.2 Cerrar período (con encapsulamiento correcto)

```typescript
async cerrarPeriodo(periodoId: string, userId: string) {
  return this.prisma.$transaction(async (tx) => {
    const periodo = await tx.periodoFiscal.findUniqueOrThrow({ 
      where: { id: periodoId } 
    });
    
    if (periodo.status === 'CERRADO') {
      throw new PeriodoCerradoError(periodoId);
    }
    
    // Validar via port — NO acceso directo a tabla comprobantes
    const borradores = await this.comprobantesLock.contarBorradoresEnPeriodo(tx, periodoId);
    
    if (borradores > 0) {
      throw new PeriodoConBorradoresError(periodoId, borradores);
    }
    
    // Bloquear comprobantes via port
    await this.comprobantesLock.bloquearPorPeriodo(tx, periodoId);
    
    // Actualizar el período
    return tx.periodoFiscal.update({
      where: { id: periodoId },
      data: {
        status: 'CERRADO',
        closedAt: new Date(),
        closedByUserId: userId,
      },
    });
  });
}
```

### 11.3 Reabrir período

```typescript
async reabrirPeriodo(periodoId: string, userId: string, motivo: string) {
  if (motivo.trim().length < 20) {
    throw new MotivoReaperturaInvalidoError();
  }
  
  return this.prisma.$transaction(async (tx) => {
    const periodo = await tx.periodoFiscal.findUniqueOrThrow({ 
      where: { id: periodoId } 
    });
    
    if (periodo.esDefinitivo) {
      throw new PeriodoDefinitivoNoReabribleError(periodoId);
    }
    
    if (periodo.status === 'ABIERTO') {
      throw new PeriodoYaAbiertoError(periodoId);
    }
    
    // Crear registro de reapertura
    await tx.periodoFiscalReopening.create({
      data: {
        periodoId,
        reopenedByUserId: userId,
        motivo,
      },
    });
    
    // Desbloquear comprobantes via port
    await this.comprobantesLock.desbloquearPorPeriodo(tx, periodoId);
    
    // Reabrir período
    return tx.periodoFiscal.update({
      where: { id: periodoId },
      data: {
        status: 'ABIERTO',
        closedAt: null,
        closedByUserId: null,
      },
    });
  });
}
```

### 11.4 Cerrar gestión

```typescript
async cerrarGestion(gestionId: string, userId: string) {
  return this.prisma.$transaction(async (tx) => {
    const gestion = await tx.gestionFiscal.findUniqueOrThrow({
      where: { id: gestionId },
      include: { periodos: true },
    });
    
    if (gestion.status === 'CERRADA') {
      throw new GestionYaCerradaError(gestionId);
    }
    
    const periodosAbiertos = gestion.periodos.filter(p => p.status === 'ABIERTO');
    
    if (periodosAbiertos.length > 0) {
      throw new GestionConPeriodosAbiertosError(
        gestionId,
        periodosAbiertos.map(p => ({ year: p.year, month: p.month, orden: p.ordenEnGestion })),
      );
    }
    
    return tx.gestionFiscal.update({
      where: { id: gestionId },
      data: {
        status: 'CERRADA',
        closedAt: new Date(),
        closedByUserId: userId,
      },
    });
  });
}
```

---

## 12. Tests obligatorios

### 12.1 Tests de integración con Postgres real

**Creación de gestión:**

| Caso | Valida |
|---|---|
| Crear gestión para tenant COMERCIAL → mesInicio=1, primer período=enero | Derivación correcta |
| Crear gestión para tenant INDUSTRIAL → mesInicio=4, primer período=abril año gestión | Derivación correcta |
| Crear gestión para tenant AGROPECUARIA → mesInicio=7, último período=junio año+1 | Cruce de año |
| Crear gestión para tenant MINERA → mesInicio=10, último período=septiembre año+1 | Cruce de año |
| year=2026 + mesInicio=4 → períodos incluyen meses de 2026 y 2027 con year calendario correcto | Year real en cada período |
| Crear gestión sin tipoEmpresaPrincipal → rechaza con TENANT_SIN_TIPO_EMPRESA | Validación de precondición |
| Crear gestión duplicada (mismo year) → rechaza con GESTION_DUPLICADA | Unicidad |
| Se generan exactamente 12 períodos | Creación automática |

**Cierre de período:**

| Caso | Valida |
|---|---|
| Cerrar período sin borradores → exitoso, comprobantes pasan a BLOQUEADO | Atomicidad del cierre |
| Cerrar período con 1 borrador → rechaza con PERIODO_CON_BORRADORES | Validación pre-cierre |
| Resumen pre-cierre devuelve conteo correcto de comprobantes | Funcionalidad del endpoint |
| Cierre usa ComprobantesLockPort, no acceso directo a tabla comprobantes | Encapsulamiento |

**Reapertura:**

| Caso | Valida |
|---|---|
| Reabrir período no-definitivo con motivo válido → exitoso | Flujo de reapertura |
| Reabrir período definitivo → rechaza con PERIODO_DEFINITIVO_NO_REABRIBLE | Irreversibilidad |
| Reabrir con motivo menor a 20 caracteres → rechaza | Validación de motivo |
| Se crea fila en PeriodoFiscalReopening | Auditoría |
| Reabrir desbloquea comprobantes vía port | Encapsulamiento |

**Cierre definitivo:**

| Caso | Valida |
|---|---|
| Marcar definitivo período abierto → rechaza | Estado correcto |
| Marcar definitivo período cerrado → exitoso, esDefinitivo=true | Flujo correcto |
| Intentar reabrir período definitivo → rechaza | Irreversibilidad confirmada |

**Cierre de gestión:**

| Caso | Valida |
|---|---|
| Cerrar gestión con 11 períodos cerrados y 1 abierto → rechaza con listado | Validación completa |
| Cerrar gestión con los 12 períodos cerrados → exitoso | Happy path |
| Cerrar gestión ya cerrada → rechaza | Estado correcto |

**Integración con comprobantes:**

| Caso | Valida |
|---|---|
| Crear comprobante en fecha de período cerrado → rechaza con PERIODO_CERRADO | Protección cross-módulo |
| Crear comprobante en fecha sin gestión → rechaza con GESTION_NO_ABIERTA | Validación de contexto |

### 12.2 Tests unitarios puros

- `calcularMesInicio(COMERCIAL)` retorna 1.
- `calcularMesInicio(INDUSTRIAL)` retorna 4.
- `calcularMesInicio(AGROPECUARIA)` retorna 7.
- `calcularMesInicio(MINERA)` retorna 10.
- `rangoCalendario(2026, 2)` retorna `{ inicio: "2026-02-01", fin: "2026-02-28" }`.
- `rangoCalendario(2024, 2)` (año bisiesto) retorna `{ inicio: "2024-02-01", fin: "2024-02-29" }`.
- `rangoCalendario(2026, 4)` retorna fin "2026-04-30".
- `rangoCalendario(2026, 1)` retorna fin "2026-01-31".
- Validación de motivo de reapertura: rechaza vacío, rechaza menor a 20 chars, acepta ≥20 chars.
- Generación de períodos para mesInicio=4 y year=2026:
  - orden 1: year=2026, month=4
  - orden 9: year=2026, month=12
  - orden 10: year=2027, month=1
  - orden 12: year=2027, month=3

---

## 13. Resumen ejecutivo

| Aspecto | Decisión |
|---|---|
| **Estados del período** | 2: `ABIERTO`, `CERRADO` |
| **Irreversibilidad** | Flag `esDefinitivo: boolean` en período cerrado |
| **Creación de períodos** | Automática al crear gestión (los 12 a la vez) |
| **mesInicio** | Derivado del `tipoEmpresaPrincipal` del tenant (Art. 46 Ley 843) |
| **Inicio tardío de operaciones** | Cerrar manualmente los meses vacíos previos |
| **Reapertura** | Solo OWNER/ADMIN, motivo obligatorio ≥20 chars, auditado en `PeriodoFiscalReopening` |
| **Cierre de gestión** | Solo valida los 12 períodos cerrados; sin asientos auto en Fase 1.2 |
| **Asientos automáticos de cierre** | Diferido a Fase 1.5 con wizard dedicado |
| **Atomicidad** | Todo cambio de estado ocurre en transacción única |
| **Encapsulamiento** | Acceso a comprobantes solo via `ComprobantesLockPort` |
| **Fechas** | Helper puro `rangoCalendario()`, sin `Date` nativo, sin `fechaInicio/fechaFin` persistidos |
| **Auditoría** | Cada reapertura registrada; cada edición durante reapertura marcada |

## 14. Observaciones aplicadas del review

Este documento incorpora los siguientes ajustes solicitados:

- **O1 (Encapsulamiento):** acceso a comprobantes via `ComprobantesLockPort`, no `tx.comprobante.updateMany` directo.
- **O2 (Fechas):** sin `fechaInicio` y `fechaFin` persistidos; helper puro `rangoCalendario()`.
- **O3 (mesInicio):** derivado del tipo de empresa, no input del usuario.
- **O5 (Naming año):** distinción clara entre `GestionFiscal.year` (año fiscal) y `PeriodoFiscal.year` (año calendario real).
- **O6 (Permiso unificado):** endpoint y permiso usan `marcar-definitivo` consistente.
- **O7 (Motivo):** mínimo 20 caracteres para reapertura.
- **Art. 46 Ley 843:** mapeo explícito de cierre fiscal por tipo de empresa integrado al diseño.
