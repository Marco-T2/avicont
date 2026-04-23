/**
 * Notification Port - Core interface for sending notifications.
 * Implement this interface for email, SMS, push notifications, etc.
 */

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  templateId?: string;
  templateData?: Record<string, unknown>;
}

export interface EmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export interface NotificationPort {
  /**
   * Send an email
   */
  sendEmail(options: EmailOptions): Promise<EmailResult>;

  /**
   * Send a templated email (uses provider's template system)
   */
  sendTemplateEmail(
    to: string | string[],
    templateId: string,
    data: Record<string, unknown>,
  ): Promise<EmailResult>;

  /**
   * Verify an email address (if supported)
   */
  verifyEmail?(email: string): Promise<boolean>;
}

/**
 * Injection token for the NotificationPort
 */
export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');
