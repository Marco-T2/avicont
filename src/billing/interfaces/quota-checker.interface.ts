const Plan = {
  FREE: 'FREE',
  PRO: 'PRO',
} as const;

type PlanType = (typeof Plan)[keyof typeof Plan];

/**
 * Quota checker interface for enforcing plan limits.
 * Implement this to define limits per plan.
 */
export interface QuotaChecker {
  /** Check if tenant can perform an action based on their plan */
  checkQuota(
    tenantId: string,
    resource: string,
  ): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    message?: string;
  }>;

  /** Get all quotas for a tenant */
  getQuotas(tenantId: string): Promise<Record<string, { current: number; limit: number }>>;

  /** Increment usage for a resource */
  incrementUsage(tenantId: string, resource: string, amount?: number): Promise<void>;

  /** Decrement usage for a resource */
  decrementUsage(tenantId: string, resource: string, amount?: number): Promise<void>;

  /** Reset usage (e.g., at billing cycle start) */
  resetUsage(tenantId: string, resource?: string): Promise<void>;
}

/**
 * Default plan limits - customize per your SaaS needs
 */
export const DEFAULT_PLAN_LIMITS: Record<PlanType, Record<string, number>> = {
  [Plan.FREE]: {
    members: 3,
    projects: 5,
    apiCalls: 1000,
    storage: 100, // MB
  },
  [Plan.PRO]: {
    members: 25,
    projects: 100,
    apiCalls: 50000,
    storage: 10000, // MB
  },
};
