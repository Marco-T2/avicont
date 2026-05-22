import { api } from '@/lib/api';

// DELETE /api/contactos/:id — eliminación física.
// Fuera de scope del slice 1: no hay botón de eliminar en la UI todavía.
// Este archivo expone la función para cuando se construya el flujo de borrado
// definitivo (requiere confirmación explícita del usuario).
export async function eliminarContacto(id: string): Promise<void> {
  await api.delete(`/api/contactos/${id}`);
}
