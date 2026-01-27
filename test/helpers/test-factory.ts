import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;

type RoleType = (typeof Role)[keyof typeof Role];

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

  return prisma.tenant.create({
    data: { name, slug },
  });
}

export async function createTestMembership(
  userId: string,
  tenantId: string,
  role: RoleType = Role.MEMBER,
) {
  return prisma.membership.create({
    data: { userId, tenantId, role },
  });
}

export async function createTestUserWithTenant(
  options: {
    email?: string;
    password?: string;
    tenantName?: string;
    role?: RoleType;
  } = {},
) {
  const user = await createTestUser({
    email: options.email,
    password: options.password,
  });

  const tenant = await createTestTenant({
    name: options.tenantName,
  });

  const membership = await createTestMembership(user.id, tenant.id, options.role ?? Role.OWNER);

  return { user, tenant, membership };
}

export async function cleanupTestData() {
  await prisma.refreshToken.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.tenant.deleteMany({});
  await prisma.user.deleteMany({});
}

export { prisma };
