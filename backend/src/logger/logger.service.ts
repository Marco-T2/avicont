import { Injectable, Inject } from '@nestjs/common';
import { LoggerPort, LogLevel, LogContext, LOGGER_PORT } from './ports/logger.port';

/**
 * Logger Service - Wraps the logger port for dependency injection.
 * Use this service throughout your application for logging.
 */
@Injectable()
export class LoggerService implements LoggerPort {
  constructor(@Inject(LOGGER_PORT) private readonly logger: LoggerPort) {}

  trace(message: string, context?: LogContext): void {
    this.logger.trace(message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, context);
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, context);
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.logger.error(message, context, error);
  }

  fatal(message: string, context?: LogContext, error?: Error): void {
    this.logger.fatal(message, context, error);
  }

  child(context: LogContext): LoggerPort {
    return this.logger.child(context);
  }

  setLevel(level: LogLevel): void {
    this.logger.setLevel(level);
  }

  /**
   * Create a child logger for a specific module/component
   */
  forContext(name: string): LoggerPort {
    return this.logger.child({ module: name });
  }
}
