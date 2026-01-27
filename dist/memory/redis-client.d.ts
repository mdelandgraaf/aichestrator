export declare class RedisClient {
    private client;
    private subscriber;
    private logger;
    private connected;
    constructor(url: string);
    ping(): Promise<boolean>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlMs?: number): Promise<void>;
    del(key: string): Promise<void>;
    hget(key: string, field: string): Promise<string | null>;
    hset(key: string, field: string, value: string): Promise<void>;
    hgetall(key: string): Promise<Record<string, string>>;
    hmset(key: string, data: Record<string, string>): Promise<void>;
    hdel(key: string, field: string): Promise<void>;
    lpush(key: string, ...values: string[]): Promise<void>;
    rpush(key: string, ...values: string[]): Promise<void>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    llen(key: string): Promise<number>;
    publish(channel: string, message: string): Promise<void>;
    subscribe(channel: string, callback: (message: string) => void): Promise<void>;
    unsubscribe(channel: string): Promise<void>;
    psubscribe(pattern: string, callback: (channel: string, message: string) => void): Promise<void>;
    keys(pattern: string): Promise<string[]>;
    exists(key: string): Promise<boolean>;
    expire(key: string, seconds: number): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
}
//# sourceMappingURL=redis-client.d.ts.map