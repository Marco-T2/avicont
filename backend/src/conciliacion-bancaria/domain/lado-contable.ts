import type { LadoBancario, LadoContable } from '@prisma/client';

/**
 * El extracto está escrito desde la perspectiva del BANCO. Un CREDITO en el
 * extracto es plata que ENTRA a la cuenta. En los libros de la empresa,
 * plata que entra a una cuenta de activo se registra al DÉBITO (design §5.1).
 *
 * Función NOMBRADA con spec propia — inlinearla es la forma más barata de
 * introducir un bug que "funciona" en la mitad de los casos. `LadoBancario`
 * entra, `LadoContable` sale: son DOS tipos, no el mismo reusado.
 */
export function ladoContableEsperado(tipo: LadoBancario): LadoContable {
  return tipo === 'CREDITO' ? 'DEBITO' : 'CREDITO';
}
