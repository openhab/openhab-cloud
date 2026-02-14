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
 * Database Reset Utility for Integration Tests
 *
 * Drops all collections and reseeds the database.
 * Use this before running test suites to ensure a clean state.
 *
 * Usage: npx tsx tests/integration/reset-database.ts
 */

import mongoose from 'mongoose';
import { seedDatabase } from './seed-database';

/**
 * Connect to MongoDB
 */
async function connectToDatabase(): Promise<void> {
  const mongoHost = process.env['MONGO_HOST'] || 'localhost';
  const mongoPort = process.env['MONGO_PORT'] || '27017';
  const mongoDb = process.env['MONGO_DB'] || 'openhab_test';

  const uri = `mongodb://${mongoHost}:${mongoPort}/${mongoDb}`;

  console.log(`Connecting to MongoDB at ${mongoHost}:${mongoPort}...`);
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

/**
 * Disconnect from MongoDB
 */
async function disconnectFromDatabase(): Promise<void> {
  await mongoose.connection.close();
  console.log('Disconnected from MongoDB');
}

/**
 * Drop all collections in the database
 */
async function dropAllCollections(): Promise<void> {
  console.log('Dropping all collections...');

  const collections = await mongoose.connection.db?.listCollections().toArray();

  if (collections) {
    for (const collection of collections) {
      await mongoose.connection.db?.dropCollection(collection.name);
      console.log(`  Dropped collection: ${collection.name}`);
    }
  }

  console.log('All collections dropped');
}

/**
 * Full database reset
 */
export async function fullReset(): Promise<void> {
  await dropAllCollections();
  await seedDatabase();
}

// Run as CLI
if (require.main === module) {
  (async () => {
    try {
      await connectToDatabase();
      await fullReset();
    } catch (error) {
      console.error('Reset failed:', error);
      process.exit(1);
    } finally {
      await disconnectFromDatabase();
    }
  })();
}
