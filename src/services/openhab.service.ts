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

/**
 * Repository interface for Openhab operations
 */
export interface IOpenhabRepositoryFull {
  findByUuid(uuid: string): Promise<IOpenhab | null>;
  create(data: { account: Types.ObjectId | string; uuid: string; secret: string }): Promise<IOpenhab>;
  updateUuidAndSecret(id: string | Types.ObjectId, uuid: string, secret: string): Promise<void>;
}

/**
 * OpenHAB Service
 *
 * Handles openHAB instance management:
 * - Configuration updates
 * - Instance creation
 */
export class OpenhabService {
  constructor(
    private readonly openhabRepository: IOpenhabRepositoryFull,
    private readonly logger: ILogger
  ) {}

  /**
   * Update openHAB UUID and secret
   */
  async updateCredentials(
    openhabId: string | Types.ObjectId,
    uuid: string,
    secret: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if new UUID is already in use by another openHAB
      const existing = await this.openhabRepository.findByUuid(uuid);
      if (existing && existing._id.toString() !== openhabId.toString()) {
        return { success: false, error: 'UUID is already in use' };
      }

      await this.openhabRepository.updateUuidAndSecret(openhabId, uuid, secret);
      this.logger.info(`OpenHAB credentials updated: ${openhabId}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Update credentials error:', error);
      return { success: false, error: 'Failed to update credentials' };
    }
  }

  /**
   * Create a new openHAB instance
   */
  async create(data: {
    account: Types.ObjectId | string;
    uuid: string;
    secret: string;
  }): Promise<{ success: boolean; openhab?: IOpenhab; error?: string }> {
    try {
      // Check if UUID is available
      const existing = await this.openhabRepository.findByUuid(data.uuid);
      if (existing) {
        return { success: false, error: 'UUID is already in use' };
      }

      const openhab = await this.openhabRepository.create(data);
      this.logger.info(`OpenHAB created: ${data.uuid}`);
      return { success: true, openhab };
    } catch (error) {
      this.logger.error('Create openHAB error:', error);
      return { success: false, error: 'Failed to create openHAB instance' };
    }
  }
}
