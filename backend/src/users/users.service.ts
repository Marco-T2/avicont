import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { toUserResponseDto, type UserResponseDto } from './dto/user-response.dto';
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

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.repo.update(id, dto);
    return toUserResponseDto(user);
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
