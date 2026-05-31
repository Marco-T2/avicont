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
    comprobantes: {
      read: 'contabilidad.comprobantes.read',
      create: 'contabilidad.comprobantes.create',
      update: 'contabilidad.comprobantes.update',
      delete: 'contabilidad.comprobantes.delete',
    },
    asientos: {
      read: 'contabilidad.asientos.read',
      create: 'contabilidad.asientos.create',
      update: 'contabilidad.asientos.update',
      delete: 'contabilidad.asientos.delete',
      post: 'contabilidad.asientos.post',
      void: 'contabilidad.asientos.void',
    },
    cuentas: {
      read: 'contabilidad.cuentas.read',
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
  },
} as const;

// Tipo inferido del objeto — útil para funciones que reciben un permiso.
export type PermissionKey =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS][keyof (typeof PERMISSIONS)[keyof typeof PERMISSIONS]][keyof (typeof PERMISSIONS)[keyof typeof PERMISSIONS][keyof (typeof PERMISSIONS)[keyof typeof PERMISSIONS]]];
