import { Injectable, Logger } from '@nestjs/common';
import { NotificationPort, EmailOptions, EmailResult } from '../ports/notification.port';

/**
 * Console/Log Email Adapter for development.
 * Logs emails to console instead of sending them.
 */
@Injectable()
export class ConsoleAdapter implements NotificationPort {
  private readonly logger = new Logger(ConsoleAdapter.name);
  private messageIdCounter = 1;

  constructor() {
    this.logger.warn('Using ConsoleAdapter - emails will be logged, not sent');
  }

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    const messageId = `console_${this.messageIdCounter++}_${Date.now()}`;
    const toAddresses = Array.isArray(options.to) ? options.to : [options.to];

    this.logger.log('━'.repeat(60));
    this.logger.log(`📧 EMAIL (not sent - console mode)`);
    this.logger.log('━'.repeat(60));
    this.logger.log(`To:      ${toAddresses.join(', ')}`);
    this.logger.log(`From:    ${options.from || 'default'}`);
    this.logger.log(`Subject: ${options.subject}`);
    this.logger.log(`ReplyTo: ${options.replyTo || 'none'}`);
    this.logger.log('─'.repeat(60));

    if (options.text) {
      this.logger.log('TEXT BODY:');
      this.logger.log(options.text);
    }

    if (options.html) {
      this.logger.log('HTML BODY:');
      // Strip HTML tags for console display
      const textContent = options.html
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      this.logger.log(textContent.substring(0, 500) + (textContent.length > 500 ? '...' : ''));
    }

    if (options.attachments?.length) {
      this.logger.log(`ATTACHMENTS: ${options.attachments.map((a) => a.filename).join(', ')}`);
    }

    this.logger.log('━'.repeat(60));

    return {
      messageId,
      accepted: toAddresses,
      rejected: [],
    };
  }

  async sendTemplateEmail(
    to: string | string[],
    templateId: string,
    data: Record<string, unknown>,
  ): Promise<EmailResult> {
    this.logger.log(`Template: ${templateId}`);
    this.logger.log(`Data: ${JSON.stringify(data, null, 2)}`);

    return this.sendEmail({
      to,
      subject: `[Template: ${templateId}]`,
      text: JSON.stringify(data, null, 2),
    });
  }
}
