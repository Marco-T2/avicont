import { describe, expect, it } from 'vitest';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import type { EstadoResultadosResponse } from '@/types/api';

import { mapearEstadoResultadosAFilas } from './exportar-estado-resultados';

const perfilCompleto: EmpresaPerfil = {
  razonSocial: 'Avicont S.R.L.',
  nit: '1234567',
  direccion: 'Av. Siempre Viva 123',
  representanteLegal: 'Juan Pérez',
  telefono: '+591 70000000',
  email: 'admin@avicont.bo',
};

const perfilTodoNull: EmpresaPerfil = {
  razonSocial: null,
  nit: null,
  direccion: null,
  representanteLegal: null,
  telefono: null,
  email: null,
};

function crearResponseResultados(
  overrides?: Partial<EstadoResultadosResponse>,
): EstadoResultadosResponse {
  return {
    fechaDesde: '2026-06-01',
    fechaHasta: '2026-06-30',
    ingreso: {
      claseCuenta: 'INGRESO',
      titulo: 'Ingresos',
      totalBob: '15000.00',
      subsecciones: [
        {
          subClaseCuenta: 'VENTA',
          titulo: 'Ventas',
          totalBob: '15000.00',
          cuentas: [
            {
              cuentaId: 'c1',
              codigoInterno: '4101',
              nombre: 'Ventas de Aves',
              nivel: 2,
              esContraria: false,
              saldoBob: '15000.00',
            },
          ],
        },
      ],
    },
    egreso: {
      claseCuenta: 'EGRESO',
      titulo: 'Egresos',
      totalBob: '8000.00',
      subsecciones: [
        {
          subClaseCuenta: 'COSTO',
          titulo: 'Costos de Venta',
          totalBob: '8000.00',
          cuentas: [
            {
              cuentaId: 'c2',
              codigoInterno: '5101',
              nombre: 'Costo de Ventas',
              nivel: 2,
              esContraria: false,
              saldoBob: '8000.00',
            },
          ],
        },
      ],
    },
    totalIngresoBob: '15000.00',
    totalEgresoBob: '8000.00',
    resultadoEjercicioBob: '7000.00',
    esGanancia: true,
    ...overrides,
  };
}

describe('mapearEstadoResultadosAFilas', () => {
  it('mapea las 2 secciones aplanadas vía el helper de árbol, con subtotales del backend', () => {
    const response = crearResponseResultados();
    const filas = mapearEstadoResultadosAFilas(response, perfilTodoNull);

    const valores = filas.map((f) => f[0]?.value ?? '');
    expect(valores.some((v) => v.includes('Ingresos'))).toBe(true);
    expect(valores.some((v) => v.includes('Egresos'))).toBe(true);
  });

  it('incluye una fila de Resultado del Ejercicio con totalIngresoBob/totalEgresoBob/resultadoEjercicioBob del backend (sin restar Ingreso-Egreso en cliente)', () => {
    const response = crearResponseResultados({
      totalIngresoBob: '99999.99',
      totalEgresoBob: '44444.44',
      resultadoEjercicioBob: '55555.55',
      esGanancia: true,
    });
    const filas = mapearEstadoResultadosAFilas(response, perfilTodoNull);

    // Las filas de resultado son las 3 últimas: TOTAL INGRESOS, TOTAL EGRESOS, Resultado del Ejercicio.
    // La celda de importe (columna 1) debe ser { type: 'numero', value: '...' } para que un mutante
    // que cambie el tipo a 'texto' haga fallar este test.
    const filaIngresos = filas.find((f) => f[0]?.value === 'TOTAL INGRESOS');
    const filaEgresos = filas.find((f) => f[0]?.value === 'TOTAL EGRESOS');
    const filaResultado = filas.find(
      (f) => typeof f[0]?.value === 'string' && f[0].value.startsWith('Resultado del Ejercicio'),
    );

    expect(filaIngresos?.[1]).toEqual({ type: 'numero', value: '99999.99' });
    expect(filaEgresos?.[1]).toEqual({ type: 'numero', value: '44444.44' });
    expect(filaResultado?.[1]).toEqual({ type: 'numero', value: '55555.55' });
  });

  it('indica Ganancia cuando esGanancia true y Pérdida cuando false', () => {
    const ganancia = crearResponseResultados({ esGanancia: true });
    const filasGanancia = mapearEstadoResultadosAFilas(ganancia, perfilTodoNull);
    const valoresGanancia = filasGanancia.map((f) => f[0]?.value ?? '');
    expect(valoresGanancia.some((v) => v.toLowerCase().includes('ganancia'))).toBe(true);

    const perdida = crearResponseResultados({ esGanancia: false });
    const filasPerdida = mapearEstadoResultadosAFilas(perdida, perfilTodoNull);
    const valoresPerdida = filasPerdida.map((f) => f[0]?.value ?? '');
    expect(valoresPerdida.some((v) => v.toLowerCase().includes('pérdida') || v.toLowerCase().includes('perdida'))).toBe(true);
  });

  it('usa el mismo helper aplanarArbol que el Balance (shape idéntico: indentación por nivel)', () => {
    // Las cuentas con nivel 2 deben tener 4 espacios de sangría (igual que el Balance)
    const response = crearResponseResultados();
    const filas = mapearEstadoResultadosAFilas(response, perfilTodoNull);

    const filaCuenta = filas.find(
      (f) => f[0]?.type === 'texto' && typeof f[0].value === 'string' && f[0].value.startsWith('    '),
    );
    expect(filaCuenta).toBeDefined();
    expect(filaCuenta![0]!.value).toMatch(/^ {4}/); // 4 espacios de sangría para nivel de cuenta
  });

  it('incluye la cabecera fiscal al inicio cuando el perfil está completo', () => {
    const response = crearResponseResultados();
    const filas = mapearEstadoResultadosAFilas(response, perfilCompleto);

    const primeraFila = filas[0];
    expect(primeraFila?.[0]).toEqual({ type: 'texto', value: 'Avicont S.R.L.' });
  });

  it('no rompe cuando el perfil fiscal tiene todos los campos null', () => {
    const response = crearResponseResultados();
    expect(() => mapearEstadoResultadosAFilas(response, perfilTodoNull)).not.toThrow();

    const filas = mapearEstadoResultadosAFilas(response, perfilTodoNull);
    const todasLasValues = filas.flatMap((f) => f).map((c) => c.value);
    expect(todasLasValues.some((v) => v === 'null')).toBe(false);
  });
});
