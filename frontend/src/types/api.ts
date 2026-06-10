// Fachada (anti-corruption layer) sobre los tipos generados desde el contrato
// OpenAPI del backend (`api.generated.ts`). Reemplaza el espejo manual previo
// (CLAUDE.md §10.10 deuda "openapi-typescript").
//
// REGLA: los consumidores siguen importando `{ Contacto, Cuenta, ... }` desde
// `@/types/api`. Acá decidimos, por cada nombre:
//   - ALIAS  → existe como schema en el OpenAPI → `type X = Schemas['XDto']`.
//   - MANUAL → NO existe en el backend (params de query, JWT, shapes de endpoints
//              sin DTO decorado) → se mantiene escrito a mano.
//
// El generado (`api.generated.ts`) es artefacto: NO se edita a mano y se
// regenera con `pnpm run gen:api-types`. El gate de CI (`contract-drift`)
// garantiza que ambos artefactos estén sincronizados con el código backend.

import type { components } from './api.generated';

type Schemas = components['schemas'];

// ============================================================
// Auth (client-only: estos endpoints no exponen DTOs decorados)
// ============================================================

export type LoginRequest = Schemas['LoginDto'];

export interface LoginResponse {
  // refreshToken va en cookie httpOnly, NO en el body.
  accessToken: string;
}

export type RegisterRequest = Schemas['RegisterDto'];

// El endpoint de registro devuelve un shape ad-hoc (no un DTO decorado).
export interface RegisterResponse {
  id: string;
  email: string;
}

// Decodificación del JWT access token (ver backend/src/auth/auth.service.ts).
// Client-only: NO es un DTO del backend, es el payload decodificado del token.
// El frontend NO valida la firma — solo usa los claims para UX.
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
// Enums del dominio contable
// ------------------------------------------------------------
// openapi-typescript emite los enums como UNIONES de strings (tipos), no como
// objetos runtime. El frontend los usa como VALOR (`ClaseCuenta.ACTIVO` en
// selects/comparaciones), así que se conservan como objetos `as const` a mano.
// El `satisfies Record<string, Schemas[...][campo]>` hace que `tsc` falle si el
// objeto deriva del enum del backend (drift de valores). Donde el enum no tiene
// un campo schema correspondiente (params de query, DTOs aún sin decorar), el
// objeto queda sin `satisfies` (no hay contra qué chequear).
// ============================================================

export const ClaseCuenta = {
  ACTIVO: 'ACTIVO',
  PASIVO: 'PASIVO',
  PATRIMONIO: 'PATRIMONIO',
  INGRESO: 'INGRESO',
  EGRESO: 'EGRESO',
} as const satisfies Record<string, Schemas['CuentaResponseDto']['claseCuenta']>;
export type ClaseCuenta = (typeof ClaseCuenta)[keyof typeof ClaseCuenta];

export const NaturalezaCuenta = {
  DEUDORA: 'DEUDORA',
  ACREEDORA: 'ACREEDORA',
} as const satisfies Record<string, Schemas['CuentaResponseDto']['naturaleza']>;
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
} as const satisfies Record<string, NonNullable<Schemas['CuentaResponseDto']['subClaseCuenta']>>;
export type SubClaseCuenta = (typeof SubClaseCuenta)[keyof typeof SubClaseCuenta];

export const Moneda = {
  BOB: 'BOB',
  USD: 'USD',
} as const satisfies Record<string, Schemas['CuentaResponseDto']['monedaFuncional']>;
export type Moneda = (typeof Moneda)[keyof typeof Moneda];

// ============================================================
// Cuenta (plan de cuentas)
// ============================================================

export type Cuenta = Schemas['CuentaResponseDto'];

export type CuentaListResponse = Schemas['CuentaListResponseDto'];

// Nodo del árbol jerárquico (GET /api/cuentas/tree): Cuenta + hijas recursivas.
export type CuentaTreeNode = Schemas['CuentaTreeNodeDto'];

// Query params para GET /api/cuentas (client-only: el backend los recibe como
// query params sueltos, no como un DTO con @ApiProperty).
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
// ------------------------------------------------------------
// Client-only: GET /api/users/me devuelve un shape compuesto (perfil + tenants)
// que no está modelado como un DTO decorado en el backend.
// ============================================================

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

// Módulo vertical de la organización. Reusa el enum literal del DTO de creación.
export type ModuloOrganizacion = Schemas['CreateTenantDto']['modulo'];

// POST /api/tenants — crear organización.
export type CreateTenantRequest = Schemas['CreateTenantDto'];

// El response es la Organization creada; client-only (solo se consume el id).
export interface CreateTenantResponse {
  id: string;
  name: string;
  slug: string;
}

// POST /api/auth/switch-tenant.
export type SwitchTenantRequest = Schemas['SwitchTenantDto'];
// El response tiene la misma shape que LoginResponse (refresh en cookie).
export type SwitchTenantResponse = LoginResponse;

// ============================================================
// Memberships (miembros del tenant activo)
// ------------------------------------------------------------
// Client-only: getMembers devuelve filas Prisma enriquecidas, sin DTO decorado.
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
export type InviteExistingUserRequest = Schemas['InviteUserDto'];

// PATCH /api/memberships/:id — cambio de rol del miembro.
export type UpdateMembershipRequest = Schemas['UpdateMembershipDto'];

// ============================================================
// Invitations (flujo email — admin + pública)
// ------------------------------------------------------------
// Las responses son client-only (sin DTO decorado); los requests sí aliasan.
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
export type CreateInvitationRequest = Schemas['CreateInvitationDto'];

// Response del POST incluye la invitation creada + el token plano.
export interface CreateInvitationResponse {
  invitation: Invitation;
  token: string;
}

// GET /api/invitations/preview?token=... — shape del backend (sin DTO decorado).
export interface InvitationPreview {
  email: string;
  expiresAt: string;
  organization: { id: string; slug: string; name: string };
  invitedBy: { email: string; displayName: string | null };
}

// POST /api/invitations/accept-and-register — registro + aceptación en una.
export type AcceptAndRegisterRequest = Schemas['AcceptAndRegisterDto'];

export interface AcceptAndRegisterResponse {
  invitation: Invitation;
  userId: string;
}

// ============================================================
// Custom Roles (RBAC per-tenant)
// ------------------------------------------------------------
// Client-only: CustomRole se devuelve como fila Prisma, sin DTO decorado.
// Los requests sí aliasan.
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

export type CreateCustomRoleRequest = Schemas['CreateCustomRoleDto'];

export type UpdateCustomRoleRequest = Schemas['UpdateCustomRoleDto'];

// Catálogo de permisos del backend (client-only: endpoint sin DTO decorado).
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
// Contactos (directorio de clientes y proveedores)
// ============================================================

export type Contacto = Schemas['ContactoResponseDto'];

export type ContactoListResponse = Schemas['ListarContactosResponseDto'];

// Query params para GET /api/contactos (client-only).
// activo: boolean → filtra por estado; 'all' → sin filtro; undefined → sin filtro.
export interface ListarContactosParams {
  q?: string;
  documento?: string;
  esCliente?: boolean;
  esProveedor?: boolean;
  activo?: boolean | 'all';
  page?: number;
  pageSize?: number;
}

// ============================================================
// Tipos de documento físico
// ============================================================

export type TipoDocumentoFisico = Schemas['TipoDocumentoFisicoResponseDto'];

export type TipoDocumentoFisicoListResponse = Schemas['ListarTiposDocumentoFisicoResponseDto'];

export type CreateTipoDocumentoFisicoRequest = Schemas['CreateTipoDocumentoFisicoDto'];

export type UpdateTipoDocumentoFisicoRequest = Schemas['UpdateTipoDocumentoFisicoDto'];

// activo sin param → backend default solo activos; false → inactivos; 'all' → todos.
export interface ListarTiposDocumentoFisicoParams {
  q?: string;
  activo?: boolean | 'all';
  page?: number;
  pageSize?: number;
}

// ============================================================
// Documentos físicos
// ============================================================

// Client-only: el enum estadoAsociacion solo aparece como query param, no en un
// DTO decorado → no hay schema contra el cual hacer `satisfies`.
export const EstadoAsociacion = {
  SUELTO: 'SUELTO',
  EN_BORRADOR: 'EN_BORRADOR',
  CONTABILIZADO: 'CONTABILIZADO',
} as const;
export type EstadoAsociacion = (typeof EstadoAsociacion)[keyof typeof EstadoAsociacion];

export type TipoDocumentoFisicoEmbebido = Schemas['TipoDocumentoFisicoEmbebidoDto'];

export type ContactoEmbebido = Schemas['ContactoEmbebidoDto'];

// Client-only: ComprobanteAsociadoDto no está referenciado por @ApiOkResponse,
// así que no entra al OpenAPI (su endpoint padre devuelve el detalle inline).
export interface ComprobanteAsociadoView {
  id: string;
  numero: string | null;
  estado: string;
}

export type DocumentoFisico = Schemas['DocumentoFisicoDto'];

// GET /api/documentos-fisicos/:id — el detalle agrega comprobantesAsociados.
// DocumentoFisicoDetalleDto no entra al OpenAPI (sin @ApiOkResponse), así que se
// compone extendiendo el alias base.
export interface DocumentoFisicoDetalle extends DocumentoFisico {
  comprobantesAsociados: ComprobanteAsociadoView[];
}

export type DocumentoFisicoListResponse = Schemas['ListarDocumentosFisicosResponseDto'];

export type CreateDocumentoFisicoRequest = Schemas['CreateDocumentoFisicoDto'];

export type UpdateDocumentoFisicoRequest = Schemas['UpdateDocumentoFisicoDto'];

// Query params para GET /api/documentos-fisicos (client-only).
export interface ListarDocumentosFisicosParams {
  tipoDocumentoFisicoId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  contactoId?: string;
  estadoAsociacion?: EstadoAsociacion;
  numero?: string;
  page?: number;
  pageSize?: number;
  disponibleParaAsociar?: boolean;
}

// ============================================================
// Impersonation
// ============================================================

export type StartImpersonationRequest = Schemas['StartImpersonationDto'];

// Client-only: el endpoint devuelve el token + metadata, sin DTO decorado.
export interface StartImpersonationResponse {
  impersonationToken: string;
  expiresAt: string;
  impersonationId: string;
}

// ============================================================
// Feature flags
// ------------------------------------------------------------
// Client-only: los flags se devuelven como filas Prisma. Los requests aliasan.
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

export type CreateFeatureFlagOverrideRequest = Schemas['CreateFeatureFlagDto'];

export type UpdateFeatureFlagOverrideRequest = Schemas['UpdateFeatureFlagDto'];

// ── Catálogo GLOBAL de feature flags (super-admin) — /api/admin/feature-flags ──
// El controller admin devuelve filas Prisma crudas; el shape de un flag global es
// el mismo `FeatureFlag` de arriba (organizationId === null para los globales).
// Los requests espejan CreateFeatureFlagDto / UpdateFeatureFlagDto. La `key` valida
// ^[a-z][a-z0-9_]*$ (≤100) en el backend (400 si no); crear una key existente da
// 409 FEATURE_FLAG_DUPLICADA, mutar una inexistente da 404. Por
// exactOptionalPropertyTypes, construir el body con spread condicional.

export type CreateFeatureFlagRequest = Schemas['CreateFeatureFlagDto'];

export type UpdateFeatureFlagRequest = Schemas['UpdateFeatureFlagDto'];

// Respuesta de POST /admin/feature-flags/:key/toggle — client-only (solo key + estado).
export interface ToggleFeatureFlagResponse {
  key: string;
  enabled: boolean;
}

// ============================================================
// Gestiones y períodos fiscales (Fase 1.2 backend)
// ------------------------------------------------------------
// Client-only: los DTOs de respuesta (Gestion/Periodo) aún no están referenciados
// por @ApiOkResponse, así que no entran al OpenAPI. Los enums tampoco tienen un
// campo schema contra el cual hacer `satisfies`.
// ============================================================

// Determina el mes de inicio del año fiscal (Ley 843 art. 46).
export const TipoEmpresa = {
  COMERCIAL: 'COMERCIAL',
  SERVICIOS: 'SERVICIOS',
  TRANSPORTE: 'TRANSPORTE',
  INDUSTRIAL: 'INDUSTRIAL',
  CONSTRUCCION: 'CONSTRUCCION',
  PETROLERA: 'PETROLERA',
  AGROPECUARIA: 'AGROPECUARIA',
  MINERA: 'MINERA',
} as const satisfies Record<string, NonNullable<Schemas['UpdateTenantDto']['tipoEmpresaPrincipal']>>;
export type TipoEmpresa = (typeof TipoEmpresa)[keyof typeof TipoEmpresa];

export const GestionFiscalStatus = {
  ABIERTA: 'ABIERTA',
  CERRADA: 'CERRADA',
} as const;
export type GestionFiscalStatus =
  (typeof GestionFiscalStatus)[keyof typeof GestionFiscalStatus];

export const PeriodoFiscalStatus = {
  ABIERTO: 'ABIERTO',
  CERRADO: 'CERRADO',
} as const;
export type PeriodoFiscalStatus =
  (typeof PeriodoFiscalStatus)[keyof typeof PeriodoFiscalStatus];

// Gestión sin períodos incluidos (GET /api/gestiones devuelve este shape).
export interface Gestion {
  id: string;
  year: number;
  mesInicio: number;
  status: GestionFiscalStatus;
  closedAt: string | null;
  closedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Periodo {
  id: string;
  gestionId: string;
  year: number;
  month: number;
  ordenEnGestion: number;
  status: PeriodoFiscalStatus;
  esDefinitivo: boolean;
  closedAt: string | null;
  closedByUserId: string | null;
  // Derivados puros del (year, month) — el backend los proyecta en la response.
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

// Response de POST /api/gestiones y GET /api/gestiones/:id (incluye los 12).
export interface GestionConPeriodos extends Gestion {
  fechaInicio: string; // YYYY-MM-DD (primer día de mesInicio)
  fechaFin: string; // YYYY-MM-DD (último día del mesCierre)
  tipoEmpresaPrincipal: TipoEmpresa;
  mesCierre: number;
  periodos: Periodo[];
}

// GET /api/periodos/:id/resumen-precierre.
export interface ComprobantesCounters {
  contabilizados: number;
  borradores: number;
  anulados: number;
}

export interface BorradorPendiente {
  id: string;
  numero: string | null;
  fechaContable: string; // YYYY-MM-DD
  glosa: string;
  total: string; // Decimal serializado como string (CLAUDE.md §4.5)
}

export interface ResumenPrecierre {
  periodo: Pick<
    Periodo,
    'id' | 'year' | 'month' | 'ordenEnGestion' | 'fechaInicio' | 'fechaFin'
  >;
  comprobantes: ComprobantesCounters;
  totalesBob: {
    totalDebe: string;
    totalHaber: string;
    balanceado: boolean;
  };
  borradoresPendientes: BorradorPendiente[];
  puedeCerrar: boolean;
  razonNoPuedeCerrar?: string;
}

// Query params de GET /api/gestiones (client-only).
export interface ListarGestionesParams {
  status?: GestionFiscalStatus;
}

// Query params de GET /api/periodos (client-only).
export interface ListarPeriodosParams {
  gestionId?: string;
  status?: PeriodoFiscalStatus;
}

// Body de POST /api/gestiones — el mesInicio se deriva del tenant.
export type CrearGestionRequest = Schemas['CrearGestionDto'];

// Body de POST /api/periodos/:id/reabrir.
export type ReabrirPeriodoRequest = Schemas['ReabrirPeriodoDto'];

// ============================================================
// Comprobantes (asientos contables — Fase 1 slice 1)
// ============================================================

export const TipoComprobante = {
  APERTURA: 'APERTURA',
  DIARIO: 'DIARIO',
  INGRESO: 'INGRESO',
  EGRESO: 'EGRESO',
  AJUSTE: 'AJUSTE',
  TRASPASO: 'TRASPASO',
  CIERRE: 'CIERRE',
} as const satisfies Record<string, Schemas['ComprobanteListItemDto']['tipo']>;
export type TipoComprobante = (typeof TipoComprobante)[keyof typeof TipoComprobante];

export const EstadoComprobante = {
  BORRADOR: 'BORRADOR',
  CONTABILIZADO: 'CONTABILIZADO',
  BLOQUEADO: 'BLOQUEADO',
} as const satisfies Record<string, Schemas['ComprobanteListItemDto']['estado']>;
export type EstadoComprobante = (typeof EstadoComprobante)[keyof typeof EstadoComprobante];

// Client-only: ComprobanteResponseDto / LineaResponseDto no están referenciados
// por @ApiOkResponse, así que no entran al OpenAPI. El detalle se tipa a mano.
export interface LineaComprobante {
  id: string;
  orden: number;
  cuentaId: string;
  contactoId: string | null;
  moneda: Moneda;
  debito: string;
  credito: string;
  tipoCambio: string;
  debitoBob: string;
  creditoBob: string;
  glosaLinea: string | null;
}

export interface Comprobante {
  id: string;
  tipo: TipoComprobante;
  numero: string | null;
  estado: EstadoComprobante;
  fechaContable: string; // YYYY-MM-DD
  periodoFiscalId: string;
  glosa: string;
  monedaPrincipal: Moneda;
  tipoCambioReexpresion: string;
  totalDebitoBob: string;
  totalCreditoBob: string;
  anulado: boolean;
  fechaAnulacion: string | null;
  anuladoPorUserId: string | null;
  motivoAnulacion: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  lineas: LineaComprobante[];
}

export type ContactoResumen = Schemas['ContactoResumenDto'];

export type DocumentoRespaldoResumen = Schemas['DocumentoRespaldoResumenDto'];

// Item de la lista paginada (no trae líneas; proyecta contactos + documentos).
export type ComprobanteListItem = Schemas['ComprobanteListItemDto'];

export type ListarComprobantesResponse = Schemas['ListarComprobantesResponseDto'];

export type ExportarComprobantesResponse = Schemas['ExportarComprobantesResponseDto'];

// Query params para GET /api/comprobantes (client-only).
export interface ListarComprobantesParams {
  page?: number;
  limit?: number;
  tipo?: TipoComprobante;
  estado?: EstadoComprobante;
  periodoFiscalId?: string;
  // Texto libre: el backend busca en número + glosa (case-insensitive).
  q?: string;
  incluirAnulados?: boolean;
}

// Query params para GET /api/comprobantes/export (client-only — sin page/limit).
export interface ExportarComprobantesParams {
  tipo?: TipoComprobante;
  estado?: EstadoComprobante;
  periodoFiscalId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  q?: string;
  incluirAnulados?: boolean;
}

// Adjunto de comprobante (Pack contabilidad.adjuntos — CLAUDE.md §10.1).
export type AdjuntoComprobante = Schemas['AdjuntoResponseDto'];

// Client-only: AuditoriaEntryDto no entra al OpenAPI (sin @ApiOkResponse).
export interface AuditoriaEntry {
  id: string;
  comprobanteId: string;
  tableName: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  rowOld: Record<string, unknown> | null;
  rowNew: Record<string, unknown> | null;
  userId: string | null;
  motivo: string | null;
  fueDuranteReapertura: boolean;
  reaperturaId: string | null;
  ts: string; // ISO timestamp
}

// ============================================================
// Reportes — Libro Diario (GET /api/libros/diario)
// ============================================================

// Query params para GET /api/libros/diario (client-only).
export interface LibroDiarioParams {
  /** UUID del período fiscal (exclusivo con fechaDesde/fechaHasta). */
  periodoFiscalId?: string;
  /** Inicio del rango YYYY-MM-DD (exclusivo con periodoFiscalId). */
  fechaDesde?: string;
  /** Fin del rango YYYY-MM-DD (exclusivo con periodoFiscalId). */
  fechaHasta?: string;
  /** Si true, incluye asientos anulados (default false — REQ-LD-03). */
  incluirAnulados?: boolean;
  /** UUID de cuenta de detalle. Solo asientos con ≥1 línea en esa cuenta. */
  cuentaId?: string;
}

export type LineaLibroDiario = Schemas['LineaLibroDiarioDto'];

export type AsientoLibroDiario = Schemas['AsientoLibroDiarioDto'];

export type LibroDiarioResponse = Schemas['LibroDiarioResponseDto'];

// ============================================================
// Libro Mayor — GET /api/libros/mayor
// ============================================================

// Query params para GET /api/libros/mayor (client-only).
export interface LibroMayorParams {
  /** UUID de la cuenta. Si se pasa, el Mayor muestra solo esa cuenta de detalle. */
  cuentaId?: string;
  /** UUID del período fiscal (exclusivo con fechaDesde/fechaHasta). */
  periodoFiscalId?: string;
  /** Inicio del rango YYYY-MM-DD (exclusivo con periodoFiscalId). */
  fechaDesde?: string;
  /** Fin del rango YYYY-MM-DD (exclusivo con periodoFiscalId). */
  fechaHasta?: string;
  /** Si true, incluye movimientos de comprobantes anulados (default false — REQ-LM-03). */
  incluirAnulados?: boolean;
  /** Si false, incluye cuentas con saldo inicial pero sin movimientos en el rango
   *  (default true — solo cuentas con movimiento — REQ-LM-08). */
  soloConMovimiento?: boolean;
}

export type MovimientoLibroMayor = Schemas['MovimientoMayorDto'];

export type CuentaLibroMayor = Schemas['CuentaMayorDto'];

export type LibroMayorResponse = Schemas['LibroMayorResponseDto'];

// ============================================================
// Balance General (Estado de Situación Financiera) — GET /api/eeff/balance
// ============================================================

export type CuentaBalance = Schemas['CuentaBalanceDto'];

export type SubseccionBalance = Schemas['SubseccionBalanceDto'];

export type SeccionBalance = Schemas['SeccionBalanceDto'];

export type BalanceGeneralResponse = Schemas['BalanceResponseDto'];

// ============================================================
// Permisos efectivos del usuario — GET /me/permissions
// ============================================================

/** Vertical activo de la organización, derivado de sus flags de módulo. */
export type VerticalActivo = Schemas['MePermissionsResponseDto']['vertical'];

export type MePermissionsResponse = Schemas['MePermissionsResponseDto'];

// Client-only: GET /me/platform no está modelado como DTO decorado.
export interface MePlatformResponse {
  isSuperAdmin: boolean;
}

// ============================================================
// Administración de plataforma (super-admin) — /api/admin/platform/orgs
// ============================================================

// Reusan los enum literals de los DTOs de la plataforma (status/plan vienen como
// string en PlatformOrgResponseDto, pero los DTOs de mutación los modelan como
// enum, que es la fuente del literal de gating de UI).
export type OrgStatus = Schemas['UpdateOrgStatusDto']['status'];

export type OrgPlan = NonNullable<Schemas['UpdateEntitlementDto']['plan']>;

export type PlatformOrg = Schemas['PlatformOrgResponseDto'];

export type CreateOrgRequest = Schemas['CreateOrgDto'];

export type UpdateOrgStatusRequest = Schemas['UpdateOrgStatusDto'];

export type UpdateEntitlementRequest = Schemas['UpdateEntitlementDto'];

// GET /admin/platform/orgs/:id/members — miembros de una org (Slice 1 platform-admin-v1.1).
export type PlatformOrgMember = Schemas['PlatformOrgMemberResponseDto'];

// ============================================================
// Roles asignables al invitar un miembro — GET /api/memberships/roles-asignables
// Client-only: el endpoint devuelve el shape inline, sin DTO decorado.
// ============================================================

export interface AssignableRole {
  id: string;
  name: string;
  kind: 'system' | 'custom';
  description?: string;
}

// ============================================================
// Estado de Resultados (Income Statement) — GET /api/eeff/resultados
// ============================================================

export type CuentaResultados = Schemas['CuentaResultadosDto'];

export type SubseccionResultados = Schemas['SubseccionResultadosDto'];

export type SeccionResultados = Schemas['SeccionResultadosDto'];

export type EstadoResultadosResponse = Schemas['EstadoResultadosResponseDto'];

// ============================================================
// Dashboard de plataforma — GET /api/admin/platform/dashboard
// GET /api/admin/platform/activity (super-admin)
// ============================================================

export type OrgStatusCount = Schemas['OrgStatusCountDto'];

export type OrgPlanCount = Schemas['OrgPlanCountDto'];

export type OrgVerticalCount = Schemas['OrgVerticalCountDto'];

export type UsuariosStats = Schemas['UsuariosStatsDto'];

export type AltasPorMes = Schemas['AltasPorMesDto'];

export type PlatformDashboard = Schemas['PlatformDashboardResponseDto'];

export type ActivityActor = Schemas['ActivityActorDto'];

export type ActivityTargetOrg = Schemas['ActivityTargetOrgDto'];

export type PlatformActivityItem = Schemas['PlatformActivityItemDto'];

export type PlatformActivity = Schemas['PlatformActivityResponseDto'];

// Query params para GET /api/admin/platform/activity (client-only).
export interface PlatformActivityParams {
  limit?: number;
  cursor?: string;
  orgId?: string;
}
