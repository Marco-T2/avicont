import { AdjuntoMimeNoPermitidoError } from './adjunto-errors';
import { validarMimeMagicBytes } from './mime-whitelist';

/**
 * Spec del validador MIME por magic bytes.
 *
 * TDD RED: escrito antes que `mime-whitelist.ts` exista. La validación usa
 * la librería `file-type` (magic bytes reales) — NO confía en el Content-Type
 * HTTP que el cliente puede falsificar.
 *
 * Whitelist permitida: PDF, XLS/XLSX, DOC/DOCX, TXT, PNG, JPG/JPEG.
 */
describe('validarMimeMagicBytes', () => {
  describe('tipos permitidos', () => {
    it('acepta un buffer PDF real (magic bytes %PDF)', async () => {
      // Magic bytes reales de PDF: %PDF-
      const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      const mime = await validarMimeMagicBytes(pdf);
      expect(mime).toBe('application/pdf');
    });

    it('acepta un buffer PNG real (magic bytes PNG)', async () => {
      // PNG mínimo válido: magic header (8 bytes) + IHDR chunk (25 bytes) — file-type necesita
      // al menos estos para detectar el tipo correctamente en v16.
      // Referencia: http://www.libpng.org/pub/png/spec/1.2/PNG-Structure.html
      const pngMinimo = Buffer.from([
        // PNG signature
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        // IHDR chunk: length (4 bytes) = 13
        0x00, 0x00, 0x00, 0x0d,
        // chunk type "IHDR"
        0x49, 0x48, 0x44, 0x52,
        // width (4), height (4), bit depth, color type, compression, filter, interlace
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00,
        // CRC (4 bytes)
        0x90, 0x77, 0x53, 0xde,
      ]);
      const mime = await validarMimeMagicBytes(pngMinimo);
      expect(mime).toBe('image/png');
    });

    it('acepta un buffer JPEG real (magic bytes JPEG/EXIF)', async () => {
      // JPEG mínimo: SOI marker (FF D8) + APP0 marker (FF E0) + JFIF header.
      // file-type v16 necesita al menos estos bytes para detectar image/jpeg.
      const jpegMinimo = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x00, 0x00,
      ]);
      const mime = await validarMimeMagicBytes(jpegMinimo);
      expect(mime).toBe('image/jpeg');
    });

    it('acepta un buffer ZIP con extensión .xlsx → devuelve MIME OOXML correcto', async () => {
      // xlsx son ZIP internamente; file-type puede detectar como application/zip.
      // Con extensión .xlsx se mapea al MIME OOXML específico.
      const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
      const mime = await validarMimeMagicBytes(zip, 'planilla.xlsx');
      expect(mime).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    it('acepta un buffer ZIP con extensión .docx → devuelve MIME OOXML correcto', async () => {
      // docx son ZIP internamente; file-type puede detectar como application/zip.
      // Con extensión .docx se mapea al MIME OOXML específico.
      const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
      const mime = await validarMimeMagicBytes(zip, 'contrato.docx');
      expect(mime).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
  });

  describe('tipos NO permitidos', () => {
    it('rechaza un buffer ZIP pelado (sin extensión Office) — zip arbitrario no permitido', async () => {
      // application/zip sin extensión Office → rechazado.
      // Previene subida de archives arbitrarios (zip bombs, etc.).
      const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
      await expect(validarMimeMagicBytes(zip, 'archivo.zip')).rejects.toThrow(
        AdjuntoMimeNoPermitidoError,
      );
    });

    it('rechaza un buffer ZIP con extensión desconocida — no se acepta application/zip genérico', async () => {
      const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
      await expect(validarMimeMagicBytes(zip, 'archivo.odt')).rejects.toThrow(
        AdjuntoMimeNoPermitidoError,
      );
    });

    it('rechaza un buffer EXE (magic bytes MZ) renombrado como .pdf', async () => {
      // Magic bytes EXE: 4D 5A (MZ)
      const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      await expect(validarMimeMagicBytes(exe)).rejects.toThrow(AdjuntoMimeNoPermitidoError);
    });

    it('rechaza un buffer vacío (sin magic bytes detectables)', async () => {
      const empty = Buffer.from([]);
      await expect(validarMimeMagicBytes(empty)).rejects.toThrow(AdjuntoMimeNoPermitidoError);
    });

    it('rechaza contenido binario desconocido', async () => {
      const random = Buffer.from([0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff]);
      await expect(validarMimeMagicBytes(random)).rejects.toThrow(AdjuntoMimeNoPermitidoError);
    });
  });

  describe('texto plano (TXT)', () => {
    it('acepta contenido de texto plano (text/plain)', async () => {
      // TXT no tiene magic bytes — file-type no detecta el tipo.
      // Para texto plano, la función fallback a text/plain si el buffer
      // solo contiene bytes ASCII válidos.
      const txt = Buffer.from('Esto es un comprobante de pago en texto plano.\n');
      const mime = await validarMimeMagicBytes(txt);
      expect(mime).toBe('text/plain');
    });
  });
});
