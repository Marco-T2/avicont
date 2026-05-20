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

// ============================================================
// Identidad / multi-tenant
// ============================================================

// Espejo de GET /api/users/me (backend/src/users/users.service.ts#getProfile).
export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  isEmailVerified: boolean;
  tenants: UserTenant[];
}

export interface UserTenant {
  id: string;
  name: string;
  slug: string;
  /** Rol efectivo: SystemRole ("OWNER" / "ADMIN") o slug del CustomRole. */
  role: string | null;
}

// Módulo vertical de la organización. Define el seeding inicial y los feature
// flags que el backend activa al crear la org (ver CreateTenantDto del backend).
export type ModuloOrganizacion = 'CONTABILIDAD' | 'GRANJA' | 'OTROS';

// POST /api/tenants — crear organización. El backend crea la org + la
// membership OWNER del usuario autenticado en una transacción.
export interface CreateTenantRequest {
  name: string;
  modulo: ModuloOrganizacion;
}
// El response es la Organization creada; acá tipamos solo lo que consume el
// front (el id es necesario para el switch-tenant posterior al onboarding).
export interface CreateTenantResponse {
  id: string;
  name: string;
  slug: string;
}

// POST /api/auth/switch-tenant request + response.
export interface SwitchTenantRequest {
  tenantId: string;
}
// El response tiene la misma shape que LoginResponse (refresh en cookie).
export type SwitchTenantResponse = LoginResponse;

// ============================================================
// Memberships (miembros del tenant activo)
// ============================================================

export type SystemRole = 'OWNER' | 'ADMIN';

export interface MembershipUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface MembershipCustomRole {
  id: string;
  slug: string;
  name: string;
}

// Espejo de getMembers (backend/src/tenants/tenants.service.ts).
export interface Membership {
  id: string;
  organizationId: string;
  userId: string;
  systemRole: SystemRole | null;
  customRoleId: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: MembershipUser;
  customRole: MembershipCustomRole | null;
}

// POST /api/memberships/invite (requiere que el user YA exista).
export interface InviteExistingUserRequest {
  email: string;
  systemRole?: SystemRole;
  customRoleId?: string;
}

// PATCH /api/memberships/:id — cambio de rol del miembro.
export interface UpdateMembershipRequest {
  systemRole?: SystemRole;
  customRoleId?: string;
}

// ============================================================
// Invitations (flujo email — admin + pública)
// ============================================================

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  invitedById: string;
  systemRole: SystemRole | null;
  customRoleId: string | null;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

// POST /api/invitations — body del admin para invitar por email.
export interface CreateInvitationRequest {
  email: string;
  systemRole?: SystemRole;
  customRoleId?: string;
  expiresInDays?: number;
}

// Response del POST incluye la invitation creada + el token plano (para
// que el admin lo copie al email manualmente si el mailer falla).
export interface CreateInvitationResponse {
  invitation: Invitation;
  token: string;
}

// GET /api/invitations/preview?token=... — shape del backend
// (backend/src/invitations/invitations.service.ts#previewByToken).
export interface InvitationPreview {
  email: string;
  expiresAt: string;
  organization: { id: string; slug: string; name: string };
  invitedBy: { email: string; displayName: string | null };
}

// POST /api/invitations/accept-and-register — registro + aceptación en una.
export interface AcceptAndRegisterRequest {
  token: string;
  password: string;
  displayName?: string;
}

export interface AcceptAndRegisterResponse {
  invitation: Invitation;
  userId: string;
}

// ============================================================
// Custom Roles (RBAC per-tenant)
// ============================================================

export interface CustomRole {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystemDefault: boolean;
  isEditable: boolean;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
}

export interface CustomRoleMember {
  membershipId: string;
  deactivatedAt: string | null;
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
}

export interface CreateCustomRoleRequest {
  slug: string;
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateCustomRoleRequest {
  name?: string;
  description?: string;
  permissions?: string[];
}

// Catálogo de permisos del backend.
export interface PermisoCatalogado {
  key: string;
  modulo: string;
  submodulo: string;
  accion: string;
  descripcion: string;
}

export interface CatalogoAgrupado {
  modulo: string;
  submodulos: {
    submodulo: string;
    permisos: PermisoCatalogado[];
  }[];
}

// ============================================================
// Impersonation
// ============================================================

export interface StartImpersonationRequest {
  targetUserId: string;
  reason: string;
}

export interface StartImpersonationResponse {
  impersonationToken: string;
  expiresAt: string;
  impersonationId: string;
}

// ============================================================
// Feature flags
// ============================================================

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  organizationId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// GET /api/feature-flags/list response.
export interface FeatureFlagListResponse {
  global: FeatureFlag[];
  overrides: FeatureFlag[];
}

export interface CreateFeatureFlagOverrideRequest {
  key: string;
  name: string;
  description?: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateFeatureFlagOverrideRequest {
  name?: string;
  description?: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}
