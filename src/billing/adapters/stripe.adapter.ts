import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  BillingPort,
  CustomerInfo,
  Subscription,
  SubscriptionStatus,
  CheckoutSession,
  PortalSession,
  WebhookEvent,
} from '../ports/billing.port';

@Injectable()
export class StripeAdapter implements BillingPort {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeAdapter.name);
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!apiKey) {
      this.logger.warn('STRIPE_SECRET_KEY not configured - Stripe adapter will not work');
    }

    this.stripe = new Stripe(apiKey || '');

    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');
  }

  /**
   * Customer Management
   */
  async createCustomer(tenantId: string, info: CustomerInfo): Promise<string> {
    const customer = await this.stripe.customers.create({
      name: info.name,
      email: info.email,
      metadata: {
        tenantId,
        ...info.metadata,
      },
    });

    this.logger.log(`Created Stripe customer ${customer.id} for tenant ${tenantId}`);
    return customer.id;
  }

  async updateCustomer(customerId: string, info: Partial<CustomerInfo>): Promise<void> {
    await this.stripe.customers.update(customerId, {
      name: info.name,
      email: info.email,
      metadata: info.metadata,
    });
  }

  async deleteCustomer(customerId: string): Promise<void> {
    await this.stripe.customers.del(customerId);
    this.logger.log(`Deleted Stripe customer ${customerId}`);
  }

  async getCustomer(customerId: string): Promise<CustomerInfo | null> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      if (customer.deleted) return null;

      return {
        id: customer.id,
        name: customer.name || '',
        email: customer.email || undefined,
        metadata: customer.metadata as Record<string, string>,
      };
    } catch {
      return null;
    }
  }

  /**
   * Subscription Management
   */
  async createSubscription(customerId: string, planId: string): Promise<Subscription> {
    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: planId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    return this.mapSubscription(subscription);
  }

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      return this.mapSubscription(subscription);
    } catch {
      return null;
    }
  }

  async getSubscriptionByCustomer(customerId: string): Promise<Subscription | null> {
    const subscriptions = await this.stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) return null;
    return this.mapSubscription(subscriptions.data[0]);
  }

  async cancelSubscription(subscriptionId: string, immediately = false): Promise<void> {
    if (immediately) {
      await this.stripe.subscriptions.cancel(subscriptionId);
    } else {
      await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
    this.logger.log(`Cancelled subscription ${subscriptionId} (immediate: ${immediately})`);
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
    this.logger.log(`Resumed subscription ${subscriptionId}`);
  }

  async updateSubscription(subscriptionId: string, planId: string): Promise<Subscription> {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    const itemId = subscription.items.data[0]?.id;

    if (!itemId) {
      throw new Error('Subscription has no items');
    }

    const updated = await this.stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: planId }],
      proration_behavior: 'create_prorations',
    });

    return this.mapSubscription(updated);
  }

  /**
   * Checkout & Portal Sessions
   */
  async createCheckoutSession(
    customerId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: planId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return {
      id: session.id,
      url: session.url!,
      expiresAt: new Date(session.expires_at * 1000),
    };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<PortalSession> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return {
      id: session.id,
      url: session.url,
    };
  }

  /**
   * Webhook Handling
   */
  constructWebhookEvent(payload: string | Buffer, signature: string): WebhookEvent {
    const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);

    return {
      type: event.type,
      data: event.data.object as unknown as Record<string, unknown>,
    };
  }

  /**
   * Plan & Price Information
   */
  async getPlanPrice(
    planId: string,
  ): Promise<{ amount: number; currency: string; interval: string } | null> {
    try {
      const price = await this.stripe.prices.retrieve(planId);
      return {
        amount: price.unit_amount || 0,
        currency: price.currency,
        interval: price.recurring?.interval || 'one_time',
      };
    } catch {
      return null;
    }
  }

  /**
   * Helper to map Stripe subscription to our domain model
   */
  private mapSubscription(sub: Stripe.Subscription): Subscription {
    // Access properties via type assertion for compatibility across Stripe versions
    const subAny = sub as unknown as {
      current_period_start: number;
      current_period_end: number;
    };

    return {
      id: sub.id,
      customerId: sub.customer as string,
      planId: sub.items.data[0]?.price.id || '',
      status: sub.status as SubscriptionStatus,
      currentPeriodStart: new Date(subAny.current_period_start * 1000),
      currentPeriodEnd: new Date(subAny.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    };
  }
}
