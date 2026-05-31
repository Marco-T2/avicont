# Smoke manual — Gating de permisos (frontend)

> Cómo verificar a mano que el gating de permisos del spine (#82) funciona end-to-end.
> El gating es **UX, no seguridad** — el candado real está en el backend (RBAC, 403).
> Este smoke comprueba que el frontend oculta/bloquea lo que el usuario no puede usar.

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

## Notas

- El email del 2º usuario debe ser **nuevo** (flujo accept-and-register). Si ya existiera como
  usuario, el flujo de aceptación es distinto.
- Solo un OWNER puede asignar el rol OWNER al invitar (enforced en backend, PR #83) — no afecta
  este smoke porque acá se asigna un CustomRole.
