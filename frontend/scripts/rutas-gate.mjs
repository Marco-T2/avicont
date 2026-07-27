// Qué pantallas cubre el gate de UI y cuáles no.
//
// Vive en un módulo propio —y no adentro de `gate-ui.mjs`— para que
// `src/routes/rutas-gate.test.ts` pueda compararlo contra el router de verdad.
// Sin esa comparación, una pantalla nueva quedaría fuera del gate en silencio y
// el verde seguiría diciendo "todo cubierto".

/** Anchos donde se evalúa el invariante: mobile chico y el breakpoint `md:`. */
export const VIEWPORTS = [375, 768];

/**
 * Rutas estáticas que el gate visita. Se listan a mano —en vez de derivarlas del
 * router en runtime— porque el gate corre en Node sin bundler y no puede importar
 * TSX. El test de drift es lo que mantiene esta lista honesta.
 */
export const RUTAS_GATE = [
  '/comprobantes',
  '/comprobantes/nuevo',
  '/conciliacion',
  '/conciliacion/informe',
  '/contactos',
  '/documentos-fisicos',
  '/eeff/balance',
  '/eeff/balance-comprobacion',
  '/eeff/evolucion-patrimonio',
  '/eeff/flujo-efectivo',
  '/eeff/hoja-trabajo',
  '/eeff/resultados',
  '/libros/diario',
  '/libros/mayor',
  '/movimientos-bancarios',
  '/periodos-fiscales',
  '/plan-cuentas',
  '/settings/complementos',
  '/settings/cuentas-bancarias',
  '/settings/empresa',
  '/settings/features',
  '/settings/members',
  '/settings/roles',
  '/settings/roles/nuevo',
  '/tipos-documento-fisico',
];

/**
 * Rutas estáticas del router que el gate NO cubre, cada una con su motivo.
 *
 * Se declaran explícitamente en vez de omitirse: una exclusión sin nombre es
 * indistinguible de un olvido, y el verde del gate se leería como cobertura
 * total cuando no lo es.
 */
export const RUTAS_EXCLUIDAS = {
  '/': 'Redirector: no renderiza layout propio, rebota según el vertical activo.',
  '/gestiones/cierre':
    'Redirector a la gestión más reciente; sin gestiones en el seed rebota a /periodos-fiscales. La pantalla real vive en /gestiones/:id/cierre, que necesita un id de la BD.',
  '/login': 'Pública, fuera del DashboardShell — no tiene <main> que medir.',
  '/register': 'Pública, ídem /login.',
  '/accept-invite': 'Pública y exige un token de invitación válido en la URL.',
  '/granja':
    'La org del seed es vertical CONTABILIDAD (granjaEnabled:false) ⇒ renderiza <SinModulo>. Medir eso no mide la pantalla de granja.',
  '/granja/lotes':
    'Ídem /granja: sin una org con granjaEnabled:true en el seed, la pantalla real nunca se monta.',
  '/granja/tipos-registro':
    'Ídem /granja: sin una org con granjaEnabled:true en el seed, la pantalla real nunca se monta.',
  '/platform-admin':
    'Exige isSuperAdmin y el founder del seed no lo es; con otro usuario habría que sostener dos sesiones en el gate.',
  '/platform-admin/orgs':
    'Ídem /platform-admin: la consola de super-admin no es alcanzable con el usuario del seed.',
  '/platform-admin/feature-flags':
    'Ídem /platform-admin: la consola de super-admin no es alcanzable con el usuario del seed.',
};
