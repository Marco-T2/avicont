import { Inject, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';

import { PrismaService } from '../common/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  USER_REPOSITORY_PORT,
  type UserRepositoryPort,
} from './ports/user.repository.port';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly repo: UserRepositoryPort,
    // `getProfile` compone datos de Membership y Organization (otros módulos).
    // Mientras esos módulos no expongan sus propios ports de lectura, el service
    // hace el join vía Prisma directo. TODO: extraer a un MembershipsReaderPort
    // cuando se hexagonice memberships (§3.2 del doc de deudas).
    private readonly prisma: PrismaService,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findByEmail(email);
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findById(id);
  }

  update(id: string, dto: UpdateUserDto): Promise<User> {
    return this.repo.update(id, dto);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            organization: true,
            customRole: { select: { slug: true, name: true } },
          },
        },
      },
    });
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      isEmailVerified: user.isEmailVerified,
      tenants: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        // Rol efectivo: systemRole si lo tiene (OWNER/ADMIN),
        // si no el slug del CustomRole asignado.
        role: m.systemRole ?? m.customRole?.slug ?? null,
      })),
    };
  }
}
