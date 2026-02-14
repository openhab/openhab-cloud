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
    return 10;
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
        this.openhabModel.countDocuments({}),
        this.countOpenhabOnline(),
        this.userModel.countDocuments({}),
        this.invitationModel.countDocuments({ used: true }),
        this.invitationModel.countDocuments({ used: false }),
        this.userDeviceModel.countDocuments({}),
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
   * Count online openHAB instances by scanning Redis connection keys.
   * Uses SCAN to avoid blocking Redis on large datasets.
   */
  private async countOpenhabOnline(): Promise<number> {
    let count = 0;
    let cursor = 0;

    try {
      do {
        const result = await this.redis.scan(cursor, { MATCH: 'connection:*', COUNT: 100 });
        cursor = result.cursor;
        count += result.keys.length;
      } while (cursor !== 0);
    } catch (err) {
      this.logger.error('Error scanning for online openhabs:', err);
    }

    return count;
  }

  private async saveStats(stats: StatsData): Promise<void> {
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
