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
    tiposDocumento: {
      // El submódulo en el catálogo backend es `tipos-documento-fisico`
      // (catalogo.ts), NO `tipos-documento`. La key debe espejarlo exacto.
      read: 'contabilidad.tipos-documento-fisico.read',
      create: 'contabilidad.tipos-documento-fisico.create',
      update: 'contabilidad.tipos-documento-fisico.update',
    },
  },
  organizacion: {
    miembros: {
      read: 'organizacion.miembros.read',
    },
    roles: {
      read: 'organizacion.roles.read',
    },
    features: {
      read: 'organizacion.features.read',
    },
  },
} as const;

// Tipo inferido del objeto — útil para funciones que reciben un permiso.
export type PermissionKey =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS][keyof (typeof PERMISSIONS)[keyof typeof PERMISSIONS]][keyof (typeof PERMISSIONS)[keyof typeof PERMISSIONS][keyof (typeof PERMISSIONS)[keyof typeof PERMISSIONS]]];
