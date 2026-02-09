import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerPort, LogLevel, LogContext } from '../ports/logger.port';

type WinstonLogger = {
  log: (level: string, message: string, meta?: object) => void;
  child: (meta: object) => WinstonLogger;
  level: string;
};

/**
 * Winston Logger Adapter - Flexible multi-transport logger.
 * Install: npm install winston
 */
@Injectable()
export class WinstonAdapter implements LoggerPort {
  private logger: WinstonLogger;
  private context: LogContext = {};

  constructor(config: ConfigService, parentLogger?: WinstonLogger, context?: LogContext) {
    if (parentLogger) {
      this.logger = parentLogger;
      this.context = context || {};
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const winston = require('winston');
      const level = config.get<LogLevel>('LOG_LEVEL', 'info');
      const pretty = config.get<string>('LOG_PRETTY', 'false') === 'true';

      const formats = [winston.format.timestamp(), winston.format.errors({ stack: true })];

      if (pretty) {
        formats.push(
          winston.format.colorize(),
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
        );
      } else {
        formats.push(winston.format.json());
      }

      this.logger = winston.createLogger({
        level,
        format: winston.format.combine(...formats),
        transports: [new winston.transports.Console()],
        defaultMeta: {
          env: config.get('NODE_ENV', 'development'),
        },
      });
    }
  }

  trace(message: string, context?: LogContext): void {
    // Winston doesn't have trace, use silly instead
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
      ? { ...this.context, ...context, error: { message: error.message, stack: error.stack } }
      : { ...this.context, ...context };
    this.logger.log('error', message, errorContext);
  }

  fatal(message: string, context?: LogContext, error?: Error): void {
    // Winston doesn't have fatal, use error with fatal flag
    const errorContext = error
      ? {
          ...this.context,
          ...context,
          fatal: true,
          error: { message: error.message, stack: error.stack },
        }
      : { ...this.context, ...context, fatal: true };
    this.logger.log('error', message, errorContext);
  }

  child(context: LogContext): LoggerPort {
    const childLogger = this.logger.child({ ...this.context, ...context });
    const adapter = Object.create(WinstonAdapter.prototype) as WinstonAdapter;
    adapter.logger = childLogger;
    adapter.context = { ...this.context, ...context };
    return adapter;
  }

  setLevel(level: LogLevel): void {
    // Map our levels to Winston levels
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
