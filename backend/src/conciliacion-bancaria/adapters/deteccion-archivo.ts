/**
 * Detección de la familia real de un archivo por magic bytes (REQ-CB-04,
 * design §8.3). `read-excel-file` solo lee `.xlsx` (OOXML/ZIP) — un `.xls`
 * legacy (BIFF/OLE2) renombrado a `.xlsx` debe rechazarse ANTES de llegar al
 * parser, con un mensaje ACCIONABLE.
 *
 * Política PROPIA — NO reusa `comprobantes/domain/mime-whitelist.ts` (design
 * §8.3): esa whitelist es para adjuntos multi-formato (PDF/imagen/Office);
 * acá solo interesa distinguir ZIP/OOXML de OLE2 legacy.
 */
export type FamiliaArchivo = 'ZIP_OOXML' | 'OLE2_LEGACY' | 'DESCONOCIDA';

export async function detectarFamiliaArchivo(buffer: Buffer): Promise<FamiliaArchivo> {
  // file-type v16 es CJS — mismo patrón de require dinámico que
  // `mime-whitelist.ts` (evita fricciones de interop ESM/CJS en test-time).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fileType = require('file-type') as {
    fromBuffer: (buffer: Buffer) => Promise<{ mime: string; ext: string } | undefined>;
  };

  const resultado = await fileType.fromBuffer(buffer);
  if (!resultado) return 'DESCONOCIDA';

  if (
    resultado.mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    resultado.mime === 'application/zip'
  ) {
    return 'ZIP_OOXML';
  }
  if (resultado.mime === 'application/x-cfb') {
    return 'OLE2_LEGACY';
  }
  return 'DESCONOCIDA';
}
