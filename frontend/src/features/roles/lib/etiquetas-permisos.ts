// Traducción de las claves técnicas del catálogo a texto de UI.
//
// La clave (`contabilidad.asientos.post`) es inmutable y vive en el backend;
// estas etiquetas son sólo presentación y se pueden cambiar sin migrar nada.

// Los slugs del catálogo son identificadores SIN tilde (`organizacion`,
// `periodos`). Acá son texto en español (§1), así que los que llevan tilde o
// nombre propio se declaran; el resto se deriva.
const ETIQUETAS_GRUPO: Record<string, string> = {
  organizacion: 'Organización',
  sistema: 'Sistema',
  configuracion: 'Configuración',
  'feature-flags': 'Feature flags',
  'plan-cuentas': 'Plan de cuentas',
  'libro-diario': 'Libro diario',
  'libro-mayor': 'Libro mayor',
  periodos: 'Períodos fiscales',
  'cierre-mensual': 'Cierre mensual',
  eeff: 'Estados financieros',
  'tipos-documento-fisico': 'Tipos de documento físico',
  'documentos-fisicos': 'Documentos físicos',
  conciliacion: 'Conciliación',
  'tipos-registro': 'Tipos de registro',
};

// Un verbo por acción, SIEMPRE el mismo. Los hijos del árbol muestran sólo
// esto: el sustantivo ya lo da el submódulo que los agrupa, y repetirlo en cada
// fila ("Listar y ver cuentas bancarias y movimientos de conciliación" dentro
// del grupo Conciliación) es lo que convertía la pantalla en un muro de texto.
// La descripción completa del backend sigue accesible en el `title`.
const ETIQUETAS_ACCION: Record<string, string> = {
  read: 'Ver',
  create: 'Crear',
  update: 'Modificar',
  delete: 'Eliminar',
  post: 'Contabilizar',
  void: 'Anular',
  cerrar: 'Cerrar',
  reabrir: 'Reabrir',
  invite: 'Invitar',
  remove: 'Quitar',
  admin: 'Administrar',
  execute: 'Ejecutar',
  importar: 'Importar',
  conciliar: 'Conciliar',
  interact: 'Interactuar',
  'marcar-definitivo': 'Marcar definitivo',
  'edit-posted': 'Editar contabilizados',
};

// Acciones cuyo efecto NO se deshace desde la app, o que mueven la frontera de
// lo que la organización puede tocar. Sirven para marcar visualmente la fila:
// conceder "Ver" y conceder "Anular" no son la misma decisión.
//
// Es una clasificación de UI, no un dato del backend: si mañana el criterio
// cambia, se edita acá y no hay migración.
const ACCIONES_SENSIBLES = new Set([
  'delete',
  'void',
  'post',
  'cerrar',
  'marcar-definitivo',
  'admin',
  'remove',
  // Toca comprobantes ya CONTABILIZADOS (§4.3): conceder esto mueve la frontera
  // de lo inmutable, misma liga que anular o cerrar.
  'edit-posted',
]);

function derivar(slug: string): string {
  const conEspacios = slug.replace(/-/g, ' ');
  return conEspacios.charAt(0).toUpperCase() + conEspacios.slice(1);
}

/** Nombre visible de un módulo o submódulo. */
export function etiquetaGrupo(slug: string): string {
  return ETIQUETAS_GRUPO[slug] ?? derivar(slug);
}

/** Verbo visible de una acción. */
export function etiquetaAccion(accion: string): string {
  return ETIQUETAS_ACCION[accion] ?? derivar(accion);
}

/** ¿Conceder esta acción merece una advertencia visual? */
export function esAccionSensible(accion: string): boolean {
  return ACCIONES_SENSIBLES.has(accion);
}
