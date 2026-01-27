import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingPort,
  CustomerInfo,
  Subscription,
  CheckoutSession,
  PortalSession,
  WebhookEvent,
} from '../ports/billing.port';

/**
 * Paddle Adapter - Stub implementation for Paddle billing integration.
 *
 * Paddle is a Merchant of Record (MoR), which means they handle:
 * - Tax calculation and remittance
 * - Payment processing
 * - Invoicing
 *
 * Implement this adapter using Paddle's API:
 * https://developer.paddle.com/api-reference/overview
 */
@Injectable()
export class PaddleAdapter implements BillingPort {
  private readonly logger = new Logger(PaddleAdapter.name);
  private readonly vendorId: string;
  private readonly apiKey: string;
  private readonly environment: 'sandbox' | 'production';

  constructor(private readonly config: ConfigService) {
    this.vendorId = this.config.get<string>('PADDLE_VENDOR_ID', '');
    this.apiKey = this.config.get<string>('PADDLE_API_KEY', '');
    this.environment = this.config.get<string>('PADDLE_ENVIRONMENT', 'sandbox') as
      | 'sandbox'
      | 'production';

    if (!this.vendorId || !this.apiKey) {
      this.logger.warn('PADDLE_VENDOR_ID or PADDLE_API_KEY not configured');
    }
  }

  private get baseUrl(): string {
    return this.environment === 'production'
      ? 'https://api.paddle.com'
      : 'https://sandbox-api.paddle.com';
  }

  /**
   * Customer Management
   */
  async createCustomer(tenantId: string, _info: CustomerInfo): Promise<string> {
    // Paddle creates customers implicitly during checkout
    // You can use their Customers API for explicit creation
    // https://developer.paddle.com/api-reference/customers/create-customer

    this.logger.log(`Creating Paddle customer for tenant ${tenantId}`);
    throw new NotImplementedException('Paddle createCustomer not implemented');
  }

  async updateCustomer(_customerId: string, _info: Partial<CustomerInfo>): Promise<void> {
    throw new NotImplementedException('Paddle updateCustomer not implemented');
  }

  async deleteCustomer(_customerId: string): Promise<void> {
    throw new NotImplementedException('Paddle deleteCustomer not implemented');
  }

  async getCustomer(_customerId: string): Promise<CustomerInfo | null> {
    throw new NotImplementedException('Paddle getCustomer not implemented');
  }

  /**
   * Subscription Management
   */
  async createSubscription(_customerId: string, _planId: string): Promise<Subscription> {
    // Paddle subscriptions are created through checkout
    throw new NotImplementedException('Paddle createSubscription not implemented');
  }

  async getSubscription(_subscriptionId: string): Promise<Subscription | null> {
    throw new NotImplementedException('Paddle getSubscription not implemented');
  }

  async getSubscriptionByCustomer(_customerId: string): Promise<Subscription | null> {
    throw new NotImplementedException('Paddle getSubscriptionByCustomer not implemented');
  }

  async cancelSubscription(_subscriptionId: string, _immediately = false): Promise<void> {
    // https://developer.paddle.com/api-reference/subscriptions/cancel-subscription
    throw new NotImplementedException('Paddle cancelSubscription not implemented');
  }

  async resumeSubscription(_subscriptionId: string): Promise<void> {
    throw new NotImplementedException('Paddle resumeSubscription not implemented');
  }

  async updateSubscription(_subscriptionId: string, _planId: string): Promise<Subscription> {
    // https://developer.paddle.com/api-reference/subscriptions/update-subscription
    throw new NotImplementedException('Paddle updateSubscription not implemented');
  }

  /**
   * Checkout & Portal Sessions
   */
  async createCheckoutSession(
    _customerId: string,
    _planId: string,
    _successUrl: string,
    _cancelUrl: string,
  ): Promise<CheckoutSession> {
    // Paddle uses client-side checkout with Paddle.js
    // Server-side: create a transaction
    // https://developer.paddle.com/api-reference/transactions/create-transaction

    throw new NotImplementedException('Paddle createCheckoutSession not implemented');
  }

  async createPortalSession(_customerId: string, _returnUrl: string): Promise<PortalSession> {
    // Paddle has a customer portal, but it's handled differently
    // You typically redirect to a Paddle-hosted URL

    throw new NotImplementedException('Paddle createPortalSession not implemented');
  }

  /**
   * Webhook Handling
   */
  constructWebhookEvent(_payload: string | Buffer, _signature: string): WebhookEvent {
    // Paddle webhook verification
    // https://developer.paddle.com/webhooks/signature-verification

    throw new NotImplementedException('Paddle webhook verification not implemented');
  }

  /**
   * Plan & Price Information
   */
  async getPlanPrice(
    _planId: string,
  ): Promise<{ amount: number; currency: string; interval: string } | null> {
    // https://developer.paddle.com/api-reference/prices/get-price
    throw new NotImplementedException('Paddle getPlanPrice not implemented');
  }
}
