import { Controller, Get, Inject, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeController } from '@nestjs/swagger';
import { METRICS_PORT, MetricsPort } from './ports/metrics.port';

/**
 * Prometheus Metrics Controller
 * Exposes metrics endpoint for Prometheus scraping.
 */
@ApiTags('Metrics')
@ApiExcludeController() // Hide from Swagger as it's for internal use
@Controller('metrics')
export class MetricsController {
  constructor(@Inject(METRICS_PORT) private readonly metrics: MetricsPort) {}

  @Get()
  @ApiOperation({ summary: 'Get Prometheus metrics' })
  @Header('Cache-Control', 'no-cache')
  async getMetrics(): Promise<string> {
    return this.metrics.getMetrics();
  }
}
