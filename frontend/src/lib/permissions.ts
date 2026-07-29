// Objeto central de constantes de permisos. Anti-drift: strings sueltos
// son foco de typos silenciosos que dan false sin error visible.
//
// Los strings DEBEN espejar EXACTAMENTE el catálogo del backend
// (backend/src/common/permisos/catalogo.ts). Usar guiones, NO camelCase.
// Verificar contra el catalogo antes de agregar nuevos permisos.
//
// D-F6 del design: tipado `as const` da autocomplete y single source of truth.

export const PERMISSIONS = {
  contabilidad: {
    // "Asiento" es el sinónimo user-facing de Comprobante en el catálogo RBAC
    // (CLAUDE.md §1): en código la entidad es Comprobante, en permisos es asientos.
    asientos: {
      read: 'contabilidad.asientos.read',
      create: 'contabilidad.asientos.create',
      update: 'contabilidad.asientos.update',
      delete: 'contabilidad.asientos.delete',
      post: 'contabilidad.asientos.post',
      void: 'contabilidad.asientos.void',
    },
    planCuentas: {
      read: 'contabilidad.plan-cuentas.read',
      create: 'contabilidad.plan-cuentas.create',
      update: 'contabilidad.plan-cuentas.update',
      // El endpoint es DELETE pero la operación es "desactivar" (soft-delete).
      delete: 'contabilidad.plan-cuentas.delete',
    },
    /** Balance General + Estado de Resultados. */
    eeff: {
      read: 'contabilidad.eeff.read',
    },
    libroDiario: {
      read: 'contabilidad.libro-diario.read',
    },
    libroMayor: {
      read: 'contabilidad.libro-mayor.read',
    },
    contactos: {
      read: 'contabilidad.contactos.read',
      create: 'contabilidad.contactos.create',
      update: 'contabilidad.contactos.update',
    },
    gestiones: {
      read: 'contabilidad.gestiones.read',
      create: 'contabilidad.gestiones.create',
      cerrar: 'contabilidad.gestiones.cerrar',
    },
    periodos: {
      read: 'contabilidad.periodos.read',
      cerrar: 'contabilidad.periodos.cerrar',
      // reabrir exige además SystemRole OWNER/ADMIN (requireOwnerOrAdmin) —
      // por eso el botón reabrir sigue gateado con usePuedeReabrir, no acá.
      reabrir: 'contabilidad.periodos.reabrir',
    },
    documentosFisicos: {
      read: 'contabilidad.documentos-fisicos.read',
      create: 'contabilidad.documentos-fisicos.create',
      update: 'contabilidad.documentos-fisicos.update',
      delete: 'contabilidad.documentos-fisicos.delete',
    },
    /** Módulo comercial. Las pantallas llegan en la fase 6 del change. */
    items: {
      read: 'contabilidad.items.read',
      create: 'contabilidad.items.create',
      update: 'contabilidad.items.update',
      // El endpoint es DELETE pero la operación es "desactivar" (soft-delete).
      delete: 'contabilidad.items.delete',
    },
    ventas: {
      read: 'contabilidad.ventas.read',
      create: 'contabilidad.ventas.create',
      update: 'contabilidad.ventas.update',
      delete: 'contabilidad.ventas.delete',
      post: 'contabilidad.ventas.post',
      void: 'contabilidad.ventas.void',
    },
    cobros: {
      read: 'contabilidad.cobros.read',
      create: 'contabilidad.cobros.create',
      // Aplicar y desaplicar un cobro caen acá: mutan el vínculo con la
      // venta, no crean un hecho contable.
      update: 'contabilidad.cobros.update',
      delete: 'contabilidad.cobros.delete',
      post: 'contabilidad.cobros.post',
      void: 'contabilidad.cobros.void',
    },
    tiposDocumento: {
      // El submódulo en el catálogo backend es `tipos-documento-fisico`
      // (catalogo.ts), NO `tipos-documento`. La key debe espejarlo exacto.
      read: 'contabilidad.tipos-documento-fisico.read',
      create: 'contabilidad.tipos-documento-fisico.create',
      update: 'contabilidad.tipos-documento-fisico.update',
    },
    // Pack `contabilidad.conciliacion` (conciliación bancaria). Primer pack
    // con permisos propios en el catálogo — ver NavItem con `pack` en nav-items.ts.
    conciliacion: {
      read: 'contabilidad.conciliacion.read',
      create: 'contabilidad.conciliacion.create',
      update: 'contabilidad.conciliacion.update',
      delete: 'contabilidad.conciliacion.delete',
      importar: 'contabilidad.conciliacion.importar',
      conciliar: 'contabilidad.conciliacion.conciliar',
    },
  },
  granja: {
    dashboard: { read: 'granja.dashboard.read' },
    lotes: {
      read: 'granja.lotes.read',
      create: 'granja.lotes.create',
      update: 'granja.lotes.update',
      delete: 'granja.lotes.delete',
    },
    // G-9: asimetría intencional — key JS camelCase `tiposRegistro` ↔ string kebab
    // `granja.tipos-registro.*`. Espeja `tiposDocumento` en contabilidad. NO corregir.
    tiposRegistro: {
      read: 'granja.tipos-registro.read',
      create: 'granja.tipos-registro.create',
      update: 'granja.tipos-registro.update',
      delete: 'granja.tipos-registro.delete',
    },
    movimientos: {
      read: 'granja.movimientos.read',
      create: 'granja.movimientos.create',
      update: 'granja.movimientos.update',
      delete: 'granja.movimientos.delete',
    },
    chat: { interact: 'granja.chat.interact' },
  },
  organizacion: {
    configuracion: {
      read: 'organizacion.configuracion.read',
      update: 'organizacion.configuracion.update',
    },
    miembros: {
      read: 'organizacion.miembros.read',
      invite: 'organizacion.miembros.invite',
      update: 'organizacion.miembros.update',
      remove: 'organizacion.miembros.remove',
    },
    roles: {
      read: 'organizacion.roles.read',
      create: 'organizacion.roles.create',
      update: 'organizacion.roles.update',
      delete: 'organizacion.roles.delete',
    },
    // El backend los llama `feature-flags`, no `features`. El espejo decía
    // `organizacion.features.read` — un permiso que no existe en el catálogo,
    // así que el gate quedaba cerrado para siempre a todo rol personalizado.
    // Lo cubre ahora `backend/src/common/permisos/catalogo-vs-espejo-frontend.spec.ts`.
    featureFlags: {
      read: 'organizacion.feature-flags.read',
      update: 'organizacion.feature-flags.update',
    },
    billing: {
      read: 'organizacion.billing.read',
    },
  },
} as const;

// Tipo inferido del objeto — útil para funciones que reciben un permiso.
export type PermissionKey =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS][keyof (typeof PERMISSIONS)[keyof typeof PERMISSIONS]][keyof (typeof PERMISSIONS)[keyof typeof PERMISSIONS][keyof (typeof PERMISSIONS)[keyof typeof PERMISSIONS]]];
