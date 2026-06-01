import { PrismaClient } from '@prisma/client';

import { toUserResponseDto } from './dto/user-response.dto';

/**
 * Integration spec del campo `User.isSuperAdmin` contra Postgres real.
 * REQ-SA-01: el campo es aditivo, no aparece en UserResponseDto.
 */
describe('REQ-SA-01: campo isSuperAdmin', () => {
  const TEST_EMAIL = 'integration-is-super-admin@test.com';

  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        hashedPassword: 'hashed-test',
        displayName: 'Test Super Admin',
      },
    });
    userId = user.id;
  });

  async function cleanup() {
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  }

  it('todos los usuarios existentes tienen isSuperAdmin = false por defecto', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.isSuperAdmin).toBe(false);
  });

  it('el campo no aparece en UserResponseDto', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const dto = toUserResponseDto(user);
    expect('isSuperAdmin' in dto).toBe(false);
  });
});
