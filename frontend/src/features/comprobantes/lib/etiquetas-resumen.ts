import type { ContactoResumen, DocumentoRespaldoResumen } from '@/types/api';

const SIN_DOCUMENTO = '—';

/**
 * Etiqueta de la columna Contacto del listado:
 * - 0 contactos → "Sin contacto asociado"
 * - 1 contacto  → su nombre
 * - 2+ distintos → "Varios"
 */
export function etiquetaContacto(contactos: ContactoResumen[]): string {
  if (contactos.length === 0) return 'Sin contacto asociado';
  if (contactos.length === 1) return contactos[0]!.nombre;
  return 'Varios';
}

/** Tipo del documento de respaldo (o "Varios" si hay más de uno, "—" si no hay). */
export function etiquetaDocumentoTipo(documentos: DocumentoRespaldoResumen[]): string {
  if (documentos.length === 0) return SIN_DOCUMENTO;
  if (documentos.length === 1) return documentos[0]!.tipoNombre;
  return 'Varios';
}

/** Número del documento de respaldo (o "Varios" si hay más de uno, "—" si no hay). */
export function etiquetaDocumentoNumero(documentos: DocumentoRespaldoResumen[]): string {
  if (documentos.length === 0) return SIN_DOCUMENTO;
  if (documentos.length === 1) return documentos[0]!.numero;
  return 'Varios';
}
