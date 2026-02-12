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

import { BaseJob, JobResult } from './base-job';
import type { PromisifiedRedisClient } from '../lib/redis';
import type { ILogger } from '../types/notification';
import type { Model } from 'mongoose';
import type { IUser, IOpenhab, IUserDevice, IInvitation } from '../types/models';

/**
 * Statistics data collected by the job
 */
export interface StatsData {
  openhabCount: number;
  openhabOnlineCount: number;
  userCount: number;
  invitationUsedCount: number;
  invitationUnusedCount: number;
  userDeviceCount: number;
  timestamp: Date;
}

/**
 * Dependencies for the stats job
 */
export interface StatsJobDependencies {
  redis: PromisifiedRedisClient;
  logger: ILogger;
  userModel: Model<IUser>;
  openhabModel: Model<IOpenhab>;
  userDeviceModel: Model<IUserDevice>;
  invitationModel: Model<IInvitation>;
}

/**
 * Statistics collection job
 *
 * Runs every 5 minutes to collect system statistics:
 * - Total openHAB instances
 * - Online openHAB instances (via Redis connection keys)
 * - Total users
 * - Used/unused invitations
 * - User devices
 */
export class StatsJob extends BaseJob {
  private readonly userModel: Model<IUser>;
  private readonly openhabModel: Model<IOpenhab>;
  private readonly userDeviceModel: Model<IUserDevice>;
  private readonly invitationModel: Model<IInvitation>;

  constructor(deps: StatsJobDependencies) {
    super(deps.redis, deps.logger);
    this.userModel = deps.userModel;
    this.openhabModel = deps.openhabModel;
    this.userDeviceModel = deps.userDeviceModel;
    this.invitationModel = deps.invitationModel;
  }

  get name(): string {
    return 'every5minstat';
  }

  get schedule(): string {
    return '0 */5 * * * *'; // Every 5 minutes
  }

  get lockTimeoutSeconds(): number {
    return 10; // Short lock since job runs frequently
  }

  protected async execute(): Promise<JobResult> {
    const stats = await this.collectStats();

    if (!stats) {
      return {
        success: false,
        message: 'Failed to collect all statistics',
      };
    }

    await this.saveStats(stats);

    return {
      success: true,
      message: 'Statistics collected and saved',
      data: stats as unknown as Record<string, unknown>,
    };
  }

  /**
   * Collect all statistics in parallel
   */
  private async collectStats(): Promise<StatsData | null> {
    try {
      const [
        openhabCount,
        openhabOnlineCount,
        userCount,
        invitationUsedCount,
        invitationUnusedCount,
        userDeviceCount,
      ] = await Promise.all([
        this.countOpenhabTotal(),
        this.countOpenhabOnline(),
        this.countUsers(),
        this.countInvitations(true),
        this.countInvitations(false),
        this.countUserDevices(),
      ]);

      return {
        openhabCount,
        openhabOnlineCount,
        userCount,
        invitationUsedCount,
        invitationUnusedCount,
        userDeviceCount,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Error collecting statistics:', error);
      return null;
    }
  }

  /**
   * Count total openHAB instances
   */
  private async countOpenhabTotal(): Promise<number> {
    return this.openhabModel.countDocuments({});
  }

  /**
   * Count online openHAB instances by counting connection keys in Redis
   * Uses SCAN to avoid blocking Redis on large datasets
   */
  private async countOpenhabOnline(): Promise<number> {
    return new Promise((resolve) => {
      // Access the underlying redis client for scan
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = (this.redis as any);

      // Check if we can access the underlying client with scan
      if (!client._client || typeof client._client.scan !== 'function') {
        this.logger.warn('Redis scan not available for counting online openhabs');
        resolve(0);
        return;
      }

      let count = 0;
      const scanKeys = (cursor: string) => {
        client._client.scan(
          cursor,
          'MATCH',
          'connection:*',
          'COUNT',
          100,
          (err: Error | null, res: [string, string[]]) => {
            if (err) {
              this.logger.error('Error scanning for online openhabs:', err);
              resolve(count);
              return;
            }

            const [nextCursor, keys] = res;
            count += keys.length;

            if (nextCursor === '0') {
              resolve(count);
            } else {
              scanKeys(nextCursor);
            }
          }
        );
      };

      scanKeys('0');
    });
  }

  /**
   * Count total users
   */
  private async countUsers(): Promise<number> {
    return this.userModel.countDocuments({});
  }

  /**
   * Count invitations by used status
   */
  private async countInvitations(used: boolean): Promise<number> {
    return this.invitationModel.countDocuments({ used });
  }

  /**
   * Count total user devices
   */
  private async countUserDevices(): Promise<number> {
    return this.userDeviceModel.countDocuments({});
  }

  /**
   * Save collected statistics to Redis
   */
  private async saveStats(stats: StatsData): Promise<void> {
    // Use multi/exec for atomic write
    const multi = this.redis.multi();

    multi.set('openhabCount', stats.openhabCount.toString());
    multi.set('openhabOnlineCount', stats.openhabOnlineCount.toString());
    multi.set('userCount', stats.userCount.toString());
    multi.set('invitationUsedCount', stats.invitationUsedCount.toString());
    multi.set('invitationUnusedCount', stats.invitationUnusedCount.toString());
    multi.set('userDeviceCount', stats.userDeviceCount.toString());
    multi.set('last5MinStatTimestamp', stats.timestamp.toISOString());

    await multi.exec();
  }
}
