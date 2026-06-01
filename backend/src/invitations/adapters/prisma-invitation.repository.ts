import { Injectable } from '@nestjs/common';
import { Invitation, InvitationStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  CreateInvitationData,
  InvitationRepositoryPort,
  InvitationWithOrgAndInviter,
} from '../ports/invitation.repository.port';

@Injectable()
export class PrismaInvitationRepository implements InvitationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateInvitationData): Promise<Invitation> {
    return this.prisma.invitation.create({
      data: {
        organizationId: data.organizationId,
        email: data.email,
        invitedById: data.invitedById,
        systemRole: data.systemRole ?? null,
        customRoleId: data.customRoleId ?? null,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
    });
  }

  findByTokenHash(tokenHash: string): Promise<InvitationWithOrgAndInviter | null> {
    return this.prisma.invitation.findUnique({
      where: { tokenHash },
      include: {
        organization: { select: { id: true, slug: true, name: true } },
        invitedBy: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  findById(id: string, organizationId: string): Promise<Invitation | null> {
    return this.prisma.invitation.findFirst({ where: { id, organizationId } });
  }

  listByOrganization(organizationId: string, status?: InvitationStatus): Promise<Invitation[]> {
    return this.prisma.invitation.findMany({
      where: {
        organizationId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  markAccepted(id: string, userId: string): Promise<Invitation> {
    return this.prisma.invitation.update({
      where: { id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        acceptedByUserId: userId,
      },
    });
  }

  markRevoked(id: string, organizationId: string): Promise<Invitation> {
    return this.prisma.invitation.update({
      where: { id, organizationId },
      data: { status: 'REVOKED' },
    });
  }

  findActivePendingForEmail(organizationId: string, email: string): Promise<Invitation | null> {
    return this.prisma.invitation.findFirst({
      where: {
        organizationId,
        email: email.toLowerCase().trim(),
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
    });
  }
}
