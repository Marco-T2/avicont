# Smoke manual — Gating de permisos (frontend)

> Cómo verificar a mano que el gating de permisos funciona end-to-end.
> El gating es **UX, no seguridad** — el candado real está en el backend (RBAC, 403).
> Este smoke comprueba que el frontend oculta/bloquea lo que el usuario no puede usar.
>
> Cubre dos capas:
> - **Parte A — Nav + rutas** (#82/#86): el sidebar oculta y las rutas bloquean lo que el rol no puede ver.
> - **Parte B — Botones de acción** (#87/#88/#89/#90): los botones de escritura se ven **deshabilitados con tooltip** (no se ocultan) cuando falta el permiso.

## El punto clave (no saltearlo)

**OWNER y ADMIN tienen wildcard `*` → nunca se les oculta nada.** Si probás solo con
el owner, no vas a ver gating y vas a creer que está roto. El gating **solo se observa
con un 2º usuario que tenga un CustomRole limitado** (con `systemRole = null`).

## Preparación

```bash
# desde la raíz del repo
docker compose up -d postgres redis

# backend — OJO a ESTA consola: el link de invitación sale acá (ConsoleAdapter)
cd backend && pnpm run start:dev

# frontend (en otra terminal)
cd frontend && pnpm dev      # o pnpm dev:full
```

## Pasos

### 1. Crear org + owner — sesión A (browser normal)
- Ir a `/register` → email del owner, password, nombre de org, tipo **Contabilidad** → "Crear cuenta".
- El form orquesta solo `register → login → createTenant → switchTenant`; quedás adentro como
  OWNER con tenant activo. (Flujo verificado: no requiere pasos manuales extra.)

### 2. Crear un CustomRole LIMITADO
- `/settings/roles` → crear rol, ej. **"Operativo"**.
- Dale algún permiso inofensivo (ej. ver comprobantes) pero **NO le des** los de reportes:
  - `contabilidad.libro-diario.read`
  - `contabilidad.libro-mayor.read`
  - `contabilidad.eeff.read`  ← cubre Balance General y Estado de Resultados
- Guardar.

### 3. Invitar al 2º usuario con ese rol
- `/settings/members` → **Invitar miembro** → email del 2º usuario (usar un **email fresco**,
  sin cuenta previa).
- En el select de rol, grupo **Personalizados**, elegí **"Operativo"** → enviar.
  > Que el CustomRole aparezca en este select es el fix del PR #84.

### 4. Conseguir el link de invitación (dev, sin email real)
- En la consola del `start:dev` del backend buscá el bloque:
  ```
  📧 EMAIL (not sent - console mode)
  ```
  Contiene el link `/accept-invite?token=...`. Copialo.
- Alternativa por DB:
  ```bash
  docker compose exec postgres psql -U postgres -d saas \
    -c "SELECT token, email FROM invitations ORDER BY \"createdAt\" DESC LIMIT 1;"
  ```

### 5. Aceptar como 2º usuario — en INCÓGNITO / otro browser
- **Importante**: ventana de incógnito o navegador distinto. El access token vive en memoria
  por sesión; abrir el link en el mismo browser pisa la sesión del owner.
- Pegar `/accept-invite?token=...` → setear password (accept-and-register) → quedás logueado
  como el 2º usuario con el rol "Operativo".

### 6. Verificar el gating ✅ (lo que tenés que observar)
- El sidebar **NO** muestra Libro Diario / Libro Mayor / Balance General / Estado de Resultados
  (nav fail-closed).
- Navegar a mano a `/libros/diario`, `/libros/mayor`, `/eeff/balance`, `/eeff/resultados` →
  ves la vista inline de `RequirePermission`, no el reporte.
- `GET /api/me/permissions` devuelve solo los permisos del rol (sin los `.read` de reportes).

### 7. Control positivo (volver a la sesión A, el owner)
- Como OWNER, **todos** los items se ven y entran → confirma que el gating recorta al rol
  limitado, no a todos.

## Checklist

- [ ] Owner creado por `/register` entra a la app con tenant activo (sin pasos manuales).
- [ ] CustomRole "Operativo" creado sin los 3 permisos de reportes.
- [ ] El CustomRole aparece en el select de invitar (grupo Personalizados).
- [ ] Invitación enviada; link obtenido de la consola del backend.
- [ ] 2º usuario acepta en incógnito y entra con el rol limitado.
- [ ] Sidebar oculta Diario/Mayor/Balance/Resultados para el rol limitado.
- [ ] Navegación directa a esas rutas muestra `RequirePermission`, no el reporte.
- [ ] `GET /me/permissions` del rol limitado no incluye los `.read` de reportes.
- [ ] OWNER (control positivo) ve y entra a todo.

---

## Parte B — Gating de botones de acción

> Misma preparación y mismo 2º usuario con CustomRole limitado (Partes A y B se prueban
> en la misma sesión). Acá lo que se observa es distinto: los botones de **escritura**
> NO se ocultan, se **deshabilitan + muestran un tooltip** explicando por qué. La regla:
> *afordancia honesta* — ves que la acción existe, pero no la podés disparar.

### Patrón de afordancia (qué esperar)

- **Botones reales** (los "Nuevo …", "Editar", "Eliminar", "Cerrar período", etc.):
  deshabilitados (grises) y al pasar el mouse muestran un tooltip "No tenés permiso para …".
- **Ítems de menú** (los "…" de las tablas de roles y miembros): el ítem aparece **deshabilitado**
  (gris, no clickeable). Sin tooltip — un `DropdownMenuItem` deshabilitado de Radix no lo
  dispara de forma fiable; el deshabilitado ya es la señal.
- El **combobox** "Buscar o crear documento" (respaldo del comprobante) deshabilitado con tooltip;
  dentro, "Crear nuevo documento" puede salir con la pista "Sin permiso".

### Qué gatear por feature (con un rol que tenga solo los `.read`)

| Pantalla | Botones que deben verse DESHABILITADOS |
|---|---|
| Comprobantes (lista + detalle) | Nuevo · Editar · Contabilizar · Eliminar · Anular |
| Comprobante → "Documentos de respaldo" | combobox asociar · "Crear nuevo" · desasociar (🗑) |
| Contactos | Nuevo · Editar · Desactivar · Reactivar |
| Documentos físicos | Nuevo · Editar · Eliminar |
| Tipos de documento físico | Nuevo · Editar · Desactivar · Activar |
| Plan de cuentas | Nueva cuenta · "+" sub-cuenta del árbol · Editar · Desactivar |
| Períodos fiscales | Nueva gestión · Cerrar gestión · Cerrar período |
| Roles personalizados | Nuevo rol · (menú "…") Editar · Eliminar |
| Miembros | Invitar miembro · (menú "…") Cambiar a Admin/Owner · Remover |
| Invitaciones | Revocar (🗑) |

### Caso especial: ADMIN en Miembros (la trampa)

Las acciones de miembros (cambiar rol, remover) las gatea `organizacion.miembros.{update,remove}`.
Hasta el PR #90 el backend exigía un permiso legacy (`users.manage`) que **no estaba catalogado**,
y por eso un **ADMIN** veía esos botones deshabilitados aunque el backend se los permitía. Tras #90:

- **OWNER y ADMIN** → ven "Cambiar a Admin/Owner" y "Remover" **habilitados** (su wildcard `*` cubre las keys).
- **CustomRole sin esos permisos** → los ve **deshabilitados**.

Verificá explícitamente con un 2º usuario **ADMIN** (systemRole ADMIN) que puede cambiar/remover.

### No se gatea con permiso RBAC (a propósito)

- **"Reabrir período"**: gateado por **SystemRole OWNER/ADMIN** (`usePuedeReabrir`), no por permiso fino —
  el backend lo doble-gatea (`requireOwnerOrAdmin`). No aparece para un CustomRole.
- **"Impersonar…"**: gateado por `isOwner` (solo OWNER lo ve).

### Checklist Parte B

- [ ] Con el rol limitado, cada botón de la tabla de arriba se ve **deshabilitado** (no oculto).
- [ ] Los botones reales muestran **tooltip** explicativo al hacer hover.
- [ ] Los ítems de menú ("…" en Roles y Miembros) aparecen deshabilitados.
- [ ] Un 2º usuario **ADMIN** SÍ puede cambiar rol / remover miembros (regresión de #90).
- [ ] "Reabrir período" e "Impersonar" no aparecen para el rol limitado (gating por SystemRole).
- [ ] OWNER (control positivo) tiene todo habilitado.

## Notas

- El email del 2º usuario debe ser **nuevo** (flujo accept-and-register). Si ya existiera como
  usuario, el flujo de aceptación es distinto.
- Solo un OWNER puede asignar el rol OWNER al invitar (enforced en backend, PR #83) — no afecta
  este smoke porque acá se asigna un CustomRole.
