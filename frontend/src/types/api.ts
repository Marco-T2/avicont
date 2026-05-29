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
// Contactos (directorio de clientes y proveedores)
// ============================================================

// Espejo de ContactoResponseDto en
// backend/src/modules/contactos/dto/contacto-response.dto.ts.
// NOTA: no incluye organizationId — el backend lo filtra por tenant activo.
export interface Contacto {
  id: string;
  razonSocial: string;
  nombreComercial: string | null;
  documento: string | null;
  esCliente: boolean;
  esProveedor: boolean;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactoListResponse {
  items: Contacto[];
  total: number;
  page: number;
  pageSize: number;
}

// Query params para GET /api/contactos.
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

// Espejo de TipoDocumentoFisicoResponseDto en
// backend/src/tipos-documento-fisico/dto/tipo-documento-fisico-response.dto.ts.
export interface TipoDocumentoFisico {
  id: string;
  nombre: string;
  codigo: string;
  esTributario: boolean;
  activo: boolean;
  tiposComprobanteAplicables: TipoComprobante[];
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TipoDocumentoFisicoListResponse {
  items: TipoDocumentoFisico[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateTipoDocumentoFisicoRequest {
  nombre: string;
  codigo: string;
  esTributario: boolean;
  tiposComprobanteAplicables: TipoComprobante[];
}

// codigo NO va (inmutable post-creación). activo puede ir en el mismo PATCH.
export interface UpdateTipoDocumentoFisicoRequest {
  nombre?: string;
  esTributario?: boolean;
  tiposComprobanteAplicables?: TipoComprobante[];
  activo?: boolean;
}

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

// Espejo de DocumentoFisicoDto + enums del backend.
export const EstadoAsociacion = {
  SUELTO: 'SUELTO',
  EN_BORRADOR: 'EN_BORRADOR',
  CONTABILIZADO: 'CONTABILIZADO',
} as const;
export type EstadoAsociacion = (typeof EstadoAsociacion)[keyof typeof EstadoAsociacion];

export interface TipoDocumentoFisicoEmbebido {
  id: string;
  nombre: string;
  codigo: string;
  esTributario: boolean;
}

export interface ContactoEmbebido {
  id: string;
  razonSocial: string;
}

export interface ComprobanteAsociadoView {
  id: string;
  numero: string | null;
  estado: string;
}

// Espejo de DocumentoFisicoDto en backend/src/documentos-fisicos/dto/.
// monto: string | null — §4.5 (dinero como string, nunca number).
export interface DocumentoFisico {
  id: string;
  numero: string;
  fechaEmision: string; // YYYY-MM-DD
  monto: string | null;
  moneda: string | null;
  glosa: string | null;
  tipoDocumentoFisico: TipoDocumentoFisicoEmbebido;
  contacto: ContactoEmbebido | null;
  organizationId: string;
  createdAt: string;
}

// GET /api/documentos-fisicos/:id — incluye comprobantesAsociados para D2.
export interface DocumentoFisicoDetalle extends DocumentoFisico {
  comprobantesAsociados: ComprobanteAsociadoView[];
}

export interface DocumentoFisicoListResponse {
  items: DocumentoFisico[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateDocumentoFisicoRequest {
  tipoDocumentoFisicoId: string;
  numero: string;
  fechaEmision: string;
  monto?: string | null;
  moneda?: Moneda | null;
  contactoId?: string | null;
  glosa?: string | null;
}

export type UpdateDocumentoFisicoRequest = Partial<CreateDocumentoFisicoRequest>;

// Query params para GET /api/documentos-fisicos.
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

// ============================================================
// Gestiones y períodos fiscales (Fase 1.2 backend)
// Espejo de backend/src/periodos-fiscales/dto/*.ts.
// ============================================================

// Determina el mes de inicio del año fiscal (Ley 843 art. 46).
// Inmutable una vez que existe ≥1 GestionFiscal para el tenant.
export const TipoEmpresa = {
  COMERCIAL: 'COMERCIAL',
  SERVICIOS: 'SERVICIOS',
  TRANSPORTE: 'TRANSPORTE',
  INDUSTRIAL: 'INDUSTRIAL',
  CONSTRUCCION: 'CONSTRUCCION',
  PETROLERA: 'PETROLERA',
  AGROPECUARIA: 'AGROPECUARIA',
  MINERA: 'MINERA',
} as const;
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

// Query params de GET /api/gestiones.
export interface ListarGestionesParams {
  status?: GestionFiscalStatus;
}

// Query params de GET /api/periodos.
export interface ListarPeriodosParams {
  gestionId?: string;
  status?: PeriodoFiscalStatus;
}

// Body de POST /api/gestiones — el mesInicio se deriva del tenant.
export interface CrearGestionRequest {
  year: number;
}

// Body de POST /api/periodos/:id/reabrir.
export interface ReabrirPeriodoRequest {
  motivo: string;
}

// ============================================================
// Comprobantes (asientos contables — Fase 1 slice 1)
// Espejo de backend/src/comprobantes/dto/*.ts.
// ============================================================

export const TipoComprobante = {
  APERTURA: 'APERTURA',
  DIARIO: 'DIARIO',
  INGRESO: 'INGRESO',
  EGRESO: 'EGRESO',
  AJUSTE: 'AJUSTE',
  TRASPASO: 'TRASPASO',
  CIERRE: 'CIERRE',
} as const;
export type TipoComprobante = (typeof TipoComprobante)[keyof typeof TipoComprobante];

export const EstadoComprobante = {
  BORRADOR: 'BORRADOR',
  CONTABILIZADO: 'CONTABILIZADO',
  BLOQUEADO: 'BLOQUEADO',
} as const;
export type EstadoComprobante = (typeof EstadoComprobante)[keyof typeof EstadoComprobante];

// Espejo de LineaResponseDto en backend/src/comprobantes/dto/comprobante-response.dto.ts.
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

// Espejo de ComprobanteResponseDto en backend/src/comprobantes/dto/comprobante-response.dto.ts.
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

// Item de la lista paginada (puede omitir lineas para eficiencia).
export type ComprobanteListItem = Omit<Comprobante, 'lineas'>;

export interface ListarComprobantesResponse {
  items: ComprobanteListItem[];
  total: number;
  page: number;
  limit: number;
}

// Query params para GET /api/comprobantes.
export interface ListarComprobantesParams {
  page?: number;
  limit?: number;
  tipo?: TipoComprobante;
  estado?: EstadoComprobante;
  incluirAnulados?: boolean;
}

// Espejo de AuditoriaEntryDto en backend/src/comprobantes/dto/auditoria-response.dto.ts.
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
