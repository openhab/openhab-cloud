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
 * Race Condition Tests
 *
 * Tests for concurrent connection handling and race conditions.
 */

import { expect } from 'chai';
import { OpenHABTestClient, ClientManager } from '../clients';
import { TEST_FIXTURES } from '../seed-database';

const SERVER_URL = process.env['SERVER_URL'] || 'http://localhost:3000';

describe('Race Conditions', function () {
  this.timeout(60000);

  describe('Simultaneous Connection Attempts', function () {
    it('should handle 10 simultaneous connections with same UUID', async function () {
      const clients: OpenHABTestClient[] = [];

      // Create 10 clients with the same UUID
      for (let i = 0; i < 10; i++) {
        clients.push(
          new OpenHABTestClient(
            SERVER_URL,
            TEST_FIXTURES.openhabs.concurrent.uuid,
            TEST_FIXTURES.openhabs.concurrent.secret
          )
        );
      }

      // Connect all simultaneously
      const results = await Promise.allSettled(
        clients.map((c) => c.connect())
      );

      // Count successes and failures
      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      // Exactly one should succeed (connection locking)
      expect(successes).to.have.length(1);
      expect(failures).to.have.length(9);

      // All failures should be lock-related
      failures.forEach((failure) => {
        if (failure.status === 'rejected') {
          const message = (failure.reason as Error).message.toLowerCase();
          expect(message).to.satisfy(
            (msg: string) => msg.includes('lock') || msg.includes('already')
          );
        }
      });

      // Disconnect the successful client
      const connectedClient = clients.find((c) => c.isConnected);
      if (connectedClient) {
        await connectedClient.disconnect();
      }
    });

    it('should handle rapid connect/disconnect cycles', async function () {
      const cycles = 5;

      for (let i = 0; i < cycles; i++) {
        const client = new OpenHABTestClient(
          SERVER_URL,
          TEST_FIXTURES.openhabs.concurrent.uuid,
          TEST_FIXTURES.openhabs.concurrent.secret
        );

        await client.connect();
        expect(client.isConnected).to.be.true;

        await client.disconnect();
        expect(client.isConnected).to.be.false;

        // Small delay to allow lock release
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    });

    it('should allow reconnection after disconnect', async function () {
      const client1 = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.concurrent.uuid,
        TEST_FIXTURES.openhabs.concurrent.secret
      );

      // First connection
      await client1.connect();
      expect(client1.isConnected).to.be.true;

      // Disconnect
      await client1.disconnect();

      // Wait for lock release
      await new Promise((resolve) => setTimeout(resolve, 500));

      // New client should be able to connect
      const client2 = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.concurrent.uuid,
        TEST_FIXTURES.openhabs.concurrent.secret
      );

      await client2.connect();
      expect(client2.isConnected).to.be.true;

      await client2.disconnect();
    });

    it('should block connection while another is active', async function () {
      const client1 = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.secondary.uuid,
        TEST_FIXTURES.openhabs.secondary.secret
      );

      await client1.connect();
      expect(client1.isConnected).to.be.true;

      try {
        // Try to connect second client
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
      } finally {
        await client1.disconnect();
      }
    });
  });

  describe('Multiple Different UUIDs', function () {
    it('should allow 5 different UUIDs to connect simultaneously', async function () {
      const manager = new ClientManager(SERVER_URL);

      // Create test UUIDs - we'll use primary and secondary from fixtures
      // and create additional ones for testing
      manager.createClient(
        TEST_FIXTURES.openhabs.primary.uuid,
        TEST_FIXTURES.openhabs.primary.secret
      );
      manager.createClient(
        TEST_FIXTURES.openhabs.secondary.uuid,
        TEST_FIXTURES.openhabs.secondary.secret
      );
      manager.createClient(
        TEST_FIXTURES.openhabs.concurrent.uuid,
        TEST_FIXTURES.openhabs.concurrent.secret
      );

      try {
        await manager.connectAll();
        expect(manager.connectedCount).to.equal(3);
      } finally {
        await manager.disconnectAll();
      }
    });

    it('should isolate connection locks per UUID', async function () {
      const client1 = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.primary.uuid,
        TEST_FIXTURES.openhabs.primary.secret
      );

      const client2 = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.secondary.uuid,
        TEST_FIXTURES.openhabs.secondary.secret
      );

      try {
        // Both should connect successfully
        await Promise.all([client1.connect(), client2.connect()]);

        expect(client1.isConnected).to.be.true;
        expect(client2.isConnected).to.be.true;
      } finally {
        await Promise.all([client1.disconnect(), client2.disconnect()]);
      }
    });
  });

  describe('Connection During Lock Transition', function () {
    it('should handle connection attempt during lock release', async function () {
      const client1 = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.concurrent.uuid,
        TEST_FIXTURES.openhabs.concurrent.secret
      );

      await client1.connect();

      // Start disconnect and immediately try to connect new client
      const disconnectPromise = client1.disconnect();

      // Small delay to start during transition
      await new Promise((resolve) => setTimeout(resolve, 50));

      const client2 = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.concurrent.uuid,
        TEST_FIXTURES.openhabs.concurrent.secret
      );

      // Wait for disconnect to complete
      await disconnectPromise;

      // Give a bit more time for lock release
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Now should be able to connect
      await client2.connect();
      expect(client2.isConnected).to.be.true;

      await client2.disconnect();
    });

    it('should maintain consistency under stress', async function () {
      const iterations = 10;
      const results: boolean[] = [];

      for (let i = 0; i < iterations; i++) {
        const client = new OpenHABTestClient(
          SERVER_URL,
          TEST_FIXTURES.openhabs.concurrent.uuid,
          TEST_FIXTURES.openhabs.concurrent.secret
        );

        try {
          await client.connect();
          results.push(client.isConnected);
          await client.disconnect();
        } catch {
          results.push(false);
        }

        // Small delay between iterations
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // All should succeed (sequential, with delays)
      expect(results.filter((r) => r === true).length).to.equal(iterations);
    });
  });
});
