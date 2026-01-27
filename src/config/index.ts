import { Config, ConfigSchema } from './schema.js';

export function loadConfig(): Config {
  const raw = {
    redis: {
      url: process.env['REDIS_URL'] ?? 'redis://localhost:6379'
    },
    anthropic: {
      apiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
      model: process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-20250514'
    },
    orchestrator: {
      maxWorkers: parseInt(process.env['MAX_WORKERS'] ?? '4', 10),
      defaultTimeoutMs: parseInt(process.env['DEFAULT_TIMEOUT_MS'] ?? '300000', 10),
      heartbeatIntervalMs: parseInt(process.env['HEARTBEAT_INTERVAL_MS'] ?? '10000', 10),
      heartbeatTimeoutMs: parseInt(process.env['HEARTBEAT_TIMEOUT_MS'] ?? '60000', 10)
    },
    logLevel: process.env['LOG_LEVEL'] ?? 'info'
  };

  return ConfigSchema.parse(raw);
}

export * from './schema.js';
