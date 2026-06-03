import { PlatformActivityCursorInvalidoError } from '../domain/platform-errors';

/**
 * Codec puro para el cursor opaco de paginación de actividad de plataforma.
 *
 * Formato interno (antes de codificar): `<createdAt ISO>|<id>`
 * Formato externo: base64url del string anterior.
 *
 * El cursor es opaco hacia el cliente — no debe parsear su contenido, solo
 * pasarlo de vuelta en la siguiente llamada. Cualquier alteración produce un
 * error 400 `PLATFORM_ACTIVITY_CURSOR_INVALIDO`.
 */
export class ActivityCursor {
  /**
   * Codifica un punto de paginación (createdAt, id) en un token opaco base64url.
   */
  static encode(createdAt: Date, id: string): string {
    const raw = `${createdAt.toISOString()}|${id}`;
    return Buffer.from(raw).toString('base64url');
  }

  /**
   * Decodifica un token opaco y devuelve { createdAt, id }.
   *
   * @throws PlatformActivityCursorInvalidoError si el token está malformado,
   * no es base64url válido, la fecha es inválida o el id está vacío.
   */
  static decode(token: string): { createdAt: Date; id: string } {
    if (!token) {
      throw new PlatformActivityCursorInvalidoError();
    }

    let raw: string;
    try {
      raw = Buffer.from(token, 'base64url').toString('utf-8');
    } catch {
      throw new PlatformActivityCursorInvalidoError();
    }

    const separatorIndex = raw.indexOf('|');
    if (separatorIndex === -1) {
      throw new PlatformActivityCursorInvalidoError();
    }

    const isoDate = raw.slice(0, separatorIndex);
    const id = raw.slice(separatorIndex + 1);

    if (!id) {
      throw new PlatformActivityCursorInvalidoError();
    }

    const createdAt = new Date(isoDate);
    if (isNaN(createdAt.getTime())) {
      throw new PlatformActivityCursorInvalidoError();
    }

    return { createdAt, id };
  }
}
