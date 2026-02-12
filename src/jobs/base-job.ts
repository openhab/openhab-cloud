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

import type { PromisifiedRedisClient } from '../lib/redis';
import type { ILogger } from '../types/notification';

/**
 * Job execution result
 */
export interface JobResult {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * Base class for background jobs with distributed locking
 */
export abstract class BaseJob {
  constructor(
    protected readonly redis: PromisifiedRedisClient,
    protected readonly logger: ILogger
  ) {}

  /**
   * Unique name for this job (used for locking)
   */
  abstract get name(): string;

  /**
   * Cron schedule expression (e.g., every 5 minutes: '0 star-slash-5 * * * *')
   */
  abstract get schedule(): string;

  /**
   * Lock timeout in seconds (default 60 seconds)
   */
  get lockTimeoutSeconds(): number {
    return 60;
  }

  /**
   * Execute the job logic (implemented by subclasses)
   */
  protected abstract execute(): Promise<JobResult>;

  /**
   * Run the job with distributed locking
   *
   * Uses Redis SET NX EX pattern to acquire a lock.
   * Only one instance across the cluster can run the job at a time.
   */
  async run(): Promise<JobResult> {
    const lockKey = `jobs:${this.name}`;

    this.logger.info(`${this.name} job started`);

    // Try to acquire lock with NX (only set if not exists) and EX (expire time)
    const acquired = await this.redis.set(lockKey, '1', 'NX', 'EX', this.lockTimeoutSeconds);

    if (!acquired) {
      this.logger.info(`${this.name} job skipped - another instance holds the lock`);
      return {
        success: false,
        message: 'Lock not acquired - another instance is running this job',
      };
    }

    this.logger.info(`${this.name} job obtained lock`);

    try {
      const result = await this.execute();
      this.logger.info(`${this.name} job finished`);
      return result;
    } catch (error) {
      this.logger.error(`${this.name} job failed:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
    // Note: We don't delete the lock - it will expire naturally
    // This prevents rapid re-execution if the job completes quickly
  }
}
