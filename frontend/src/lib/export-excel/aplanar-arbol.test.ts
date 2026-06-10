import { describe, expect, it } from 'vitest';

import type { SeccionArbol } from './aplanar-arbol';
import { aplanarArbol } from './aplanar-arbol';

/**
 * Tests para el helper de aplanado de árbol jerárquico de 3 niveles:
 *   Sección → Subsección → Cuenta
 *
 * §4.5 Anti-recálculo: los totales de sección/subsección vienen del backend;
 * el helper NO los suma ni los deriva.
 */

function crearSeccion(overrides?: Partial<SeccionArbol>): SeccionArbol {
  return {
    titulo: 'ACTIVO',
    totalBob: '10000.00',
    subsecciones: [
      {
        titulo: 'Activo Corriente',
        totalBob: '6000.00',
        cuentas: [
          { nombre: 'Caja', codigoInterno: '1101', saldoBob: '4000.00', esContraria: false, nivel: 2 },
          { nombre: 'Banco', codigoInterno: '1102', saldoBob: '2000.00', esContraria: false, nivel: 2 },
        ],
      },
    ],
    ...overrides,
  };
}

describe('aplanarArbol', () => {
  it('aplana sección con una subsección y dos cuentas: fila de sección + fila de subsección + 2 filas de cuenta + 1 subtotal subsección = 5 filas', () => {
    const secciones: SeccionArbol[] = [crearSeccion()];
    const filas = aplanarArbol(secciones);

    // Sección: 1 fila de título
    // Subsección: 1 fila de título
    // 2 cuentas: 2 filas
    // Subtotal subsección: 1 fila
    // Subtotal sección: 1 fila
    expect(filas.length).toBe(6);
  });

  it('refleja el nivel por indentación: sección sin sangría, subsección 1 sangría, cuenta 2 sangrías', () => {
    const secciones: SeccionArbol[] = [crearSeccion()];
    const filas = aplanarArbol(secciones);

    // Fila 0 = título de sección: sin sangría (en negrita desde Fase Estilos)
    const filaSec = filas[0];
    expect(filaSec).toBeDefined();
    expect(filaSec![0]).toMatchObject({ type: 'texto', value: 'ACTIVO' });

    // Fila 1 = título de subsección: 2 espacios de sangría (en negrita desde Fase Estilos)
    const filaSub = filas[1];
    expect(filaSub).toBeDefined();
    expect(filaSub![0]).toMatchObject({ type: 'texto', value: '  Activo Corriente' });

    // Fila 2 = primera cuenta: 4 espacios de sangría (sin negrita — detalle)
    const filaCuenta = filas[2];
    expect(filaCuenta).toBeDefined();
    expect(filaCuenta![0]).toMatchObject({ type: 'texto', value: '    1101 - Caja' });
  });

  it('usa los totalBob del backend en los subtotales, sin sumar las cuentas (anti-recálculo)', () => {
    // totalBob de la subsección = '9999.99' que NO es la suma 4000+2000=6000
    const secciones: SeccionArbol[] = [
      crearSeccion({
        totalBob: '88888.88',
        subsecciones: [
          {
            titulo: 'Activo Corriente',
            totalBob: '9999.99',
            cuentas: [
              { nombre: 'Caja', codigoInterno: '1101', saldoBob: '4000.00', esContraria: false, nivel: 2 },
              { nombre: 'Banco', codigoInterno: '1102', saldoBob: '2000.00', esContraria: false, nivel: 2 },
            ],
          },
        ],
      }),
    ];
    const filas = aplanarArbol(secciones);

    // La fila de subtotal de subsección debe usar '9999.99' del backend
    const filaSubtotalSub = filas.find(
      (f) => f[0]?.type === 'texto' && f[0].value.includes('Total Activo Corriente'),
    );
    expect(filaSubtotalSub).toBeDefined();
    expect(filaSubtotalSub![1]).toMatchObject({ type: 'numero', value: '9999.99' });

    // La fila de subtotal de sección debe usar '88888.88' del backend
    const filaSubtotalSec = filas.find(
      (f) => f[0]?.type === 'texto' && f[0].value.includes('Total ACTIVO'),
    );
    expect(filaSubtotalSec).toBeDefined();
    expect(filaSubtotalSec![1]).toMatchObject({ type: 'numero', value: '88888.88' });
  });

  it('una sección sin subsecciones aparece con su subtotal y sin filas de detalle, sin error', () => {
    const secciones: SeccionArbol[] = [
      { titulo: 'SECCIÓN VACÍA', totalBob: '0.00', subsecciones: [] },
    ];
    const filas = aplanarArbol(secciones);

    // Título + subtotal = 2 filas
    expect(filas.length).toBe(2);
    expect(filas[0]![0]).toMatchObject({ type: 'texto', value: 'SECCIÓN VACÍA' });
  });

  it('(estilo) filas de sección y subsección llevan fontWeight:"bold" en todas sus celdas', () => {
    const secciones: SeccionArbol[] = [crearSeccion()];
    const filas = aplanarArbol(secciones);

    // Fila 0 = título de sección
    const filaSec = filas[0];
    expect(filaSec).toBeDefined();
    filaSec!.forEach((celda) => {
      expect(celda).toMatchObject({ fontWeight: 'bold' });
    });

    // Fila 1 = título de subsección
    const filaSub = filas[1];
    expect(filaSub).toBeDefined();
    filaSub!.forEach((celda) => {
      expect(celda).toMatchObject({ fontWeight: 'bold' });
    });

    // Fila 4 = subtotal de subsección (índice: título-sec + título-sub + 2 cuentas + subtotal-sub)
    const filaSubtotalSub = filas[4];
    expect(filaSubtotalSub).toBeDefined();
    filaSubtotalSub!.forEach((celda) => {
      expect(celda).toMatchObject({ fontWeight: 'bold' });
    });

    // Fila 5 = subtotal de sección
    const filaSubtotalSec = filas[5];
    expect(filaSubtotalSec).toBeDefined();
    filaSubtotalSec!.forEach((celda) => {
      expect(celda).toMatchObject({ fontWeight: 'bold' });
    });
  });

  it('(estilo) filas de cuenta de detalle NO llevan fontWeight', () => {
    const secciones: SeccionArbol[] = [crearSeccion()];
    const filas = aplanarArbol(secciones);

    // Fila 2 = primera cuenta (índice: título-sec + título-sub + cuenta)
    const filaCuenta1 = filas[2];
    expect(filaCuenta1).toBeDefined();
    filaCuenta1!.forEach((celda) => {
      expect('fontWeight' in celda).toBe(false);
    });

    // Fila 3 = segunda cuenta
    const filaCuenta2 = filas[3];
    expect(filaCuenta2).toBeDefined();
    filaCuenta2!.forEach((celda) => {
      expect('fontWeight' in celda).toBe(false);
    });
  });

  it('una subsección sin cuentas aparece con su subtotal y sin filas de cuenta', () => {
    const secciones: SeccionArbol[] = [
      {
        titulo: 'ACTIVO',
        totalBob: '0.00',
        subsecciones: [
          { titulo: 'Activo Corriente', totalBob: '0.00', cuentas: [] },
        ],
      },
    ];
    const filas = aplanarArbol(secciones);

    // Sección título + subsección título + subtotal subsección + subtotal sección = 4
    expect(filas.length).toBe(4);
  });

  it('una cuenta con codigoInterno null omite el código (no imprime "null") y conserva nombre y saldoBob', () => {
    const secciones: SeccionArbol[] = [
      {
        titulo: 'ACTIVO',
        totalBob: '5000.00',
        subsecciones: [
          {
            titulo: 'Activo Corriente',
            totalBob: '5000.00',
            cuentas: [
              { nombre: 'Cuenta Sintética', codigoInterno: null, saldoBob: '5000.00', esContraria: false, nivel: 2 },
            ],
          },
        ],
      },
    ];
    const filas = aplanarArbol(secciones);

    // Encontrar la fila de la cuenta
    const filaCuenta = filas.find(
      (f) => f[0]?.type === 'texto' && f[0].value.includes('Cuenta Sintética'),
    );
    expect(filaCuenta).toBeDefined();

    const concepto = filaCuenta![0];
    expect(concepto).toBeDefined();
    // No debe contener la palabra "null"
    expect(concepto!.value).not.toContain('null');
    // Debe contener el nombre
    expect(concepto!.value).toContain('Cuenta Sintética');
    // El saldo debe ser CeldaNumero con el valor del backend
    expect(filaCuenta![1]).toMatchObject({ type: 'numero', value: '5000.00' });
  });
});
