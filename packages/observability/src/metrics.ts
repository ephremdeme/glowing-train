import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export function createServiceMetrics(serviceName: string): {
  registry: Registry;
  requestDurationMs: Histogram<string>;
  requestCount: Counter<string>;
  errorCount: Counter<string>;
  buildInfo: Gauge<string>;
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

  const buildInfo = new Gauge({
    name: `${serviceName.replaceAll('-', '_')}_build_info`,
    help: 'Build and deployment metadata for this running service',
    labelNames: ['release_id', 'git_sha', 'deploy_color', 'environment'] as const,
    registers: [registry]
  });

  buildInfo
    .labels(
      process.env.RELEASE_ID ?? 'dev',
      process.env.GIT_SHA ?? 'local',
      process.env.DEPLOY_COLOR ?? 'local',
      process.env.ENVIRONMENT ?? process.env.NODE_ENV ?? 'development'
    )
    .set(1);

  return {
    registry,
    requestDurationMs,
    requestCount,
    errorCount,
    buildInfo
  };
}
