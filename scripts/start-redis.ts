#!/usr/bin/env npx tsx
/**
 * Start an in-memory Redis server for testing
 */

import { RedisMemoryServer } from 'redis-memory-server';

async function main() {
  console.log('Starting in-memory Redis server...');

  const redis = new RedisMemoryServer({
    instance: {
      port: 6379
    }
  });

  const host = await redis.getHost();
  const port = await redis.getPort();

  console.log(`Redis running at ${host}:${port}`);
  console.log('Press Ctrl+C to stop');

  // Keep running
  process.on('SIGINT', async () => {
    console.log('\nStopping Redis...');
    await redis.stop();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

main().catch(console.error);
