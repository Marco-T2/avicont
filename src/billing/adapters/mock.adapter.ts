import { Injectable, Logger } from '@nestjs/common';
import {
  BillingPort,
  CustomerInfo,
  Subscription,
  CheckoutSession,
  PortalSession,
  WebhookEvent,
} from '../ports/billing.port';

/**
 * Mock Billing Adapter for development and testing.
 * Does not connect to any real payment provider.
 */
@Injectable()
export class MockBillingAdapter implements BillingPort {
  private readonly logger = new Logger(MockBillingAdapter.name);
  private customers = new Map<string, CustomerInfo>();
  private subscriptions = new Map<string, Subscription>();
  private customerIdCounter = 1;
  private subscriptionIdCounter = 1;

  constructor() {
    this.logger.warn('Using MockBillingAdapter - no real payments will be processed');
  }

  async createCustomer(tenantId: string, info: CustomerInfo): Promise<string> {
    const customerId = `mock_cus_${this.customerIdCounter++}`;
    this.customers.set(customerId, { ...info, id: customerId });
    this.logger.log(`Mock: Created customer ${customerId} for tenant ${tenantId}`);
    return customerId;
  }

  async updateCustomer(customerId: string, info: Partial<CustomerInfo>): Promise<void> {
    const existing = this.customers.get(customerId);
    if (existing) {
      this.customers.set(customerId, { ...existing, ...info });
    }
  }

  async deleteCustomer(customerId: string): Promise<void> {
    this.customers.delete(customerId);
    this.logger.log(`Mock: Deleted customer ${customerId}`);
  }

  async getCustomer(customerId: string): Promise<CustomerInfo | null> {
    return this.customers.get(customerId) || null;
  }

  async createSubscription(customerId: string, planId: string): Promise<Subscription> {
    const subscriptionId = `mock_sub_${this.subscriptionIdCounter++}`;
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription: Subscription = {
      id: subscriptionId,
      customerId,
      planId,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    };

    this.subscriptions.set(subscriptionId, subscription);
    this.logger.log(`Mock: Created subscription ${subscriptionId} for customer ${customerId}`);
    return subscription;
  }

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    return this.subscriptions.get(subscriptionId) || null;
  }

  async getSubscriptionByCustomer(customerId: string): Promise<Subscription | null> {
    for (const sub of this.subscriptions.values()) {
      if (sub.customerId === customerId && sub.status === 'active') {
        return sub;
      }
    }
    return null;
  }

  async cancelSubscription(subscriptionId: string, immediately = false): Promise<void> {
    const sub = this.subscriptions.get(subscriptionId);
    if (sub) {
      if (immediately) {
        sub.status = 'canceled';
      } else {
        sub.cancelAtPeriodEnd = true;
      }
      this.logger.log(`Mock: Cancelled subscription ${subscriptionId} (immediate: ${immediately})`);
    }
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    const sub = this.subscriptions.get(subscriptionId);
    if (sub) {
      sub.cancelAtPeriodEnd = false;
      this.logger.log(`Mock: Resumed subscription ${subscriptionId}`);
    }
  }

  async updateSubscription(subscriptionId: string, planId: string): Promise<Subscription> {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) {
      throw new Error('Subscription not found');
    }
    sub.planId = planId;
    this.logger.log(`Mock: Updated subscription ${subscriptionId} to plan ${planId}`);
    return sub;
  }

  async createCheckoutSession(
    customerId: string,
    planId: string,
    successUrl: string,
    _cancelUrl: string,
  ): Promise<CheckoutSession> {
    const sessionId = `mock_cs_${Date.now()}`;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    this.logger.log(`Mock: Created checkout session ${sessionId}`);

    return {
      id: sessionId,
      url: `${successUrl}?session_id=${sessionId}&customer=${customerId}&plan=${planId}`,
      expiresAt,
    };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<PortalSession> {
    const sessionId = `mock_portal_${Date.now()}`;

    return {
      id: sessionId,
      url: `${returnUrl}?portal_session=${sessionId}&customer=${customerId}`,
    };
  }

  constructWebhookEvent(payload: string | Buffer, _signature: string): WebhookEvent {
    const data = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString());
    return {
      type: data.type || 'mock.event',
      data: data.data || {},
    };
  }

  async getPlanPrice(
    planId: string,
  ): Promise<{ amount: number; currency: string; interval: string } | null> {
    // Mock prices
    const mockPrices: Record<string, { amount: number; currency: string; interval: string }> = {
      price_pro_monthly: { amount: 2900, currency: 'usd', interval: 'month' },
      price_pro_yearly: { amount: 29000, currency: 'usd', interval: 'year' },
    };

    return mockPrices[planId] || { amount: 0, currency: 'usd', interval: 'month' };
  }
}
