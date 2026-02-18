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

import { createClient } from 'redis';

const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';

/**
 * Clear all blocked UUID keys from Redis.
 * Called after auth failure tests to prevent subsequent tests from being blocked.
 */
export async function clearBlockedUuids(): Promise<void> {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  try {
    const { keys } = await redis.scan('0', { MATCH: 'blocked:*', COUNT: 1000 });
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } finally {
    await redis.close();
  }
}

/**
 * Clear all connection lock keys from Redis.
 */
export async function clearConnectionLocks(): Promise<void> {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  try {
    const { keys } = await redis.scan('0', { MATCH: 'connection:*', COUNT: 1000 });
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } finally {
    await redis.close();
  }
}
