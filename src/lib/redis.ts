/*
 * Copyright (c) 2010-2026 Contributors to the openHAB project
 *
 * See the NOTICE file(s) distributed with this work for additional
 * information.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import type { RedisClient, Multi } from 'redis';
import type { RedisConfig } from '../config';
import type { ILogger } from '../types/notification';

/**
 * Promisified Redis client interface
 */
export interface PromisifiedRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: (string | number)[]): Promise<string | null>;
  del(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  incr(key: string): Promise<number>;
  mget(keys: string[]): Promise<(string | null)[]>;
  watch(key: string): Promise<string>;
  unwatch(): Promise<string>;
  multi(): PromisifiedRedisMulti;
  quit(): Promise<void>;
  on(event: string, callback: (...args: unknown[]) => void): void;
  /** The underlying Redis client (for libraries like connect-redis that need it) */
  readonly _rawClient: RedisClient;
}

export interface PromisifiedRedisMulti {
  get(key: string): PromisifiedRedisMulti;
  set(key: string, value: string, ...args: (string | number)[]): PromisifiedRedisMulti;
  del(key: string): PromisifiedRedisMulti;
  expire(key: string, seconds: number): PromisifiedRedisMulti;
  zadd(key: string, score: number, member: string): PromisifiedRedisMulti;
  zremrangebyscore(key: string, min: string | number, max: string | number): PromisifiedRedisMulti;
  exec(): Promise<unknown[] | null>;
}

// Callback types for Redis operations
type RedisCallback<T> = (err: Error | null, reply: T) => void;

/**
 * Create a promisified Redis client
 *
 * @param config - Redis configuration
 * @param logger - Logger instance
 * @returns Promisified Redis client
 */
export function createRedisClient(
  config: RedisConfig,
  logger: ILogger
): PromisifiedRedisClient {
  // Dynamic require to handle CommonJS module
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const redis = require('redis') as typeof import('redis');

  logger.info(`Connecting to Redis at ${config.host}:${config.port}`);

  const client = redis.createClient({
    port: config.port,
    host: config.host,
  }) as RedisClient;

  // Authenticate if password is configured
  if (config.password) {
    client.auth(config.password, (error: Error | null, data: string) => {
      if (error) {
        logger.error('Redis auth error - closing connection:', error);
        client.quit();
      } else {
        logger.info(`Redis connect response: ${data}`);
      }
    });
  }

  // Set up event handlers
  client.on('ready', () => {
    logger.info('Redis is ready');
  });

  client.on('end', () => {
    logger.error('Redis connection closed');
  });

  client.on('error', (error: Error) => {
    logger.error('Redis error:', error);
  });

  // Return promisified wrapper
  return wrapRedisClient(client);
}

/**
 * Wrap a Redis client with Promise-based methods
 */
function wrapRedisClient(client: RedisClient): PromisifiedRedisClient {
  return {
    get(key: string): Promise<string | null> {
      return new Promise((resolve, reject) => {
        client.get(key, (err: Error | null, reply: string | null) => {
          if (err) reject(err);
          else resolve(reply);
        });
      });
    },

    set(key: string, value: string, ...args: (string | number)[]): Promise<string | null> {
      return new Promise((resolve, reject) => {
        // Build args array for redis client
        const redisArgs: (string | number)[] = [key, value, ...args];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (client.set as any)(...redisArgs, (err: Error | null, reply: string | null) => {
          if (err) reject(err);
          else resolve(reply);
        });
      });
    },

    del(key: string): Promise<number> {
      return new Promise((resolve, reject) => {
        client.del(key, (err: Error | null, reply: number) => {
          if (err) reject(err);
          else resolve(reply);
        });
      });
    },

    ttl(key: string): Promise<number> {
      return new Promise((resolve, reject) => {
        client.ttl(key, (err: Error | null, reply: number) => {
          if (err) reject(err);
          else resolve(reply);
        });
      });
    },

    expire(key: string, seconds: number): Promise<number> {
      return new Promise((resolve, reject) => {
        client.expire(key, seconds, (err: Error | null, reply: number) => {
          if (err) reject(err);
          else resolve(reply);
        });
      });
    },

    incr(key: string): Promise<number> {
      return new Promise((resolve, reject) => {
        client.incr(key, (err: Error | null, reply: number) => {
          if (err) reject(err);
          else resolve(reply);
        });
      });
    },

    mget(keys: string[]): Promise<(string | null)[]> {
      return new Promise((resolve, reject) => {
        client.mget(keys, (err: Error | null, reply: (string | null)[]) => {
          if (err) reject(err);
          else resolve(reply);
        });
      });
    },

    watch(key: string): Promise<string> {
      return new Promise((resolve, reject) => {
        client.watch(key, (err: Error | null, reply: string) => {
          if (err) reject(err);
          else resolve(reply);
        });
      });
    },

    unwatch(): Promise<string> {
      return new Promise((resolve, reject) => {
        client.unwatch((err: Error | null, reply: string) => {
          if (err) reject(err);
          else resolve(reply);
        });
      });
    },

    multi(): PromisifiedRedisMulti {
      const multi = client.multi();
      return wrapRedisMulti(multi);
    },

    quit(): Promise<void> {
      return new Promise((resolve, reject) => {
        client.quit((err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },

    on(event: string, callback: (...args: unknown[]) => void): void {
      client.on(event, callback);
    },

    get _rawClient(): RedisClient {
      return client;
    },
  };
}

/**
 * Wrap a Redis multi with Promise-based exec
 */
function wrapRedisMulti(multi: Multi): PromisifiedRedisMulti {
  return {
    get(key: string): PromisifiedRedisMulti {
      multi.get(key);
      return this;
    },

    set(key: string, value: string, ...args: (string | number)[]): PromisifiedRedisMulti {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (multi.set as any)(key, value, ...args);
      return this;
    },

    del(key: string): PromisifiedRedisMulti {
      multi.del(key);
      return this;
    },

    expire(key: string, seconds: number): PromisifiedRedisMulti {
      multi.expire(key, seconds);
      return this;
    },

    zadd(key: string, score: number, member: string): PromisifiedRedisMulti {
      multi.zadd(key, score, member);
      return this;
    },

    zremrangebyscore(key: string, min: string | number, max: string | number): PromisifiedRedisMulti {
      multi.zremrangebyscore(key, min, max);
      return this;
    },

    exec(): Promise<unknown[] | null> {
      return new Promise((resolve, reject) => {
        multi.exec((err: Error | null, replies: unknown[] | null) => {
          if (err) reject(err);
          else resolve(replies);
        });
      });
    },
  };
}

/**
 * Create a mock Redis client for testing
 */
export function createMockRedisClient(): PromisifiedRedisClient {
  const store = new Map<string, string>();

  const mockMulti = (): PromisifiedRedisMulti => ({
    get: function() { return this; },
    set: function() { return this; },
    del: function() { return this; },
    expire: function() { return this; },
    zadd: function() { return this; },
    zremrangebyscore: function() { return this; },
    exec: async () => [],
  });

  return {
    async get(key: string) {
      return store.get(key) || null;
    },
    async set(key: string, value: string) {
      store.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      store.delete(key);
      return 1;
    },
    async ttl() {
      return -2;
    },
    async expire() {
      return 1;
    },
    async incr(key: string) {
      const val = parseInt(store.get(key) || '0', 10) + 1;
      store.set(key, val.toString());
      return val;
    },
    async mget(keys: string[]) {
      return keys.map(k => store.get(k) || null);
    },
    async watch() {
      return 'OK';
    },
    async unwatch() {
      return 'OK';
    },
    multi: mockMulti,
    async quit() {},
    on() {},
    // Mock client doesn't have a real underlying client
    get _rawClient(): RedisClient {
      return {} as RedisClient;
    },
  };
}
