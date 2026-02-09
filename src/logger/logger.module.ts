import { Module, Global, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerService } from './logger.service';
import { LOGGER_PORT, LogLevel } from './ports/logger.port';
import { ConsoleLoggerAdapter } from './adapters/console.adapter';
import { PinoAdapter } from './adapters/pino.adapter';
import { PinoLokiAdapter } from './adapters/pino-loki.adapter';
import { WinstonAdapter } from './adapters/winston.adapter';
import { LokiAdapter } from './adapters/loki.adapter';

export type LogProvider = 'console' | 'pino' | 'pino-loki' | 'winston' | 'loki';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    LoggerService,
    {
      provide: LOGGER_PORT,
      useFactory: (config: ConfigService) => {
        const logger = new Logger('LoggerModule');
        const provider = config.get<LogProvider>('LOG_PROVIDER', 'console');
        const level = config.get<LogLevel>('LOG_LEVEL', 'info');

        logger.log(`Initializing logger adapter: ${provider} (level: ${level})`);

        switch (provider) {
          case 'pino':
            try {
              require.resolve('pino');
              return new PinoAdapter(config);
            } catch {
              logger.warn(
                'Pino not installed, falling back to console. Run: npm install pino pino-pretty',
              );
              return new ConsoleLoggerAdapter(level);
            }
          case 'pino-loki':
            try {
              require.resolve('pino');
              require.resolve('pino-loki');
              return new PinoLokiAdapter(config);
            } catch {
              logger.warn(
                'Pino or pino-loki not installed, falling back to console. Run: npm install pino pino-pretty pino-loki',
              );
              return new ConsoleLoggerAdapter(level);
            }
          case 'winston':
            try {
              require.resolve('winston');
              return new WinstonAdapter(config);
            } catch {
              logger.warn(
                'Winston not installed, falling back to console. Run: npm install winston',
              );
              return new ConsoleLoggerAdapter(level);
            }
          case 'loki':
            try {
              require.resolve('winston');
              require.resolve('winston-loki');
              return new LokiAdapter(config);
            } catch {
              logger.warn(
                'Winston or winston-loki not installed, falling back to console. Run: npm install winston winston-loki',
              );
              return new ConsoleLoggerAdapter(level);
            }
          case 'console':
          default:
            return new ConsoleLoggerAdapter(level);
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [LoggerService, LOGGER_PORT],
})
export class LoggerModule {}
