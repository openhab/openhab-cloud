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
 * Database Seeding Script for Integration Tests
 *
 * Creates test fixtures for integration testing.
 *
 * Usage: npx tsx tests/integration/seed-database.ts
 */

import mongoose from 'mongoose';

// Import models
import {
  User,
  Openhab,
  OAuth2Client,
  Invitation,
} from '../../src/models';
import { createUserAccount } from '../../src/models/user-account.model';

/**
 * Test fixtures - known credentials for testing
 * Every user has an associated openHAB UUID and secret
 */
export const TEST_FIXTURES = {
  users: {
    testUser: {
      username: 'test@example.com',
      password: 'TestPass123!',
      uuid: 'test-uuid-001',
      secret: 'test-secret-001',
    },
    staffUser: {
      username: 'staff@example.com',
      password: 'StaffPass123!',
      group: 'staff',
      uuid: 'staff-uuid-001',
      secret: 'staff-secret-001',
    },
    masterUser: {
      username: 'master@example.com',
      password: 'MasterPass123!',
      role: 'master',
      uuid: 'master-uuid-001',
      secret: 'master-secret-001',
    },
  },
  openhabs: {
    // Primary openHAB instance (same as testUser's openhab)
    primary: {
      uuid: 'test-uuid-001',
      secret: 'test-secret-001',
    },
    // Additional openHAB instances for multi-instance testing
    secondary: {
      uuid: 'test-uuid-002',
      secret: 'test-secret-002',
    },
    concurrent: {
      uuid: 'concurrent-uuid',
      secret: 'concurrent-secret',
    },
  },
  oauth2: {
    testClient: {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost:3001/callback',
    },
  },
} as const;

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
 * Clear all test data
 */
async function clearDatabase(): Promise<void> {
  console.log('Clearing existing test data...');

  await User.deleteMany({});
  await Openhab.deleteMany({});
  await OAuth2Client.deleteMany({});
  await Invitation.deleteMany({});

  console.log('Database cleared');
}

/**
 * Create test users
 */
async function createTestUsers(): Promise<Map<string, { user: unknown; account: unknown }>> {
  console.log('Creating test users...');
  const users = new Map<string, { user: unknown; account: unknown }>();

  for (const [key, userData] of Object.entries(TEST_FIXTURES.users)) {
    // Create a user account
    const account = await createUserAccount();

    const user = new User({
      username: userData.username,
      group: 'group' in userData ? userData.group : 'user',
      role: 'role' in userData ? userData.role : 'master',
      account: account._id,
      registered: new Date(),
    });

    // Set password through virtual property (triggers hash generation)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user as any).password = userData.password;

    await user.save();
    users.set(key, { user, account });
    console.log(`  Created user: ${userData.username} with account ${account._id}`);
  }

  return users;
}

/**
 * Create test openHAB instances for each user
 */
async function createTestOpenhabs(
  users: Map<string, { user: unknown; account: unknown }>
): Promise<Map<string, unknown>> {
  console.log('Creating test openHAB instances...');
  const openhabs = new Map<string, unknown>();

  // Create openHAB for each user based on their fixture data
  for (const [userKey, userData] of users.entries()) {
    const userFixture = TEST_FIXTURES.users[userKey as keyof typeof TEST_FIXTURES.users];
    if (!userFixture || !('uuid' in userFixture)) continue;

    const accountId = (userData.account as { _id: unknown })._id;
    const openhab = new Openhab({
      uuid: userFixture.uuid,
      secret: userFixture.secret,
      account: accountId,
      name: `openHAB for ${userKey}`,
      last_online: new Date(),
    });

    await openhab.save();
    openhabs.set(userKey, openhab);
    console.log(`  Created openHAB: ${userFixture.uuid} for user ${userKey}`);
  }

  // Create additional openHAB instances (for multi-instance testing)
  // Note: 'primary' is just a reference to testUser's openhab, so skip it
  const testUserData = users.get('testUser');
  if (testUserData) {
    const accountId = (testUserData.account as { _id: unknown })._id;
    for (const [key, openhabData] of Object.entries(TEST_FIXTURES.openhabs)) {
      // Skip 'primary' as it's already created for testUser
      if (key === 'primary') {
        openhabs.set('primary', openhabs.get('testUser'));
        continue;
      }

      const openhab = new Openhab({
        uuid: openhabData.uuid,
        secret: openhabData.secret,
        account: accountId,
        name: `Additional openHAB ${key}`,
        last_online: new Date(),
      });

      await openhab.save();
      openhabs.set(key, openhab);
      console.log(`  Created additional openHAB: ${openhabData.uuid}`);
    }
  }

  return openhabs;
}

/**
 * Create test OAuth2 clients
 */
async function createTestOAuth2Clients(): Promise<void> {
  console.log('Creating test OAuth2 clients...');

  for (const [key, clientData] of Object.entries(TEST_FIXTURES.oauth2)) {
    const client = new OAuth2Client({
      clientId: clientData.clientId,
      clientSecret: clientData.clientSecret,
      redirectUri: clientData.redirectUri,
      name: `Test Client ${key}`,
    });

    await client.save();
    console.log(`  Created OAuth2 client: ${clientData.clientId}`);
  }
}

/**
 * Create invitation codes
 */
async function createTestInvitations(): Promise<void> {
  console.log('Creating test invitations...');

  // Create a few unused invitations
  for (let i = 0; i < 3; i++) {
    await Invitation.createInvitation('test@example.com');
    console.log(`  Created invitation ${i + 1}`);
  }
}

/**
 * Main seeding function
 */
export async function seedDatabase(): Promise<void> {
  console.log('Starting database seeding...');
  console.log('');

  await clearDatabase();

  const users = await createTestUsers();
  await createTestOpenhabs(users);
  await createTestOAuth2Clients();
  await createTestInvitations();

  console.log('');
  console.log('Database seeding complete!');
  console.log('');
  console.log('Test credentials (each user has an openHAB):');
  console.log('  User: test@example.com / TestPass123! (uuid: test-uuid-001)');
  console.log('  Staff: staff@example.com / StaffPass123! (uuid: staff-uuid-001)');
  console.log('  Master: master@example.com / MasterPass123! (uuid: master-uuid-001)');
  console.log('');
  console.log('Additional openHAB instances (for test user):');
  console.log('  Secondary: test-uuid-002 / test-secret-002');
  console.log('  Concurrent: concurrent-uuid / concurrent-secret');
}

/**
 * Reset and reseed the database
 */
export async function resetDatabase(): Promise<void> {
  await clearDatabase();
  await seedDatabase();
}

// Run as CLI
if (require.main === module) {
  (async () => {
    try {
      await connectToDatabase();
      await seedDatabase();
      await disconnectFromDatabase();
      process.exit(0);
    } catch (error) {
      console.error('Seeding failed:', error);
      process.exit(1);
    }
  })();
}
