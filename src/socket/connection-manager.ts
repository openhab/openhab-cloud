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

import type { Types } from 'mongoose';
import type { IOpenhab } from '../types/models';
import type { ILogger } from '../types/notification';
import type { ConnectionInfo, ISocketSystemConfig } from './types';

/**
 * Redis client interface for connection management
 */
export interface IRedisClientForConnection {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    ...args: (string | number)[]
  ): Promise<string | null>;
  del(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  watch(key: string): Promise<string>;
  unwatch(): Promise<string>;
  multi(): {
    expire(key: string, seconds: number): unknown;
    get(key: string): unknown;
    del(key: string): unknown;
    exec(): Promise<unknown[] | null>;
  };
}

/**
 * Repository interface for OpenHAB operations
 */
export interface IOpenhabRepositoryForConnection {
  findByUuidAndSecret(uuid: string, secret: string): Promise<IOpenhab | null>;
  updateLastOnline(id: string | Types.ObjectId): Promise<void>;
}

/**
 * Result of checking if a connection is blocked
 */
export interface BlockedResult {
  blocked: boolean;
  ttl?: number;
}

/**
 * Result of acquiring a connection lock
 */
export interface LockResult {
  acquired: boolean;
  error?: string;
}

/**
 * Connection Manager
 *
 * Manages WebSocket connection state using Redis:
 * - Connection blocking (rate limiting failed auth attempts)
 * - Connection locking (ensuring one connection per openHAB)
 * - Lock renewal on heartbeat
 * - Clean disconnection handling
 */
export class ConnectionManager {
  constructor(
    private readonly redis: IRedisClientForConnection,
    private readonly openhabRepository: IOpenhabRepositoryForConnection,
    private readonly systemConfig: ISocketSystemConfig,
    private readonly logger: ILogger
  ) {}

  /**
   * Check if a UUID is blocked from connecting
   *
   * UUIDs are blocked temporarily after failed authentication attempts.
   */
  async isBlocked(uuid: string): Promise<BlockedResult> {
    try {
      const ttl = await this.redis.ttl(`blocked:${uuid}`);

      if (ttl === -2) {
        // Key does not exist - not blocked
        return { blocked: false };
      }

      if (ttl === -1) {
        // Key exists but no TTL - permanently blocked
        return { blocked: true };
      }

      // Key exists with TTL - temporarily blocked
      return { blocked: true, ttl };
    } catch (error) {
      this.logger.error(`Error checking blocked status for ${uuid}:`, error);
      // Allow connection on Redis error (fail open)
      return { blocked: false };
    }
  }

  /**
   * Block a UUID temporarily after failed authentication
   *
   * @param uuid - The UUID to block
   * @param version - The openHAB version (for logging/debugging)
   * @param seconds - How long to block (default: 60)
   */
  async blockUuid(uuid: string, version: string, seconds = 60): Promise<void> {
    try {
      await this.redis.set(`blocked:${uuid}`, version, 'NX', 'EX', seconds);
    } catch (error) {
      this.logger.error(`Error blocking ${uuid}:`, error);
    }
  }

  /**
   * Authenticate an openHAB connection
   *
   * @param uuid - The openHAB UUID
   * @param secret - The openHAB secret
   * @returns The openHAB instance if authenticated, null otherwise
   */
  async authenticate(uuid: string, secret: string): Promise<IOpenhab | null> {
    try {
      const openhab = await this.openhabRepository.findByUuidAndSecret(uuid, secret);
      return openhab;
    } catch (error) {
      this.logger.error(`Authentication error for ${uuid}:`, error);
      return null;
    }
  }

  /**
   * Acquire a connection lock for an openHAB
   *
   * Uses Redis NX (not exists) to ensure only one connection per openHAB.
   *
   * @param openhabId - The openHAB's MongoDB ID
   * @param connectionId - Unique identifier for this connection
   * @param openhabVersion - The openHAB version
   * @returns Lock result indicating success or failure
   */
  async acquireLock(
    openhabId: string,
    connectionId: string,
    openhabVersion: string
  ): Promise<LockResult> {
    const lockKey = `connection:${openhabId}`;
    const lockValue: ConnectionInfo = {
      serverAddress: this.systemConfig.getInternalAddress(),
      connectionId,
      connectionTime: new Date().toISOString(),
      openhabVersion,
    };

    try {
      const result = await this.redis.set(
        lockKey,
        JSON.stringify(lockValue),
        'NX',
        'EX',
        this.systemConfig.getConnectionLockTimeSeconds()
      );

      if (!result) {
        this.logger.info(
          `Another connection has lock for openHAB ${openhabId}, connectionId ${connectionId}`
        );
        return { acquired: false, error: 'already connected' };
      }

      return { acquired: true };
    } catch (error) {
      this.logger.error(
        `Error acquiring lock for openHAB ${openhabId}, connectionId ${connectionId}:`,
        error
      );
      return { acquired: false, error: 'connection lock error' };
    }
  }

  /**
   * Renew a connection lock (called on heartbeat/ping)
   *
   * Verifies we still own the lock before renewing.
   *
   * @param lockKey - The Redis lock key
   * @param connectionId - Our connection ID
   * @returns True if lock renewed, false if we lost the lock
   */
  async renewLock(lockKey: string, connectionId: string): Promise<boolean> {
    try {
      const multi = this.redis.multi();
      multi.expire(lockKey, this.systemConfig.getConnectionLockTimeSeconds());
      multi.get(lockKey);

      const results = await multi.exec();

      if (!results || !results[1]) {
        this.logger.error(`Lock no longer present for key ${lockKey}`);
        return false;
      }

      const connectionData = results[1] as string;
      const connection = JSON.parse(connectionData) as ConnectionInfo;

      if (connection.connectionId !== connectionId) {
        this.logger.error(
          `Connection ${connection.connectionId} has lock, expected ${connectionId}`
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Error renewing lock ${lockKey}:`, error);
      return false;
    }
  }

  /**
   * Release a connection lock on disconnect
   *
   * Uses Redis WATCH to ensure we only delete our own lock.
   *
   * @param lockKey - The Redis lock key
   * @param connectionId - Our connection ID
   * @param openhabId - The openHAB's MongoDB ID (for updating last_online)
   */
  async releaseLock(
    lockKey: string,
    connectionId: string,
    openhabId: string
  ): Promise<void> {
    try {
      await this.redis.watch(lockKey);

      const data = await this.redis.get(lockKey);
      if (!data) {
        this.logger.info(`Lock already removed for ${lockKey}`);
        await this.redis.unwatch();
        return;
      }

      const connection = JSON.parse(data) as ConnectionInfo;
      if (connection.connectionId !== connectionId) {
        this.logger.info(
          `Lock belongs to different connection: ${connection.connectionId}, not ${connectionId}`
        );
        await this.redis.unwatch();
        return;
      }

      // Delete the lock
      const multi = this.redis.multi();
      multi.del(lockKey);
      const results = await multi.exec();

      if (!results) {
        this.logger.info(`Lock was mutated before delete for ${lockKey}`);
      }

      // Update last_online timestamp
      await this.openhabRepository.updateLastOnline(openhabId);
    } catch (error) {
      this.logger.error(`Error releasing lock ${lockKey}:`, error);
      try {
        await this.redis.unwatch();
      } catch {
        // Ignore unwatch errors
      }
    }
  }

  /**
   * Get connection info for an openHAB
   *
   * @param openhabId - The openHAB's MongoDB ID
   * @returns Connection info if connected, null otherwise
   */
  async getConnectionInfo(openhabId: string): Promise<ConnectionInfo | null> {
    try {
      const data = await this.redis.get(`connection:${openhabId}`);
      if (!data) {
        return null;
      }
      return JSON.parse(data) as ConnectionInfo;
    } catch (error) {
      this.logger.error(`Error getting connection info for ${openhabId}:`, error);
      return null;
    }
  }

  /**
   * Get the lock key for an openHAB ID
   */
  getLockKey(openhabId: string): string {
    return `connection:${openhabId}`;
  }
}
