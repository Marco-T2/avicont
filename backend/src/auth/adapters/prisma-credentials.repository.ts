import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';

import type {
  CrearCredencialData,
  CredentialsRepositoryPort,
  StoredRefreshToken,
} from '../ports/credentials.repository.port';

@Injectable()
export class PrismaCredentialsRepository implements CredentialsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveByHash(hash: string): Promise<StoredRefreshToken | null> {
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        familyId: true,
        user: { select: { email: true } },
      },
    });
    if (!stored) return null;
    return {
      id: stored.id,
      userId: stored.userId,
      userEmail: stored.user.email,
      organizationId: stored.organizationId,
      familyId: stored.familyId,
    };
  }

  async create(data: CrearCredencialData): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: data.tokenHash,
        userId: data.userId,
        ...(data.organizationId !== undefined
          ? { organizationId: data.organizationId }
          : {}),
        familyId: data.familyId,
        expiresAt: data.expiresAt,
      },
    });
  }

  async revokeById(id: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeByHash(hash: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
}
