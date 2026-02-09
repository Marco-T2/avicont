/**
 * Logger Port - Core interface for logging providers.
 * Implement this interface to connect Pino, Winston, or other loggers.
 *
 * This follows the Ports & Adapters (Hexagonal) architecture pattern,
 * allowing you to swap logging providers without changing business logic.
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  [key: string]: unknown;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
}

export interface LoggerPort {
  /**
   * Log at trace level (most verbose)
   */
  trace(message: string, context?: LogContext): void;

  /**
   * Log at debug level
   */
  debug(message: string, context?: LogContext): void;

  /**
   * Log at info level
   */
  info(message: string, context?: LogContext): void;

  /**
   * Log at warn level
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Log at error level
   */
  error(message: string, context?: LogContext, error?: Error): void;

  /**
   * Log at fatal level (most severe)
   */
  fatal(message: string, context?: LogContext, error?: Error): void;

  /**
   * Create a child logger with preset context
   */
  child(context: LogContext): LoggerPort;

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void;
}

/**
 * Injection token for the LoggerPort
 */
export const LOGGER_PORT = Symbol('LOGGER_PORT');
