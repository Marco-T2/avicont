import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { CreateCobroRequest } from '@/types/api';

import { contabilizarCobro } from '../api/contabilizar-cobro';
import { createCobro } from '../api/create-cobro';
import { crearAplicacion } from '../api/crear-aplicacion';
import { mensajeCobros } from '../lib/mensaje-cobros';

export type EstadoPasoGuardar = 'pendiente' | 'guardando' | 'listo' | 'error';

export interface PasoGuardar {
  id: string;
  etiqueta: string;
  estado: EstadoPasoGuardar;
  error?: string;
}

export interface AplicacionAGuardar {
  ventaId: string;
  montoAplicado: string;
  /** Texto para el progreso, ej. "Venta del 01/06/2026". */
  etiqueta: string;
}

export type ModoGuardar = 'borrador' | 'contabilizar';

export type ResultadoGuardar =
  | { ok: true; cobroId: string }
  | {
      ok: false;
      /** null si falló el POST del cobro (nada quedó creado); un id si el
       * cobro YA EXISTE — el usuario continúa desde la edición. */
      cobroId: string | null;
      /** Dónde quedó el flujo: son tres lugares distintos y el usuario
       * necesita saber en cuál está parado. */
      falloEn: 'cobro' | 'contabilizar' | 'aplicacion';
      error: string;
    };

/**
 * Orquestación multi-paso del alta estilo Receive Payment, espejo del patrón
 * de ventas (dos acciones, D-14):
 *
 * - `modo 'borrador'`: SOLO `POST /cobros`. Las aplicaciones NO viajan — el
 *   backend exige AMBAS puntas contabilizadas (predicado de cartera de
 *   REQ-CXC-03, `APLICACION_PUNTA_NO_CONTABILIZADA`) y un cobro recién creado
 *   está en BORRADOR, así que aplicar acá fallaría el 100% de las veces.
 * - `modo 'contabilizar'`: `POST /cobros` → `POST /cobros/:id/contabilizar` →
 *   `POST /cobros/:id/aplicaciones` × N. Contabilizar va ANTES de la primera
 *   aplicación POR CONTRATO del backend — un test congela ese orden; si
 *   alguien lo invierte o saltea el paso, se pone rojo.
 *
 * Mecánica compartida con use-contabilizar-cierre:
 * - for...of + await (NO Promise.all): orden garantizado y parada temprana.
 * - Progreso por paso visible durante la corrida.
 * - Anti-F-07: isPending vuelve a false en éxito y en error.
 */
export function useGuardarCobroConAplicaciones() {
  const qc = useQueryClient();
  const [progreso, setProgreso] = useState<PasoGuardar[]>([]);
  const [isPending, setIsPending] = useState(false);

  function marcarPaso(id: string, estado: EstadoPasoGuardar, errorMsg?: string): void {
    setProgreso((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, estado, ...(errorMsg !== undefined ? { error: errorMsg } : {}) }
          : p,
      ),
    );
  }

  function invalidar(): void {
    void qc.invalidateQueries({ queryKey: ['cobros'] });
    void qc.invalidateQueries({ queryKey: ['estado-cuenta'] });
    void qc.invalidateQueries({ queryKey: ['comprobantes'] });
  }

  async function guardar(
    cobro: CreateCobroRequest,
    aplicaciones: AplicacionAGuardar[],
    modo: ModoGuardar,
  ): Promise<ResultadoGuardar> {
    setIsPending(true);
    // En borrador las aplicaciones NO viajan (rechazo garantizado del backend).
    const aplicacionesAEjecutar = modo === 'contabilizar' ? aplicaciones : [];

    setProgreso([
      { id: 'cobro', etiqueta: 'Registrar el cobro', estado: 'pendiente' },
      ...(modo === 'contabilizar'
        ? [
            {
              id: 'contabilizar',
              etiqueta: 'Contabilizar el cobro',
              estado: 'pendiente' as const,
            },
          ]
        : []),
      ...aplicacionesAEjecutar.map((a) => ({
        id: `aplicacion-${a.ventaId}`,
        etiqueta: `Aplicar Bs ${a.montoAplicado} — ${a.etiqueta}`,
        estado: 'pendiente' as const,
      })),
    ]);

    marcarPaso('cobro', 'guardando');
    let cobroId: string;
    try {
      const creado = await createCobro(cobro);
      cobroId = creado.id;
      marcarPaso('cobro', 'listo');
    } catch (err) {
      const mensaje = mensajeCobros(err, 'No se pudo registrar el cobro');
      marcarPaso('cobro', 'error', mensaje);
      setIsPending(false);
      return { ok: false, cobroId: null, falloEn: 'cobro', error: mensaje };
    }

    if (modo === 'contabilizar') {
      // ANTES de la primera aplicación: recién con el cobro CONTABILIZADO las
      // dos puntas cumplen el predicado de cartera (REQ-CXC-03).
      marcarPaso('contabilizar', 'guardando');
      try {
        await contabilizarCobro(cobroId);
        marcarPaso('contabilizar', 'listo');
      } catch (err) {
        const mensaje = mensajeCobros(err, 'No se pudo contabilizar el cobro');
        marcarPaso('contabilizar', 'error', mensaje);
        invalidar();
        setIsPending(false);
        return { ok: false, cobroId, falloEn: 'contabilizar', error: mensaje };
      }
    }

    for (const aplicacion of aplicacionesAEjecutar) {
      const pasoId = `aplicacion-${aplicacion.ventaId}`;
      marcarPaso(pasoId, 'guardando');
      try {
        await crearAplicacion(cobroId, {
          ventaId: aplicacion.ventaId,
          montoAplicado: aplicacion.montoAplicado,
        });
        marcarPaso(pasoId, 'listo');
      } catch (err) {
        // PARADA TEMPRANA: fallo REAL (carrera de sobre-aplicación, período
        // cerrado entremedio, venta anulada…) — el cobro ya está contabilizado
        // y el usuario continúa desde la edición.
        const mensaje = mensajeCobros(err, 'No se pudo aplicar el cobro a la venta');
        marcarPaso(pasoId, 'error', mensaje);
        invalidar();
        setIsPending(false);
        return { ok: false, cobroId, falloEn: 'aplicacion', error: mensaje };
      }
    }

    invalidar();
    setIsPending(false);
    return { ok: true, cobroId };
  }

  return { guardar, progreso, isPending };
}
