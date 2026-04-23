import { Module, Global, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TracingService } from './tracing.service';
import { TRACING_PORT } from './ports/tracing.port';
import { OpenTelemetryAdapter } from './adapters/opentelemetry.adapter';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    TracingService,
    {
      provide: TRACING_PORT,
      useFactory: (config: ConfigService) => {
        const logger = new Logger('TracingModule');
        const enabled = config.get<string>('TRACING_ENABLED', 'true') === 'true';

        if (enabled) {
          logger.log('Initializing OpenTelemetry tracing adapter');
          return new OpenTelemetryAdapter(config);
        }

        logger.log('Tracing disabled');
        // Return a no-op tracer when disabled
        return {
          startSpan: () => ({
            setAttribute: () => {},
            setAttributes: () => {},
            addEvent: () => {},
            recordException: () => {},
            setStatus: () => {},
            end: () => {},
            getContext: () => ({ traceId: '', spanId: '', traceFlags: 0 }),
            isRecording: () => false,
          }),
          startActiveSpan: (_name: string, fn: (span: unknown) => unknown) =>
            fn({
              setAttribute: () => {},
              setAttributes: () => {},
              addEvent: () => {},
              recordException: () => {},
              setStatus: () => {},
              end: () => {},
              getContext: () => ({ traceId: '', spanId: '', traceFlags: 0 }),
              isRecording: () => false,
            }),
          getActiveSpan: () => undefined,
          getCurrentContext: () => undefined,
          inject: () => {},
          extract: () => undefined,
          shutdown: async () => {},
        };
      },
      inject: [ConfigService],
    },
  ],
  exports: [TracingService, TRACING_PORT],
})
export class TracingModule {}
