import { describe, expect, it } from 'vitest';

import { nombreDelDeclarante } from './declarante';

describe('nombreDelDeclarante — el acto se atribuye a una persona, nunca a un UUID', () => {
  it('usa el nombre resuelto por el backend', () => {
    expect(nombreDelDeclarante('Marco Tarqui')).toBe('Marco Tarqui');
  });

  it('sin nombre resuelto lo dice en castellano — jamás cae al identificador', () => {
    // El backend devuelve null cuando el id ya no resuelve dentro de la
    // organización. Mostrar el UUID sería peor que no decir nada: no atribuye
    // el acto a nadie y ensucia un papel de trabajo que lee un contador.
    expect(nombreDelDeclarante(null)).toBe('un usuario que ya no pertenece a la organización');
    expect(nombreDelDeclarante(undefined)).toBe(
      'un usuario que ya no pertenece a la organización',
    );
  });
});
