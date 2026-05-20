# ADR-0001 — Integración de agentes IA en Avicont

- **Estado**: Aceptado (estratégico — guía sin obligar a implementación)
- **Fecha**: 2026-04-27
- **Autores**: Marco Tarqui
- **Supersede**: —
- **Superseded by**: —

---

## 1. Contexto

Avicont es un SaaS contable + operativo avícola para asociaciones bolivianas
de avicultores. El módulo `granja` está **explícitamente diseñado para
operarse con IA** ("operativo simple con IA", `CLAUDE.md` raíz, sección de
contexto), porque el usuario opera en gallinero con celular y no va a
completar formularios complejos. El módulo `contabilidad` tiene varios
casos de uso candidatos para IA (captura de facturas, sugerencia de
asientos, conciliación, RAG normativo, cierre asistido).

Hoy el proyecto está en **Fase 1.4** (entidades base de comprobantes y
documentos físicos). No hay ningún feature de IA implementado todavía. La
pregunta estratégica es: **¿cómo se diseña la base para que cuando llegue
el agente, no haya que romper nada?**

Este ADR fija el patrón mental y arquitectónico, NO la implementación.
La implementación se decide slice por slice cuando llega el feature
concreto.

### Lo que motiva escribir este ADR ahora

1. La forma de la auditoría, el modelo de actor del sistema y el estado
   machine de comprobantes son decisiones que **se diseñan ahora aunque
   el agente venga después**. Si se diseñan mal, retrofitearlas con
   datos productivos es doloroso.
2. El `enum AccionAuditoriaComprobante` y el shape de
   `AuditLog.metadata Json?` son extensibles desde día 1 con cero costo si
   se sabe qué viene. Si no se sabe, terminás con migrations de enum y
   queries que asumen forms viejas.
3. El módulo `granja` es el primer candidato real para IA y está
   relativamente cerca en el roadmap. Tener la guía escrita evita
   discusiones desde cero cuando llegue ese slice.

---

## 2. Decisión

Las decisiones que sigue son **políticas duras**. Cualquier feature de IA
en Avicont las respeta o se discute en un nuevo ADR que las supersedee.

### 2.1 El agente entra como adapter más, no rompe el dominio

La arquitectura hexagonal del backend ya soporta este patrón sin cambios:

```
modules/<dominio>/<dominio>.service.ts    ← invariantes (partida doble, period lock, tenant isolation)
                  ▲
                  │
   ┌──────────────┼──────────────┐
   │              │              │
HTTP API       Agent IA       Jobs/CLI
adapter        adapter        adapter
```

El agente expone un set finito de **tools** que son métodos del service.
**El LLM nunca toca Prisma directo, nunca arma SQL libre, nunca invoca
métodos privados del dominio.** Toda acción pasa por la capa que valida
invariantes.

### 2.2 El agente nunca postea autónomo

En contabilidad, el agente **siempre** opera en estado `BORRADOR`. Un
asiento `CONTABILIZADO` solo se logra con acción humana explícita. Esto
NO es opcional, NO se relaja por UX, NO se justifica con "el modelo es
muy bueno".

Razones:

- **Legal**: la responsabilidad del asiento es del contador, no del
  software. El SIN no aceptaría "fue la IA" como excusa.
- **Técnica**: los LLM hallucinan. Tarde o temprano sugiere una cuenta
  inexistente, un monto invertido, una fecha en período cerrado. El estado
  `BORRADOR` permite que el contador detecte y corrija antes de
  comprometer los libros.
- **Confianza**: si el agente equivoca dos asientos contabilizados, el
  contador no usa más el sistema. Si equivoca dos borradores, el contador
  los borra y aprende a revisar.

En el módulo `granja` la regla se relaja: las operaciones no tienen
implicancia legal/contable, así que el agente PUEDE persistir directo.
Pero toda persistencia queda **auditada** con la sesión del agente
asociada (ver §2.4).

### 2.3 Patrón de actor dual (impersonation-like)

Hoy el modelo `AuditLog` tiene `userId?` apuntando a `User`. El esquema
de **impersonation** (`ImpersonationLog` + `ImpersonationAction`) ya
implementa el concepto correcto: una acción tiene **dos atribuciones
simultáneas** — el actor que opera (admin) y el contexto en cuyo
nombre opera (target).

El agente sigue el **mismo patrón mental**: cada acción del agente tiene:

- `userId` → usuario humano dueño de la sesión (siempre obligatorio,
  nunca null — el agente no opera sin un humano que lo invocó).
- `agentSessionId` → sesión del agente que originó la acción (nullable;
  null = acción puramente humana).

Un registro con `agentSessionId IS NOT NULL` indica origen-agente. La
distinción humano vs agente se hace por presencia/ausencia del campo, no
por un enum `actorTipo` separado. Razones:

- Más simple: un campo nullable en lugar de un enum + FK condicional.
- Más rico: el `agentSessionId` lleva al detalle completo (modelo, prompt,
  tools invocados), no solo "fue agente".
- Compatible: registros viejos sin `agentSessionId` se interpretan como
  origen-humano sin migración de datos.

### 2.4 Auditoría detallada de sesiones de agente

Cuando llegue el primer slice con agente real, se introducen tres
tablas dedicadas:

```prisma
model AgentSession {
  id              String      @id @default(uuid())
  organizationId  String
  userId          String      // humano dueño de la sesión
  modelo          String      // ej "claude-opus-4-7"
  startedAt       DateTime    @default(now())
  endedAt         DateTime?
  totalTokensIn   Int         @default(0)
  totalTokensOut  Int         @default(0)
  totalCostUsd    Decimal     @default(0) @db.Decimal(10, 6)
  // ... índices por (organizationId, userId, startedAt)
}

model AgentMessage {
  id          String        @id @default(uuid())
  sessionId   String
  role        String        // "user" | "assistant" | "system" | "tool"
  content     String        // contenido del mensaje (puede ser largo)
  tokensIn    Int           @default(0)
  tokensOut   Int           @default(0)
  createdAt   DateTime      @default(now())
}

model AgentToolInvocation {
  id           String       @id @default(uuid())
  sessionId    String
  messageId    String?      // mensaje que disparó la invocación
  tool         String       // ej "sugerir_asiento_compra"
  params       Json
  result       Json?
  error        String?
  durationMs   Int
  createdAt    DateTime     @default(now())
}
```

Estas tablas **no se crean ahora**. Se introducen como parte del primer
slice donde haya agente (probablemente granja). Documentado acá para que
el shape esté pre-decidido y el slice no tenga que diseñarlas desde cero.

### 2.5 Marca de origen-agente en entidades de dominio

Cuando un comprobante (o cualquier entidad relevante) sea creado/sugerido
por el agente, lleva:

- `agentSessionId` (FK a `AgentSession`, nullable).
- `fueRevisadoPorHumano: Boolean @default(false)`.
- `revisadoPorUserId: String?` y `revisadoEn: DateTime?` cuando se confirma.

Esto permite:

- UI: "este borrador lo armó la IA, revisalo con atención" (badge visible).
- Métricas de calidad del agente: `% borradores del agente que se postean
  sin modificación` vs `% modificados antes de postear`. **Sin esto, no
  hay forma de evaluar si el agente mejora o empeora con el tiempo.**
- Auditoría regulatoria: cuando un auditor pregunte "¿quién hizo este
  asiento?", se muestra usuario humano + sesión completa + tool exacto +
  prompt original.

### 2.6 Eventos de revisión humana en el enum de auditoría

El enum `AccionAuditoriaComprobante` debe incluir, cuando llegue el agente:

```
REVISADO_AGENTE_SIN_CAMBIOS
REVISADO_AGENTE_CON_CAMBIOS
```

Hoy el enum tiene `CREADO`, `EDITADO`, `CONTABILIZADO`, `ANULADO`,
`CREADO_POR_REVERSION`, `EDIT_EN_REAPERTURA`. Si el agente entra sin estos
valores nuevos, se pierde el evento intermedio "humano revisó lo que armó
el agente y lo dejó tal cual" o "humano modificó X campos antes de
postear". Ese evento es **central** para la auditoría regulatoria.

**Decisión de timing**: estos valores se agregan al enum en el primer
slice de agente que toque comprobantes. NO ahora — los enums Postgres son
un dolor de cambiar y no queremos meter valores que después se renombran.

### 2.7 Aislamiento multi-tenant del agente (defense in depth)

El agente respeta el invariante §4.2 del `CLAUDE.md` raíz: **multi-tenant
estricto**. Reglas concretas:

1. El `tenantId` del agente viene del **JWT del usuario humano que abrió
   la sesión**, NO del prompt del agente. Si el usuario escribe "muestrame
   las cuentas de la otra organización", la tool ignora el pedido.
2. Las tools reciben `organizationId` y `userId` del contexto de la
   sesión, no de los argumentos del LLM. El LLM nunca puede pasar
   `organizationId` como parámetro.
3. Test de aislamiento obligatorio en cada tool: dos tenants concurrentes,
   acción del agente del tenant A no debe ser visible/modificable por el
   tenant B. Patrón espejo de los tests E2E existentes.

### 2.8 Tracking de costos LLM por tenant

El uso de LLM cuesta. Sin tracking, no hay manera de:

- Modelar pricing del producto.
- Limitar features por plan (`Plan.FREE` vs `Plan.PRO` con cuotas).
- Detectar abuso o bug (un loop de tools que consume 100k tokens).

Las columnas `totalTokensIn`, `totalTokensOut`, `totalCostUsd` en
`AgentSession` son la base. Reportes agregados por (organizationId,
periodo) se calculan al vuelo o con materialized view si hay volumen.

### 2.9 RAG sobre histórico del tenant — diferido

Para que el agente sugiera asientos basándose en operaciones similares
pasadas del mismo tenant, hace falta vector store (`pgvector` u otro).
**No se introduce hasta que haya volumen real de histórico que justifique
el costo de mantener embeddings.** Esto es Fase 2+.

Mientras tanto, el agente opera con:

- Reglas duras (PUCT, plan de cuentas, períodos).
- Few-shot prompting con ejemplos curados manualmente.
- Histórico reciente del tenant pasado en el contexto del prompt
  (acotado a N días o N comprobantes).

---

## 3. Consecuencias

### 3.1 Positivas

- **Schema actual no requiere cambios** para empezar. La arquitectura
  hexagonal absorbe el agente como otro adapter, sin tocar dominio.
- **Auditoría base ya está**: `AuditLog`, `ComprobanteAuditoria`,
  `ImpersonationLog/Action`. La extensión para agente es aditiva.
- **Patrón mental claro**: cualquier dev que toque el agente sabe que
  va vía service, que opera en BORRADOR, que tiene actor dual.
- **Estado machine ya delimita el área del agente** (`BORRADOR`).
- **Decisiones reversibles**: si el proyecto pivota y no hace agente, no
  hay código desperdiciado — solo este ADR queda como decisión
  contrafáctica.

### 3.2 Negativas / costos

- **Discipline cost**: hay que recordar la decisión cuando llegue el
  primer slice de agente. Mitigación: este ADR + memory de Engram + el
  triggers de §12 del `CLAUDE.md` raíz se pueden extender para incluir
  "antes de tocar agente, releer ADR-0001".
- **Tests específicos de agente**: cuando llegue, hay que escribir
  tests de aislamiento de tenant con el agente como actor. Esfuerzo
  real, no se puede saltar.
- **Lock-in del patrón**: si en el futuro descubrimos que el dual-attribution
  no escala (ej. agentes que operan sin humano por jobs programados), hay
  que escribir un ADR nuevo que supersedee este. Es saludable, no es
  problema — es como funcionan los ADRs.

---

## 4. Alternativas consideradas

### 4.1 Diseñar todo el agente ahora (rechazada)

Crear `AgentSession`, `AgentMessage`, `AgentToolInvocation`, agregar
`agentSessionId` a `Comprobante` y otras entidades, sumar valores al enum
`AccionAuditoriaComprobante`, todo en una migration grande hoy.

**Por qué se rechaza**: especulación pura. La forma exacta de las tablas
depende del primer caso de uso (granja vs contabilidad), de qué LLM se
usa, de cuántos tools hay. Diseñar sin caso de uso = diseñar mal y tener
que migrar después igual. Es el opuesto de YAGNI.

### 4.2 No escribir ningún ADR hasta que el agente exista (rechazada)

"Cuando llegue el feature, ahí decidimos."

**Por qué se rechaza**: hay decisiones que TOCAN al schema actual y se
deciden ahora aunque el agente venga después. Por ejemplo: si en este
trimestre tocamos `AccionAuditoriaComprobante` por otro motivo, hay que
saber qué valores futuros vienen para no migrar dos veces. Sin ADR,
cuando llegue el primer slice de agente cada decisión se discute desde
cero.

### 4.3 Crear "users técnicos" para el agente (rechazada)

Cada vez que el agente opera, se loguea con un `User` con flag `isAgent`.
Resto de sistema ignora la diferencia.

**Por qué se rechaza**: contamina el modelo de usuarios reales. Queries
sobre `User` tienen que filtrar agentes. Permisos, RBAC, invitaciones,
todo se vuelve "humanos vs agentes" disperso por el código. Es un
antipatrón documentado en sistemas grandes (los "service accounts" se
hacen con tabla separada o con flag a nivel de sesión, no a nivel de
identidad).

### 4.4 Enum `actorTipo: HUMANO | AGENTE | SISTEMA` (rechazada)

Agregar un enum a cada tabla auditada que distinga origen.

**Por qué se rechaza** (en favor de §2.3): el enum aporta menos info que
un FK a `AgentSession`. Si querés saber **qué** agente, **qué** prompt,
**qué** tool — el enum no te lleva a ningún lado. Si vas a tener tabla
de sesiones de todas formas, el FK nullable es estrictamente más
informativo. Como bonus: registros viejos no necesitan migración de
datos (NULL = humano por convención, vs `actorTipo NOT NULL DEFAULT
'HUMANO'` que requiere update masivo).

---

## 5. Plan escalonado

Esta es la guía operativa de **cuándo** implementar cada pieza. El
principio rector es **"último momento responsable"**: postergar hasta
el momento donde retrasarlo más empieza a ser caro.

### 🟢 Fase 0 — Hoy (gratis, alto retorno)

- ☑ Este ADR escrito.
- ☐ Referencia desde `CLAUDE.md` raíz (sección §10 o nueva).
- ☐ Cuando se toque cualquier slice cercano al schema de auditoría,
  releer este ADR antes de decidir.

### 🟡 Fase 1 — Cuando arranque el primer slice con IA real

Hoy el candidato más cercano es `granja`, porque el módulo está
**explícitamente diseñado** para operarse con chat IA. Será el primer
caso real de uso donde aplican los principios de este ADR.

Cuando ese slice arranque, en su SDD planning:

- Crear las tablas `AgentSession`, `AgentMessage`, `AgentToolInvocation`
  con el shape de §2.4 (ajustando si el caso de uso real lo amerita).
- Crear el módulo `agent/` en `backend/src/modules/` siguiendo
  hexagonal estricto: `domain/`, `ports/`, `adapters/`, `service`.
- Implementar las tools como métodos del service del módulo objetivo
  (ej. `granja.service.registrarMovimientoLote`), invocadas desde un
  adapter del módulo `agent/`.
- Tests de aislamiento multi-tenant del agente, en paralelo con los
  tests E2E del feature.

### 🟡 Fase 2 — Cuando el agente toque contabilidad

Cuando llegue el primer feature de IA en contabilidad (probable orden:
captura de facturas → sugerencia de asientos → conciliación):

- Migration aditiva: `agentSessionId` (FK nullable) en
  `Comprobante`, `LineaComprobante`, `ComprobanteAuditoria`.
- Migration aditiva: `fueRevisadoPorHumano`, `revisadoPorUserId`,
  `revisadoEn` en `Comprobante`.
- Migration de enum: agregar `REVISADO_AGENTE_SIN_CAMBIOS` y
  `REVISADO_AGENTE_CON_CAMBIOS` a `AccionAuditoriaComprobante`.
- UI: badge "borrador IA" en lista de comprobantes; flujo de revisión
  con diff visual antes de postear.
- Métricas: dashboard de calidad del agente
  (% sin cambios, % con cambios, accuracy por tipo de comprobante).

### 🔴 Fase 3+ — Diferido hasta justificación clara

- **Vector store / RAG sobre histórico del tenant**: solo cuando
  haya volumen real (>1000 comprobantes/tenant) y el few-shot manual ya
  no escale.
- **Agentes autónomos** (jobs programados sin humano disparando): solo
  con caso de uso fuerte (ej. cierre mensual asistido nocturno). Requiere
  ADR nuevo que supersedee §2.2.
- **Multi-modelo / multi-provider**: hoy `modelo: String` alcanza para
  Claude. Si en el futuro hace falta abstracción de proveedor (Claude +
  GPT + Gemini), se discute con caso de uso.

---

## 6. Anexos

### 6.1 Ejemplo de query de auditoría completa de un comprobante

Cuando un auditor pregunta "¿quién creó el asiento `X`?", la respuesta
completa se compone así:

```sql
-- Comprobante con metadata del agente (si aplica)
SELECT c.id, c.numero, c.fechaContable,
       c.createdByUserId AS humano,
       c.agentSessionId,
       c.fueRevisadoPorHumano, c.revisadoPorUserId
FROM comprobantes c
WHERE c.id = '...';

-- Si agentSessionId no es null, traer la sesión completa
SELECT s.modelo, s.startedAt, s.totalTokensIn, s.totalTokensOut, s.totalCostUsd
FROM agent_sessions s
WHERE s.id = '<agentSessionId>';

-- Y los mensajes / tools
SELECT * FROM agent_messages WHERE sessionId = '<agentSessionId>'
ORDER BY createdAt;

SELECT * FROM agent_tool_invocations WHERE sessionId = '<agentSessionId>'
ORDER BY createdAt;

-- Eventos de auditoría del comprobante (histórico de mutaciones)
SELECT accion, userId, timestamp, diff
FROM comprobantes_auditoria
WHERE comprobanteId = '...' ORDER BY timestamp;
```

Resultado: el auditor ve **humano + agente + prompt + tools + eventos**.
Trazabilidad total.

### 6.2 Ejemplo de tool del agente (signature, no implementación)

Para fijar la idea de que el agente nunca toca BD directo:

```ts
// modules/agent/tools/sugerir-asiento-compra.tool.ts
export class SugerirAsientoCompraTool {
  constructor(
    private readonly comprobanteService: ComprobanteService,    // del módulo de dominio
    private readonly planCuentas: PlanCuentasReaderPort,
    private readonly contactos: ContactosReaderPort,
    private readonly currentSession: AgentSessionContext,        // org + user + sessionId
  ) {}

  // El LLM invoca esto. Nunca recibe organizationId del LLM.
  async invoke(params: SugerirAsientoCompraParams): Promise<AsientoSugerido> {
    // Validar params (zod)
    // Consultar plan de cuentas via reader port
    // Consultar contacto proveedor via reader port
    // Llamar service del módulo de dominio para CREAR borrador
    // Persistir agentToolInvocation
    // Devolver el asiento al LLM (que se lo presenta al humano)
  }
}
```

El LLM nunca arma SQL. Nunca decide cuentas sin pasar por reglas del
plan. Nunca crea un asiento sin pasar por el service que valida partida
doble. **El agente delega autoridad, no la usurpa.**

### 6.3 Referencias internas

- `CLAUDE.md` raíz §1 (idioma del dominio — agente respeta español).
- `CLAUDE.md` raíz §3 (arquitectura hexagonal — el agente es adapter).
- `CLAUDE.md` raíz §4.2 (multi-tenant estricto — defense in depth aplica
  al agente igual que a cualquier capa).
- `CLAUDE.md` raíz §4.3 (inmutabilidad post-CONTABILIZADO — el agente NO
  es excepción).
- `docs/claude/seguridad.md` §5.6 (impersonation — patrón conceptual
  espejo).
- `docs/disenos/comprobantes-asientos.md` (estado machine y auditoría
  base de comprobantes).

---

**Fin del ADR.** Cuando llegue el primer slice con IA real, releer este
documento ANTES de empezar el SDD planning. Si el caso de uso amerita
desviar de alguna decisión, escribir un ADR-0002 que la supersedee — no
desviar silenciosamente.
