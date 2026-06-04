/**
 * Genera el nombre de archivo para el export.
 *
 * §1: nombre en español con extensión .xlsx.
 * Ejemplo: generarNombreArchivo('libro-diario', '2026-06') → 'libro-diario-2026-06.xlsx'
 */
export function generarNombreArchivo(informe: string, rango: string): string {
  return `${informe}-${rango}.xlsx`;
}

/**
 * Dispara la descarga de un Blob en el navegador.
 *
 * - Crea un <a> temporal con el blob como href.
 * - Llama .click() para iniciar la descarga.
 * - Revoca la ObjectURL inmediatamente para evitar fuga de memoria.
 */
export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nombre;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
