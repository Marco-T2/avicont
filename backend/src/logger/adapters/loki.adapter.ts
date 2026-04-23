import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerPort, LogLevel, LogContext } from '../ports/logger.port';

type WinstonLogger = {
  log: (level: string, message: string, meta?: object) => void;
  child: (meta: object) => WinstonLogger;
  level: string;
};

/**
 * Loki Logger Adapter - Ships logs to Grafana Loki via Winston.
 * Requires: npm install winston winston-loki
 */
@Injectable()
export class LokiAdapter implements LoggerPort {
  private logger: WinstonLogger;
  private context: LogContext = {};
  private readonly serviceName: string;

  constructor(config: ConfigService, parentLogger?: WinstonLogger, context?: LogContext) {
    this.serviceName = config.get<string>('OTEL_SERVICE_NAME', 'saas-api');

    if (parentLogger) {
      this.logger = parentLogger;
      this.context = context || {};
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const winston = require('winston');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const LokiTransport = require('winston-loki');

      const level = config.get<LogLevel>('LOG_LEVEL', 'info');
      const lokiHost = config.get<string>('LOKI_HOST', 'http://loki:3100');
      const pretty = config.get<string>('LOG_PRETTY', 'false') === 'true';

      const transports = [
        new LokiTransport({
          host: lokiHost,
          labels: {
            app: this.serviceName,
            env: config.get('NODE_ENV', 'development'),
          },
          json: true,
          format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
          replaceTimestamp: true,
          gracefulShutdown: true,
          clearOnError: false,
          batching: true,
          interval: 5,
          onConnectionError: (err: Error) => console.error('Loki connection error:', err),
        }),
      ];

      // Also log to console in development
      if (pretty || config.get('NODE_ENV') === 'development') {
        transports.push(
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.timestamp(),
              winston.format.printf(
                ({
                  level,
                  message,
                  timestamp,
                  ...meta
                }: {
                  level: string;
                  message: string;
                  timestamp: string;
                  [key: string]: unknown;
                }) => {
                  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                  return `[${timestamp}] ${level}: ${message}${metaStr}`;
                },
              ),
            ),
          }),
        );
      }

      this.logger = winston.createLogger({
        level,
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        transports,
        defaultMeta: {
          service: this.serviceName,
          env: config.get('NODE_ENV', 'development'),
        },
      });
    }
  }

  trace(message: string, context?: LogContext): void {
    this.logger.log('silly', message, { ...this.context, ...context });
  }

  debug(message: string, context?: LogContext): void {
    this.logger.log('debug', message, { ...this.context, ...context });
  }

  info(message: string, context?: LogContext): void {
    this.logger.log('info', message, { ...this.context, ...context });
  }

  warn(message: string, context?: LogContext): void {
    this.logger.log('warn', message, { ...this.context, ...context });
  }

  error(message: string, context?: LogContext, error?: Error): void {
    const errorContext = error
      ? {
          ...this.context,
          ...context,
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
        }
      : { ...this.context, ...context };
    this.logger.log('error', message, errorContext);
  }

  fatal(message: string, context?: LogContext, error?: Error): void {
    const errorContext = error
      ? {
          ...this.context,
          ...context,
          fatal: true,
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
        }
      : { ...this.context, ...context, fatal: true };
    this.logger.log('error', message, errorContext);
  }

  child(context: LogContext): LoggerPort {
    const childLogger = this.logger.child({ ...this.context, ...context });
    const adapter = Object.create(LokiAdapter.prototype) as LokiAdapter;
    adapter.logger = childLogger;
    adapter.context = { ...this.context, ...context };
    return adapter;
  }

  setLevel(level: LogLevel): void {
    const levelMap: Record<LogLevel, string> = {
      trace: 'silly',
      debug: 'debug',
      info: 'info',
      warn: 'warn',
      error: 'error',
      fatal: 'error',
    };
    this.logger.level = levelMap[level];
  }
}
