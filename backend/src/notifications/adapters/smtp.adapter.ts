import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { NotificationPort, EmailOptions, EmailResult } from '../ports/notification.port';

/**
 * SMTP Email Adapter using Nodemailer.
 * Works with any SMTP provider (Gmail, SendGrid SMTP, Amazon SES SMTP, etc.)
 */
@Injectable()
export class SmtpAdapter implements NotificationPort {
  private readonly logger = new Logger(SmtpAdapter.name);
  private transporter: nodemailer.Transporter;
  private readonly defaultFrom: string;

  constructor(private readonly config: ConfigService) {
    this.defaultFrom = this.config.get<string>('SMTP_FROM', 'noreply@example.com');

    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
      const result = await this.transporter.sendMail({
        from: options.from || this.defaultFrom,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });

      this.logger.log(`Email sent: ${result.messageId}`);

      return {
        messageId: result.messageId,
        accepted: result.accepted as string[],
        rejected: result.rejected as string[],
      };
    } catch (error) {
      this.logger.error(`Failed to send email: ${error}`);
      throw error;
    }
  }

  async sendTemplateEmail(
    to: string | string[],
    templateId: string,
    data: Record<string, unknown>,
  ): Promise<EmailResult> {
    // SMTP doesn't have built-in templates, so we'd need to implement our own
    // For now, log a warning and send plain text
    this.logger.warn(
      `SMTP adapter does not support templates. Template: ${templateId}, Data: ${JSON.stringify(data)}`,
    );

    return this.sendEmail({
      to,
      subject: `Template: ${templateId}`,
      text: JSON.stringify(data, null, 2),
    });
  }
}
