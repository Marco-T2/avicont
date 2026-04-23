import { Invitation, InvitationStatus, SystemRole } from '@prisma/client';

export const INVITATION_REPOSITORY_PORT = Symbol('INVITATION_REPOSITORY_PORT');

export interface CreateInvitationData {
  organizationId: string;
  email: string;
  invitedById: string;
  systemRole?: SystemRole | null;
  customRoleId?: string | null;
  tokenHash: string;
  expiresAt: Date;
}

export interface InvitationWithOrgAndInviter extends Invitation {
  organization: { id: string; slug: string; name: string };
  invitedBy: { id: string; email: string; displayName: string | null };
}

export interface InvitationRepositoryPort {
  create(data: CreateInvitationData): Promise<Invitation>;
  findByTokenHash(tokenHash: string): Promise<InvitationWithOrgAndInviter | null>;
  findById(id: string): Promise<Invitation | null>;
  listByOrganization(organizationId: string, status?: InvitationStatus): Promise<Invitation[]>;
  markAccepted(id: string, userId: string): Promise<Invitation>;
  markRevoked(id: string): Promise<Invitation>;
  // Para evitar duplicados: hay invitación PENDING vigente para ese email en esa org?
  findActivePendingForEmail(organizationId: string, email: string): Promise<Invitation | null>;
}
