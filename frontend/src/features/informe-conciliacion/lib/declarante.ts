/**
 * Cómo se nombra al autor de una declaración de arranque.
 *
 * REQ-ICB-04 pide un acto ATRIBUIDO. Un UUID no atribuye nada a una persona:
 * quien lee el papel de trabajo es un contador, no el que consulta la base.
 * Cuando el backend no puede resolver el id dentro de la organización —un acto
 * viejo de alguien que ya no es miembro— se dice eso, en castellano, en vez de
 * mostrar el identificador crudo.
 */
export function nombreDelDeclarante(declaradoPorNombre: string | null | undefined): string {
  return declaradoPorNombre ?? 'un usuario que ya no pertenece a la organización';
}
