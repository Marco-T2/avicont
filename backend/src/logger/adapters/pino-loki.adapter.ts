import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerPort, LogLevel, LogContext } from '../ports/logger.port';

type PinoLogger = {
  trace: (obj: object, msg?: string) => void;
  debug: (obj: object, msg?: string) => void;
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
  fatal: (obj: object, msg?: string) => void;
  child: (bindings: object) => PinoLogger;
  level: string;
};

/**
 * Pino-Loki Logger Adapter - High-performance logger that ships to Grafana Loki.
 * Requires: npm install pino pino-pretty pino-loki
 */
@Injectable()
export class PinoLokiAdapter implements LoggerPort {
  private logger: PinoLogger;
  private context: LogContext = {};
  private readonly serviceName: string;

  constructor(config: ConfigService, parentLogger?: PinoLogger, context?: LogContext) {
    this.serviceName = config.get<string>('OTEL_SERVICE_NAME', 'saas-api');

    if (parentLogger) {
      this.logger = parentLogger;
      this.context = context || {};
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pino = require('pino');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const _pinoLoki = require('pino-loki');

      const level = config.get<LogLevel>('LOG_LEVEL', 'info');
      const lokiHost = config.get<string>('LOKI_HOST', 'http://loki:3100');
      const pretty = config.get<string>('LOG_PRETTY', 'false') === 'true';

      // Create transports array
      const targets: Array<{
        target: string;
        options: object;
        level: string;
      }> = [
        {
          target: 'pino-loki',
          options: {
            batching: true,
            interval: 5,
            host: lokiHost,
            labels: {
              app: this.serviceName,
              env: config.get('NODE_ENV', 'development'),
            },
          },
          level,
        },
      ];

      // Add pretty console in development
      if (pretty || config.get('NODE_ENV') === 'development') {
        targets.push({
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
          level,
        });
      }

      const transport = pino.transport({
        targets,
      });

      this.logger = pino(
        {
          level,
          base: {
            pid: process.pid,
            service: this.serviceName,
            env: config.get('NODE_ENV', 'development'),
          },
        },
        transport,
      );
    }
  }

  trace(message: string, context?: LogContext): void {
    this.logger.trace({ ...this.context, ...context }, message);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug({ ...this.context, ...context }, message);
  }

  info(message: string, context?: LogContext): void {
    this.logger.info({ ...this.context, ...context }, message);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn({ ...this.context, ...context }, message);
  }

  error(message: string, context?: LogContext, error?: Error): void {
    const errorContext = error
      ? { ...this.context, ...context, err: { message: error.message, stack: error.stack } }
      : { ...this.context, ...context };
    this.logger.error(errorContext, message);
  }

  fatal(message: string, context?: LogContext, error?: Error): void {
    const errorContext = error
      ? { ...this.context, ...context, err: { message: error.message, stack: error.stack } }
      : { ...this.context, ...context };
    this.logger.fatal(errorContext, message);
  }

  child(context: LogContext): LoggerPort {
    const childLogger = this.logger.child({ ...this.context, ...context });
    const adapter = Object.create(PinoLokiAdapter.prototype) as PinoLokiAdapter;
    adapter.logger = childLogger;
    adapter.context = { ...this.context, ...context };
    return adapter;
  }

  setLevel(level: LogLevel): void {
    this.logger.level = level;
  }
}
