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

import crypto from 'crypto';
import type { Types } from 'mongoose';
import type { IOpenhab } from '../types/models';
import type { ILogger } from '../types/notification';

/**
 * Repository interface for Openhab operations
 */
export interface IOpenhabRepositoryFull {
  findById(id: string | Types.ObjectId): Promise<IOpenhab | null>;
  findByUuid(uuid: string): Promise<IOpenhab | null>;
  findByAccount(accountId: string | Types.ObjectId): Promise<IOpenhab | null>;
  create(data: { account: Types.ObjectId | string; uuid: string; secret: string }): Promise<IOpenhab>;
  updateUuidAndSecret(id: string | Types.ObjectId, uuid: string, secret: string): Promise<void>;
  updateLastOnline(id: string | Types.ObjectId): Promise<void>;
  deleteByAccount(accountId: string | Types.ObjectId): Promise<void>;
}

/**
 * Result of openHAB authentication
 */
export interface OpenhabAuthResult {
  success: boolean;
  openhab?: IOpenhab;
  error?: string;
}

/**
 * OpenHAB Service
 *
 * Handles openHAB instance management:
 * - Authentication (for socket connections)
 * - Instance lookup
 * - Configuration updates
 * - Online status tracking
 */
export class OpenhabService {
  constructor(
    private readonly openhabRepository: IOpenhabRepositoryFull,
    private readonly logger: ILogger
  ) {}

  /**
   * Authenticate an openHAB instance by UUID and secret
   *
   * Used when openHAB connects via WebSocket.
   *
   * @param uuid - OpenHAB UUID
   * @param secret - OpenHAB secret
   * @returns Authentication result with openhab if successful
   */
  async authenticate(uuid: string, secret: string): Promise<OpenhabAuthResult> {
    try {
      const openhab = await this.openhabRepository.findByUuid(uuid);

      if (!openhab) {
        this.logger.debug(`OpenHAB not found: ${uuid}`);
        return { success: false, error: 'OpenHAB not found' };
      }

      // Use timing-safe comparison to prevent timing attacks
      const secretBuffer = Buffer.from(secret);
      const storedBuffer = Buffer.from(openhab.secret);
      if (secretBuffer.length !== storedBuffer.length ||
          !crypto.timingSafeEqual(secretBuffer, storedBuffer)) {
        this.logger.debug(`Invalid secret for openHAB: ${uuid}`);
        return { success: false, error: 'Invalid secret' };
      }

      this.logger.debug(`OpenHAB authenticated: ${uuid}`);
      return { success: true, openhab };
    } catch (error) {
      this.logger.error('OpenHAB authentication error:', error);
      return { success: false, error: 'Authentication error' };
    }
  }

  /**
   * Get openHAB instance by ID
   */
  async getById(id: string | Types.ObjectId): Promise<IOpenhab | null> {
    try {
      return await this.openhabRepository.findById(id);
    } catch (error) {
      this.logger.error('OpenHAB lookup error:', error);
      return null;
    }
  }

  /**
   * Get openHAB instance for a user account
   */
  async getByAccount(accountId: string | Types.ObjectId): Promise<IOpenhab | null> {
    try {
      return await this.openhabRepository.findByAccount(accountId);
    } catch (error) {
      this.logger.error('OpenHAB lookup by account error:', error);
      return null;
    }
  }

  /**
   * Check if a UUID is available (not already in use)
   */
  async isUuidAvailable(uuid: string): Promise<boolean> {
    try {
      const existing = await this.openhabRepository.findByUuid(uuid);
      return existing === null;
    } catch (error) {
      this.logger.error('UUID availability check error:', error);
      return false;
    }
  }

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
   * Update last online timestamp
   *
   * Called when openHAB connects or performs activity.
   */
  async updateLastOnline(openhabId: string | Types.ObjectId): Promise<void> {
    try {
      await this.openhabRepository.updateLastOnline(openhabId);
    } catch (error) {
      this.logger.error('Update last online error:', error);
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
