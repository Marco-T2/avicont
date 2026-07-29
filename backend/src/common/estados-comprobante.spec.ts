import { EstadoComprobante } from '@prisma/client';

import { ESTADOS_CONCILIABLES } from './estados-comprobante';

/**
 * Guarda del invariante de §4.4. Es una constante, pero la que más duele si
 * cambia: sacar `BLOQUEADO` vacía el estado de cuenta de cada cliente y la
 * conciliación de cada cuenta el día del cierre mensual, sobre datos correctos.
 */
describe('ESTADOS_CONCILIABLES', () => {
  it('incluye CONTABILIZADO y BLOQUEADO, y sólo esos dos', () => {
    expect([...ESTADOS_CONCILIABLES].sort()).toEqual(
      [EstadoComprobante.BLOQUEADO, EstadoComprobante.CONTABILIZADO].sort(),
    );
  });

  it('NO incluye BORRADOR', () => {
    // Un borrador todavía no movió plata.
    expect(ESTADOS_CONCILIABLES).not.toContain(EstadoComprobante.BORRADOR);
  });

  it('incluye BLOQUEADO — el cierre del período no puede vaciar la lectura', () => {
    // Assert redundante con el primero A PROPÓSITO: es el que se rompe si
    // alguien "simplifica" a `CONTABILIZADO` a secas, y su nombre dice por qué
    // está mal.
    expect(ESTADOS_CONCILIABLES).toContain(EstadoComprobante.BLOQUEADO);
  });
});
