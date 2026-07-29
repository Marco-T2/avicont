import {
  ContactoRequeridoError,
  CuentaInactivaError,
  CuentaNoDetalleError,
  CuentaNoEncontradaError,
} from './comprobante-errors';

/**
 * Validación de una línea contra la cuenta que referencia (§4.1).
 *
 * ## Por qué existe
 *
 * Este bloque estaba copiado **tres veces** en `comprobantes.service.ts`
 * —`contabilizar`, `editarContabilizado` y `resolverYValidarBorrador`— y el
 * camino de sistema que Ventas necesita (`ComprobanteSistemaWriterPort`) iba a
 * ser la cuarta (Anti-01).
 *
 * Ya se pagó una vez el precio de tenerlo duplicado: `requiereContacto` estaba
 * en `contabilizar` y **faltaba** en `editarContabilizado`, así que la edición
 * en bloque podía dejar una línea contra CUENTAS POR COBRAR sin `contactoId`
 * —el campo del que depende el aging— hasta que se cerró en el PR #294.
 *
 * ## Qué se extrajo y qué NO
 *
 * Los tres call sites **no son idénticos**, así que acá vive sólo lo que de
 * verdad se repite:
 *
 * | Chequeo | ¿Dónde estaba? | ¿Acá? |
 * |---|---|---|
 * | existe / activa / esDetalle | los 3 | ✅ `resolverCuentaDeLinea` |
 * | `requiereContacto` | 2 de 3 | ✅ `validarContactoRequerido` |
 * | contacto existe y está activo | 2 de 3, con reglas distintas | ❌ se queda en el service |
 * | moneda compatible con la cuenta | 1 de 3 | ❌ se queda en el service |
 *
 * Se descartó una única función con banderas (`{ validarContacto: true,
 * validarMoneda: false }`): un booleano por call site convierte la firma en un
 * mapa de excepciones y esconde exactamente lo que hay que leer de un vistazo.
 */

/**
 * Superficie mínima que necesita la validación. Tipado estructural: lo satisface
 * `CuentaParaLinea` del port de `cuentas` sin que el dominio tenga que importar
 * tipos de Prisma (§3.5).
 */
export interface CuentaValidable {
  id: string;
  codigoInterno: string;
  activa: boolean;
  esDetalle: boolean;
  requiereContacto: boolean;
}

/**
 * Resuelve la cuenta de una línea y valida los invariantes de §4.1 que aplican
 * a TODOS los caminos de escritura: existe, está activa y es de detalle.
 *
 * @param orden número de línea (1-based) que se reporta al usuario, NO el índice.
 * @throws CuentaNoEncontradaError si el id no está en el batch — que está
 * acotado al tenant, así que cubre también la cuenta de otra organización (§4.2).
 * @throws CuentaInactivaError | CuentaNoDetalleError
 */
export function resolverCuentaDeLinea<T extends CuentaValidable>(
  orden: number,
  cuentaId: string,
  cuentasPorId: ReadonlyMap<string, T>,
): T {
  const cuenta = cuentasPorId.get(cuentaId);
  if (!cuenta) throw new CuentaNoEncontradaError(cuentaId);
  if (!cuenta.activa) throw new CuentaInactivaError(orden, cuenta.id, cuenta.codigoInterno);
  if (!cuenta.esDetalle) throw new CuentaNoDetalleError(orden, cuenta.id, cuenta.codigoInterno);
  return cuenta;
}

/**
 * §4.1 / B-1: una cuenta marcada `requiereContacto` no puede quedarse sin él.
 * Es el invariante del que depende el aging de Cuentas por Cobrar.
 */
export function validarContactoRequerido(
  orden: number,
  cuenta: CuentaValidable,
  contactoId: string | null | undefined,
): void {
  if (cuenta.requiereContacto && !contactoId) {
    throw new ContactoRequeridoError(orden, cuenta.id, cuenta.codigoInterno);
  }
}
