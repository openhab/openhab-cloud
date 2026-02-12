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
 * WebSocket Connection Tests
 *
 * Tests for openHAB WebSocket connection authentication and locking.
 */

import { expect } from 'chai';
import { OpenHABTestClient, ClientManager } from '../clients';
import { TEST_FIXTURES } from '../seed-database';

const SERVER_URL = process.env['SERVER_URL'] || 'http://localhost:3000';

describe('WebSocket Connection', function () {
  // Increase timeout for connection tests
  this.timeout(30000);

  describe('Authentication', function () {
    it('should connect with valid UUID and secret', async function () {
      const client = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.primary.uuid,
        TEST_FIXTURES.openhabs.primary.secret
      );

      await client.connect();
      expect(client.isConnected).to.be.true;

      await client.disconnect();
    });

    it('should reject invalid credentials', async function () {
      const client = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.primary.uuid,
        'wrong-secret'
      );

      try {
        await client.connect();
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err).to.be.instanceOf(Error);
        // Connection should fail with auth error
      }

      expect(client.isConnected).to.be.false;
    });

    it('should reject non-existent UUID', async function () {
      const client = new OpenHABTestClient(
        SERVER_URL,
        'non-existent-uuid',
        'some-secret'
      );

      try {
        await client.connect();
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err).to.be.instanceOf(Error);
      }

      expect(client.isConnected).to.be.false;
    });

    it('should handle missing credentials', async function () {
      const client = new OpenHABTestClient(SERVER_URL, '', '');

      try {
        await client.connect();
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err).to.be.instanceOf(Error);
      }

      expect(client.isConnected).to.be.false;
    });

    it('should include openHAB version in connection', async function () {
      const client = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.primary.uuid,
        TEST_FIXTURES.openhabs.primary.secret,
        '4.1.0'
      );

      await client.connect();
      expect(client.isConnected).to.be.true;

      // Version is sent to server in headers
      await client.disconnect();
    });
  });

  describe('Connection Locking', function () {
    let client1: OpenHABTestClient;

    beforeEach(async function () {
      // Connect first client
      client1 = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.secondary.uuid,
        TEST_FIXTURES.openhabs.secondary.secret
      );
      await client1.connect();
    });

    afterEach(async function () {
      await client1?.disconnect();
    });

    it('should allow single connection per UUID', async function () {
      expect(client1.isConnected).to.be.true;
    });

    it('should reject second connection with same UUID', async function () {
      const client2 = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.secondary.uuid,
        TEST_FIXTURES.openhabs.secondary.secret
      );

      try {
        await client2.connect();
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err).to.be.instanceOf(Error);
        const message = (err as Error).message.toLowerCase();
        expect(message).to.include('lock');
      }

      expect(client2.isConnected).to.be.false;
    });

    it('should release lock on disconnect', async function () {
      // Disconnect first client
      await client1.disconnect();
      expect(client1.isConnected).to.be.false;

      // Wait a moment for lock to be released
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Second client should now be able to connect
      const client2 = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.secondary.uuid,
        TEST_FIXTURES.openhabs.secondary.secret
      );

      await client2.connect();
      expect(client2.isConnected).to.be.true;

      await client2.disconnect();
    });
  });

  describe('Connection Stability', function () {
    it('should maintain connection over time', async function () {
      const client = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.primary.uuid,
        TEST_FIXTURES.openhabs.primary.secret
      );

      await client.connect();
      expect(client.isConnected).to.be.true;

      // Wait for a few seconds
      await new Promise((resolve) => setTimeout(resolve, 3000));

      expect(client.isConnected).to.be.true;

      await client.disconnect();
    });

    it('should handle clean disconnect', async function () {
      const client = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.primary.uuid,
        TEST_FIXTURES.openhabs.primary.secret
      );

      await client.connect();
      expect(client.isConnected).to.be.true;

      await client.disconnect();
      expect(client.isConnected).to.be.false;
    });
  });

  describe('Multiple Different UUIDs', function () {
    it('should allow connections from different UUIDs simultaneously', async function () {
      const manager = new ClientManager(SERVER_URL);

      // Create clients for different openHABs
      manager.createClient(
        TEST_FIXTURES.openhabs.primary.uuid,
        TEST_FIXTURES.openhabs.primary.secret
      );
      manager.createClient(
        TEST_FIXTURES.openhabs.secondary.uuid,
        TEST_FIXTURES.openhabs.secondary.secret
      );

      // Connect all
      await manager.connectAll();

      expect(manager.connectedCount).to.equal(2);

      // Disconnect all
      await manager.disconnectAll();
    });
  });
});
