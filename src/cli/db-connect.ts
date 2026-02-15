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

import mongoose from 'mongoose';
import path from 'path';
import { loadConfig, SystemConfigManager } from '../config';
import { MongoConnect } from '../lib/mongoconnect';
import type { AppLogger } from '../lib/logger';

/** Simple console logger for CLI tools */
const cliLogger: AppLogger = {
  error: (...args: unknown[]) => console.error(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  info: (...args: unknown[]) => console.log(...args),
  debug: () => {},
  audit: () => {},
  auditRequest: () => {},
};

/**
 * Connect to the database using configuration from config.json
 */
export async function connectToDatabase(): Promise<{ configManager: SystemConfigManager }> {
  const configPath = process.env['CONFIG_PATH'] || path.join(__dirname, '../../config.json');
  const config = loadConfig(configPath);
  const configManager = new SystemConfigManager(config);

  const mongoConnect = new MongoConnect(configManager, cliLogger);
  await mongoConnect.connect(mongoose);

  return { configManager };
}

/**
 * Disconnect from the database
 */
export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.connection.close();
  console.log('Disconnected from MongoDB');
}
