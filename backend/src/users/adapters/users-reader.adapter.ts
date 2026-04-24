import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';

import {
  UsersReaderPort,
  UsuarioMinimo,
  UsuarioParaAuth,
} from '../ports/users-reader.port';

@Injectable()
export class PrismaUsersReaderAdapter extends UsersReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByEmail(email: string): Promise<UsuarioParaAuth | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        hashedPassword: true,
        isActive: true,
      },
    });
  }

  async findMinimalByEmail(email: string): Promise<UsuarioMinimo | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        displayName: true,
      },
    });
  }
}
