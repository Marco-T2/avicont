import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/create-cobro', () => ({ createCobro: vi.fn() }));
vi.mock('../api/contabilizar-cobro', () => ({ contabilizarCobro: vi.fn() }));
vi.mock('../api/crear-aplicacion', () => ({ crearAplicacion: vi.fn() }));

import type { CreateCobroRequest } from '@/types/api';

import { contabilizarCobro } from '../api/contabilizar-cobro';
import { createCobro } from '../api/create-cobro';
import { crearAplicacion } from '../api/crear-aplicacion';
import { useGuardarCobroConAplicaciones } from './use-guardar-cobro-con-aplicaciones';

const mockCreateCobro = vi.mocked(createCobro);
const mockContabilizar = vi.mocked(contabilizarCobro);
const mockCrearAplicacion = vi.mocked(crearAplicacion);

const COBRO: CreateCobroRequest = {
  contactoId: 'cliente-1',
  fechaContable: '2026-07-15',
  monto: '600.00',
  cuentaDestinoId: 'caja-1',
  glosa: 'Cobro de prueba',
};

const APLICACIONES = [
  { ventaId: 'v-1', montoAplicado: '300.00', etiqueta: 'Venta del 01/06/2026' },
  { ventaId: 'v-2', montoAplicado: '300.00', etiqueta: 'Venta del 15/06/2026' },
];

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

function setupHook() {
  return renderHook(() => useGuardarCobroConAplicaciones(), { wrapper: makeWrapper() });
}

beforeEach(() => {
  mockCreateCobro.mockReset();
  mockContabilizar.mockReset();
  mockCrearAplicacion.mockReset();
});

describe("useGuardarCobroConAplicaciones — modo 'contabilizar'", () => {
  // ============================================================
  // EL TEST QUE CONGELA LA REGLA DEL BACKEND (REQ-CXC-03): una aplicación
  // exige que AMBAS puntas estén contabilizadas, y POST /cobros siempre deja
  // el cobro en BORRADOR. Por eso `contabilizar` corre ANTES de la PRIMERA
  // aplicación — sin ese paso (o invertido), TODA aplicación del alta rebota
  // con APLICACION_PUNTA_NO_CONTABILIZADA (defecto real cazado en smoke
  // contra el backend, 2026-07-30). Si invertís el orden, este test es rojo.
  // ============================================================
  it('orden estricto: cobro → CONTABILIZAR → aplicaciones (contabilizar ANTES de la primera aplicación)', async () => {
    const llamadas: string[] = [];
    mockCreateCobro.mockImplementation(async () => {
      llamadas.push('cobro');
      return { id: 'cobro-9' } as Awaited<ReturnType<typeof createCobro>>;
    });
    mockContabilizar.mockImplementation(async () => {
      llamadas.push('contabilizar');
      return { comprobanteId: 'comp-1', numero: 'I2607-000001' };
    });
    mockCrearAplicacion.mockImplementation(async (_cobroId, body) => {
      llamadas.push(`aplicacion-${body.ventaId}`);
      return { id: 'ap' } as Awaited<ReturnType<typeof crearAplicacion>>;
    });

    const { result } = setupHook();

    let resultado;
    await act(async () => {
      resultado = await result.current.guardar(COBRO, APLICACIONES, 'contabilizar');
    });

    expect(resultado).toEqual({ ok: true, cobroId: 'cobro-9' });
    expect(llamadas).toEqual(['cobro', 'contabilizar', 'aplicacion-v-1', 'aplicacion-v-2']);
    // Doble cerrojo sobre el MISMO invariante, por si el array de llamadas se
    // refactoriza: contabilizar se invocó antes que la primera aplicación.
    expect(mockContabilizar.mock.invocationCallOrder[0]).toBeLessThan(
      mockCrearAplicacion.mock.invocationCallOrder[0]!,
    );
    expect(mockContabilizar).toHaveBeenCalledWith('cobro-9');
    expect(mockCrearAplicacion).toHaveBeenCalledWith('cobro-9', {
      ventaId: 'v-1',
      montoAplicado: '300.00',
    });
    expect(result.current.isPending).toBe(false);
    expect(result.current.progreso.every((p) => p.estado === 'listo')).toBe(true);
  });

  it('falla el POST del cobro: ni contabilizar ni aplicaciones se intentan, cobroId null', async () => {
    mockCreateCobro.mockRejectedValue(new Error('500'));

    const { result } = setupHook();

    let resultado;
    await act(async () => {
      resultado = await result.current.guardar(COBRO, APLICACIONES, 'contabilizar');
    });

    expect(resultado).toMatchObject({ ok: false, cobroId: null, falloEn: 'cobro' });
    expect(mockContabilizar).not.toHaveBeenCalled();
    expect(mockCrearAplicacion).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(false);
    expect(result.current.progreso[0]?.estado).toBe('error');
  });

  it('falla contabilizar: NINGUNA aplicación se intenta y el resultado dice falloEn contabilizar', async () => {
    mockCreateCobro.mockResolvedValue({ id: 'cobro-9' } as Awaited<
      ReturnType<typeof createCobro>
    >);
    mockContabilizar.mockRejectedValue(new Error('COBRO_PERIODO_NO_ABIERTO'));

    const { result } = setupHook();

    let resultado;
    await act(async () => {
      resultado = await result.current.guardar(COBRO, APLICACIONES, 'contabilizar');
    });

    // El cobro quedó como BORRADOR: el caller distingue este lugar del fallo.
    expect(resultado).toMatchObject({
      ok: false,
      cobroId: 'cobro-9',
      falloEn: 'contabilizar',
    });
    expect(mockCrearAplicacion).not.toHaveBeenCalled();
    const [pasoCobro, pasoContab, pasoAp1] = result.current.progreso;
    expect(pasoCobro?.estado).toBe('listo');
    expect(pasoContab?.estado).toBe('error');
    expect(pasoAp1?.estado).toBe('pendiente');
    expect(result.current.isPending).toBe(false);
  });

  it('falla la 1ra aplicación: parada temprana, la 2da no se intenta, falloEn aplicacion', async () => {
    mockCreateCobro.mockResolvedValue({ id: 'cobro-9' } as Awaited<
      ReturnType<typeof createCobro>
    >);
    mockContabilizar.mockResolvedValue({ comprobanteId: 'comp-1', numero: 'I2607-000001' });
    mockCrearAplicacion.mockRejectedValue(new Error('APLICACION_EXCEDE_VENTA'));

    const { result } = setupHook();

    let resultado;
    await act(async () => {
      resultado = await result.current.guardar(COBRO, APLICACIONES, 'contabilizar');
    });

    // El cobro YA EXISTE y está contabilizado: se continúa desde edición.
    expect(resultado).toMatchObject({ ok: false, cobroId: 'cobro-9', falloEn: 'aplicacion' });
    expect(mockCrearAplicacion).toHaveBeenCalledTimes(1);
    const [pasoCobro, pasoContab, pasoAp1, pasoAp2] = result.current.progreso;
    expect(pasoCobro?.estado).toBe('listo');
    expect(pasoContab?.estado).toBe('listo');
    expect(pasoAp1?.estado).toBe('error');
    expect(pasoAp2?.estado).toBe('pendiente');
  });

  it('isPending vuelve a false tanto en éxito como en error (Anti-F-07)', async () => {
    mockCreateCobro.mockRejectedValue(new Error('red'));

    const { result } = setupHook();

    await act(async () => {
      await result.current.guardar(COBRO, [], 'contabilizar');
    });

    expect(result.current.isPending).toBe(false);
  });

  it('sin aplicaciones tildadas: cobro + contabilizar, nada más (anticipo → saldo a favor)', async () => {
    mockCreateCobro.mockResolvedValue({ id: 'cobro-9' } as Awaited<
      ReturnType<typeof createCobro>
    >);
    mockContabilizar.mockResolvedValue({ comprobanteId: 'comp-1', numero: 'I2607-000001' });

    const { result } = setupHook();

    let resultado;
    await act(async () => {
      resultado = await result.current.guardar(COBRO, [], 'contabilizar');
    });

    expect(resultado).toEqual({ ok: true, cobroId: 'cobro-9' });
    expect(mockContabilizar).toHaveBeenCalledTimes(1);
    expect(mockCrearAplicacion).not.toHaveBeenCalled();
  });
});

describe("useGuardarCobroConAplicaciones — modo 'borrador'", () => {
  it('SOLO POST /cobros: ni contabilizar ni aplicaciones, aunque haya filas tildadas', async () => {
    mockCreateCobro.mockResolvedValue({ id: 'cobro-9' } as Awaited<
      ReturnType<typeof createCobro>
    >);

    const { result } = setupHook();

    let resultado;
    await act(async () => {
      // Se pasan aplicaciones A PROPÓSITO: el hook debe ignorarlas en
      // borrador — el backend las rechazaría el 100% de las veces
      // (APLICACION_PUNTA_NO_CONTABILIZADA sobre la punta cobro).
      resultado = await result.current.guardar(COBRO, APLICACIONES, 'borrador');
    });

    expect(resultado).toEqual({ ok: true, cobroId: 'cobro-9' });
    expect(mockContabilizar).not.toHaveBeenCalled();
    expect(mockCrearAplicacion).not.toHaveBeenCalled();
    // El progreso tampoco promete pasos que no van a correr.
    expect(result.current.progreso).toHaveLength(1);
    expect(result.current.progreso[0]?.id).toBe('cobro');
  });

  it('falla el POST en borrador: cobroId null y falloEn cobro', async () => {
    mockCreateCobro.mockRejectedValue(new Error('500'));

    const { result } = setupHook();

    let resultado;
    await act(async () => {
      resultado = await result.current.guardar(COBRO, [], 'borrador');
    });

    expect(resultado).toMatchObject({ ok: false, cobroId: null, falloEn: 'cobro' });
    expect(result.current.isPending).toBe(false);
  });
});
