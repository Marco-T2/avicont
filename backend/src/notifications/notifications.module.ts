import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ConsoleAdapter } from './adapters/console.adapter';
import { NotificationsInvitationEmailsAdapter } from './adapters/notifications-invitation-emails.adapter';
import { ResendAdapter } from './adapters/resend.adapter';
import { SmtpAdapter } from './adapters/smtp.adapter';
import { NotificationsService } from './notifications.service';
import { INVITATION_EMAILS_PORT } from './ports/invitation-emails.port';
import { NOTIFICATION_PORT } from './ports/notification.port';

export type EmailProvider = 'smtp' | 'resend' | 'console';

@Module({
  imports: [ConfigModule],
  providers: [
    NotificationsService,
    {
      provide: NOTIFICATION_PORT,
      useFactory: (config: ConfigService) => {
        const logger = new Logger('NotificationsModule');
        const provider = config.get<EmailProvider>('EMAIL_PROVIDER', 'console');

        logger.log(`Initializing email adapter: ${provider}`);

        switch (provider) {
          case 'smtp':
            return new SmtpAdapter(config);
          case 'resend':
            return new ResendAdapter(config);
          case 'console':
          default:
            return new ConsoleAdapter();
        }
      },
      inject: [ConfigService],
    },

    // Port cross-módulo para emails de invitación — consumido por
    // `invitations`. Envuelve `NotificationsService` descartando el
    // EmailResult del provider para no filtrar detalle del adapter.
    NotificationsInvitationEmailsAdapter,
    {
      provide: INVITATION_EMAILS_PORT,
      useExisting: NotificationsInvitationEmailsAdapter,
    },
  ],
  exports: [NotificationsService, NOTIFICATION_PORT, INVITATION_EMAILS_PORT],
})
export class NotificationsModule {}
