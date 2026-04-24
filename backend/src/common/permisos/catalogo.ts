// Catálogo único de permisos del sistema. Es la fuente de verdad sobre qué
// cadenas son válidas para asignar a un CustomRole.
//
// Reglas (ver CLAUDE.md §10.4 y permission-matcher.ts):
//   - Formato: {modulo}.{submodulo}.{accion}
//   - Acciones canónicas: read, create, update, delete, post, void, execute, interact
//   - Los wildcards (modulo.*, modulo.submodulo.*, modulo.*.accion) son válidos
//     solo en CustomRole.permissions, no en este catálogo.
//
// Cuando agregás un módulo o un endpoint nuevo:
//   1. Agregá el permiso fino acá.
//   2. Decoralo con @RequirePermissions('...') en el controller.
//   3. Si corresponde, sumalo a los templates en prisma/seed.ts.

export interface PermisoCatalogado {
  key: string;
  modulo: string;
  submodulo: string;
  accion: string;
  descripcion: string;
}

interface DefinicionGrupo {
  modulo: string;
  submodulo: string;
  // Mapa accion -> descripción
  acciones: Record<string, string>;
}

const definir = (grupos: DefinicionGrupo[]): PermisoCatalogado[] => {
  const out: PermisoCatalogado[] = [];
  for (const g of grupos) {
    for (const [accion, descripcion] of Object.entries(g.acciones)) {
      out.push({
        key: `${g.modulo}.${g.submodulo}.${accion}`,
        modulo: g.modulo,
        submodulo: g.submodulo,
        accion,
        descripcion,
      });
    }
  }
  return out;
};

// Acciones CRUD básicas reutilizables.
const CRUD = (entidad: string) => ({
  read: `Listar y ver ${entidad}`,
  create: `Crear ${entidad}`,
  update: `Modificar ${entidad}`,
  delete: `Eliminar ${entidad}`,
});

export const CATALOGO_PERMISOS: PermisoCatalogado[] = definir([
  // ---------- Organización (administración general) ----------
  {
    modulo: 'organizacion',
    submodulo: 'configuracion',
    acciones: {
      read: 'Ver configuración de la organización',
      update: 'Modificar configuración de la organización',
    },
  },
  {
    modulo: 'organizacion',
    submodulo: 'miembros',
    acciones: {
      read: 'Listar miembros de la organización',
      invite: 'Invitar miembros a la organización',
      update: 'Modificar el rol de un miembro',
      remove: 'Quitar un miembro de la organización',
    },
  },
  {
    modulo: 'organizacion',
    submodulo: 'roles',
    acciones: {
      read: 'Listar y ver roles personalizados',
      create: 'Crear roles personalizados',
      update: 'Modificar roles personalizados',
      delete: 'Eliminar roles personalizados',
    },
  },
  {
    modulo: 'organizacion',
    submodulo: 'auditoria',
    acciones: { read: 'Consultar bitácora de auditoría' },
  },
  {
    modulo: 'organizacion',
    submodulo: 'feature-flags',
    acciones: {
      read: 'Ver feature flags habilitados',
      update: 'Modificar feature flags de la organización',
    },
  },

  // ---------- Sistema (operaciones cross-tenant) ----------
  // Estos permisos son CROSS-TENANT pero hoy el modelo RBAC es
  // tenant-scoped: cualquier OWNER/ADMIN los matchea vía el wildcard '*'
  // del resolver. Refinar cuando se formalice super-admin global —
  // ver docs/deudas-arquitecturales.md §3.3 (deuda abierta).
  {
    modulo: 'sistema',
    submodulo: 'feature-flags',
    acciones: {
      admin: 'Administrar catálogo global de feature flags (cross-tenant)',
    },
  },

  // ---------- Contabilidad ----------
  {
    modulo: 'contabilidad',
    submodulo: 'dashboard',
    acciones: { read: 'Ver dashboard contable' },
  },
  {
    modulo: 'contabilidad',
    submodulo: 'plan-cuentas',
    acciones: CRUD('cuentas del plan'),
  },
  {
    modulo: 'contabilidad',
    submodulo: 'asientos',
    acciones: {
      ...CRUD('asientos contables'),
      post: 'Contabilizar asientos (DRAFT → CONTABILIZADO)',
      void: 'Anular asientos contabilizados',
    },
  },
  {
    modulo: 'contabilidad',
    submodulo: 'libro-diario',
    acciones: { read: 'Consultar libro diario' },
  },
  {
    modulo: 'contabilidad',
    submodulo: 'libro-mayor',
    acciones: { read: 'Consultar libro mayor' },
  },
  {
    modulo: 'contabilidad',
    submodulo: 'ventas',
    acciones: {
      ...CRUD('ventas'),
      post: 'Contabilizar ventas',
      void: 'Anular ventas',
    },
  },
  {
    modulo: 'contabilidad',
    submodulo: 'compras',
    acciones: {
      ...CRUD('compras'),
      post: 'Contabilizar compras',
      void: 'Anular compras',
    },
  },
  {
    modulo: 'contabilidad',
    submodulo: 'gestiones',
    acciones: {
      read: 'Consultar gestiones fiscales',
      create: 'Crear gestión fiscal (genera los 12 períodos)',
      cerrar: 'Cerrar gestión fiscal anual',
    },
  },
  {
    modulo: 'contabilidad',
    submodulo: 'periodos',
    acciones: {
      read: 'Consultar períodos fiscales',
      cerrar: 'Cerrar período fiscal mensual',
      reabrir: 'Reabrir período fiscal cerrado (con motivo auditado)',
      'marcar-definitivo': 'Marcar período como definitivo (irreversible)',
    },
  },
  {
    modulo: 'contabilidad',
    submodulo: 'cierre-mensual',
    acciones: {
      read: 'Consultar cierres mensuales',
      execute: 'Ejecutar cierre mensual del período',
    },
  },
  {
    modulo: 'contabilidad',
    submodulo: 'eeff',
    acciones: { read: 'Ver Estados Financieros (Balance, Resultados, etc.)' },
  },
  {
    modulo: 'contabilidad',
    submodulo: 'configuracion',
    acciones: {
      read: 'Ver configuración contable',
      update: 'Modificar configuración contable',
    },
  },

  // ---------- Granja ----------
  {
    modulo: 'granja',
    submodulo: 'dashboard',
    acciones: { read: 'Ver dashboard de granja' },
  },
  {
    modulo: 'granja',
    submodulo: 'lotes',
    acciones: CRUD('lotes de aves'),
  },
  {
    modulo: 'granja',
    submodulo: 'tipos-registro',
    acciones: CRUD('tipos de registro de granja'),
  },
  {
    modulo: 'granja',
    submodulo: 'movimientos',
    acciones: CRUD('movimientos de inversión y cantidad'),
  },
  {
    modulo: 'granja',
    submodulo: 'chat',
    acciones: { interact: 'Interactuar con el asistente IA de granja' },
  },
]);

// Set para validación O(1) de permisos finos.
const KEYS_VALIDOS = new Set(CATALOGO_PERMISOS.map((p) => p.key));

// Verifica que un permiso "fino" (sin wildcards) exista en el catálogo.
export function permisoExisteEnCatalogo(key: string): boolean {
  return KEYS_VALIDOS.has(key);
}

// Devuelve todos los permisos finos que matchearían un patrón con wildcards.
// Útil para mostrar al usuario qué permisos otorga un wildcard al crearlo.
export function expandirPatron(pattern: string): string[] {
  if (pattern === '*') {
    return [...KEYS_VALIDOS];
  }
  const parts = pattern.split('.');
  if (parts.length < 2 || parts.length > 3) return [];

  return CATALOGO_PERMISOS.filter((p) => {
    const segs = [p.modulo, p.submodulo, p.accion];
    if (segs.length !== parts.length) return false;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '*') continue;
      if (parts[i] !== segs[i]) return false;
    }
    return true;
  }).map((p) => p.key);
}

// Vista agrupada para el frontend (UI de asignación de permisos).
export interface CatalogoAgrupado {
  modulo: string;
  submodulos: Array<{
    submodulo: string;
    permisos: PermisoCatalogado[];
  }>;
}

export function catalogoAgrupado(): CatalogoAgrupado[] {
  const porModulo = new Map<string, Map<string, PermisoCatalogado[]>>();

  for (const p of CATALOGO_PERMISOS) {
    if (!porModulo.has(p.modulo)) porModulo.set(p.modulo, new Map());
    const mods = porModulo.get(p.modulo)!;
    if (!mods.has(p.submodulo)) mods.set(p.submodulo, []);
    mods.get(p.submodulo)!.push(p);
  }

  const out: CatalogoAgrupado[] = [];
  for (const [modulo, mods] of porModulo) {
    out.push({
      modulo,
      submodulos: Array.from(mods.entries()).map(([submodulo, permisos]) => ({
        submodulo,
        permisos,
      })),
    });
  }
  return out;
}
