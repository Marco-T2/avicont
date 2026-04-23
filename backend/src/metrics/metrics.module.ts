import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { METRICS_PORT } from './ports/metrics.port';
import { PrometheusAdapter } from './adapters/prometheus.adapter';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    {
      provide: METRICS_PORT,
      useFactory: (config: ConfigService) => {
        return new PrometheusAdapter(config);
      },
      inject: [ConfigService],
    },
  ],
  exports: [MetricsService, METRICS_PORT],
})
export class MetricsModule {}
