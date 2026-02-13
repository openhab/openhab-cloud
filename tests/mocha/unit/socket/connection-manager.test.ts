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

import { expect } from 'chai';
import sinon from 'sinon';
import { Types } from 'mongoose';
import { ConnectionManager } from '../../../../src/socket/connection-manager';
import type {
  IRedisClientForConnection,
  IOpenhabRepositoryForConnection,
} from '../../../../src/socket/connection-manager';
import type { ISocketSystemConfig } from '../../../../src/socket/types';
import type { IOpenhab } from '../../../../src/types/models';
import type { ILogger } from '../../../../src/types/notification';

// Mock implementations
class MockLogger implements ILogger {
  logs: { level: string; message: string; meta: unknown[] }[] = [];

  error(message: string, ...meta: unknown[]): void {
    this.logs.push({ level: 'error', message, meta });
  }
  warn(message: string, ...meta: unknown[]): void {
    this.logs.push({ level: 'warn', message, meta });
  }
  info(message: string, ...meta: unknown[]): void {
    this.logs.push({ level: 'info', message, meta });
  }
  debug(message: string, ...meta: unknown[]): void {
    this.logs.push({ level: 'debug', message, meta });
  }

  clear(): void {
    this.logs = [];
  }
}

class MockRedisClient implements IRedisClientForConnection {
  store: Map<string, { value: string; ttl?: number }> = new Map();
  watchedKeys: Set<string> = new Set();
  shouldThrow = false;

  async get(key: string): Promise<string | null> {
    if (this.shouldThrow) throw new Error('Redis error');
    return this.store.get(key)?.value || null;
  }

  async set(
    key: string,
    value: string,
    ...args: (string | number)[]
  ): Promise<string | null> {
    if (this.shouldThrow) throw new Error('Redis error');

    // Handle NX (only set if not exists)
    const hasNX = args.includes('NX');
    if (hasNX && this.store.has(key)) {
      return null;
    }

    // Handle EX (expiry in seconds)
    const exIndex = args.indexOf('EX');
    const ttl = exIndex !== -1 ? (args[exIndex + 1] as number) : undefined;

    this.store.set(key, { value, ttl });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    if (this.shouldThrow) throw new Error('Redis error');
    return this.store.delete(key) ? 1 : 0;
  }

  async ttl(key: string): Promise<number> {
    if (this.shouldThrow) throw new Error('Redis error');
    const item = this.store.get(key);
    if (!item) return -2; // Key doesn't exist
    if (!item.ttl) return -1; // No TTL
    return item.ttl;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (this.shouldThrow) throw new Error('Redis error');
    const item = this.store.get(key);
    if (!item) return 0;
    item.ttl = seconds;
    return 1;
  }

  async watch(key: string): Promise<string> {
    if (this.shouldThrow) throw new Error('Redis error');
    this.watchedKeys.add(key);
    return 'OK';
  }

  async unwatch(): Promise<string> {
    if (this.shouldThrow) throw new Error('Redis error');
    this.watchedKeys.clear();
    return 'OK';
  }

  multi() {
    const self = this;
    const operations: (() => unknown)[] = [];

    return {
      expire(key: string, seconds: number) {
        operations.push(() => {
          const item = self.store.get(key);
          if (item) item.ttl = seconds;
          return 1;
        });
        return this;
      },
      get(key: string) {
        operations.push(() => self.store.get(key)?.value || null);
        return this;
      },
      del(key: string) {
        operations.push(() => (self.store.delete(key) ? 1 : 0));
        return this;
      },
      async exec(): Promise<unknown[] | null> {
        if (self.shouldThrow) return null;
        return operations.map(op => op());
      },
    };
  }

  clear(): void {
    this.store.clear();
    this.watchedKeys.clear();
    this.shouldThrow = false;
  }
}

class MockOpenhabRepository implements IOpenhabRepositoryForConnection {
  openhabs: IOpenhab[] = [];
  updatedIds: string[] = [];
  shouldThrow = false;

  async findByUuid(uuid: string): Promise<IOpenhab | null> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.openhabs.find(o => o.uuid === uuid) || null;
  }

  async updateLastOnline(id: string): Promise<void> {
    if (this.shouldThrow) throw new Error('Database error');
    this.updatedIds.push(id);
  }

  addOpenhab(openhab: Partial<IOpenhab>): IOpenhab {
    const newOpenhab = {
      _id: new Types.ObjectId(),
      uuid: 'test-uuid',
      secret: 'test-secret',
      account: new Types.ObjectId(),
      ...openhab,
    } as IOpenhab;
    this.openhabs.push(newOpenhab);
    return newOpenhab;
  }

  clear(): void {
    this.openhabs = [];
    this.updatedIds = [];
    this.shouldThrow = false;
  }
}

class MockSystemConfig implements ISocketSystemConfig {
  internalAddress = 'localhost:3000';
  connectionLockTimeSeconds = 300;

  getInternalAddress(): string {
    return this.internalAddress;
  }
  getConnectionLockTimeSeconds(): number {
    return this.connectionLockTimeSeconds;
  }
}

describe('ConnectionManager', () => {
  let connectionManager: ConnectionManager;
  let redis: MockRedisClient;
  let openhabRepository: MockOpenhabRepository;
  let systemConfig: MockSystemConfig;
  let logger: MockLogger;

  beforeEach(() => {
    redis = new MockRedisClient();
    openhabRepository = new MockOpenhabRepository();
    systemConfig = new MockSystemConfig();
    logger = new MockLogger();

    connectionManager = new ConnectionManager(
      redis,
      openhabRepository,
      systemConfig,
      logger
    );
  });

  afterEach(() => {
    sinon.restore();
    redis.clear();
    openhabRepository.clear();
    logger.clear();
  });

  describe('isBlocked', () => {
    it('should return not blocked when key does not exist', async () => {
      const result = await connectionManager.isBlocked('test-uuid');
      expect(result.blocked).to.be.false;
    });

    it('should return blocked with TTL when key has TTL', async () => {
      await redis.set('blocked:test-uuid', 'version', 'EX', 60);

      const result = await connectionManager.isBlocked('test-uuid');
      expect(result.blocked).to.be.true;
      expect(result.ttl).to.equal(60);
    });

    it('should handle Redis errors gracefully', async () => {
      redis.shouldThrow = true;

      const result = await connectionManager.isBlocked('test-uuid');
      expect(result.blocked).to.be.false; // Fail open
    });
  });

  describe('blockUuid', () => {
    it('should block a UUID', async () => {
      await connectionManager.blockUuid('test-uuid', '3.0.0', 60);

      const value = await redis.get('blocked:test-uuid');
      expect(value).to.equal('3.0.0');
    });

    it('should not overwrite existing block', async () => {
      await redis.set('blocked:test-uuid', 'first', 'NX', 'EX', 60);
      await connectionManager.blockUuid('test-uuid', 'second', 60);

      const value = await redis.get('blocked:test-uuid');
      expect(value).to.equal('first');
    });
  });

  describe('authenticate', () => {
    it('should return openhab when credentials match', async () => {
      const openhab = openhabRepository.addOpenhab({
        uuid: 'test-uuid',
        secret: 'test-secret',
      });

      const result = await connectionManager.authenticate('test-uuid', 'test-secret');
      expect(result).to.exist;
      expect(result!._id.toString()).to.equal(openhab._id.toString());
    });

    it('should return null when credentials do not match', async () => {
      openhabRepository.addOpenhab({
        uuid: 'test-uuid',
        secret: 'test-secret',
      });

      const result = await connectionManager.authenticate('test-uuid', 'wrong-secret');
      expect(result).to.be.null;
    });

    it('should return null on database error', async () => {
      openhabRepository.shouldThrow = true;

      const result = await connectionManager.authenticate('test-uuid', 'test-secret');
      expect(result).to.be.null;
      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
    });
  });

  describe('acquireLock', () => {
    it('should acquire lock when not held', async () => {
      const result = await connectionManager.acquireLock(
        'openhab-id',
        'connection-id',
        '3.0.0'
      );

      expect(result.acquired).to.be.true;

      const lockData = await redis.get('connection:openhab-id');
      expect(lockData).to.exist;

      const lock = JSON.parse(lockData!);
      expect(lock.connectionId).to.equal('connection-id');
      expect(lock.serverAddress).to.equal('localhost:3000');
    });

    it('should fail to acquire lock when already held', async () => {
      await connectionManager.acquireLock('openhab-id', 'connection-1', '3.0.0');
      const result = await connectionManager.acquireLock(
        'openhab-id',
        'connection-2',
        '3.0.0'
      );

      expect(result.acquired).to.be.false;
      expect(result.error).to.equal('already connected');
    });

    it('should handle Redis errors', async () => {
      redis.shouldThrow = true;

      const result = await connectionManager.acquireLock(
        'openhab-id',
        'connection-id',
        '3.0.0'
      );

      expect(result.acquired).to.be.false;
      expect(result.error).to.equal('connection lock error');
    });
  });

  describe('renewLock', () => {
    it('should renew lock when we own it', async () => {
      await connectionManager.acquireLock('openhab-id', 'connection-id', '3.0.0');

      const result = await connectionManager.renewLock(
        'connection:openhab-id',
        'connection-id'
      );

      expect(result).to.be.true;
    });

    it('should fail when lock is owned by someone else', async () => {
      await connectionManager.acquireLock('openhab-id', 'other-connection', '3.0.0');

      const result = await connectionManager.renewLock(
        'connection:openhab-id',
        'my-connection'
      );

      expect(result).to.be.false;
    });

    it('should fail when lock does not exist', async () => {
      const result = await connectionManager.renewLock(
        'connection:openhab-id',
        'connection-id'
      );

      expect(result).to.be.false;
    });
  });

  describe('releaseLock', () => {
    it('should release lock when we own it', async () => {
      await connectionManager.acquireLock('openhab-id', 'connection-id', '3.0.0');

      await connectionManager.releaseLock(
        'connection:openhab-id',
        'connection-id',
        'openhab-id'
      );

      const lockData = await redis.get('connection:openhab-id');
      expect(lockData).to.be.null;
      expect(openhabRepository.updatedIds).to.include('openhab-id');
    });

    it('should not release lock when owned by someone else', async () => {
      await connectionManager.acquireLock('openhab-id', 'other-connection', '3.0.0');

      await connectionManager.releaseLock(
        'connection:openhab-id',
        'my-connection',
        'openhab-id'
      );

      // Lock should still exist
      const lockData = await redis.get('connection:openhab-id');
      expect(lockData).to.exist;
    });
  });

  describe('getConnectionInfo', () => {
    it('should return connection info when exists', async () => {
      await connectionManager.acquireLock('openhab-id', 'connection-id', '3.0.0');

      const info = await connectionManager.getConnectionInfo('openhab-id');
      expect(info).to.exist;
      expect(info!.connectionId).to.equal('connection-id');
    });

    it('should return null when not connected', async () => {
      const info = await connectionManager.getConnectionInfo('openhab-id');
      expect(info).to.be.null;
    });
  });

  describe('getLockKey', () => {
    it('should return correct lock key format', () => {
      const key = connectionManager.getLockKey('openhab-id');
      expect(key).to.equal('connection:openhab-id');
    });
  });
});
