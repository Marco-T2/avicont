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

// Espejo de ContactoResumenDto: contacto distinto referenciado por las líneas.
export interface ContactoResumen {
  id: string;
  nombre: string;
}

// Espejo de DocumentoRespaldoResumenDto: documento físico de respaldo asociado.
export interface DocumentoRespaldoResumen {
  id: string;
  tipoNombre: string;
  numero: string;
}

// Item de la lista paginada. No trae líneas; en su lugar proyecta los contactos
// distintos y los documentos de respaldo. Espejo de ComprobanteListItemDto.
export interface ComprobanteListItem {
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
  contactos: ContactoResumen[];
  documentosRespaldo: DocumentoRespaldoResumen[];
}

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
  periodoFiscalId?: string;
  // Texto libre: el backend busca en número + glosa (case-insensitive).
  q?: string;
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

// ============================================================
// Reportes — Libro Diario (GET /api/libros/diario)
// Espejo de backend/src/reportes/dto/libro-diario-response.dto.ts
// ============================================================

// Query params para GET /api/libros/diario.
// La regla de negocio "exactamente uno de período O rango" se valida
// en el schema del form (libro-diario-filtro-schema.ts) y en el backend.
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

// Espejo de LineaLibroDiarioDto.
// Montos como string decimal (§4.5 CLAUDE.md).
export interface LineaLibroDiario {
  codigoCuenta: string;
  nombreCuenta: string;
  /** Glosa de la línea — nullable (no todas las líneas tienen glosa). */
  glosa: string | null;
  /** Monto debe en BOB. "0.00" si la línea es haber. */
  debeBob: string;
  /** Monto haber en BOB. "0.00" si la línea es debe. */
  haberBob: string;
}

// Espejo de AsientoLibroDiarioDto.
export interface AsientoLibroDiario {
  id: string;
  /** Fecha contable calendario puro: "YYYY-MM-DD" (§4.6). */
  fechaContable: string;
  /** Número correlativo del comprobante. Null solo en BORRADOR, pero el
   *  Libro Diario nunca incluye BORRADOR (REQ-LD-02). */
  numero: string | null;
  tipo: string;
  estado: string;
  glosa: string;
  /** Flag de anulación ortogonal al estado (§4.7 CLAUDE.md). */
  anulado: boolean;
  lineas: LineaLibroDiario[];
}

// Espejo de LibroDiarioResponseDto.
export interface LibroDiarioResponse {
  rango: {
    fechaDesde: string; // YYYY-MM-DD
    fechaHasta: string; // YYYY-MM-DD
  };
  asientos: AsientoLibroDiario[];
  /** Suma de todos los debeBob de las líneas incluidas. */
  totalDebeBob: string;
  /** Suma de todos los haberBob de las líneas incluidas.
   *  En asientos balanceados: === totalDebeBob. */
  totalHaberBob: string;
}

// ============================================================
// Libro Mayor — GET /api/libros/mayor
// ============================================================

// Query params para GET /api/libros/mayor.
// La regla "exactamente uno de período O rango" se valida en el schema del
// form (libro-mayor-filtro-schema.ts) y en el backend (service, no DTO).
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

// Espejo de MovimientoMayorDto.
// Montos como string decimal (§4.5 CLAUDE.md).
export interface MovimientoLibroMayor {
  comprobanteId: string;
  /** Número correlativo del comprobante. Null solo en BORRADOR — el Mayor nunca lo muestra. */
  numeroComprobante: string | null;
  /** Fecha contable calendario puro: "YYYY-MM-DD" (§4.6). */
  fechaContable: string;
  /** Glosa del comprobante cabecera. */
  glosa: string;
  /** Glosa de la línea (nullable). */
  glosaLinea: string | null;
  estado: string;
  /** Flag de anulación ortogonal al estado (§4.7 CLAUDE.md). */
  anulado: boolean;
  orden: number;
  /** Monto debe en BOB. "0.00" si la línea es haber. */
  debeBob: string;
  /** Monto haber en BOB. "0.00" si la línea es debe. */
  haberBob: string;
  /** Saldo corriente acumulado después de este movimiento. String decimal (§4.5). */
  saldoCorrienteBob: string;
}

// Espejo de CuentaMayorDto.
export interface CuentaLibroMayor {
  cuentaId: string;
  codigoInterno: string;
  nombreCuenta: string;
  /** Naturaleza contable: DEUDORA (activos/egresos) o ACREEDORA (pasivos/patrimonio/ingresos). */
  naturaleza: 'DEUDORA' | 'ACREEDORA';
  /** Saldo antes del primer movimiento del rango. String decimal, puede ser negativo. (§4.5) */
  saldoInicialBob: string;
  /** Saldo al final del rango (= saldoCorriente del último movimiento). String decimal. (§4.5) */
  saldoFinalBob: string;
  /** Suma de debeBob de los movimientos del rango. */
  totalDebeBob: string;
  /** Suma de haberBob de los movimientos del rango. */
  totalHaberBob: string;
  movimientos: MovimientoLibroMayor[];
}

// Espejo de LibroMayorResponseDto.
export interface LibroMayorResponse {
  rango: {
    fechaDesde: string; // YYYY-MM-DD
    fechaHasta: string; // YYYY-MM-DD
  };
  /** Cuentas con movimiento (o con saldo previo si soloConMovimiento=false), ordenadas por codigoInterno ASC. */
  cuentas: CuentaLibroMayor[];
  /** Suma de todos los debeBob del rango, de todas las cuentas. */
  totalDebeBob: string;
  /** Suma de todos los haberBob del rango, de todas las cuentas. */
  totalHaberBob: string;
}

// ============================================================
// Balance General (Estado de Situación Financiera) — GET /api/eeff/balance
// Espejo del BalanceResponseDto del backend (montos string §4.5,
// fechaCorte YYYY-MM-DD §4.6). Las ramas vacías ya vienen podadas (REQ-BG-15).
// ============================================================

export interface CuentaBalance {
  /** null en la línea sintética del Resultado del Ejercicio. */
  cuentaId: string | null;
  /** null en la línea sintética. */
  codigoInterno: string | null;
  nombre: string;
  nivel: number;
  esContraria: boolean;
  /** true solo para "Resultado del Ejercicio (en curso)". */
  esSintetica: boolean;
  saldoBob: string;
}

export interface SubseccionBalance {
  subClaseCuenta: string;
  titulo: string;
  cuentas: CuentaBalance[];
  totalBob: string;
}

export interface SeccionBalance {
  claseCuenta: string;
  titulo: string;
  subsecciones: SubseccionBalance[];
  totalBob: string;
}

export interface BalanceGeneralResponse {
  fechaCorte: string;
  gestionId: string;
  activo: SeccionBalance;
  pasivo: SeccionBalance;
  patrimonio: SeccionBalance;
  resultadoEjercicioBob: string;
  totalActivoBob: string;
  totalPasivoBob: string;
  totalPatrimonioBob: string;
  /** true si |Activo − (Pasivo + Patrimonio)| ≤ ±Bs 0.01 (REQ-BG-11). */
  cuadra: boolean;
  diferenciaBob: string;
}

// ============================================================
// Permisos efectivos del usuario — GET /me/permissions
// Espejo de MePermissionsResponseDto del backend (backend/src/me/dto/).
// `permissions` son strings de permiso EXACTOS, ya expandidos contra el catálogo
// por el backend (NO patrones de wildcards).
// ============================================================

/** Vertical activo de la organización, derivado de sus flags de módulo. */
export type VerticalActivo = 'CONTABILIDAD' | 'GRANJA' | null;

export interface MePermissionsResponse {
  /** Permisos efectivos exactos del usuario (ej. ["contabilidad.eeff.read"]). */
  permissions: string[];
  /** true si el usuario es OWNER o ADMIN (tiene acceso total). */
  isOwner: boolean;
  /** ID del tenant activo en el JWT en el momento de la consulta. */
  activeTenantId: string;
  /** Vertical de la org activa. null si la org no tiene módulo asignado. */
  vertical: VerticalActivo;
}

// Espeja backend me-platform-response.dto.ts. Org-less: identidad de plataforma
// del usuario, independiente del tenant activo.
export interface MePlatformResponse {
  isSuperAdmin: boolean;
}

// ============================================================
// Administración de plataforma (super-admin) — /api/admin/platform/orgs
// Espeja backend platform-org-response.dto.ts. status/plan vienen como string
// en el DTO (proyección directa de los enums Prisma OrganizationStatus/Plan);
// los tipamos con union literals para gating de UI, con render defensivo (R6)
// si el backend agregara un valor nuevo. createdAt: Date serializa a ISO string
// sobre HTTP.
// ============================================================

export type OrgStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export type OrgPlan = 'FREE' | 'PRO';

export interface PlatformOrg {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  plan: OrgPlan;
  contabilidadEnabled: boolean;
  granjaEnabled: boolean;
  createdAt: string;
}

// ============================================================
// Roles asignables al invitar un miembro — GET /api/memberships/roles-asignables
// Espejo de AssignableRoleDto en backend/src/memberships/dto/assignable-role.dto.ts.
// ============================================================

export interface AssignableRole {
  id: string;
  name: string;
  kind: 'system' | 'custom';
  description?: string;
}

// ============================================================
// Estado de Resultados (Income Statement) — GET /api/eeff/resultados
// Espejo del EstadoResultadosResponseDto del backend (montos string §4.5,
// rango fechaDesde/fechaHasta YYYY-MM-DD §4.6). Reporte de FLUJO del período.
// A diferencia del Balance: dos secciones raíz (Ingresos/Egresos), sin línea
// sintética, y el Resultado del Ejercicio es un campo escalar en raíz.
// Las ramas vacías ya vienen podadas del backend (REQ-ER-08).
// ============================================================

export interface CuentaResultados {
  cuentaId: string;
  codigoInterno: string;
  nombre: string;
  nivel: number;
  esContraria: boolean;
  saldoBob: string;
}

export interface SubseccionResultados {
  subClaseCuenta: string;
  titulo: string;
  cuentas: CuentaResultados[];
  totalBob: string;
}

export interface SeccionResultados {
  claseCuenta: string;
  titulo: string;
  subsecciones: SubseccionResultados[];
  totalBob: string;
}

export interface EstadoResultadosResponse {
  /** Inicio del rango de flujo (inclusive), YYYY-MM-DD. */
  fechaDesde: string;
  /** Fin del rango de flujo (inclusive), YYYY-MM-DD. */
  fechaHasta: string;
  ingreso: SeccionResultados;
  egreso: SeccionResultados;
  /** Resultado del Ejercicio = Σ INGRESO − Σ EGRESO; puede ser negativo (pérdida). */
  resultadoEjercicioBob: string;
  totalIngresoBob: string;
  totalEgresoBob: string;
  /** true si resultadoEjercicio >= 0 (utilidad o break-even). */
  esGanancia: boolean;
}
