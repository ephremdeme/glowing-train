import { Counter, Histogram, Registry } from 'prom-client';

export function createServiceMetrics(serviceName: string): {
  registry: Registry;
  requestDurationMs: Histogram<string>;
  requestCount: Counter<string>;
  errorCount: Counter<string>;
} {
  const registry = new Registry();

  const requestDurationMs = new Histogram({
    name: `${serviceName.replaceAll('-', '_')}_request_duration_ms`,
    help: 'Request duration in milliseconds',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [10, 25, 50, 100, 250, 500, 1000, 2000],
    registers: [registry]
  });

  const requestCount = new Counter({
    name: `${serviceName.replaceAll('-', '_')}_request_total`,
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [registry]
  });

  const errorCount = new Counter({
    name: `${serviceName.replaceAll('-', '_')}_error_total`,
    help: 'Total errors',
    labelNames: ['code'] as const,
    registers: [registry]
  });

  return {
    registry,
    requestDurationMs,
    requestCount,
    errorCount
  };
}
