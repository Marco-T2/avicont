import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';

const enabled = (process.env.TRACING_ENABLED ?? 'true') === 'true';
const serviceName = process.env.OTEL_SERVICE_NAME ?? 'saas-api';
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://tempo:4318';
const serviceVersion = process.env.APP_VERSION ?? '1.0.0';
const environment = process.env.NODE_ENV ?? 'development';

let sdk: NodeSDK | null = null;

if (enabled) {
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
      'deployment.environment': environment,
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) =>
          Boolean(
            req.url?.includes('/health') ||
            req.url?.includes('/metrics') ||
            req.url?.includes('/favicon'),
          ),
      }),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
    ],
  });

  sdk.start();
  console.info(`[otel-bootstrap] tracing enabled → ${endpoint}/v1/traces`);
} else {
  console.info('[otel-bootstrap] tracing disabled (TRACING_ENABLED != true)');
}

const SHUTDOWN_TIMEOUT_MS = 2_000;

/**
 * Cierra el SDK flusheando los spans pendientes. No registra handlers de señal
 * a propósito: el apagado lo ordena `main.ts`, que es el único que puede cerrar
 * primero la aplicación Nest y recién después el tracing.
 *
 * La espera está acotada porque el collector puede no estar disponible — en dev
 * el hostname `tempo` sólo resuelve dentro de la red de Docker Compose, así que
 * desde el host el flush esperaría a un endpoint inalcanzable.
 */
export async function shutdownTracing(timeoutMs = SHUTDOWN_TIMEOUT_MS): Promise<void> {
  if (!sdk) return;

  try {
    await Promise.race([
      sdk.shutdown(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch (err) {
    console.error('[otel-bootstrap] shutdown error:', err);
  }
}

export { sdk };
