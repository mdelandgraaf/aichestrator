import { Redis } from 'ioredis';
import { createLogger } from '../utils/logger.js';
import { RedisError } from '../utils/errors.js';
export class RedisClient {
    client;
    subscriber;
    logger;
    connected = false;
    constructor(url) {
        this.logger = createLogger('redis-client');
        this.client = new Redis(url, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => Math.min(times * 100, 3000)
        });
        this.subscriber = new Redis(url, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => Math.min(times * 100, 3000)
        });
        this.client.on('connect', () => {
            this.connected = true;
            this.logger.info('Redis client connected');
        });
        this.client.on('error', (err) => {
            this.logger.error({ err }, 'Redis client error');
        });
        this.subscriber.on('error', (err) => {
            this.logger.error({ err }, 'Redis subscriber error');
        });
    }
    async ping() {
        try {
            const result = await this.client.ping();
            return result === 'PONG';
        }
        catch {
            return false;
        }
    }
    // Key-value operations
    async get(key) {
        try {
            return await this.client.get(key);
        }
        catch (err) {
            throw new RedisError(`Failed to get key: ${key}`, err);
        }
    }
    async set(key, value, ttlMs) {
        try {
            if (ttlMs) {
                await this.client.set(key, value, 'PX', ttlMs);
            }
            else {
                await this.client.set(key, value);
            }
        }
        catch (err) {
            throw new RedisError(`Failed to set key: ${key}`, err);
        }
    }
    async del(key) {
        try {
            await this.client.del(key);
        }
        catch (err) {
            throw new RedisError(`Failed to delete key: ${key}`, err);
        }
    }
    // Hash operations
    async hget(key, field) {
        try {
            return await this.client.hget(key, field);
        }
        catch (err) {
            throw new RedisError(`Failed to hget ${key}.${field}`, err);
        }
    }
    async hset(key, field, value) {
        try {
            await this.client.hset(key, field, value);
        }
        catch (err) {
            throw new RedisError(`Failed to hset ${key}.${field}`, err);
        }
    }
    async hgetall(key) {
        try {
            return await this.client.hgetall(key);
        }
        catch (err) {
            throw new RedisError(`Failed to hgetall ${key}`, err);
        }
    }
    async hmset(key, data) {
        try {
            await this.client.hmset(key, data);
        }
        catch (err) {
            throw new RedisError(`Failed to hmset ${key}`, err);
        }
    }
    async hdel(key, field) {
        try {
            await this.client.hdel(key, field);
        }
        catch (err) {
            throw new RedisError(`Failed to hdel ${key}.${field}`, err);
        }
    }
    // List operations
    async lpush(key, ...values) {
        try {
            await this.client.lpush(key, ...values);
        }
        catch (err) {
            throw new RedisError(`Failed to lpush ${key}`, err);
        }
    }
    async rpush(key, ...values) {
        try {
            await this.client.rpush(key, ...values);
        }
        catch (err) {
            throw new RedisError(`Failed to rpush ${key}`, err);
        }
    }
    async lrange(key, start, stop) {
        try {
            return await this.client.lrange(key, start, stop);
        }
        catch (err) {
            throw new RedisError(`Failed to lrange ${key}`, err);
        }
    }
    async llen(key) {
        try {
            return await this.client.llen(key);
        }
        catch (err) {
            throw new RedisError(`Failed to llen ${key}`, err);
        }
    }
    // Pub/Sub operations
    async publish(channel, message) {
        try {
            await this.client.publish(channel, message);
        }
        catch (err) {
            throw new RedisError(`Failed to publish to ${channel}`, err);
        }
    }
    async subscribe(channel, callback) {
        try {
            await this.subscriber.subscribe(channel);
            this.subscriber.on('message', (ch, message) => {
                if (ch === channel) {
                    callback(message);
                }
            });
        }
        catch (err) {
            throw new RedisError(`Failed to subscribe to ${channel}`, err);
        }
    }
    async unsubscribe(channel) {
        try {
            await this.subscriber.unsubscribe(channel);
        }
        catch (err) {
            throw new RedisError(`Failed to unsubscribe from ${channel}`, err);
        }
    }
    // Pattern subscription
    async psubscribe(pattern, callback) {
        try {
            await this.subscriber.psubscribe(pattern);
            this.subscriber.on('pmessage', (pat, channel, message) => {
                if (pat === pattern) {
                    callback(channel, message);
                }
            });
        }
        catch (err) {
            throw new RedisError(`Failed to psubscribe to ${pattern}`, err);
        }
    }
    // Utility
    async keys(pattern) {
        try {
            return await this.client.keys(pattern);
        }
        catch (err) {
            throw new RedisError(`Failed to get keys matching ${pattern}`, err);
        }
    }
    async exists(key) {
        try {
            const result = await this.client.exists(key);
            return result === 1;
        }
        catch (err) {
            throw new RedisError(`Failed to check existence of ${key}`, err);
        }
    }
    async expire(key, seconds) {
        try {
            await this.client.expire(key, seconds);
        }
        catch (err) {
            throw new RedisError(`Failed to set expiry on ${key}`, err);
        }
    }
    async disconnect() {
        this.connected = false;
        await this.subscriber.quit();
        await this.client.quit();
        this.logger.info('Redis client disconnected');
    }
    isConnected() {
        return this.connected;
    }
}
//# sourceMappingURL=redis-client.js.map