export type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    metadata: metadata ?? {}
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
}
