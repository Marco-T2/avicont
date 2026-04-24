import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import type {
  ActualizarUsuarioData,
  CrearUsuarioData,
  UserRepositoryPort,
} from '../ports/user.repository.port';

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: CrearUsuarioData): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: data.email.toLowerCase().trim(),
        hashedPassword: data.hashedPassword,
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
      },
    });
  }

  update(id: string, data: ActualizarUsuarioData): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
      },
    });
  }
}
