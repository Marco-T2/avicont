import { PrismaClient, SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export async function createTestUser(overrides: { email?: string; password?: string } = {}) {
  const email = overrides.email ?? `test-${Date.now()}@example.com`;
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
  const name = overrides.name ?? `Test Tenant ${Date.now()}`;
  const slug = overrides.slug ?? `test-tenant-${Date.now()}`;

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
  await prisma.refreshToken.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.impersonationAction.deleteMany({});
  await prisma.impersonationLog.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.customRole.deleteMany({});
  await prisma.featureFlag.deleteMany({});
  // Comprobantes (Fase 1.3): deben borrarse ANTES de cuentas porque
  // LineaComprobante tiene FK Restrict hacia Cuenta. Borrar Comprobante
  // cascadea LineaComprobante y ComprobanteAuditoria (schema onDelete: Cascade).
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
  await prisma.organization.deleteMany({});
  await prisma.user.deleteMany({});
}

export { prisma };
