import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CreateVentaRequest, UpdateVentaRequest } from '@/types/api';

import { anularVenta } from '../api/anular-venta';
import { contabilizarVenta } from '../api/contabilizar-venta';
import { createVenta } from '../api/create-venta';
import { deleteVenta } from '../api/delete-venta';
import { updateVenta } from '../api/update-venta';

// Toda mutación de venta invalida también ['comprobantes']: la venta ES su
// propio comprobante (REQ-VTA-01) — guardar/contabilizar/anular cambian el
// estado de un comprobante que el listado de comprobantes también muestra.
export function useInvalidateVentas(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['ventas'] });
    void qc.invalidateQueries({ queryKey: ['comprobantes'] });
  };
}

// Los toasts viven en el call site (patrón del editor de comprobantes): el
// flujo "Guardar y contabilizar" encadena dos mutaciones y decide qué anunciar.
export function useCrearVenta() {
  const invalidate = useInvalidateVentas();
  return useMutation({
    mutationFn: (payload: CreateVentaRequest) => createVenta(payload),
    onSuccess: invalidate,
  });
}

export function useEditarVenta(id: string) {
  const invalidate = useInvalidateVentas();
  return useMutation({
    mutationFn: (payload: UpdateVentaRequest) => updateVenta(id, payload),
    onSuccess: invalidate,
  });
}

export function useEliminarVenta() {
  const invalidate = useInvalidateVentas();
  return useMutation({
    mutationFn: (id: string) => deleteVenta(id),
    onSuccess: invalidate,
  });
}

export function useContabilizarVenta() {
  const invalidate = useInvalidateVentas();
  return useMutation({
    mutationFn: (id: string) => contabilizarVenta(id),
    onSuccess: invalidate,
  });
}

export function useAnularVenta(id: string) {
  const invalidate = useInvalidateVentas();
  return useMutation({
    mutationFn: (motivo: string) => anularVenta(id, { motivo }),
    onSuccess: invalidate,
  });
}
