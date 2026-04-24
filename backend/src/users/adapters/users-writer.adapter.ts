import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';

import {
  CrearUsuarioParaAuthData,
  UsersWriterPort,
  UsuarioCreadoParaAuth,
} from '../ports/users-writer.port';

@Injectable()
export class PrismaUsersWriterAdapter extends UsersWriterPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(data: CrearUsuarioParaAuthData): Promise<UsuarioCreadoParaAuth> {
    return this.prisma.user.create({
      data: {
        email: data.email.toLowerCase().trim(),
        hashedPassword: data.hashedPassword,
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
      },
      select: { id: true, email: true },
    });
  }
}
