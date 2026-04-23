import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async update(id: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
    });
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
