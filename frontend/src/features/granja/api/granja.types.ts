// Tipos TS para el módulo granja — espeja los DTOs del backend.
// Fuente de verdad: openspec/changes/granja-v1/frontend-contracts.md

export type EstadoLote = 'ACTIVO' | 'CERRADO';
export type NaturalezaRegistro = 'INVERSION' | 'CANTIDAD';

// ─── Response shapes ───────────────────────────────────────────────────────────

export interface ResumenLote {
  avesVivas: number;
  /** BOB como string (§4.5 CLAUDE.md) */
  costoAcumulado: string;
  /** null cuando avesVivas = 0 (mortalidad total) */
  costoPorPolloVivo: string | null;
  /** 0..1 (multiplicar x100 para %) */
  porcentajeMortalidad: number;
  edadDias: number;
}

export interface LoteDashboardItem {
  id: string;
  nombre: string | null;
  galpon: string | null;
  estado: EstadoLote;
  cantidadInicial: number;
  fechaIngreso: string;
  edadDias: number;
  avesVivas: number;
  costoAcumulado: string;
  costoPorPolloVivo: string | null;
  porcentajeMortalidad: number;
}

/** GET /lotes/:id, POST /lotes, PATCH /lotes/:id, POST /lotes/:id/cerrar */
export interface LoteResponse {
  id: string;
  nombre: string | null;
  cantidadInicial: number;
  fechaIngreso: string;
  fechaEstimadaSaca: string | null;
  fechaCierre: string | null;
  galpon: string | null;
  detalle: string | null;
  estado: EstadoLote;
  organizationId: string;
  resumen: ResumenLote;
  createdAt: string;
  updatedAt: string;
}

/** Ítem en la lista paginada (sin resumen) */
export interface LoteListItem {
  id: string;
  nombre: string | null;
  cantidadInicial: number;
  fechaIngreso: string;
  fechaCierre: string | null;
  galpon: string | null;
  estado: EstadoLote;
}

export interface ListarLotesResponse {
  items: LoteListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TipoRegistroResponse {
  id: string;
  nombre: string;
  naturaleza: NaturalezaRegistro;
  esSistema: boolean;
  activo: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MovimientoInversionResponse {
  id: string;
  loteId: string;
  tipoRegistroId: string;
  /** BOB como string (§4.5 CLAUDE.md) */
  monto: string;
  detalle: string | null;
  fecha: string;
  createdAt: string;
}

export interface MovimientoCantidadResponse {
  id: string;
  loteId: string;
  tipoRegistroId: string;
  cantidad: number;
  detalle: string | null;
  fecha: string;
  createdAt: string;
}

export interface MovimientosResponse {
  inversiones: MovimientoInversionResponse[];
  cantidades: MovimientoCantidadResponse[];
}

// ─── Request shapes ────────────────────────────────────────────────────────────

export interface CreateLoteRequest {
  /** int > 0, INMUTABLE tras crear */
  cantidadInicial: number;
  /** 'YYYY-MM-DD' */
  fechaIngreso: string;
  nombre?: string;
  galpon?: string;
  fechaEstimadaSaca?: string;
  detalle?: string;
}

/** NO incluye cantidadInicial — el backend la ignora y el contrato lo prohíbe */
export interface UpdateLoteRequest {
  nombre?: string;
  galpon?: string;
  detalle?: string;
  fechaIngreso?: string;
  fechaEstimadaSaca?: string;
}

export interface CreateTipoRegistroRequest {
  nombre: string;
  naturaleza: NaturalezaRegistro;
}

export interface UpdateTipoRegistroRequest {
  nombre?: string;
  activo?: boolean;
}

export interface CreateMovimientoInversionRequest {
  /** Regex /^\d+(\.\d{1,2})?$/ — monto como string (§4.5 CLAUDE.md) */
  monto: string;
  /** 'YYYY-MM-DD' */
  fecha: string;
  /** uuid, naturaleza INVERSION */
  tipoRegistroId: string;
  detalle?: string;
}

export interface CreateMovimientoCantidadRequest {
  /** int >= 1 */
  cantidad: number;
  /** 'YYYY-MM-DD' */
  fecha: string;
  /** uuid, naturaleza CANTIDAD */
  tipoRegistroId: string;
  detalle?: string;
}

// ─── Query params ──────────────────────────────────────────────────────────────

export interface ListarLotesParams {
  estado?: EstadoLote;
  page?: number;
  pageSize?: number;
}

export interface ListarTiposRegistroParams {
  naturaleza?: NaturalezaRegistro;
  activo?: boolean;
}
