// Tipos DTO espejados a mano del backend (Opción 1A según CLAUDE.md §10.10).
// Migraremos a openapi-typescript cuando haya 4-5 features consumiendo la API.
// Mantener en sincronía manual con backend/src/**/dto/*.ts.

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  // refreshToken va en cookie httpOnly, NO en el body.
  accessToken: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface RegisterResponse {
  id: string;
  email: string;
}

// Decodificación del JWT access token (ver backend/src/auth/auth.service.ts).
// NOTA: el frontend NO valida la firma — solo usa los claims para UX.
// La validación real la hace el backend en cada request.
export interface JwtPayload {
  sub: string;
  email: string;
  activeTenantId?: string;
  roles?: string[];
  impersonatedBy?: string;
  impersonationId?: string;
  iat: number;
  exp: number;
}

// ============================================================
// Enums y tipos del dominio contable — espejo de @prisma/client
// ============================================================

export const ClaseCuenta = {
  ACTIVO: 'ACTIVO',
  PASIVO: 'PASIVO',
  PATRIMONIO: 'PATRIMONIO',
  INGRESO: 'INGRESO',
  EGRESO: 'EGRESO',
} as const;
export type ClaseCuenta = (typeof ClaseCuenta)[keyof typeof ClaseCuenta];

export const NaturalezaCuenta = {
  DEUDORA: 'DEUDORA',
  ACREEDORA: 'ACREEDORA',
} as const;
export type NaturalezaCuenta = (typeof NaturalezaCuenta)[keyof typeof NaturalezaCuenta];

export const SubClaseCuenta = {
  ACTIVO_CORRIENTE: 'ACTIVO_CORRIENTE',
  ACTIVO_NO_CORRIENTE: 'ACTIVO_NO_CORRIENTE',
  PASIVO_CORRIENTE: 'PASIVO_CORRIENTE',
  PASIVO_NO_CORRIENTE: 'PASIVO_NO_CORRIENTE',
  PATRIMONIO_CAPITAL: 'PATRIMONIO_CAPITAL',
  PATRIMONIO_RESULTADOS: 'PATRIMONIO_RESULTADOS',
  INGRESO_OPERATIVO: 'INGRESO_OPERATIVO',
  INGRESO_NO_OPERATIVO: 'INGRESO_NO_OPERATIVO',
  EGRESO_OPERATIVO: 'EGRESO_OPERATIVO',
  EGRESO_ADMINISTRATIVO: 'EGRESO_ADMINISTRATIVO',
  EGRESO_COMERCIALIZACION: 'EGRESO_COMERCIALIZACION',
  EGRESO_FINANCIERO: 'EGRESO_FINANCIERO',
  EGRESO_NO_OPERATIVO: 'EGRESO_NO_OPERATIVO',
} as const;
export type SubClaseCuenta = (typeof SubClaseCuenta)[keyof typeof SubClaseCuenta];

export const Moneda = {
  BOB: 'BOB',
  USD: 'USD',
} as const;
export type Moneda = (typeof Moneda)[keyof typeof Moneda];

// ============================================================
// Cuenta (plan de cuentas)
// ============================================================

// Espejo de CuentaResponseDto en backend/src/cuentas/dto/cuenta-response.dto.ts.
export interface Cuenta {
  id: string;
  organizationId: string;
  codigoInterno: string;
  codigoPuct: string | null;
  nombrePuctSnapshot: string | null;
  versionPuctMapeado: string | null;
  nombre: string;
  descripcion: string | null;
  claseCuenta: ClaseCuenta;
  subClaseCuenta: SubClaseCuenta | null;
  naturaleza: NaturalezaCuenta;
  parentId: string | null;
  nivel: number;
  esDetalle: boolean;
  requiereContacto: boolean;
  esContraria: boolean;
  activa: boolean;
  monedaFuncional: Moneda;
  permiteMultiMoneda: boolean;
  esSystemSeed: boolean;
  esRequeridaSistema: boolean;
  // createdAt/updatedAt llegan como string ISO por el transporte JSON.
  createdAt: string;
  updatedAt: string;
}

export interface CuentaListResponse {
  items: Cuenta[];
  total: number;
  page: number;
  pageSize: number;
}

// Nodo del árbol jerárquico (GET /api/cuentas/tree). Espejo de
// CuentaTreeNodeDto — Cuenta + hijas recursivas.
export interface CuentaTreeNode extends Cuenta {
  hijas: CuentaTreeNode[];
}

// Query params para GET /api/cuentas.
export interface ListarCuentasParams {
  claseCuenta?: ClaseCuenta;
  subClaseCuenta?: SubClaseCuenta;
  activa?: boolean;
  esDetalle?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}
