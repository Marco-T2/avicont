import { ImpersonationLog } from '@prisma/client';

export const IMPERSONATION_REPOSITORY_PORT = Symbol('IMPERSONATION_REPOSITORY_PORT');

export interface CreateImpersonationLogData {
  adminUserId: string;
  targetUserId: string;
  organizationId: string;
  reason: string;
}

export interface LogActionData {
  impersonationLogId: string;
  action: string;
  resource?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ImpersonationRepositoryPort {
  createLog(data: CreateImpersonationLogData): Promise<ImpersonationLog>;
  findActiveByAdmin(adminUserId: string): Promise<ImpersonationLog | null>;
  findActiveById(id: string): Promise<ImpersonationLog | null>;
  endLog(id: string): Promise<ImpersonationLog>;
  logAction(data: LogActionData): Promise<void>;
}
