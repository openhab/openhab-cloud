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

/**
 * Redis Helper for Integration Tests
 *
 * Provides utilities for managing Redis state during tests.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Redis = require('ioredis');

const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';

/**
 * Clear all blocked UUID keys from Redis.
 * Called after auth failure tests to prevent subsequent tests from being blocked.
 */
export async function clearBlockedUuids(): Promise<void> {
  const redis = new Redis(REDIS_URL);
  try {
    const keys: string[] = await redis.keys('blocked:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } finally {
    redis.disconnect();
  }
}

/**
 * Clear all connection lock keys from Redis.
 */
export async function clearConnectionLocks(): Promise<void> {
  const redis = new Redis(REDIS_URL);
  try {
    const keys: string[] = await redis.keys('connection:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } finally {
    redis.disconnect();
  }
}
