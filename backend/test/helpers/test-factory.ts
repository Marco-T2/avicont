import { PrismaClient, SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Contador monotónico para unicidad garantizada: Date.now() solo colisiona
// cuando dos creaciones consecutivas caen en el mismo milisegundo (frecuente
// bajo --runInBand), rompiendo el UNIQUE de slug/email de forma intermitente.
let testSeq = 0;
function uniqueToken(): string {
  return `${Date.now()}-${testSeq++}`;
}

export async function createTestUser(overrides: { email?: string; password?: string } = {}) {
  const email = overrides.email ?? `test-${uniqueToken()}@example.com`;
  const password = overrides.password ?? 'password123';
  const hashedPassword = await bcrypt.hash(password, 10);

  return prisma.user.create({
    data: {
      email,
      hashedPassword,
    },
  });
}

export async function createTestTenant(overrides: { name?: string; slug?: string } = {}) {
  const name = overrides.name ?? `Test Tenant ${uniqueToken()}`;
  const slug = overrides.slug ?? `test-tenant-${uniqueToken()}`;

  return prisma.organization.create({
    data: { name, slug },
  });
}

export async function createTestMembership(
  userId: string,
  tenantId: string,
  role: SystemRole = SystemRole.OWNER,
) {
  return prisma.membership.create({
    data: { userId, organizationId: tenantId, systemRole: role },
  });
}

export async function createTestUserWithTenant(
  options: {
    email?: string;
    password?: string;
    tenantName?: string;
    role?: SystemRole;
  } = {},
) {
  const user = await createTestUser({
    ...(options.email !== undefined ? { email: options.email } : {}),
    ...(options.password !== undefined ? { password: options.password } : {}),
  });

  const tenant = await createTestTenant({
    ...(options.tenantName !== undefined ? { name: options.tenantName } : {}),
  });

  const membership = await createTestMembership(
    user.id,
    tenant.id,
    options.role ?? SystemRole.OWNER,
  );

  return { user, tenant, membership };
}

export async function cleanupTestData() {
  // Limpiar primero los registros de auditoría de plataforma para evitar
  // conflictos de FK con users/orgs que se eliminan después.
  // Se limpia también al final para capturar escrituras async tardías (void).
  await prisma.platformAudit.deleteMany({}).catch(() => void 0);
  await prisma.refreshToken.deleteMany({});
  await prisma.impersonationAction.deleteMany({});
  await prisma.impersonationLog.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.customRole.deleteMany({});
  await prisma.featureFlag.deleteMany({});
  // Comprobantes (Fase 1.3): deben borrarse ANTES de cuentas porque
  // LineaComprobante tiene FK Restrict hacia Cuenta. Borrar Comprobante
  // cascadea LineaComprobante (schema onDelete: Cascade). La auditoría
  // vive en `comprobantes_audit` (tabla raw, no relacional) y se limpia
  // aparte si los tests la inspeccionan.
  await prisma.comprobante.deleteMany({});
  await prisma.secuenciaComprobante.deleteMany({});
  // Documento físico (Fase 1.4 slice 2): la tabla de asociación cascadea al
  // borrar Comprobante, pero la limpiamos explícita por idempotencia. Luego los
  // documentos (FK Restrict hacia TipoDocumentoFisico y Contacto) y por último
  // los tipos. Todo ANTES de Contacto y Organization.
  await prisma.comprobanteDocumentoFisico.deleteMany({});
  await prisma.documentoFisico.deleteMany({});
  await prisma.tipoDocumentoFisico.deleteMany({});
  // Contactos (Fase 1.4): van DESPUÉS de comprobantes (LineaComprobante
  // tiene FK Restrict hacia Contacto) y ANTES de Organization (FK Cascade).
  await prisma.contacto.deleteMany({});
  // Plan de cuentas: OrgConfiguracionContable tiene FKs Restrict hacia Cuenta,
  // así que los borramos en orden explícito antes de tocar Organization.
  await prisma.orgConfiguracionContable.deleteMany({});
  await prisma.cuenta.deleteMany({});
  // Gestiones + períodos fiscales (Fase 1.2). Orden importa por las FKs.
  await prisma.periodoFiscalReopening.deleteMany({});
  await prisma.periodoFiscal.deleteMany({});
  await prisma.gestionFiscal.deleteMany({});
  // Packs (eje 2): OrgPackEntitlement cascadea al borrar Organization, pero lo
  // borramos explícito antes (su FK hacia Pack es Restrict). Pack es catálogo
  // global sin FK a Organization, así que se limpia aparte tras los entitlements.
  await prisma.orgPackEntitlement.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.pack.deleteMany({});
  // Segunda limpieza de platform_audit justo antes de usuarios: atrapa escrituras
  // async tardías (el interceptor usa void/fire-and-forget). La org ya fue borrada
  // (targetOrganizationId → SET NULL en BD); ahora limpiamos antes de eliminar users
  // para evitar la restricción actorUserId (ON DELETE RESTRICT → actorUser).
  await prisma.platformAudit.deleteMany({}).catch(() => void 0);
  await prisma.user.deleteMany({});
}

export { prisma };
