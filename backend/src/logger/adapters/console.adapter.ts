import { Injectable } from '@nestjs/common';
import { LoggerPort, LogLevel, LogContext } from '../ports/logger.port';

/**
 * Console Logger Adapter - Default logger using console.
 * Suitable for development and simple deployments.
 */
@Injectable()
export class ConsoleLoggerAdapter implements LoggerPort {
  private currentLevel: LogLevel = 'info';
  private context: LogContext = {};

  private readonly levelPriority: Record<LogLevel, number> = {
    trace: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
    fatal: 5,
  };

  private readonly levelColors: Record<LogLevel, string> = {
    trace: '\x1b[90m', // gray
    debug: '\x1b[36m', // cyan
    info: '\x1b[32m', // green
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
    fatal: '\x1b[35m', // magenta
  };

  private readonly reset = '\x1b[0m';

  constructor(level?: LogLevel, context?: LogContext) {
    if (level) this.currentLevel = level;
    if (context) this.context = context;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.currentLevel];
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const mergedContext = { ...this.context, ...context };
    const contextStr = Object.keys(mergedContext).length ? ` ${JSON.stringify(mergedContext)}` : '';
    const color = this.levelColors[level];
    return `${color}[${timestamp}] ${level.toUpperCase().padEnd(5)}${this.reset} ${message}${contextStr}`;
  }

  trace(message: string, context?: LogContext): void {
    if (this.shouldLog('trace')) {
      console.log(this.formatMessage('trace', message, context));
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  error(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog('error')) {
      const errorContext = error
        ? { ...context, errorMessage: error.message, stack: error.stack }
        : context;
      console.error(this.formatMessage('error', message, errorContext));
    }
  }

  fatal(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog('fatal')) {
      const errorContext = error
        ? { ...context, errorMessage: error.message, stack: error.stack }
        : context;
      console.error(this.formatMessage('fatal', message, errorContext));
    }
  }

  child(context: LogContext): LoggerPort {
    return new ConsoleLoggerAdapter(this.currentLevel, {
      ...this.context,
      ...context,
    });
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }
}
