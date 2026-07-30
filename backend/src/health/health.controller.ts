import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  DiskHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma.service';
import { LoggerService } from '../logger/logger.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private prisma: PrismaHealthIndicator,
    private prismaService: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check application health' })
  check() {
    this.logger.info('Performing health check');
    return this.health.check([
      () => this.prisma.pingCheck('database', this.prismaService),
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024), // 150MB
      // 512MB. Medido el 2026-07-29: el proceso compilado (`node dist/main.js`)
      // arranca en ~307MB en `main` y ~313MB con el módulo de ventas — o sea que
      // el umbral anterior de 300MB YA lo excedía `main`, y las corridas verdes
      // de `ui-gate` venían saliendo por suerte, con el runner de CI cayendo
      // apenas por debajo. El siguiente módulo que alguien agregara lo rompía.
      //
      // 307MB no es una fuga: es lo que pesa NestJS + Prisma + AWS SDK S3 + OTel
      // con ~25 módulos. El RSS incluye memoria mapeada y compartida y no baja
      // pronto tras un GC, así que como señal de salud es tosco — la accionable
      // es `memory_heap`, que sigue en 150MB y verde. Este umbral queda como red
      // de un leak GRUESO, que no se detiene en 320MB.
      () => this.memory.checkRSS('memory_rss', 512 * 1024 * 1024), // 512MB
      () =>
        this.disk.checkStorage('disk', {
          path: '/',
          thresholdPercent: 0.9,
        }),
    ]);
  }

  @Get('liveness')
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe (is app running)' })
  liveness() {
    return this.health.check([]);
  }

  @Get('readiness')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe (is app ready to serve traffic)' })
  readiness() {
    return this.health.check([() => this.prisma.pingCheck('database', this.prismaService)]);
  }
}
