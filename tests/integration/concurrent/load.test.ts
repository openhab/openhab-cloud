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
 * Load Tests
 *
 * Tests for handling concurrent load from multiple connections.
 */

import { expect } from 'chai';
import { OpenHABTestClient, APITestClient } from '../clients';
import { TEST_FIXTURES } from '../seed-database';

const SERVER_URL = process.env['SERVER_URL'] || 'http://localhost:3000';

describe('Load Testing', function () {
  this.timeout(120000); // 2 minutes for load tests

  describe('Concurrent API Requests', function () {
    let apiClient: APITestClient;
    let openhabClient: OpenHABTestClient;

    beforeEach(async function () {
      openhabClient = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.primary.uuid,
        TEST_FIXTURES.openhabs.primary.secret
      );
      await openhabClient.connect();

      // Set up proxy handler
      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: req.path, time: Date.now() }),
      }));

      apiClient = new APITestClient(SERVER_URL);
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );
    });

    afterEach(async function () {
      await openhabClient?.disconnect();
    });

    it('should handle 50 concurrent API requests', async function () {
      const requests: Promise<any>[] = [];

      for (let i = 0; i < 50; i++) {
        requests.push(apiClient.proxyGet(`/items/item${i}`));
      }

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach((response) => {
        expect(response.status).to.equal(200);
      });
    });

    it('should handle 100 sequential API requests', async function () {
      for (let i = 0; i < 100; i++) {
        const response = await apiClient.proxyGet(`/items/item${i}`);
        expect(response.status).to.equal(200);
      }
    });

    it('should handle mixed GET and POST requests', async function () {
      const requests: Promise<any>[] = [];

      for (let i = 0; i < 25; i++) {
        requests.push(apiClient.proxyGet(`/items/item${i}`));
        requests.push(apiClient.proxyPost(`/items/item${i}`, 'ON'));
      }

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).to.equal(200);
      });
    });
  });

  describe('Concurrent Notifications', function () {
    let openhabClient: OpenHABTestClient;
    let apiClient: APITestClient;

    beforeEach(async function () {
      openhabClient = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.primary.uuid,
        TEST_FIXTURES.openhabs.primary.secret
      );
      await openhabClient.connect();

      apiClient = new APITestClient(SERVER_URL);
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );
    });

    afterEach(async function () {
      await openhabClient?.disconnect();
    });

    it('should handle rapid notification sending', async function () {
      const count = 20;

      for (let i = 0; i < count; i++) {
        openhabClient.sendNotification(
          TEST_FIXTURES.users.testUser.username,
          `Load test notification ${i}`
        );
      }

      // Wait for notifications to be processed
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify some notifications were stored
      const response = await apiClient.getNotifications(count);
      expect(response.status).to.equal(200);
      expect(response.body.length).to.be.greaterThan(0);
    });

    it('should handle broadcast notifications under load', async function () {
      const count = 10;

      for (let i = 0; i < count; i++) {
        openhabClient.sendBroadcastNotification(`Broadcast load test ${i}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const response = await apiClient.getNotifications();
      expect(response.status).to.equal(200);
    });
  });

  describe('Mixed WebSocket and HTTP Load', function () {
    it('should handle WebSocket events during HTTP load', async function () {
      const openhabClient = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.primary.uuid,
        TEST_FIXTURES.openhabs.primary.secret
      );
      await openhabClient.connect();

      let requestCount = 0;
      openhabClient.onRequest((req) => {
        requestCount++;
        return {
          id: req.id,
          status: 200,
          headers: {},
          body: JSON.stringify({ count: requestCount }),
        };
      });

      const apiClient = new APITestClient(SERVER_URL);
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      try {
        // Send notifications while making API requests
        const notificationPromise = (async () => {
          for (let i = 0; i < 10; i++) {
            openhabClient.sendNotification(
              TEST_FIXTURES.users.testUser.username,
              `Mixed load test ${i}`
            );
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        })();

        // Make API requests concurrently
        const apiPromises = Array.from({ length: 20 }, (_, i) =>
          apiClient.proxyGet(`/items/item${i}`)
        );

        await Promise.all([notificationPromise, ...apiPromises]);

        expect(requestCount).to.equal(20);
      } finally {
        await openhabClient.disconnect();
      }
    });
  });

  describe('Connection Stability Under Load', function () {
    it('should maintain connection during sustained load', async function () {
      const openhabClient = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.primary.uuid,
        TEST_FIXTURES.openhabs.primary.secret
      );
      await openhabClient.connect();

      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: {},
        body: 'OK',
      }));

      const apiClient = new APITestClient(SERVER_URL);
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      try {
        // Sustained load over 5 seconds
        const startTime = Date.now();
        const duration = 5000;
        let requestCount = 0;

        while (Date.now() - startTime < duration) {
          await apiClient.proxyGet('/items');
          requestCount++;
        }

        // Connection should still be active
        expect(openhabClient.isConnected).to.be.true;
        expect(requestCount).to.be.greaterThan(10);
      } finally {
        await openhabClient.disconnect();
      }
    });

    it('should handle large response bodies', async function () {
      const openhabClient = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.primary.uuid,
        TEST_FIXTURES.openhabs.primary.secret
      );
      await openhabClient.connect();

      // Generate large response (100KB)
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        name: `Item${i}`,
        state: 'ON',
        type: 'Switch',
        label: `Item ${i} Label with some extra text`,
        category: 'switch',
        tags: ['tag1', 'tag2', 'tag3'],
        groupNames: ['group1', 'group2'],
      }));

      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(largeData),
      }));

      const apiClient = new APITestClient(SERVER_URL);
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      try {
        const response = await apiClient.proxyGet('/items');

        expect(response.status).to.equal(200);
        expect(response.body).to.have.length(1000);
      } finally {
        await openhabClient.disconnect();
      }
    });
  });

  describe('Response Time', function () {
    it('should respond within reasonable time under normal load', async function () {
      const openhabClient = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.primary.uuid,
        TEST_FIXTURES.openhabs.primary.secret
      );
      await openhabClient.connect();

      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: {},
        body: JSON.stringify({ timestamp: Date.now() }),
      }));

      const apiClient = new APITestClient(SERVER_URL);
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      try {
        const responseTimes: number[] = [];

        for (let i = 0; i < 10; i++) {
          const start = Date.now();
          await apiClient.proxyGet('/items');
          responseTimes.push(Date.now() - start);
        }

        // Calculate average response time
        const avg =
          responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

        // Average should be under 500ms
        expect(avg).to.be.lessThan(500);
      } finally {
        await openhabClient.disconnect();
      }
    });
  });
});
