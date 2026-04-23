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

  const membership = await createTestMembership(user.id, tenant.id, options.role ?? SystemRole.OWNER);

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
  await prisma.organization.deleteMany({});
  await prisma.user.deleteMany({});
}

export { prisma };
