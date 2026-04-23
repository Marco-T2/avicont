import { Injectable, Inject } from '@nestjs/common';
import { NOTIFICATION_PORT, NotificationPort, EmailOptions } from './ports/notification.port';

export interface InviteUserEmailData {
  inviterName: string;
  tenantName: string;
  inviteUrl: string;
}

export interface WelcomeEmailData {
  userName: string;
  loginUrl: string;
}

export interface PasswordResetEmailData {
  resetUrl: string;
  expiresIn: string;
}

/**
 * Notification Service - High-level service for sending notifications.
 * Uses the NotificationPort adapter for actual delivery.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATION_PORT)
    private readonly notificationAdapter: NotificationPort,
  ) {}

  /**
   * Send a raw email
   */
  async sendEmail(options: EmailOptions) {
    return this.notificationAdapter.sendEmail(options);
  }

  /**
   * Send user invitation email
   */
  async sendInviteEmail(to: string, data: InviteUserEmailData) {
    return this.notificationAdapter.sendEmail({
      to,
      subject: `${data.inviterName} invited you to join ${data.tenantName}`,
      html: `
        <h2>You've been invited!</h2>
        <p><strong>${data.inviterName}</strong> has invited you to join <strong>${data.tenantName}</strong>.</p>
        <p>
          <a href="${data.inviteUrl}" style="
            display: inline-block;
            padding: 12px 24px;
            background-color: #0070f3;
            color: white;
            text-decoration: none;
            border-radius: 6px;
          ">Accept Invitation</a>
        </p>
        <p>Or copy and paste this link: ${data.inviteUrl}</p>
      `,
      text: `
        You've been invited!

        ${data.inviterName} has invited you to join ${data.tenantName}.

        Click here to accept: ${data.inviteUrl}
      `,
    });
  }

  /**
   * Send welcome email after registration
   */
  async sendWelcomeEmail(to: string, data: WelcomeEmailData) {
    return this.notificationAdapter.sendEmail({
      to,
      subject: `Welcome to our platform!`,
      html: `
        <h2>Welcome, ${data.userName}!</h2>
        <p>Your account has been created successfully.</p>
        <p>
          <a href="${data.loginUrl}" style="
            display: inline-block;
            padding: 12px 24px;
            background-color: #0070f3;
            color: white;
            text-decoration: none;
            border-radius: 6px;
          ">Go to Dashboard</a>
        </p>
      `,
      text: `
        Welcome, ${data.userName}!

        Your account has been created successfully.

        Go to your dashboard: ${data.loginUrl}
      `,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(to: string, data: PasswordResetEmailData) {
    return this.notificationAdapter.sendEmail({
      to,
      subject: `Reset your password`,
      html: `
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        <p>
          <a href="${data.resetUrl}" style="
            display: inline-block;
            padding: 12px 24px;
            background-color: #0070f3;
            color: white;
            text-decoration: none;
            border-radius: 6px;
          ">Reset Password</a>
        </p>
        <p>This link will expire in ${data.expiresIn}.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
      text: `
        Password Reset Request

        We received a request to reset your password.

        Click here to reset: ${data.resetUrl}

        This link will expire in ${data.expiresIn}.

        If you didn't request this, you can safely ignore this email.
      `,
    });
  }

  /**
   * Send subscription confirmation email
   */
  async sendSubscriptionConfirmation(
    to: string,
    data: { planName: string; amount: string; nextBillingDate: string },
  ) {
    return this.notificationAdapter.sendEmail({
      to,
      subject: `Subscription confirmed - ${data.planName}`,
      html: `
        <h2>Subscription Confirmed! 🎉</h2>
        <p>Thank you for subscribing to the <strong>${data.planName}</strong> plan.</p>
        <ul>
          <li><strong>Amount:</strong> ${data.amount}</li>
          <li><strong>Next billing date:</strong> ${data.nextBillingDate}</li>
        </ul>
        <p>If you have any questions, please contact support.</p>
      `,
      text: `
        Subscription Confirmed!

        Thank you for subscribing to the ${data.planName} plan.

        Amount: ${data.amount}
        Next billing date: ${data.nextBillingDate}

        If you have any questions, please contact support.
      `,
    });
  }
}
