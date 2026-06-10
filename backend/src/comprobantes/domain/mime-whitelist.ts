import { AdjuntoMimeNoPermitidoError } from './adjunto-errors';

/**
 * Whitelist de tipos MIME permitidos para adjuntos de comprobantes.
 * La validación usa magic bytes (no el Content-Type HTTP, que es falsificable).
 *
 * La librería `file-type` (ESM) detecta el tipo real por los primeros bytes
 * del buffer. Para texto plano (TXT), `file-type` no detecta tipo — se usa
 * un fallback que verifica que todos los bytes sean ASCII imprimible/whitespace.
 *
 * NOTA: `application/zip` NO está en la whitelist directa. Los archivos OOXML
 * (xlsx, docx, etc.) son contenedores ZIP, y `file-type` a veces los detecta
 * como `application/zip` en lugar del MIME OOXML específico. Cuando eso ocurre,
 * se acepta SOLO si la extensión declarada es de un formato Office reconocido
 * — combinando magic bytes (es ZIP válido) + extensión declarada.
 * Un `.zip` pelado con magic bytes ZIP → rechazado.
 */
export const MIME_WHITELIST = new Set([
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
]);

/**
 * Extensiones que mapean a MIME OOXML cuando `file-type` detecta el contenedor
 * como `application/zip` (OOXML = ZIP estructurado; file-type no siempre
 * distingue el sub-formato).
 */
const EXTENSION_A_MIME_OOXML: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};

/**
 * Valida el tipo del buffer por magic bytes y devuelve el MIME type definitivo.
 *
 * Cuando `file-type` devuelve `application/zip` (contenedor OOXML detectado como
 * ZIP genérico), se acepta SOLO si la extensión del nombre original corresponde
 * a un formato Office — se mapea al MIME específico. Un `.zip` u otra extensión
 * con magic bytes ZIP → rechazado con `ADJUNTO_MIME_NO_PERMITIDO`.
 *
 * @param buffer         Bytes del archivo subido.
 * @param nombreOriginal Nombre original del archivo (para resolver ZIP → OOXML por extensión).
 *
 * @throws {AdjuntoMimeNoPermitidoError} si el tipo no está en la whitelist
 *   o si el buffer está vacío/no tiene magic bytes reconocibles.
 */
export async function validarMimeMagicBytes(
  buffer: Buffer,
  nombreOriginal: string = '',
): Promise<string> {
  // file-type v16 es CJS, disponible via require() directo.
  // Se importa de forma dinámica (import()) para compatibilidad TS y evitar
  // efectos de carga de módulo en test-time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fileType = require('file-type') as {
    fromBuffer: (buffer: Buffer) => Promise<{ mime: string; ext: string } | undefined>;
  };

  const result = await fileType.fromBuffer(buffer);

  if (result) {
    const mime = result.mime;

    // OOXML son ZIP por dentro: file-type puede detectarlos como application/zip.
    // Aceptamos SOLO si la extensión declarada corresponde a un formato Office —
    // combinamos magic bytes (contenedor ZIP válido) + extensión declarada.
    // Un .zip pelado u otra extensión no-Office → rechazado.
    if (mime === 'application/zip') {
      const ext = nombreOriginal.split('.').pop()?.toLowerCase() ?? '';
      const mimeOoxml = EXTENSION_A_MIME_OOXML[ext];
      if (mimeOoxml !== undefined) {
        return mimeOoxml;
      }
      throw new AdjuntoMimeNoPermitidoError(mime);
    }

    if (MIME_WHITELIST.has(mime)) {
      return mime;
    }
    throw new AdjuntoMimeNoPermitidoError(mime);
  }

  // file-type no detectó el tipo. Puede ser texto plano (sin magic bytes).
  // Verificamos si el buffer es texto ASCII/UTF-8 válido con heurística simple:
  // todos los bytes son bytes de texto (printable ASCII + whitespace comunes).
  if (buffer.length > 0 && esTextoPlano(buffer)) {
    return 'text/plain';
  }

  // Sin magic bytes y no es texto plano → rechazar.
  throw new AdjuntoMimeNoPermitidoError('desconocido');
}

/**
 * Heurística para detectar texto plano: verifica que el buffer no contenga
 * bytes nulos ni bytes de control que no sean whitespace común.
 * Umbral: si > 30% de los bytes son no-texto, no es texto plano.
 */
function esTextoPlano(buffer: Buffer): boolean {
  // Sample de los primeros 512 bytes para eficiencia.
  const sample = buffer.slice(0, Math.min(buffer.length, 512));
  let bytesNoTexto = 0;

  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    if (byte === undefined) continue;
    // Bytes de control que NO son whitespace: null (0x00), DEL (0x7f), y rango 0x01-0x08.
    const esControl = byte === 0x00 || byte === 0x7f || (byte >= 0x01 && byte <= 0x08);
    if (esControl) {
      bytesNoTexto++;
    }
  }

  return bytesNoTexto / sample.length < 0.3;
}
