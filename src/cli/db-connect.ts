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
 * Database Connection Utility for CLI Tools
 *
 * Provides a simple way to connect to MongoDB for CLI scripts.
 */

import mongoose from 'mongoose';
import path from 'path';
import { loadConfig, SystemConfigManager } from '../config';

/**
 * Connect to the database using configuration from config.json
 */
export async function connectToDatabase(): Promise<{ configManager: SystemConfigManager }> {
  const configPath = process.env['CONFIG_PATH'] || path.join(__dirname, '../../config.json');
  const config = loadConfig(configPath);
  const configManager = new SystemConfigManager(config);

  let uri = 'mongodb://';

  if (configManager.hasDbCredentials()) {
    const user = configManager.getDbUser() ?? '';
    const pass = configManager.getDbPass() ?? '';
    uri += encodeURIComponent(user) + ':' + encodeURIComponent(pass) + '@';
  }

  uri += configManager.getDbHostsString();
  uri += '/' + configManager.getDbName();

  console.log('Connecting to MongoDB at:', configManager.getDbHostsString());
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  return { configManager };
}

/**
 * Disconnect from the database
 */
export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.connection.close();
  console.log('Disconnected from MongoDB');
}
