# Libro Diario — Especificación

> Fecha: 2026-05-30
> Fase: spec
> Proyecto: avicont
> Capability nueva: `libro-diario` (no existe spec previa en `openspec/specs/`)

---

## Propósito

Consulta del Libro Diario contable: listado cronológico de comprobantes CONTABILIZADOS
y BLOQUEADOS con sus líneas en BOB, filtrado por rango de fechas o período fiscal, para
un único tenant. Primer reporte del módulo `reportes/`.

---

## Glosario

- **Asiento**: comprobante CONTABILIZADO o BLOQUEADO, con `anulado` flag ortogonal.
- **Línea**: `LineaComprobante` con código+nombre de cuenta y monto debe/haber en BOB.
- **Rango activo**: `periodoFiscalId` O la dupla `fechaDesde`+`fechaHasta` (nunca ambos, nunca ninguno).
- **Monto string**: todo importe viaja como `string` decimal ("1250.50"), nunca `number` (§4.5 CLAUDE.md).
- **FechaContable**: fecha calendario puro `"YYYY-MM-DD"`, sin hora ni UTC (§4.6 CLAUDE.md).

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-LD-01: Filtro de rango — exclusividad

El sistema DEBE aceptar exactamente una de estas dos formas de rango:
(a) `periodoFiscalId` (string, requerido solo) — resuelve internamente sus fechas.
(b) `fechaDesde` + `fechaHasta` (ambas requeridas juntas).

Si se reciben ambas formas simultáneamente, o si no se recibe ninguna, el sistema
DEBE rechazar la solicitud con HTTP 400.

#### Escenario: solo periodoFiscalId — válido

- DADO que existe un período fiscal ABIERTO para el tenant activo
- CUANDO se consulta `GET /api/libros/diario?periodoFiscalId=<id>`
- ENTONCES el sistema responde 200 con asientos cuya `fechaContable` cae en el rango del período

#### Escenario: solo fechaDesde + fechaHasta — válido

- DADO un tenant con asientos en mayo 2026
- CUANDO se consulta `GET /api/libros/diario?fechaDesde=2026-05-01&fechaHasta=2026-05-31`
- ENTONCES el sistema responde 200 con los asientos del rango

#### Escenario: ambas formas presentes — error

- CUANDO se envía `periodoFiscalId` junto con `fechaDesde` o `fechaHasta`
- ENTONCES el sistema responde HTTP 400 con `LIBRO_DIARIO_FILTRO_INVALIDO`

#### Escenario: ningún filtro de rango — error

- CUANDO se consulta sin `periodoFiscalId` ni `fechaDesde`/`fechaHasta`
- ENTONCES el sistema responde HTTP 400 con `LIBRO_DIARIO_FILTRO_INVALIDO`

#### Escenario: fechaDesde sin fechaHasta — error

- CUANDO se envía `fechaDesde` pero no `fechaHasta` (o viceversa)
- ENTONCES el sistema responde HTTP 400 con `LIBRO_DIARIO_FILTRO_INVALIDO`

---

### REQ-LD-02: Filtrado por estado — BORRADOR excluido siempre

El sistema DEBE incluir únicamente comprobantes con
`estado IN (CONTABILIZADO, BLOQUEADO)`. El estado BORRADOR NUNCA DEBE aparecer,
independientemente de cualquier parámetro.

#### Escenario: BORRADOR excluido

- DADO un período con un comprobante en BORRADOR y otro CONTABILIZADO
- CUANDO se consulta el Libro Diario para ese período
- ENTONCES la respuesta contiene solo el CONTABILIZADO; el BORRADOR no aparece

---

### REQ-LD-03: Anulados — excluidos por default, incluibles con toggle

Por default (`incluirAnulados` ausente o `false`), los comprobantes con
`anulado = true` NO DEBEN aparecer en el resultado. Si `incluirAnulados=true`,
el sistema DEBE incluirlos marcados con `"anulado": true` en el item (§4.7 CLAUDE.md).

#### Escenario: anulados excluidos por default

- DADO un período con un comprobante CONTABILIZADO anulado y uno no anulado
- CUANDO se consulta sin `incluirAnulados`
- ENTONCES la respuesta incluye solo el no anulado; `totalDebeBob` y `totalHaberBob` reflejan solo ese

#### Escenario: anulados visibles con toggle

- DADO el mismo período
- CUANDO se consulta con `incluirAnulados=true`
- ENTONCES la respuesta incluye ambos; el anulado tiene `"anulado": true`

---

### REQ-LD-04: Orden cronológico estable

Los asientos en la respuesta DEBEN ordenarse por `fechaContable` ASC, con desempate
estable por `numero` ASC. El orden DEBE ser determinístico para el mismo conjunto de datos.

#### Escenario: múltiples asientos en un día

- DADO tres asientos en la misma `fechaContable`, con números D2605-000001, D2605-000002, D2605-000003
- CUANDO se consulta el Libro Diario
- ENTONCES aparecen en ese orden numérico dentro del día

---

### REQ-LD-05: Líneas por asiento ordenadas por `orden`

Cada asiento en la respuesta DEBE incluir sus `lineas` ordenadas por el campo `orden`
ASC. Cada línea DEBE contener: `codigoCuenta`, `nombreCuenta`, `glosa` (nullable),
`debeBob` (string), `haberBob` (string).

#### Escenario: líneas en orden correcto

- DADO un asiento con 3 líneas insertadas en orden inverso al campo `orden`
- CUANDO se consulta el Libro Diario
- ENTONCES las líneas aparecen ordenadas por `orden` ASC, no por orden de inserción

---

### REQ-LD-06: Totales del período

La respuesta DEBE incluir `totalDebeBob` y `totalHaberBob` como suma de todos los
`debeBob`/`haberBob` de todas las líneas incluidas en el resultado (respetando los
filtros de estado y anulados). Ambos DEBEN ser `string` decimal. En un conjunto de
asientos válidos (CONTABILIZADOS) `totalDebeBob === totalHaberBob` (partida doble).

#### Escenario: totales calculados correctamente

- DADO un período con 2 asientos CONTABILIZADOS, cada uno de Bs 500
- CUANDO se consulta el Libro Diario
- ENTONCES `totalDebeBob = "1000.00"` y `totalHaberBob = "1000.00"`

#### Escenario: período vacío

- DADO un período sin ningún comprobante CONTABILIZADO ni BLOQUEADO
- CUANDO se consulta el Libro Diario
- ENTONCES la respuesta tiene `asientos: []`, `totalDebeBob: "0.00"`, `totalHaberBob: "0.00"`

---

### REQ-LD-07: Forma del DTO de respuesta

La respuesta DEBE cumplir esta forma exacta:

```
{
  asientos: [
    {
      fechaContable: string,        // "YYYY-MM-DD"
      numero: string,               // "D2605-000001"
      glosa: string,
      estado: "CONTABILIZADO" | "BLOQUEADO",
      anulado: boolean,
      lineas: [
        {
          codigoCuenta: string,
          nombreCuenta: string,
          glosa: string | null,
          debeBob: string,          // "0.00" si no aplica
          haberBob: string          // "0.00" si no aplica
        }
      ]
    }
  ],
  totalDebeBob: string,
  totalHaberBob: string,
  rango: {
    fechaDesde: string,             // "YYYY-MM-DD"
    fechaHasta: string              // "YYYY-MM-DD"
  }
}
```

#### Escenario: montos serializados como string

- DADO un asiento con una línea de Bs 1.250,50
- CUANDO se consulta el Libro Diario
- ENTONCES el campo `debeBob` en la respuesta JSON es el string `"1250.50"`, no el número `1250.5`

---

### REQ-LD-08: Multi-tenant — aislamiento estricto

El sistema DEBE filtrar todos los comprobantes por el `organizationId` del JWT activo
(§4.2 CLAUDE.md). Ningún comprobante de otro tenant DEBE aparecer en la respuesta,
independientemente de los filtros de fecha.

#### Escenario: dos tenants — sin fuga

- DADO que el Tenant A y el Tenant B tienen asientos en el mismo rango de fechas
- CUANDO el usuario del Tenant A consulta el Libro Diario
- ENTONCES la respuesta contiene solo asientos con `organizationId` del Tenant A

#### Escenario: tenant sin asientos en el rango

- DADO un tenant sin asientos en el rango solicitado
- CUANDO consulta el Libro Diario
- ENTONCES la respuesta retorna `asientos: []` (no un error)

---

### REQ-LD-09: RBAC — permiso requerido

El sistema DEBE proteger `GET /api/libros/diario` con el permiso
`contabilidad.libro-diario.read`. Un usuario sin ese permiso DEBE recibir HTTP 403.

#### Escenario: sin permiso — 403

- DADO un usuario autenticado sin el permiso `contabilidad.libro-diario.read`
- CUANDO consulta `GET /api/libros/diario`
- ENTONCES el sistema responde HTTP 403

#### Escenario: sin autenticación — 401

- CUANDO se consulta sin JWT
- ENTONCES el sistema responde HTTP 401

---

### REQ-LD-10: Tope defensivo

Si el rango consultado contiene más de 5.000 asientos que cumplan los filtros
(estado + anulados), el sistema DEBE rechazar la solicitud con HTTP 422 y código
`LIBRO_DIARIO_RANGO_EXCEDIDO`. NO DEBE devolver un payload parcial silencioso.

#### Escenario: rango excede el tope

- DADO un tenant con 5.001 asientos CONTABILIZADOS en un rango anual
- CUANDO se consulta ese rango
- ENTONCES el sistema responde HTTP 422 con `LIBRO_DIARIO_RANGO_EXCEDIDO` y un mensaje legible

---

### REQ-LD-11: Frontend — pantalla del Libro Diario

La feature `frontend/src/features/libro-diario/` DEBE proveer:
- Un selector de filtro: período fiscal (**default**) o rango de fechas libre (switch/tab).
- Tabla agrupada por asiento (cabecera fecha/número/glosa + sub-filas de líneas cuenta/debe/haber).
- Fila de totales al pie (debe BOB / haber BOB).
- Estados: carga (skeleton), vacío ("No hay asientos en el rango"), error (mensaje).
- Toggle "Incluir anulados" visible; los asientos anulados incluidos se DEBEN marcar visualmente.
- La pantalla SOLO DEBE renderizarse si el usuario tiene `contabilidad.libro-diario.read`; de lo contrario redirige o muestra acceso denegado.

#### Escenario: filtro por período fiscal

- DADO que el usuario selecciona un período fiscal en el selector
- CUANDO ejecuta la consulta
- ENTONCES la tabla muestra los asientos del período ordenados cronológicamente

#### Escenario: pantalla vacía

- DADO un período sin asientos
- CUANDO el usuario consulta ese período
- ENTONCES la pantalla muestra el estado vacío, no una tabla sin filas

#### Escenario: error de backend

- DADO que el backend devuelve error (ej. 422 por tope excedido)
- CUANDO el usuario ejecuta la consulta
- ENTONCES la pantalla muestra el mensaje de error y NO muestra tabla parcial

#### Escenario: sin permiso en frontend

- DADO un usuario sin `contabilidad.libro-diario.read`
- CUANDO navega a la ruta del Libro Diario
- ENTONCES se le muestra una pantalla de acceso denegado (no un error de red)

---

## Código de errores

| Código | HTTP | Descripción |
|--------|------|-------------|
| `LIBRO_DIARIO_FILTRO_INVALIDO` | 400 | Filtros de rango inválidos (ninguno, ambos, o dupla incompleta) |
| `LIBRO_DIARIO_PERIODO_NO_ENCONTRADO` | 404 | El `periodoFiscalId` no existe o no pertenece al tenant |
| `LIBRO_DIARIO_RANGO_EXCEDIDO` | 422 | El rango supera 5.000 asientos |
