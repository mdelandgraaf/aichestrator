import { Redis } from 'ioredis';
import { createLogger, Logger } from '../utils/logger.js';
import { RedisError } from '../utils/errors.js';

export class RedisClient {
  private client: Redis;
  private subscriber: Redis;
  private logger: Logger;
  private connected: boolean = false;

  constructor(url: string) {
    this.logger = createLogger('redis-client');
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 100, 3000)
    });
    this.subscriber = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 100, 3000)
    });

    this.client.on('connect', () => {
      this.connected = true;
      this.logger.info('Redis client connected');
    });

    this.client.on('error', (err: Error) => {
      this.logger.error({ err }, 'Redis client error');
    });

    this.subscriber.on('error', (err: Error) => {
      this.logger.error({ err }, 'Redis subscriber error');
    });
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  // Key-value operations
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (err) {
      throw new RedisError(`Failed to get key: ${key}`, err);
    }
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    try {
      if (ttlMs) {
        await this.client.set(key, value, 'PX', ttlMs);
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      throw new RedisError(`Failed to set key: ${key}`, err);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      throw new RedisError(`Failed to delete key: ${key}`, err);
    }
  }

  // Hash operations
  async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.client.hget(key, field);
    } catch (err) {
      throw new RedisError(`Failed to hget ${key}.${field}`, err);
    }
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    try {
      await this.client.hset(key, field, value);
    } catch (err) {
      throw new RedisError(`Failed to hset ${key}.${field}`, err);
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hgetall(key);
    } catch (err) {
      throw new RedisError(`Failed to hgetall ${key}`, err);
    }
  }

  async hmset(key: string, data: Record<string, string>): Promise<void> {
    try {
      await this.client.hmset(key, data);
    } catch (err) {
      throw new RedisError(`Failed to hmset ${key}`, err);
    }
  }

  async hdel(key: string, field: string): Promise<void> {
    try {
      await this.client.hdel(key, field);
    } catch (err) {
      throw new RedisError(`Failed to hdel ${key}.${field}`, err);
    }
  }

  // List operations
  async lpush(key: string, ...values: string[]): Promise<void> {
    try {
      await this.client.lpush(key, ...values);
    } catch (err) {
      throw new RedisError(`Failed to lpush ${key}`, err);
    }
  }

  async rpush(key: string, ...values: string[]): Promise<void> {
    try {
      await this.client.rpush(key, ...values);
    } catch (err) {
      throw new RedisError(`Failed to rpush ${key}`, err);
    }
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.client.lrange(key, start, stop);
    } catch (err) {
      throw new RedisError(`Failed to lrange ${key}`, err);
    }
  }

  async llen(key: string): Promise<number> {
    try {
      return await this.client.llen(key);
    } catch (err) {
      throw new RedisError(`Failed to llen ${key}`, err);
    }
  }

  // Pub/Sub operations
  async publish(channel: string, message: string): Promise<void> {
    try {
      await this.client.publish(channel, message);
    } catch (err) {
      throw new RedisError(`Failed to publish to ${channel}`, err);
    }
  }

  async subscribe(
    channel: string,
    callback: (message: string) => void
  ): Promise<void> {
    try {
      await this.subscriber.subscribe(channel);
      this.subscriber.on('message', (ch: string, message: string) => {
        if (ch === channel) {
          callback(message);
        }
      });
    } catch (err) {
      throw new RedisError(`Failed to subscribe to ${channel}`, err);
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    try {
      await this.subscriber.unsubscribe(channel);
    } catch (err) {
      throw new RedisError(`Failed to unsubscribe from ${channel}`, err);
    }
  }

  // Pattern subscription
  async psubscribe(
    pattern: string,
    callback: (channel: string, message: string) => void
  ): Promise<void> {
    try {
      await this.subscriber.psubscribe(pattern);
      this.subscriber.on('pmessage', (pat: string, channel: string, message: string) => {
        if (pat === pattern) {
          callback(channel, message);
        }
      });
    } catch (err) {
      throw new RedisError(`Failed to psubscribe to ${pattern}`, err);
    }
  }

  // Utility
  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (err) {
      throw new RedisError(`Failed to get keys matching ${pattern}`, err);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (err) {
      throw new RedisError(`Failed to check existence of ${key}`, err);
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.client.expire(key, seconds);
    } catch (err) {
      throw new RedisError(`Failed to set expiry on ${key}`, err);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    await this.subscriber.quit();
    await this.client.quit();
    this.logger.info('Redis client disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }
}
