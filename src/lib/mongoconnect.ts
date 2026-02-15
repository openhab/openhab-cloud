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
 * MongoDB Connection Module
 *
 * Handles MongoDB connection using Mongoose with configuration from SystemConfigManager.
 */

import type { Mongoose } from 'mongoose';
import mongoose from 'mongoose';
import type { AppLogger } from './logger';

/**
 * Configuration interface for MongoDB connection
 */
export interface MongoConnectConfig {
  hasDbCredentials(): boolean;
  getDbUser(): string | undefined;
  getDbPass(): string | undefined;
  getDbHostsString(): string;
  getDbName(): string;
  getDbAuthSource(): string | undefined;
}

/**
 * MongoDB connection manager
 */
export class MongoConnect {
  constructor(
    private config: MongoConnectConfig,
    private logger: AppLogger
  ) {}

  /**
   * Connect to MongoDB using the configured URI.
   *
   * @param mongoose - Mongoose instance to connect
   * @returns Promise that resolves when connected
   */
  async connect(mongooseInstance: Mongoose): Promise<void> {
    // Preserve Mongoose 6 behavior: allow queries with fields not in schema
    mongoose.set('strictQuery', false);

    const uri = this.getMongoUri();

    // Log URI with masked password for debugging
    this.logger.info('Trying to connect to mongodb at: ' + this.getMaskedUri());

    try {
      await mongooseInstance.connect(uri);
      this.logger.info('Successfully connected to mongodb');
    } catch (error) {
      this.logger.error('Error while connecting from openHAB-cloud to mongodb:', error);
      this.logger.error('Stopping openHAB-cloud due to error with mongodb');
      throw error;
    }
  }

  /**
   * Build the MongoDB connection URI from configuration.
   *
   * Note: We do NOT URL-encode credentials here because the MongoDB Node.js driver
   * handles special characters internally. Pre-encoding would cause double-encoding
   * and authentication failures.
   */
  private getMongoUri(): string {
    let uri = 'mongodb://';

    if (this.config.hasDbCredentials()) {
      uri += this.config.getDbUser() + ':' + this.config.getDbPass() + '@';
    }

    uri += this.config.getDbHostsString();
    uri += '/' + this.config.getDbName();

    // Append authSource if configured (common in replica set deployments)
    const authSource = this.config.getDbAuthSource();
    if (authSource) {
      uri += '?authSource=' + authSource;
    }

    return uri;
  }

  /**
   * Get URI with password masked for logging.
   */
  private getMaskedUri(): string {
    let uri = 'mongodb://';

    if (this.config.hasDbCredentials()) {
      uri += this.config.getDbUser() + ':***@';
    }

    uri += this.config.getDbHostsString();
    uri += '/' + this.config.getDbName();

    const authSource = this.config.getDbAuthSource();
    if (authSource) {
      uri += '?authSource=' + authSource;
    }

    return uri;
  }
}
