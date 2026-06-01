// Mutations de react-query v5 para el módulo granja.
// Patrón: invalidar queries relevantes en onSuccess.

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/stores/auth-store';

import {
  cerrarLote,
  createLote,
  createMovimientoCantidad,
  createMovimientoInversion,
  createTipoRegistro,
  deleteTipoRegistro,
  deleteMovimientoCantidad,
  deleteMovimientoInversion,
  updateLote,
  updateTipoRegistro,
} from '../api/granja.api';
import type {
  CreateLoteRequest,
  CreateMovimientoCantidadRequest,
  CreateMovimientoInversionRequest,
  CreateTipoRegistroRequest,
  UpdateLoteRequest,
  UpdateTipoRegistroRequest,
} from '../api/granja.types';

// Invalida todo el cache de lotes + dashboard. Post-mutation, la UI re-fetch
// ambas queries para mostrar datos actualizados.
function useInvalidateLotes() {
  const qc = useQueryClient();
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);
  return () => {
    void qc.invalidateQueries({ queryKey: ['granja-lotes', activeTenantId] });
    void qc.invalidateQueries({ queryKey: ['granja-dashboard', activeTenantId] });
  };
}

function useInvalidateLote(loteId: string | null | undefined) {
  const qc = useQueryClient();
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);
  return () => {
    void qc.invalidateQueries({ queryKey: ['granja-lote', activeTenantId, loteId] });
    void qc.invalidateQueries({ queryKey: ['granja-lotes', activeTenantId] });
    void qc.invalidateQueries({ queryKey: ['granja-dashboard', activeTenantId] });
  };
}

function useInvalidateTiposRegistro() {
  const qc = useQueryClient();
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);
  return () => qc.invalidateQueries({ queryKey: ['granja-tipos-registro', activeTenantId] });
}

function useInvalidateMovimientos(loteId: string | null | undefined) {
  const qc = useQueryClient();
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);
  return () => {
    void qc.invalidateQueries({ queryKey: ['granja-movimientos', activeTenantId, loteId] });
    // El resumen del lote cambia con cada movimiento
    void qc.invalidateQueries({ queryKey: ['granja-lote', activeTenantId, loteId] });
    void qc.invalidateQueries({ queryKey: ['granja-dashboard', activeTenantId] });
  };
}

// ─── Lote mutations ────────────────────────────────────────────────────────────

export function useCreateLote() {
  const invalidate = useInvalidateLotes();
  return useMutation({
    mutationFn: (body: CreateLoteRequest) => createLote(body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateLote(loteId: string | null | undefined) {
  const invalidate = useInvalidateLote(loteId);
  return useMutation({
    mutationFn: (body: UpdateLoteRequest) => {
      if (!loteId) throw new Error('loteId requerido para updateLote');
      return updateLote(loteId, body);
    },
    onSuccess: () => invalidate(),
  });
}

export function useCerrarLote() {
  const invalidate = useInvalidateLotes();
  return useMutation({
    mutationFn: (loteId: string) => cerrarLote(loteId),
    onSuccess: () => invalidate(),
  });
}

// ─── Tipo de registro mutations ────────────────────────────────────────────────

export function useCreateTipoRegistro() {
  const invalidate = useInvalidateTiposRegistro();
  return useMutation({
    mutationFn: (body: CreateTipoRegistroRequest) => createTipoRegistro(body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateTipoRegistro(id: string | null | undefined) {
  const invalidate = useInvalidateTiposRegistro();
  return useMutation({
    mutationFn: (body: UpdateTipoRegistroRequest) => {
      if (!id) throw new Error('id requerido para updateTipoRegistro');
      return updateTipoRegistro(id, body);
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteTipoRegistro() {
  const invalidate = useInvalidateTiposRegistro();
  return useMutation({
    mutationFn: (id: string) => deleteTipoRegistro(id),
    onSuccess: () => invalidate(),
  });
}

// ─── Movimiento mutations ──────────────────────────────────────────────────────

export function useCreateMovimientoInversion(loteId: string | null | undefined) {
  const invalidate = useInvalidateMovimientos(loteId);
  return useMutation({
    mutationFn: (body: CreateMovimientoInversionRequest) => {
      if (!loteId) throw new Error('loteId requerido para createMovimientoInversion');
      return createMovimientoInversion(loteId, body);
    },
    onSuccess: () => invalidate(),
  });
}

export function useCreateMovimientoCantidad(loteId: string | null | undefined) {
  const invalidate = useInvalidateMovimientos(loteId);
  return useMutation({
    mutationFn: (body: CreateMovimientoCantidadRequest) => {
      if (!loteId) throw new Error('loteId requerido para createMovimientoCantidad');
      return createMovimientoCantidad(loteId, body);
    },
    onSuccess: () => invalidate(),
  });
}

/**
 * Elimina un movimiento de inversión o cantidad según el tipo indicado.
 * Firma: `{ loteId, tipo, movId }` — cubre los endpoints 14 y 15.
 */
export function useDeleteMovimiento(loteId: string | null | undefined) {
  const invalidate = useInvalidateMovimientos(loteId);
  return useMutation({
    mutationFn: ({
      tipo,
      movId,
    }: {
      tipo: 'inversion' | 'cantidad';
      movId: string;
    }) => {
      if (!loteId) throw new Error('loteId requerido para deleteMovimiento');
      if (tipo === 'inversion') return deleteMovimientoInversion(loteId, movId);
      return deleteMovimientoCantidad(loteId, movId);
    },
    onSuccess: () => invalidate(),
  });
}
