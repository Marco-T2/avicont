import { pdf } from '@react-pdf/renderer';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';

import type { LibroDiarioPdfModelo } from './exportar-libro-diario-pdf';
import { LibroDiarioPdfDocument } from './libro-diario-pdf-document';

/**
 * Builder del Libro Diario AGRUPADO por comprobante: ensambla el documento
 * react-pdf y devuelve su Blob.
 *
 * Importa @react-pdf/renderer (pesado) — debe consumirse vía dynamic import desde
 * el handler del botón para no entrar al chunk de la ruta. Render frontend-puro:
 * los números ya vienen computados del backend; este builder solo MAQUETA.
 */
export interface ConstruirLibroDiarioPdfParams {
  /** Título del informe (ej. "Libro Diario"). */
  titulo: string;
  /** Subtítulo: rango legible (ej. "Del 01/06/2026 al 30/06/2026"). */
  subtitulo: string;
  /** Perfil fiscal para la cabecera del informe (campos null se omiten). */
  perfil: EmpresaPerfil;
  /** Modelo agrupado por comprobante. */
  modelo: LibroDiarioPdfModelo;
}

export async function construirLibroDiarioPdf(
  params: ConstruirLibroDiarioPdfParams,
): Promise<Blob> {
  return pdf(<LibroDiarioPdfDocument {...params} />).toBlob();
}
