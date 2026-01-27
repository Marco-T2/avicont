import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER'
} as const;

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('password', 10);

  const user = await prisma.user.upsert({
    where: { email: 'founder@yoursaas.com' },
    update: {},
    create: {
      email: 'founder@yoursaas.com',
      hashedPassword: password,
      isEmailVerified: true,
      displayName: 'Founder'
    }
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme' },
    update: {},
    create: {
      name: 'Acme Inc',
      slug: 'acme'
    }
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: { role: Role.OWNER },
    create: { tenantId: tenant.id, userId: user.id, role: Role.OWNER }
  });

  console.info('Seed complete:', { tenant: tenant.slug, user: user.email });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
