import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { RbacModule } from '../rbac/rbac.module';
import { BILLING_PORT } from './ports/billing.port';
import { StripeAdapter } from './adapters/stripe.adapter';
import { PaddleAdapter } from './adapters/paddle.adapter';
import { MockBillingAdapter } from './adapters/mock.adapter';

export type BillingProvider = 'stripe' | 'paddle' | 'mock';

@Module({
  imports: [RbacModule, ConfigModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    PrismaService,
    TenantContextService,
    {
      provide: BILLING_PORT,
      useFactory: (config: ConfigService) => {
        const logger = new Logger('BillingModule');
        const provider = config.get<BillingProvider>('BILLING_PROVIDER', 'mock');

        logger.log(`Initializing billing adapter: ${provider}`);

        switch (provider) {
          case 'stripe':
            return new StripeAdapter(config);
          case 'paddle':
            return new PaddleAdapter(config);
          case 'mock':
          default:
            return new MockBillingAdapter();
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [BillingService, BILLING_PORT],
})
export class BillingModule {}
