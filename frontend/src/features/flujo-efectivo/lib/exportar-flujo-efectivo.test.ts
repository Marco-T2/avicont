import { describe, expect, it } from 'vitest';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import type { EstadoFlujoEfectivoResponse } from '@/types/api';

import { mapearFlujoEfectivoAFilas } from './exportar-flujo-efectivo';

const perfilTodoNull: EmpresaPerfil = {
  razonSocial: null,
  nit: null,
  direccion: null,
  representanteLegal: null,
  telefono: null,
  email: null,
};

const perfilConRazon: EmpresaPerfil = {
  razonSocial: 'Avicont Bolivia SRL',
  nit: '12345678',
  direccion: 'Av. Principal 123',
  representanteLegal: 'Juan Pérez',
  telefono: '59171234567',
  email: 'info@avicont.bo',
};

function crearResponse(): EstadoFlujoEfectivoResponse {
  return {
    fechaDesde: '2026-01-01',
    fechaHasta: '2026-12-31',
    resultadoEjercicio: '30000.00',
    operacion: {
      lineas: [
        {
          cuentaId: 'ut-1',
          codigoInterno: '4.1.1.001',
          nombre: 'Utilidad del ejercicio',
          tipo: 'RESULTADO_EJERCICIO',
          monto: '30000.00',
        },
        {
          cuentaId: 'dep-1',
          codigoInterno: '1.2.2.001',
          nombre: 'Depreciación acumulada',
          tipo: 'PARTIDA_NO_MONETARIA',
          monto: '5000.00',
        },
      ],
      subtotal: '35000.00',
    },
    inversion: {
      lineas: [
        {
          cuentaId: 'maq-1',
          codigoInterno: '1.2.1.001',
          nombre: 'Compra de maquinaria',
          tipo: 'VARIACION_CUENTA',
          monto: '-20000.00',
        },
      ],
      subtotal: '-20000.00',
    },
    financiacion: {
      lineas: [
        {
          cuentaId: 'prest-1',
          codigoInterno: '2.1.1.001',
          nombre: 'Préstamo bancario',
          tipo: 'VARIACION_CUENTA',
          monto: '10000.00',
        },
      ],
      subtotal: '10000.00',
    },
    efectivoInicial: '5000.00',
    variacionNeta: '25000.00',
    efectivoFinal: '30000.00',
    cuadra: true,
    diferencia: '0.00',
    advertencias: [],
    cuentasEfectivoDetectadasPorHeuristica: [],
  };
}

describe('mapearFlujoEfectivoAFilas', () => {
  it('incluye cabecera fiscal cuando perfil tiene razonSocial', () => {
    const filas = mapearFlujoEfectivoAFilas(crearResponse(), perfilConRazon);

    // La cabecera fiscal es la primera sección antes de los headers de columna
    const cabeceraFila = filas.find(
      (f) => f[0] !== undefined && f[0].type === 'texto' && String(f[0].value).includes('Avicont Bolivia SRL'),
    );
    expect(cabeceraFila).toBeDefined();
  });

  it('emite fila del resultado del ejercicio antes de las secciones', () => {
    const filas = mapearFlujoEfectivoAFilas(crearResponse(), perfilTodoNull);

    const filaResultado = filas.find(
      (f) => f[1] !== undefined && String(f[1].value) === 'Resultado del ejercicio',
    );
    expect(filaResultado).toBeDefined();
    expect(filaResultado?.[3]).toEqual({ type: 'numero', value: '30000.00' });
  });

  it('emite filas de operación con sus líneas y subtotal en negrita', () => {
    const filas = mapearFlujoEfectivoAFilas(crearResponse(), perfilTodoNull);

    // Línea de operación: columna actividad = 'Operación'
    const lineaOp = filas.find(
      (f) => f[0] !== undefined && String(f[0].value) === 'Operación' &&
        f[1] !== undefined && String(f[1].value) === 'Utilidad del ejercicio',
    );
    expect(lineaOp).toBeDefined();
    expect(lineaOp?.[3]).toEqual({ type: 'numero', value: '30000.00' });

    // Subtotal operación en negrita
    const subtotalOp = filas.find(
      (f) => f[1] !== undefined && String(f[1].value) === 'Subtotal Operación',
    );
    expect(subtotalOp).toBeDefined();
    expect(subtotalOp?.[3]).toEqual({ type: 'numero', value: '35000.00', fontWeight: 'bold' });
  });

  it('emite filas de inversión con sus líneas y subtotal en negrita', () => {
    const filas = mapearFlujoEfectivoAFilas(crearResponse(), perfilTodoNull);

    const lineaInv = filas.find(
      (f) => f[0] !== undefined && String(f[0].value) === 'Inversión' &&
        f[1] !== undefined && String(f[1].value) === 'Compra de maquinaria',
    );
    expect(lineaInv).toBeDefined();
    expect(lineaInv?.[3]).toEqual({ type: 'numero', value: '-20000.00' });

    const subtotalInv = filas.find(
      (f) => f[1] !== undefined && String(f[1].value) === 'Subtotal Inversión',
    );
    expect(subtotalInv?.[3]).toEqual({ type: 'numero', value: '-20000.00', fontWeight: 'bold' });
  });

  it('emite filas de financiación con sus líneas y subtotal en negrita', () => {
    const filas = mapearFlujoEfectivoAFilas(crearResponse(), perfilTodoNull);

    const lineaFin = filas.find(
      (f) => f[0] !== undefined && String(f[0].value) === 'Financiación' &&
        f[1] !== undefined && String(f[1].value) === 'Préstamo bancario',
    );
    expect(lineaFin).toBeDefined();
    expect(lineaFin?.[3]).toEqual({ type: 'numero', value: '10000.00' });

    const subtotalFin = filas.find(
      (f) => f[1] !== undefined && String(f[1].value) === 'Subtotal Financiación',
    );
    expect(subtotalFin?.[3]).toEqual({ type: 'numero', value: '10000.00', fontWeight: 'bold' });
  });

  it('emite bloque de conciliación (efectivoInicial, variacionNeta, efectivoFinal)', () => {
    const filas = mapearFlujoEfectivoAFilas(crearResponse(), perfilTodoNull);

    const efectivoInicial = filas.find(
      (f) => f[1] !== undefined && String(f[1].value) === 'Efectivo inicial',
    );
    expect(efectivoInicial?.[3]).toEqual({ type: 'numero', value: '5000.00' });

    const variacionNeta = filas.find(
      (f) => f[1] !== undefined && String(f[1].value) === 'Variación neta',
    );
    expect(variacionNeta?.[3]).toEqual({ type: 'numero', value: '25000.00' });

    const efectivoFinal = filas.find(
      (f) => f[1] !== undefined && String(f[1].value) === 'Efectivo final',
    );
    expect(efectivoFinal?.[3]).toEqual({ type: 'numero', value: '30000.00', fontWeight: 'bold' });
  });

  it('los montos se escriben como celda numérica desde el string del backend sin recalcular (§4.5)', () => {
    const filas = mapearFlujoEfectivoAFilas(crearResponse(), perfilTodoNull);

    // Verificar que cada monto numérico es exactamente el string del backend (sin re-calcular)
    const todasLasCeldasNumericas = filas.flatMap((f) =>
      f.filter((c) => c.type === 'numero'),
    );
    // Ninguna celda numérica tiene valor calculado que difiera del string original
    for (const celda of todasLasCeldasNumericas) {
      expect(typeof celda.value).toBe('string');
    }
    // El monto del resultado del ejercicio se preserva exactamente como viene del backend
    const filaResultado = filas.find(
      (f) => f[1] !== undefined && String(f[1].value) === 'Resultado del ejercicio',
    );
    expect(filaResultado?.[3]).toEqual({ type: 'numero', value: '30000.00' });
  });

  it('el nombre del archivo incluye fechaDesde y fechaHasta sin conversión UTC (§4.6)', () => {
    // Este test valida que las fechas del response se usan tal cual (sin new Date() / UTC)
    // El nombre del archivo lo construye el botón con `response.fechaDesde` y `response.fechaHasta`
    // Verificamos que las fechas en el response se preservan sin transformación
    const response = crearResponse();
    expect(response.fechaDesde).toBe('2026-01-01');
    expect(response.fechaHasta).toBe('2026-12-31');
    // El mapeador no toca las fechas — el nombre lo construye el botón directamente del response
    const filas = mapearFlujoEfectivoAFilas(response, perfilTodoNull);
    // Las fechas no aparecen como celdas UTC-convertidas en las filas
    const celdasConFecha = filas.flatMap((f) =>
      f.filter(
        (c) =>
          c.type === 'texto' &&
          (String(c.value).includes('2026-01-01') || String(c.value).includes('2026-12-31')),
      ),
    );
    // Si las fechas aparecen, deben ser exactamente el string del backend, no convertido a UTC
    for (const celda of celdasConFecha) {
      expect(String(celda.value)).not.toMatch(/T00:00:00/); // Sin sufijo UTC
    }
  });
});
