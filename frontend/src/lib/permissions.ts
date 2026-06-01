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
    },
    periodos: {
      read: 'contabilidad.periodos.read',
    },
    documentosFisicos: {
      read: 'contabilidad.documentos-fisicos.read',
    },
    tiposDocumento: {
      // El submódulo en el catálogo backend es `tipos-documento-fisico`
      // (catalogo.ts), NO `tipos-documento`. La key debe espejarlo exacto.
      read: 'contabilidad.tipos-documento-fisico.read',
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
