# Design: Informe de conciliación bancaria

## Technical Approach

Servicio de LECTURA PURA en `conciliacion-bancaria` que arma la identidad de
REQ-ICB-01 a partir de tres fuentes, dos de ellas **ya existentes**. El único
estado nuevo es el punto de arranque (REQ-ICB-04), que se escribe por comando
explícito y nunca como efecto de una lectura.

## Architecture Decisions

### D1 — Lado libros: método agregado en `LineasCuentaReaderPort`

| Opción | Tradeoff | Decisión |
|---|---|---|
| `EeffSaldosReaderPort.obtenerSaldosHasta` | Existe, pero **solo BOB**, agrupa el plan ENTERO y abre dependencia nueva hacia `reportes` | ✗ |
| Método nuevo en `LineasCuentaReaderPort` | 3er método en un port que se declaró de "superficie mínima" | **✓** |
| Sumar `listarPorCuentaEnRango` en Node | Trae todas las líneas desde el origen para sumarlas | ✗ |

`comprobantes` posee el port (§3.7) y `conciliacion-bancaria` ya lo consume vía
el módulo leaf `lineas-cuenta-reader.module.ts` ⇒ **cero wiring cross-módulo
nuevo**. Devuelve moneda original ⇒ no hipoteca USD. El comentario "superficie
MÍNIMA: dos métodos" describía las necesidades del workspace v1; este change
las amplía deliberadamente y se documenta en el port.

**Implementación**: `prisma.lineaComprobante.aggregate({_sum})`, NO `$queryRaw`.
El adapter justifica el query builder porque deja el filtro de tenant
estáticamente visible; `aggregate` conserva esa propiedad y da el `GROUP BY`
en Postgres sin pagar el remapeo `string → Decimal` del raw.

### D2 — Lado banco: NO se construye nada

`MovimientoBancarioRepositoryPort.saldosVigentes(tenantId, corte)` **ya
existe** (REQ-VMB-08/09), devuelve `{cuentaBancariaId, fecha, saldo}` con
`saldo: null` honesto si el último movimiento no lo publica, eligiendo la fila
con la inversión exacta del orden de presentación. Es literalmente el ancla
que pide REQ-ICB-03. Se reutiliza tal cual y se filtra a la cuenta pedida.

### D3 — El punto de arranque es también la COTA de rendimiento

Riesgo detectado: a corte acumulado, cargar movimientos + líneas + matches
desde el origen para derivar `estadoEfectivo` no escala — el workspace hace
eso sobre un rango mensual.

**Todo lo anterior al arranque ya está absorbido en el saldo declarado.** El
informe solo necesita la ventana `arranque.fecha < fecha ≤ corte`. La
declaración de arranque no es solo un dispositivo de honestidad: es lo que
acota la consulta. Sin arranque declarado, el informe se emite abstenido
(REQ-ICB-04) y sin ventana ilimitada.

### D4 — Derivación del puente: dominio puro compartido, sin duplicar

`conciliacion.service.ts` deriva `estadoEfectivo` mezclado con el armado del
workspace. Se extrae a `domain/estado-efectivo.ts` (función pura sobre
movimientos + matches + líneas ya resueltos) y **ambos** consumidores la usan.
Duplicarla haría que un match roto se interprete distinto en el workspace y en
el informe — divergencia silenciosa sobre el mismo dato.

`verificarAnclas` y la consulta de diagnóstico por huérfanas se reutilizan sin
cambios.

### D5 — Continuidad: dominio puro, DERIVADA en lectura

| Opción | Tradeoff | Decisión |
|---|---|---|
| Calcular al importar y persistir | Se invalida cuando llega un extracto que rellena un hueco | ✗ |
| Función pura derivada en lectura | Un recorrido sobre las importaciones de la cuenta | **✓** |

`domain/continuidad-extractos.ts`, molde de `cobertura-extracto.ts`: recibe la
lista de `(fechaDesde, fechaHasta, saldoInicial, saldoFinal)` y devuelve las
discontinuidades. Comparación con `Money.igualaConTolerancia`. Ambos saldos
nulos ⇒ sin veredicto (REQ-CB-23).

**No repite el patrón "se computa y se tira"**: el dato que se persiste es el
insumo (`saldoInicial`/`saldoFinal`), y el veredicto se deriva de él.

### D6 — Señal de abstención

`estadoVerificacion` de las importaciones del rango, huecos y discontinuidades
se resuelven en el service y viajan como una sección `confiabilidad` del DTO,
con `conciliado: boolean` + motivos. El informe **siempre se emite**; lo que
se retiene es la conclusión (REQ-ICB-05).

## Data Flow

```
GET /api/conciliacion/informe?cuentaBancariaId&corte
        │
        ├─→ CuentasBancariasService.findById ......... 404 cross-tenant
        ├─→ ArranqueRepo.vigenteA(corte) ............. ventana + residuo
        ├─→ MovimientoRepo.saldosVigentes(corte) ..... saldo banco   [EXISTE]
        ├─→ LineasCuentaReader.sumarPorCuentaHasta ... saldo libros  [NUEVO]
        ├─→ MovimientoRepo.listarEnVentana ─┐
        ├─→ LineasCuentaReader.listar ──────┼→ estadoEfectivo (puro) → partidas
        ├─→ MatchRepo.listarPorMovimientos ─┘
        └─→ ImportacionRepo.listarPorCuenta → detectarHuecos + continuidad
                              ↓
              armarInforme() — dominio PURO, sin I/O
                              ↓
              InformeConciliacionDto (montos STRING §4.5)
```

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `comprobantes/ports/lineas-cuenta-reader.port.ts` | Modify | 3er método agregado a corte |
| `comprobantes/adapters/prisma-lineas-cuenta-reader.adapter.ts` | Modify | `aggregate({_sum})` |
| `conciliacion-bancaria/domain/estado-efectivo.ts` | Create | Derivación pura extraída |
| `conciliacion-bancaria/domain/continuidad-extractos.ts` | Create | Discontinuidades |
| `conciliacion-bancaria/domain/armar-informe.ts` | Create | La identidad, pura |
| `conciliacion-bancaria/informe-conciliacion.service.ts` | Create | Orquesta |
| `conciliacion-bancaria/informe-conciliacion.controller.ts` | Create | `GET` informe + `POST` arranque |
| `conciliacion-bancaria/ports/arranque-conciliado.repository.port.ts` | Create | Port + adapter |
| `conciliacion-bancaria/domain/checksum-extracto.ts` | Modify | Devuelve ambos saldos |
| `conciliacion-bancaria/extracto-importador.service.ts` | Modify | Persiste ambos |
| `conciliacion-bancaria/conciliacion.service.ts` | Modify | Consume `estado-efectivo.ts` |
| `prisma/schema.prisma` | Modify | `ArranqueConciliado` |
| `frontend/src/features/informe-conciliacion/` | Create | Feature nueva |
| `frontend/src/components/nav-items.ts` + `nav-list.test.tsx` | Modify | 4º ítem en `bancos` |

## Interfaces / Contracts

```ts
// comprobantes/ports/lineas-cuenta-reader.port.ts
export interface SumaLineasCuentaRow {
  totalDebito: Prisma.Decimal;   // MONEDA ORIGINAL
  totalCredito: Prisma.Decimal;
  totalDebitoBob: Prisma.Decimal;
  totalCreditoBob: Prisma.Decimal;
}
/** Acumulado hasta `hasta` inclusive. CONTABILIZADO/BLOQUEADO, anulado=false. */
abstract sumarPorCuentaHasta(
  tenantId: string,
  filtros: { cuentaId: string; hasta: Date; desde?: Date },
): Promise<SumaLineasCuentaRow>;
```

```prisma
model ArranqueConciliado {
  id               String   @id @default(uuid())
  organizationId   String
  cuentaBancariaId String
  fecha            DateTime @db.Date        // corte del arranque
  saldoExtracto    Decimal  @db.Decimal(18,2)
  saldoLibros      Decimal  @db.Decimal(18,2)
  diferenciaResidual Decimal @db.Decimal(18,2)
  nota             String?
  declaradoPorUserId String
  createdAt        DateTime @default(now()) @db.Timestamptz(3)

  // SIN @@unique sobre (cuenta, fecha): append-only, se conservan todas.
  @@index([organizationId, cuentaBancariaId, fecha])
  @@map("arranques_conciliados")
}
```

`vigenteA(corte)` = `fecha <= corte ORDER BY fecha DESC, createdAt DESC LIMIT 1`.

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit | `armar-informe`, `estado-efectivo`, `continuidad-extractos`, checksum con ambos saldos | Jest puro, ≥95% (dominio contable) |
| Integration | Agregado con BORRADOR/anulado excluidos; `vigenteA`; aislamiento por tenant | Postgres real |
| E2E | Informe cierra con las 3 partidas; abstención por DESCUADRE y por hueco; 404 cross-tenant; el `GET` no crea arranque | supertest |

Casos obligatorios: `IGNORADO` presente en el puente; residuo ≠ 0 expuesto;
período cerrado con diferencia permanente; borrar la última fila de un
extracto ⇒ discontinuidad detectada.

## Migration / Rollout

**PR 1** `fix(conciliacion)` — checksum devuelve ambos saldos, importador los
persiste. **Sin migración.** Habilita el resto.
**PR 2** `feat(conciliacion)` — continuidad + cobertura expuesta. **Sin
migración**, solo lectura.
**PR 3** `feat(conciliacion)` — informe. Migración **ADITIVA**: tabla
`arranques_conciliados` + índice. Sin backfill: sin arranque el informe se
emite abstenido. Rollback = revert de código; la tabla queda huérfana y se
elimina en una migración posterior. **Ningún dato contable se toca.**

### D7 — Permisos: `read` para consultar, `conciliar` para declarar

El pack ya declara seis permisos (`read`, `create`, `update`, `delete`,
`importar`, `conciliar`) y `conciliacion.controller.ts` fija la convención:
`read` guarda el `GET` del workspace, `conciliar` guarda el `POST`/`DELETE` de
matches. Declarar un arranque es un acto de la misma familia — fija el saldo
de partida sobre el que se apoyan todos los informes futuros — así que va con
`conciliar`. **No se introduce permiso nuevo.**

### D8 — Arranque con fecha anterior a uno existente: se ACEPTA

Declarar un arranque con fecha previa a otro ya declarado es válido. El
append-only lo tolera y `vigenteA` simplemente no lo aplicará mientras exista
uno posterior. La UI DEBE mostrar el **historial completo** de declaraciones y
señalar cuál está aplicando el informe: si alguien corrige hacia atrás, el
rastro de ambas declaraciones queda visible. Coherente con REQ-ICB-04 — la
declaración anterior nunca se borra ni se oculta.

## Open Questions

Ninguna. Las dos que abrió el diseño quedaron resueltas (D7 permisos, D8
arranque retroactivo).
