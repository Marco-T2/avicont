// Queries de react-query v5 para el módulo granja.
// Patrón: activeTenantId en queryKey + enabled:Boolean(activeTenantId)
// para aislar cache por tenant (D-F1 del design).

import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/stores/auth-store';

import {
  getDashboard,
  getLote,
  getLotes,
  getMovimientos,
  getTiposRegistro,
} from '../api/granja.api';
import type { EstadoLote, NaturalezaRegistro } from '../api/granja.types';

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export function useDashboard() {
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);
  return useQuery({
    queryKey: ['granja-dashboard', activeTenantId] as const,
    queryFn: getDashboard,
    enabled: Boolean(activeTenantId),
  });
}

// ─── Lotes ─────────────────────────────────────────────────────────────────────

export function useLotes(estado?: EstadoLote) {
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);
  return useQuery({
    queryKey: ['granja-lotes', activeTenantId, estado] as const,
    queryFn: () => getLotes({ estado }),
    enabled: Boolean(activeTenantId),
  });
}

// id puede ser undefined/null cuando el drawer/panel está cerrado.
export function useLote(id: string | null | undefined) {
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);
  return useQuery({
    queryKey: ['granja-lote', activeTenantId, id] as const,
    queryFn: () => {
      if (!id) throw new Error('id requerido — query debería estar disabled');
      return getLote(id);
    },
    enabled: Boolean(activeTenantId) && Boolean(id),
  });
}

// ─── Tipos de registro ─────────────────────────────────────────────────────────

export function useTiposRegistro(naturaleza?: NaturalezaRegistro) {
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);
  return useQuery({
    queryKey: ['granja-tipos-registro', activeTenantId, naturaleza] as const,
    queryFn: () => getTiposRegistro({ naturaleza }),
    enabled: Boolean(activeTenantId),
  });
}

// ─── Movimientos ───────────────────────────────────────────────────────────────

// loteId puede ser null cuando no hay lote seleccionado.
export function useMovimientos(loteId: string | null | undefined) {
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);
  return useQuery({
    queryKey: ['granja-movimientos', activeTenantId, loteId] as const,
    queryFn: () => {
      if (!loteId) throw new Error('loteId requerido — query debería estar disabled');
      return getMovimientos(loteId);
    },
    enabled: Boolean(activeTenantId) && Boolean(loteId),
  });
}
