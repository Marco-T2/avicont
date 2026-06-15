# Datos de la Empresa — Especificación

<!--
Última edición: 2026-06-15
Última revisión contra core: 2026-06-15
Owner: backend-lead
-->

## Propósito

Perfil fiscal editable de la organización: los 6 campos (`razonSocial`, `nit`, `direccion`, `representanteLegal`, `telefono`, `email`) son optativos y nullable. Habilitan la cabecera de informes contables bolivianos. El campo `tipoEmpresaPrincipal` (enum `TipoEmpresa`, 8 valores) es editable mientras la org no tenga gestiones fiscales registradas — una vez existe al menos una gestión, queda inmutable (`TENANT_EMPRESA_INMUTABLE`, 409). Export a Excel/PDF y logo quedan fuera de scope.

---

## Requisitos

### Requisito: Exposición de campos fiscales en GET

El endpoint `GET /tenants/current` DEBE devolver los 6 campos del perfil fiscal. Cuando un campo no ha sido seteado, DEBE devolverse como `null`. Ningún campo es obligatorio para que la org opere. La respuesta DEBE incluir también `tipoEmpresaPrincipal` (valor actual del enum) y `tipoEmpresaEditable` (boolean derivado de la existencia de gestiones).

#### Escenario: Org sin perfil fiscal configurado

- DADO un usuario autenticado con tenant activo que nunca configuró datos fiscales
- CUANDO hace `GET /tenants/current`
- ENTONCES la respuesta incluye `"razonSocial": null, "nit": null, "direccion": null, "representanteLegal": null, "telefono": null, "email": null`
- Y la respuesta incluye `"tipoEmpresaPrincipal": "COMERCIAL"` (valor por defecto del modelo)
- Y la respuesta incluye `"tipoEmpresaEditable": true` (sin gestiones)

#### Escenario: Org con perfil fiscal parcialmente configurado

- DADO un tenant con `razonSocial` y `nit` seteados, los demás null
- CUANDO hace `GET /tenants/current`
- ENTONCES `razonSocial` y `nit` muestran sus valores, el resto devuelve `null`
- Y `tipoEmpresaPrincipal` muestra el tipo actual de la org

#### Escenario: Org con gestión existente refleja no-editable

- DADO un tenant con una gestión fiscal registrada
- CUANDO hace `GET /tenants/current`
- ENTONCES `"tipoEmpresaEditable": false`

---

### Requisito: Actualización parcial del perfil fiscal

`PATCH /tenants/current` DEBE aceptar cualquier subconjunto de los 6 campos fiscales. Un campo ausente en el payload NO DEBE modificarse. Un campo presente con valor DEBE actualizarse. Un campo presente con valor `null` DEBE setearse a null (desmapear).

#### Escenario: Actualización de un solo campo

- DADO un usuario con permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current` con `{ "razonSocial": "Avicultura del Norte S.R.L." }`
- ENTONCES solo `razonSocial` se actualiza; los otros 5 campos no se modifican
- Y `GET /tenants/current` devuelve el nuevo valor

#### Escenario: Payload vacío no rompe el estado

- DADO un tenant con perfil fiscal completo
- CUANDO hace `PATCH /tenants/current` con `{}`
- ENTONCES la respuesta es 200 y todos los campos mantienen sus valores previos

#### Escenario: Desmapear un campo (setear a null)

- DADO un tenant con `nit` seteado
- CUANDO hace `PATCH /tenants/current` con `{ "nit": null }`
- ENTONCES `nit` queda `null` en la respuesta y en BD

---

### Requisito: Validación del NIT

El campo `nit`, cuando está presente y no es `null`, DEBE cumplir el patrón `^\d{7,12}$` (solo dígitos, entre 7 y 12 caracteres). Un NIT inválido DEBE rechazarse con HTTP 400 y code de error `TENANT_NIT_INVALIDO`.

> Referencia normativa: RND 10-0025-14 — misma regla que el value object `Nit` en `backend/src/common/domain/nit.ts`.

#### Escenario: NIT válido (7 dígitos)

- DADO un usuario con permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current` con `{ "nit": "1234567" }`
- ENTONCES la respuesta es 200 y `nit` queda `"1234567"`

#### Escenario: NIT válido (12 dígitos)

- DADO un usuario con permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current` con `{ "nit": "123456789012" }`
- ENTONCES la respuesta es 200

#### Escenario: NIT con letras

- DADO un usuario con permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current` con `{ "nit": "12345AB" }`
- ENTONCES la respuesta es 400 con `error.code === "TENANT_NIT_INVALIDO"`

#### Escenario: NIT demasiado corto (< 7 dígitos)

- DADO un usuario con permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current` con `{ "nit": "12345" }`
- ENTONCES la respuesta es 400 con `error.code === "TENANT_NIT_INVALIDO"`

#### Escenario: NIT demasiado largo (> 12 dígitos)

- DADO un usuario con permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current` con `{ "nit": "1234567890123" }`
- ENTONCES la respuesta es 400 con `error.code === "TENANT_NIT_INVALIDO"`

---

### Requisito: Validación del email

El campo `email`, cuando está presente y no es `null`, DEBE tener formato de dirección de correo válida (RFC 5321). Un email malformado DEBE rechazarse con HTTP 400 y code de error `TENANT_EMAIL_INVALIDO`.

#### Escenario: Email válido

- DADO un usuario con permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current` con `{ "email": "contacto@empresa.com" }`
- ENTONCES la respuesta es 200

#### Escenario: Email malformado

- DADO un usuario con permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current` con `{ "email": "no-es-un-email" }`
- ENTONCES la respuesta es 400 con `error.code === "TENANT_EMAIL_INVALIDO"`

---

### Requisito: Longitudes máximas de campos de texto

Los campos de texto libre DEBEN respetar los siguientes `maxLength`:

| Campo | maxLength |
|-------|-----------|
| `razonSocial` | 200 |
| `direccion` | 300 |
| `representanteLegal` | 150 |
| `telefono` | 30 |

Un campo que supere su maxLength DEBE rechazarse con HTTP 400.

#### Escenario: Razón social dentro del límite

- DADO un usuario con permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current` con `razonSocial` de 200 caracteres
- ENTONCES la respuesta es 200

#### Escenario: Razón social supera el límite

- DADO un usuario con permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current` con `razonSocial` de 201 caracteres
- ENTONCES la respuesta es 400

---

### Requisito: Gating de permisos en el backend

`PATCH /tenants/current` DEBE rechazar con HTTP 403 a cualquier usuario que no tenga el permiso `organizacion.configuracion.update`. `GET /tenants/current` permanece con su gating existente (sin cambios).

#### Escenario: PATCH sin permiso suficiente

- DADO un usuario autenticado en un tenant pero sin el permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current` con cualquier campo fiscal
- ENTONCES la respuesta es 403

#### Escenario: PATCH con permiso (Owner)

- DADO un usuario con permiso `organizacion.configuracion.update` (ej. Owner o Admin con el permiso)
- CUANDO hace `PATCH /tenants/current` con datos fiscales válidos
- ENTONCES la respuesta es 200

---

### Requisito: Aislamiento multi-tenant

Un usuario SOLO PUEDE editar el perfil fiscal de su propia organización. El endpoint resuelve el `tenantId` del JWT. No existe endpoint para que un usuario edite la org de otro tenant (excepto super-admin, cuyo flujo es cross-tenant y está fuera de scope de este requisito).

#### Escenario: Usuario edita su propia org

- DADO un usuario con `activeTenantId = "org-A"` y permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current`
- ENTONCES solo `"org-A"` se actualiza

---

### Requisito: Página /settings/empresa en el frontend

La ruta `/settings/empresa` DEBE existir en el frontend y estar gateada por `RequirePermission` con permiso de lectura (`organizacion.configuracion.read` o equivalente que permita ver los datos). El formulario DEBE precargar los valores actuales desde `GET /tenants/current`, incluyendo `tipoEmpresaPrincipal`. Al guardar, DEBE llamar `PATCH /tenants/current` con solo los campos del formulario. Los errores de validación del backend (NIT inválido, email malformado) DEBEN mostrarse al usuario en español junto al campo correspondiente.

#### Escenario: Acceso sin permiso

- DADO un usuario sin el permiso de lectura de configuración
- CUANDO navega a `/settings/empresa`
- ENTONCES es redirigido o ve pantalla de acceso denegado (misma UX que el resto del gating de la app)

#### Escenario: Precarga de datos existentes

- DADO un tenant con `razonSocial = "Avicultura Norte S.R.L."` y `nit = "1234567"` y `tipoEmpresaPrincipal = "AGROPECUARIA"`
- CUANDO un usuario con permiso accede a `/settings/empresa`
- ENTONCES el formulario muestra esos valores en los campos correspondientes, incluyendo `AGROPECUARIA` seleccionado en el `<Select>`

#### Escenario: Guardar NIT inválido muestra error

- DADO un usuario en `/settings/empresa`
- CUANDO ingresa `nit = "ABC"` y presiona guardar
- ENTONCES el backend devuelve 400 con `TENANT_NIT_INVALIDO`
- Y el formulario muestra el mensaje de error en español junto al campo NIT

#### Escenario: Guardar con datos válidos

- DADO un usuario con permiso en `/settings/empresa`
- CUANDO completa el formulario con datos válidos y guarda
- ENTONCES la llamada a `PATCH /tenants/current` retorna 200
- Y el formulario refleja los nuevos valores

---

### Requisito: Flag de editabilidad de tipoEmpresaPrincipal en GET

El endpoint `GET /tenants/current` DEBE devolver el campo `tipoEmpresaEditable: boolean`. Su valor DEBE ser `true` cuando la organización NO tiene ninguna gestión fiscal registrada, y `false` en caso contrario. El campo DEBE derivarse de `GestionesReaderPort.existeAlgunaGestion` en el servicio.

#### Escenario: Org sin gestión devuelve editable = true

- DADO un tenant sin ninguna gestión fiscal registrada
- CUANDO hace `GET /tenants/current`
- ENTONCES la respuesta incluye `"tipoEmpresaEditable": true`

#### Escenario: Org con al menos una gestión devuelve editable = false

- DADO un tenant con al menos una gestión fiscal registrada
- CUANDO hace `GET /tenants/current`
- ENTONCES la respuesta incluye `"tipoEmpresaEditable": false`

---

### Requisito: Endpoint GET /tenants/current tipado en OpenAPI

El endpoint `GET /tenants/current` DEBE estar decorado con `@ApiOkResponse` apuntando a un `TenantResponseDto` tipado que incluya todos los campos de la respuesta, incluyendo los 6 campos fiscales y el nuevo `tipoEmpresaEditable`. El contrato DEBE generar un tipo correcto en `api.generated.ts` al regenerar.

#### Escenario: contract-drift verde tras regenerar

- DADO el endpoint decorado con `@ApiOkResponse(TenantResponseDto)`
- CUANDO se ejecuta `openapi:dump` + `gen:api-types`
- ENTONCES `git diff --exit-code` sobre `openapi.json` y `api.generated.ts` no produce diferencias
- Y el job `contract-drift` del CI pasa en verde

---

### Requisito: Edición de tipoEmpresaPrincipal en formulario de empresa (frontend)

El formulario de perfil de empresa (`/settings/empresa`) DEBE incluir un `<Select>` para `tipoEmpresaPrincipal` con las 8 opciones del enum `TipoEmpresa`. El campo DEBE estar habilitado cuando `tipoEmpresaEditable === true` y DEBE estar deshabilitado con un tooltip explicativo cuando `tipoEmpresaEditable === false`. Al guardar, el valor seleccionado DEBE enviarse en el payload de `PATCH /tenants/current`.

#### Escenario: Select habilitado sin gestión

- DADO un usuario con permiso `organizacion.configuracion.update` en tenant sin gestiones
- CUANDO accede a `/settings/empresa`
- ENTONCES el `<Select>` de tipo de empresa muestra el valor actual y está habilitado

#### Escenario: Select deshabilitado con gestión existente

- DADO un usuario en tenant con al menos una gestión fiscal
- CUANDO accede a `/settings/empresa`
- ENTONCES el `<Select>` de tipo de empresa está deshabilitado
- Y al hacer hover sobre él se muestra un tooltip explicativo (no se oculta el campo)

#### Escenario: Guardar cambio de tipo exitoso

- DADO un usuario con permiso `organizacion.configuracion.update` en tenant sin gestiones
- CUANDO selecciona `AGROPECUARIA` en el `<Select>` y presiona guardar
- ENTONCES el formulario llama `PATCH /tenants/current` con `{ "tipoEmpresaPrincipal": "AGROPECUARIA" }`
- Y la respuesta es 200

#### Escenario: Botón de guardar deshabilitado mientras la mutación está pendiente

- DADO un usuario que presiona guardar en el formulario
- CUANDO la mutación está en curso (`isPending === true`)
- ENTONCES el botón de guardar está deshabilitado hasta que la respuesta llegue

---

### Requisito: Enum de tipoEmpresaPrincipal con validación estricta en backend

`PATCH /tenants/current` DEBE rechazar con HTTP 400 cualquier valor de `tipoEmpresaPrincipal` que no pertenezca al enum `TipoEmpresa` (`COMERCIAL`, `SERVICIOS`, `TRANSPORTE`, `INDUSTRIAL`, `PETROLERA`, `CONSTRUCCION`, `AGROPECUARIA`, `MINERA`).

#### Escenario: Valor de enum válido

- DADO un usuario con permiso `organizacion.configuracion.update` en tenant sin gestiones
- CUANDO hace `PATCH /tenants/current` con `{ "tipoEmpresaPrincipal": "MINERA" }`
- ENTONCES la respuesta es 200 y `tipoEmpresaPrincipal` queda `"MINERA"`

#### Escenario: Valor fuera del enum

- DADO un usuario con permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current` con `{ "tipoEmpresaPrincipal": "OTRO" }`
- ENTONCES la respuesta es 400 con error de validación

---

### Requisito: Inmutabilidad de tipoEmpresaPrincipal post-gestión (backend)

`PATCH /tenants/current` DEBE rechazar con HTTP 409 y code `TENANT_EMPRESA_INMUTABLE` cualquier intento de cambiar `tipoEmpresaPrincipal` cuando la organización ya tiene al menos una gestión fiscal registrada.

#### Escenario: Cambio rechazado con gestión existente

- DADO un tenant con al menos una gestión fiscal
- Y un usuario con permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current` con `{ "tipoEmpresaPrincipal": "SERVICIOS" }`
- ENTONCES la respuesta es 409 con `error.code === "TENANT_EMPRESA_INMUTABLE"`

#### Escenario: Cambio permitido sin gestiones

- DADO un tenant sin ninguna gestión fiscal
- Y un usuario con permiso `organizacion.configuracion.update`
- CUANDO hace `PATCH /tenants/current` con `{ "tipoEmpresaPrincipal": "SERVICIOS" }`
- ENTONCES la respuesta es 200

---

## Restricciones

- Los campos `name`, `plan`, `status` y entitlement NO son parte de este change; siguen con su comportamiento actual.
- Export a Excel/PDF y upload de logo están fuera de scope.
- La validación de NIT es solo de formato (7-12 dígitos); no hay consulta al padrón del SIN.
- `tipoEmpresaPrincipal` es editable solo en `/settings/empresa` (edit); `CreateTenantDto` es un follow-up diferido.
- La inmutabilidad de `tipoEmpresaPrincipal` es autoritativa en el backend (`TENANT_EMPRESA_INMUTABLE`); el frontend la refleja deshabilitando el `<Select>` via `tipoEmpresaEditable`, pero el guard backend es el enforcement real (§14.7).
