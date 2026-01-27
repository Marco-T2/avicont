import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationPort, EmailOptions, EmailResult } from '../ports/notification.port';

/**
 * Resend Email Adapter.
 * https://resend.com/docs/api-reference/introduction
 *
 * Resend is a modern email API that's easy to use and has great deliverability.
 */
@Injectable()
export class ResendAdapter implements NotificationPort {
  private readonly logger = new Logger(ResendAdapter.name);
  private readonly apiKey: string;
  private readonly defaultFrom: string;
  private readonly baseUrl = 'https://api.resend.com';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('RESEND_API_KEY', '');
    this.defaultFrom = this.config.get<string>('RESEND_FROM', 'onboarding@resend.dev');

    if (!this.apiKey) {
      this.logger.warn('RESEND_API_KEY not configured - emails will fail');
    }
  }

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    const response = await fetch(`${this.baseUrl}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: options.from || this.defaultFrom,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        text: options.text,
        html: options.html,
        reply_to: options.replyTo,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content:
            typeof a.content === 'string' ? a.content : Buffer.from(a.content).toString('base64'),
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Resend API error: ${error}`);
      throw new Error(`Failed to send email: ${error}`);
    }

    const result = (await response.json()) as { id: string };
    const toAddresses = Array.isArray(options.to) ? options.to : [options.to];

    this.logger.log(`Email sent via Resend: ${result.id}`);

    return {
      messageId: result.id,
      accepted: toAddresses,
      rejected: [],
    };
  }

  async sendTemplateEmail(
    to: string | string[],
    templateId: string,
    data: Record<string, unknown>,
  ): Promise<EmailResult> {
    // Resend doesn't have a template system like SendGrid
    // You could integrate with React Email or similar
    this.logger.warn(`Resend does not have built-in templates. Using templateId as subject.`);

    // Simple template replacement - in production, use a proper template engine
    const html = `<h1>${templateId}</h1><pre>${JSON.stringify(data, null, 2)}</pre>`;

    return this.sendEmail({
      to,
      subject: templateId,
      html,
    });
  }
}
