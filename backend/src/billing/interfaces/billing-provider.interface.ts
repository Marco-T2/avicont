export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
}

/**
 * Billing provider interface for future payment integrations.
 * Implement this interface to connect Stripe, Paddle, LemonSqueezy, etc.
 */
export interface BillingProvider {
  /** Create a customer in the billing system */
  createCustomer(tenant: Tenant): Promise<{ customerId: string }>;

  /** Update customer details */
  updateCustomer(customerId: string, data: { name?: string; email?: string }): Promise<void>;

  /** Delete a customer */
  deleteCustomer(customerId: string): Promise<void>;

  /** Create a checkout session for plan upgrade */
  createCheckoutSession(
    tenantId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<{ sessionUrl: string }>;

  /** Create a portal session for managing subscription */
  createPortalSession(customerId: string, returnUrl: string): Promise<{ portalUrl: string }>;

  /** Check if tenant has active subscription */
  hasActiveSubscription(tenantId: string): Promise<boolean>;

  /** Get current subscription details */
  getSubscription(tenantId: string): Promise<{
    planId: string;
    status: string;
    currentPeriodEnd: Date;
  } | null>;

  /** Cancel subscription */
  cancelSubscription(tenantId: string): Promise<void>;

  /** Resume a cancelled subscription */
  resumeSubscription(tenantId: string): Promise<void>;
}
