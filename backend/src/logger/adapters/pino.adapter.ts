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
 * Pino Logger Adapter - High-performance JSON logger.
 * Install: npm install pino pino-pretty
 */
@Injectable()
export class PinoAdapter implements LoggerPort {
  private logger: PinoLogger;
  private context: LogContext = {};

  constructor(config: ConfigService, parentLogger?: PinoLogger, context?: LogContext) {
    if (parentLogger) {
      this.logger = parentLogger;
      this.context = context || {};
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pino = require('pino');
      const level = config.get<LogLevel>('LOG_LEVEL', 'info');
      const pretty = config.get<string>('LOG_PRETTY', 'false') === 'true';

      this.logger = pino({
        level,
        transport: pretty
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
        base: {
          pid: process.pid,
          env: config.get('NODE_ENV', 'development'),
        },
      });
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
    const adapter = Object.create(PinoAdapter.prototype) as PinoAdapter;
    adapter.logger = childLogger;
    adapter.context = { ...this.context, ...context };
    return adapter;
  }

  setLevel(level: LogLevel): void {
    this.logger.level = level;
  }
}
