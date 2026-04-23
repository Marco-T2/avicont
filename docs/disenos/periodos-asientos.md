# Gestiones y Períodos Fiscales — Fase 1.2

Documento de referencia para la implementación del módulo de gestiones y períodos fiscales. Sigue el dominio contable boliviano y se integra con el módulo de comprobantes (Fase 1.3).

---

## 1. Conceptos

**Gestión Fiscal** — Ejercicio anual. Contenedor de los 12 períodos mensuales. Típicamente de enero a diciembre en Bolivia, pero configurable por `mesInicio`.

**Período Fiscal** — Mes calendario dentro de una gestión. Es la unidad operativa donde se registran comprobantes. Se cierra mensualmente para consolidar operaciones.

**Reapertura** — Acción excepcional y auditada que devuelve un período cerrado al estado `ABIERTO` para correcciones. Solo OWNER/ADMIN.

**Cierre definitivo** — Flag que marca un período como irreversible (ej. período declarado al SIN). Un período definitivo no puede reabrirse por ningún medio.

---

## 2. Flujo operativo completo

### 2.1 Inicio de operaciones

El tenant crea su primera `GestionFiscal` (ej. 2026). El sistema genera automáticamente los 12 períodos mensuales en estado `ABIERTO`.

```
Gestión 2026 (ABIERTA)
├── Período 2026-01 (01/01/2026 → 31/01/2026) — ABIERTO
├── Período 2026-02 (01/02/2026 → 28/02/2026) — ABIERTO
├── Período 2026-03 (01/03/2026 → 31/03/2026) — ABIERTO
├── Período 2026-04 (01/04/2026 → 30/04/2026) — ABIERTO
├── ...
└── Período 2026-12 — ABIERTO
```

### 2.2 Caso: inicio tardío de operaciones

Si la empresa empieza a operar en abril (no en enero):

1. Tenant registra un comprobante de apertura en abril con los saldos iniciales (balance de apertura).
2. Los meses enero, febrero, marzo **existen pero están vacíos** (0 comprobantes).
3. Tenant va a "Cerrar período" para cada uno de los meses enero, febrero, marzo individualmente.
4. El sistema valida: "0 comprobantes en borrador, 0 contabilizados" → permite cerrar un período vacío sin problema.
5. Queda el histórico: "enero 2026 cerrado sin movimientos" — trazabilidad intacta.

### 2.3 Operación normal durante el mes

Durante un mes con período abierto (ej. abril):

- Tenant registra comprobantes con `fechaContable` dentro del período.
- Estados de comprobantes fluyen: `BORRADOR` → `CONTABILIZADO`.
- Todo editable/modificable/anulable **mientras el período esté `ABIERTO`**.
- Cada edición deja auditoría con timestamp, usuario, diff de cambios.

### 2.4 Cierre de período al final del mes

Tenant va a "Cerrar período abril":

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

### 2.5 Intentos de operar fuera de período cerrado

- Nuevo comprobante con `fechaContable` en un período `CERRADO` → rechazado con `PERIODO_CERRADO`.
- Edición de comprobante `BLOQUEADO` → rechazado con `COMPROBANTE_BLOQUEADO`.
- Único camino para modificar algo del período cerrado: reapertura.

### 2.6 Reapertura de período

Solo OWNER o ADMIN puede:

1. Va a "Reabrir período abril".
2. Debe ingresar un motivo obligatorio (mínimo 20 caracteres).
3. Sistema registra en `PeriodoFiscalReopening` con timestamp, usuario, motivo.
4. Período vuelve a `ABIERTO`, comprobantes vuelven a `CONTABILIZADO` (desbloqueados).
5. Durante la ventana de reapertura, todas las ediciones se auditan con marca "durante reapertura".
6. Cuando se vuelve a cerrar, se actualiza `reclosedAt` en la tabla de reapertura.

### 2.7 Cierre de gestión

Al cerrar los 12 meses:

1. Tenant va a "Cerrar gestión 2026".
2. Sistema valida que los 12 períodos estén `CERRADO`.
3. Si alguno está abierto: rechaza con listado de períodos pendientes.
4. Gestión pasa a `CERRADA`.

**En Fase 1.2 NO se generan asientos automáticos de cierre.** La generación automática de asientos (depreciación, cierre de resultados, apertura de gestión siguiente) queda para Fase 1.5 con wizard dedicado.

---

## 3. Modelo de datos (Prisma)

### 3.1 GestionFiscal

```prisma
model GestionFiscal {
  id              String   @id @default(uuid())
  organizationId  String
  year            Int
  mesInicio       Int      @default(1)
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

### 3.2 PeriodoFiscal

```prisma
model PeriodoFiscal {
  id               String   @id @default(uuid())
  organizationId   String
  gestionId        String
  year             Int
  month            Int
  fechaInicio      DateTime @db.Date
  fechaFin         DateTime @db.Date
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
  @@index([organizationId, status])
  @@index([gestionId])
  @@map("periodos_fiscales")
}

enum PeriodoFiscalStatus {
  ABIERTO
  CERRADO
}
```

### 3.3 PeriodoFiscalReopening

```prisma
model PeriodoFiscalReopening {
  id                 String   @id @default(uuid())
  periodoId          String
  reopenedAt         DateTime @default(now())
  reopenedByUserId   String
  motivo             String
  reclosedAt         DateTime?
  reclosedByUserId   String?
  
  periodo            PeriodoFiscal @relation(fields: [periodoId], references: [id])
  
  @@index([periodoId])
  @@map("periodo_fiscal_reopenings")
}
```

---

## 4. Endpoints

### 4.1 Gestiones

| Método | Path | Permiso | Propósito |
|---|---|---|---|
| `POST` | `/api/gestiones` | `contabilidad.gestiones.create` | Crear gestión; genera los 12 períodos |
| `GET` | `/api/gestiones` | `contabilidad.gestiones.read` | Listar (filtro `?status=ABIERTA`) |
| `GET` | `/api/gestiones/:id` | `contabilidad.gestiones.read` | Detalle con períodos incluidos |
| `POST` | `/api/gestiones/:id/cerrar` | `contabilidad.gestiones.cerrar` | Valida los 12 períodos cerrados y cierra |

### 4.2 Períodos

| Método | Path | Permiso | Propósito |
|---|---|---|---|
| `GET` | `/api/periodos` | `contabilidad.periodos.read` | Listar (filtros `?gestionId=x&status=ABIERTO`) |
| `GET` | `/api/periodos/:id` | `contabilidad.periodos.read` | Detalle |
| `GET` | `/api/periodos/:id/resumen-precierre` | `contabilidad.periodos.read` | Resumen antes de cerrar |
| `POST` | `/api/periodos/:id/cerrar` | `contabilidad.periodos.cerrar` | Cerrar (valida 0 borradores) |
| `POST` | `/api/periodos/:id/reabrir` | `contabilidad.periodos.reabrir` | Solo OWNER/ADMIN, body: `{ motivo }` |
| `POST` | `/api/periodos/:id/marcar-definitivo` | `contabilidad.periodos.bloquear` | Solo OWNER, hace irreversible |

### 4.3 Endpoint: resumen pre-cierre

Es el endpoint más importante de UX. Le da confianza al contador antes de cerrar.

**Response:**

```json
{
  "periodo": {
    "id": "uuid",
    "year": 2026,
    "month": 4,
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

## 5. Invariantes críticos

### 5.1 Al crear gestión

- No puede existir otra gestión con el mismo `(organizationId, year)`.
- Se crean exactamente 12 períodos automáticamente.
- Todos los períodos nacen en `ABIERTO`.
- Las fechas `fechaInicio` y `fechaFin` se calculan según calendario (respetando años bisiestos en febrero).

### 5.2 Al cerrar período

- No debe haber comprobantes en `BORRADOR` dentro del período.
- Todos los comprobantes `CONTABILIZADO` pasan a `BLOQUEADO` atómicamente (misma transacción).
- Período pasa a `CERRADO`.
- Campos `closedAt` y `closedByUserId` se setean.

### 5.3 Al reabrir período

- Solo si `esDefinitivo: false`.
- Solo OWNER o ADMIN (verificado por RBAC).
- Requiere motivo no vacío (mínimo 20 caracteres).
- Se crea fila en `PeriodoFiscalReopening`.
- Período vuelve a `ABIERTO`.
- Comprobantes `BLOQUEADO` del período vuelven a `CONTABILIZADO`.

### 5.4 Al marcar definitivo

- Solo período en estado `CERRADO`.
- Solo OWNER.
- Una vez marcado, no hay endpoint de "desmarcar". Irreversible por diseño.

### 5.5 Al cerrar gestión

- Los 12 períodos deben estar `CERRADO`.
- Si alguno está `ABIERTO`, rechaza con listado de pendientes (`GESTION_CON_PERIODOS_ABIERTOS`).
- No genera asientos automáticos (diferido a Fase 1.5).

### 5.6 Al crear/editar comprobante

- `fechaContable` debe estar dentro de un período `ABIERTO` del tenant.
- Si el período está `CERRADO`: `PERIODO_CERRADO`.
- Si no existe período para esa fecha: `GESTION_NO_ABIERTA`.

---

## 6. Códigos de error

| Código | HTTP | Módulo | Cuándo |
|---|---|---|---|
| `GESTION_DUPLICADA` | 409 | gestiones | Ya existe gestión para `(tenant, year)` |
| `GESTION_NO_ENCONTRADA` | 404 | gestiones | ID inválido |
| `GESTION_CON_PERIODOS_ABIERTOS` | 422 | gestiones | Intento de cerrar con períodos abiertos |
| `GESTION_NO_ABIERTA` | 422 | comprobante | Comprobante con fecha fuera de gestiones existentes |
| `PERIODO_NO_ENCONTRADO` | 404 | periodos | ID inválido |
| `PERIODO_CERRADO` | 409 | periodos | Operación en período cerrado |
| `PERIODO_CON_BORRADORES` | 422 | periodos | Intento de cerrar con borradores pendientes |
| `PERIODO_DEFINITIVO_NO_REABRIBLE` | 409 | periodos | Intento de reabrir período marcado definitivo |
| `PERIODO_YA_ABIERTO` | 409 | periodos | Intento de reabrir período ya abierto |
| `MOTIVO_REAPERTURA_INVALIDO` | 400 | periodos | Motivo vacío o < 20 caracteres |
| `SOLO_OWNER_ADMIN_PUEDE_REABRIR` | 403 | periodos | Rol insuficiente |
| `SOLO_OWNER_PUEDE_MARCAR_DEFINITIVO` | 403 | periodos | Rol insuficiente |

---

## 7. Scope de Fase 1.2 vs Fase 1.5+

| Feature | Fase 1.2 | Fase 1.5+ |
|---|---|---|
| Crear gestión con 12 períodos auto | ✅ | — |
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

## 8. Permisos RBAC involucrados

Nuevos permisos a agregar al catálogo:

```typescript
export const CATALOGO_PERMISOS = {
  contabilidad: {
    // ...
    gestiones: ['read', 'create', 'cerrar'],
    periodos: ['read', 'cerrar', 'reabrir', 'bloquear'],
  },
};
```

### 8.1 Distribución sugerida por rol

| Rol | Permisos de gestiones/períodos |
|---|---|
| OWNER | Todos (incluye `bloquear` para marcar definitivo) |
| ADMIN | Todos excepto `bloquear` |
| CONTADOR SENIOR | `read`, `create`, `cerrar` |
| CONTADOR JUNIOR | `read` solamente |
| AUDITOR EXTERNO | `read` solamente |

---

## 9. Consideraciones de implementación

### 9.1 Atomicidad del cierre de período

El cierre de período debe ocurrir en una transacción única:

```ts
async cerrarPeriodo(periodoId: string, userId: string) {
  return this.prisma.$transaction(async (tx) => {
    const periodo = await tx.periodoFiscal.findUniqueOrThrow({ where: { id: periodoId } });
    
    if (periodo.status === 'CERRADO') {
      throw new PeriodoCerradoError(periodoId);
    }
    
    // Validar que no hay borradores
    const borradores = await tx.comprobante.count({
      where: { periodoFiscalId: periodoId, estado: 'BORRADOR' },
    });
    
    if (borradores > 0) {
      throw new PeriodoConBorradoresError(periodoId, borradores);
    }
    
    // Atomic: todos los comprobantes CONTABILIZADO → BLOQUEADO
    await tx.comprobante.updateMany({
      where: { periodoFiscalId: periodoId, estado: 'CONTABILIZADO' },
      data: { estado: 'BLOQUEADO' },
    });
    
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

### 9.2 Atomicidad de la reapertura

```ts
async reabrirPeriodo(periodoId: string, userId: string, motivo: string) {
  if (motivo.trim().length < 20) {
    throw new MotivoReaperturaInvalidoError();
  }
  
  return this.prisma.$transaction(async (tx) => {
    const periodo = await tx.periodoFiscal.findUniqueOrThrow({ where: { id: periodoId } });
    
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
    
    // Desbloquear comprobantes
    await tx.comprobante.updateMany({
      where: { periodoFiscalId: periodoId, estado: 'BLOQUEADO' },
      data: { estado: 'CONTABILIZADO' },
    });
    
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

### 9.3 Generación de los 12 períodos al crear gestión

```ts
async crearGestion(tenantId: string, year: number, mesInicio: number = 1) {
  return this.prisma.$transaction(async (tx) => {
    const gestion = await tx.gestionFiscal.create({
      data: {
        organizationId: tenantId,
        year,
        mesInicio,
        status: 'ABIERTA',
      },
    });
    
    const periodos = [];
    for (let mes = 1; mes <= 12; mes++) {
      const fechaInicio = new Date(year, mes - 1, 1);
      const fechaFin = new Date(year, mes, 0); // último día del mes
      
      periodos.push({
        organizationId: tenantId,
        gestionId: gestion.id,
        year,
        month: mes,
        fechaInicio,
        fechaFin,
        status: 'ABIERTO' as const,
      });
    }
    
    await tx.periodoFiscal.createMany({ data: periodos });
    
    return tx.gestionFiscal.findUniqueOrThrow({
      where: { id: gestion.id },
      include: { periodos: true },
    });
  });
}
```

### 9.4 Auditoría durante reapertura

Todo comprobante editado mientras su período está en reapertura debe llevar una marca en el registro de auditoría:

```ts
// En el servicio de comprobantes, al editar
const periodoActivoReapertura = await this.periodoRepo.reaperturaActiva(comprobante.periodoFiscalId);

await this.auditoriaRepo.create({
  comprobanteId,
  usuarioId: userId,
  accion: 'EDITADO',
  cambios: diff,
  fueDuranteReapertura: !!periodoActivoReapertura,
  reaperturaId: periodoActivoReapertura?.id ?? null,
});
```

---

## 10. Tests obligatorios

### 10.1 Tests de integración con Postgres real

| Caso | Invariante que valida |
|---|---|
| Crear gestión → se generan exactamente 12 períodos | Creación automática |
| Crear gestión duplicada (mismo year) → rechaza | Unicidad |
| Cerrar período sin borradores → exitoso, comprobantes pasan a BLOQUEADO | Atomicidad del cierre |
| Cerrar período con 1 borrador → rechaza con `PERIODO_CON_BORRADORES` | Validación pre-cierre |
| Reabrir período no-definitivo con motivo válido → exitoso | Flujo de reapertura |
| Reabrir período definitivo → rechaza con `PERIODO_DEFINITIVO_NO_REABRIBLE` | Irreversibilidad |
| Reabrir con motivo < 20 caracteres → rechaza | Validación de motivo |
| Marcar definitivo período abierto → rechaza | Estado correcto |
| Cerrar gestión con 11 períodos cerrados y 1 abierto → rechaza con listado | Validación completa |
| Cerrar gestión con los 12 períodos cerrados → exitoso | Happy path |
| Crear comprobante en fecha de período cerrado → rechaza con `PERIODO_CERRADO` | Protección cross-módulo |
| Crear comprobante en fecha sin gestión → rechaza con `GESTION_NO_ABIERTA` | Validación de contexto |

### 10.2 Tests unitarios

- Cálculo correcto de `fechaInicio` y `fechaFin` para cada mes (incluyendo febrero bisiesto).
- Validación de formato de motivo de reapertura.
- Transición de estados válida.

---

## 11. Resumen ejecutivo

| Aspecto | Decisión |
|---|---|
| **Estados del período** | 2: `ABIERTO`, `CERRADO` |
| **Irreversibilidad** | Flag `esDefinitivo: boolean` en período cerrado |
| **Creación de períodos** | Automática al crear gestión (los 12 a la vez) |
| **Inicio tardío de operaciones** | Cerrar manualmente los meses vacíos |
| **Reapertura** | Solo OWNER/ADMIN, motivo obligatorio, auditado en `PeriodoFiscalReopening` |
| **Cierre de gestión** | Solo valida los 12 períodos cerrados; sin asientos auto en Fase 1.2 |
| **Asientos automáticos de cierre** | Diferido a Fase 1.5 con wizard dedicado |
| **Atomicidad** | Todo cambio de estado ocurre en transacción única |
| **Auditoría** | Cada reapertura registrada; cada edición durante reapertura marcada |
