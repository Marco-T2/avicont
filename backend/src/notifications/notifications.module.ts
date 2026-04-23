import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_PORT } from './ports/notification.port';
import { SmtpAdapter } from './adapters/smtp.adapter';
import { ResendAdapter } from './adapters/resend.adapter';
import { ConsoleAdapter } from './adapters/console.adapter';

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
  ],
  exports: [NotificationsService, NOTIFICATION_PORT],
})
export class NotificationsModule {}
