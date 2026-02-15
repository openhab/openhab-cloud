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

import { createClient, type RedisClientType } from 'redis';
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
  /** Scan keys matching a pattern. Returns [nextCursor, keys]. */
  scan(cursor: number, options: { MATCH: string; COUNT: number }): Promise<{ cursor: number; keys: string[] }>;
  /** The underlying Redis v4 client (for libraries like connect-redis) */
  readonly nativeClient: RedisClientType;
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

/**
 * Create a promisified Redis client (async — must be awaited)
 *
 * @param config - Redis configuration
 * @param logger - Logger instance
 * @returns Promise of a PromisifiedRedisClient
 */
export async function createRedisClient(
  config: RedisConfig,
  logger: ILogger
): Promise<PromisifiedRedisClient> {
  logger.info(`Connecting to Redis at ${config.host}:${config.port}`);

  const clientOptions: Parameters<typeof createClient>[0] = {
    socket: {
      host: config.host,
      port: config.port,
    },
  };

  if (config.password) {
    clientOptions.password = config.password;
  }

  const client = createClient(clientOptions) as RedisClientType;

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

  await client.connect();

  // Return wrapper that matches the PromisifiedRedisClient interface
  return wrapRedisClient(client);
}

/**
 * Wrap a Redis v4 client with our stable interface
 */
function wrapRedisClient(client: RedisClientType): PromisifiedRedisClient {
  return {
    async get(key: string): Promise<string | null> {
      return client.get(key);
    },

    async set(key: string, value: string, ...args: (string | number)[]): Promise<string | null> {
      // Parse variadic args to match redis v4 API
      // Supports: set(key, val), set(key, val, 'EX', 60), set(key, val, 'NX', 'EX', 60)
      const options: Record<string, unknown> = {};
      for (let i = 0; i < args.length; i++) {
        const arg = String(args[i]).toUpperCase();
        if (arg === 'EX' && i + 1 < args.length) {
          options['EX'] = Number(args[++i]);
        } else if (arg === 'PX' && i + 1 < args.length) {
          options['PX'] = Number(args[++i]);
        } else if (arg === 'NX') {
          options['NX'] = true;
        } else if (arg === 'XX') {
          options['XX'] = true;
        }
      }
      return client.set(key, value, options);
    },

    async del(key: string): Promise<number> {
      return client.del(key);
    },

    async ttl(key: string): Promise<number> {
      return client.ttl(key);
    },

    async expire(key: string, seconds: number): Promise<number> {
      const result = await client.expire(key, seconds);
      return result ? 1 : 0;
    },

    async incr(key: string): Promise<number> {
      return client.incr(key);
    },

    async mget(keys: string[]): Promise<(string | null)[]> {
      return client.mGet(keys);
    },

    async watch(key: string): Promise<string> {
      await client.watch(key);
      return 'OK';
    },

    async unwatch(): Promise<string> {
      await client.unwatch();
      return 'OK';
    },

    multi(): PromisifiedRedisMulti {
      const multi = client.multi();
      return wrapRedisMulti(multi);
    },

    async quit(): Promise<void> {
      await client.quit();
    },

    on(event: string, callback: (...args: unknown[]) => void): void {
      client.on(event, callback);
    },

    async scan(cursor: number, options: { MATCH: string; COUNT: number }): Promise<{ cursor: number; keys: string[] }> {
      return client.scan(cursor, options);
    },

    get nativeClient(): RedisClientType {
      return client;
    },
  };
}

/**
 * Wrap a Redis v4 multi with our stable interface
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapRedisMulti(multi: any): PromisifiedRedisMulti {
  return {
    get(key: string): PromisifiedRedisMulti {
      multi.get(key);
      return this;
    },

    set(key: string, value: string): PromisifiedRedisMulti {
      multi.set(key, value);
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
      multi.zAdd(key, { score, value: member });
      return this;
    },

    zremrangebyscore(key: string, min: string | number, max: string | number): PromisifiedRedisMulti {
      multi.zRemRangeByScore(key, min, max);
      return this;
    },

    async exec(): Promise<unknown[] | null> {
      return multi.exec();
    },
  };
}

