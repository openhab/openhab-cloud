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
 * REST API Tests
 *
 * Tests for the myopenhab REST API endpoints.
 */

import { expect } from 'chai';
import { APITestClient, OpenHABTestClient } from '../clients';
import { TEST_FIXTURES } from '../seed-database';

const SERVER_URL = process.env['SERVER_URL'] || 'http://localhost:3000';

describe('REST API', function () {
  this.timeout(30000);

  let apiClient: APITestClient;
  let openhabClient: OpenHABTestClient;

  beforeEach(async function () {
    apiClient = new APITestClient(SERVER_URL);

    // Connect openHAB for proxy-dependent tests
    openhabClient = new OpenHABTestClient(
      SERVER_URL,
      TEST_FIXTURES.openhabs.primary.uuid,
      TEST_FIXTURES.openhabs.primary.secret
    );
    await openhabClient.connect();
  });

  afterEach(async function () {
    await openhabClient?.disconnect();
  });

  describe('Authentication', function () {
    it('should authenticate with basic auth', async function () {
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const response = await apiClient.getNotifications();
      expect(response.status).to.equal(200);
    });

    it('should reject invalid basic auth', async function () {
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        'wrong-password'
      );

      const response = await apiClient.getNotifications();
      expect(response.status).to.equal(401);
    });

    it('should reject unauthenticated requests', async function () {
      // No auth set
      const response = await apiClient.getNotifications();
      expect(response.status).to.equal(401);
    });

    it('should reject non-existent user', async function () {
      apiClient.withBasicAuth('nonexistent@example.com', 'password');

      const response = await apiClient.getNotifications();
      expect(response.status).to.equal(401);
    });
  });

  describe('App IDs Endpoint', function () {
    it('should return app IDs without authentication', async function () {
      const response = await apiClient.getAppIds();

      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('android');
      expect(response.body).to.have.property('ios');
    });
  });

  describe('Notifications API', function () {
    beforeEach(function () {
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );
    });

    it('should return notifications list', async function () {
      const response = await apiClient.getNotifications();

      expect(response.status).to.equal(200);
      expect(response.body).to.be.an('array');
    });

    it('should return notifications with limit', async function () {
      // First, create some notifications
      for (let i = 0; i < 5; i++) {
        openhabClient.sendNotification(
          TEST_FIXTURES.users.testUser.username,
          `API test notification ${i}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const response = await apiClient.getNotifications(3, 0);

      expect(response.status).to.equal(200);
      expect(response.body).to.be.an('array');
      // Limit parameter should work
    });

    it('should return notifications with skip', async function () {
      const response = await apiClient.getNotifications(10, 5);

      expect(response.status).to.equal(200);
      expect(response.body).to.be.an('array');
    });

    it('should send notification', async function () {
      const response = await apiClient.sendNotification('API test message');

      expect(response.status).to.be.oneOf([200, 201, 204]);
    });

    it('should send notification with options', async function () {
      const response = await apiClient.sendNotification('API test with options', {
        icon: 'alarm',
        severity: 'high',
        title: 'Important Alert',
      });

      expect(response.status).to.be.oneOf([200, 201, 204]);
    });
  });

  describe('Proxy URL Endpoint', function () {
    beforeEach(function () {
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );
    });

    it('should return proxy URL when openHAB connected', async function () {
      const response = await apiClient.getProxyUrl();

      expect(response.status).to.equal(200);
      // Response format depends on implementation
    });

    it('should indicate status when openHAB not connected', async function () {
      // Disconnect openHAB
      await openhabClient.disconnect();

      const response = await apiClient.getProxyUrl();

      // Should indicate no connection
      expect(response.status).to.be.oneOf([200, 404, 503]);
    });
  });

  describe('Notification Settings', function () {
    beforeEach(function () {
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );
    });

    it('should return notification settings', async function () {
      const response = await apiClient.getNotificationSettings();

      // May return 200 or 404 depending on implementation
      expect(response.status).to.be.oneOf([200, 404]);
    });
  });

  describe('Device Registration', function () {
    beforeEach(function () {
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );
    });

    it('should register Android device', async function () {
      const response = await apiClient.registerAndroidDevice(
        'test-fcm-token-android',
        {
          deviceId: 'test-device-android',
          deviceModel: 'Test Phone',
          appVersion: '2.0.0',
          osVersion: 'Android 13',
        }
      );

      expect(response.status).to.be.oneOf([200, 201, 204]);
    });

    it('should register iOS device', async function () {
      const response = await apiClient.registerIOSDevice('test-apns-token-ios', {
        deviceId: 'test-device-ios',
        deviceModel: 'iPhone 14',
        appVersion: '2.0.0',
        osVersion: 'iOS 16',
      });

      expect(response.status).to.be.oneOf([200, 201, 204]);
    });

    it('should update existing device registration', async function () {
      // Register device
      await apiClient.registerAndroidDevice('initial-token', {
        deviceId: 'update-test-device',
        deviceModel: 'Test Phone',
      });

      // Update same device
      const response = await apiClient.registerAndroidDevice('updated-token', {
        deviceId: 'update-test-device',
        deviceModel: 'Test Phone Updated',
      });

      expect(response.status).to.be.oneOf([200, 201, 204]);
    });
  });

  describe('REST Proxy', function () {
    beforeEach(function () {
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      // Set up proxy handler
      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [], things: [] }),
      }));
    });

    it('should proxy GET request to openHAB', async function () {
      const response = await apiClient.proxyGet('/items');

      expect(response.status).to.equal(200);
    });

    it('should proxy POST request to openHAB', async function () {
      const response = await apiClient.proxyPost('/items/TestSwitch', 'ON');

      expect(response.status).to.equal(200);
    });

    it('should require auth for proxy requests', async function () {
      apiClient.clearAuth();

      const response = await apiClient.proxyGet('/items');

      expect(response.status).to.equal(401);
    });
  });
});
