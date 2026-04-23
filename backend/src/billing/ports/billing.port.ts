/**
 * Billing Port - Core interface for payment provider integrations.
 * Implement this interface to connect Stripe, Paddle, LemonSqueezy, etc.
 *
 * This follows the Ports & Adapters (Hexagonal) architecture pattern,
 * allowing you to swap billing providers without changing business logic.
 */

export interface CustomerInfo {
  id: string;
  name: string;
  email?: string;
  metadata?: Record<string, string>;
}

export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'trialing'
  | 'unpaid'
  | 'paused';

export interface CheckoutSession {
  id: string;
  url: string;
  expiresAt: Date;
}

export interface PortalSession {
  id: string;
  url: string;
}

export interface WebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface BillingPort {
  /**
   * Customer Management
   */
  createCustomer(tenantId: string, info: CustomerInfo): Promise<string>;
  updateCustomer(customerId: string, info: Partial<CustomerInfo>): Promise<void>;
  deleteCustomer(customerId: string): Promise<void>;
  getCustomer(customerId: string): Promise<CustomerInfo | null>;

  /**
   * Subscription Management
   */
  createSubscription(customerId: string, planId: string): Promise<Subscription>;
  getSubscription(subscriptionId: string): Promise<Subscription | null>;
  getSubscriptionByCustomer(customerId: string): Promise<Subscription | null>;
  cancelSubscription(subscriptionId: string, immediately?: boolean): Promise<void>;
  resumeSubscription(subscriptionId: string): Promise<void>;
  updateSubscription(subscriptionId: string, planId: string): Promise<Subscription>;

  /**
   * Checkout & Portal Sessions
   */
  createCheckoutSession(
    customerId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<CheckoutSession>;

  createPortalSession(customerId: string, returnUrl: string): Promise<PortalSession>;

  /**
   * Webhook Handling
   */
  constructWebhookEvent(payload: string | Buffer, signature: string): WebhookEvent;

  /**
   * Plan & Price Information
   */
  getPlanPrice(
    planId: string,
  ): Promise<{ amount: number; currency: string; interval: string } | null>;
}

/**
 * Injection token for the BillingPort
 */
export const BILLING_PORT = Symbol('BILLING_PORT');
