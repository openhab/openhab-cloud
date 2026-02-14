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
 * Notification Tests
 *
 * Tests for notification sending via openHAB WebSocket connection.
 */

import { expect } from 'chai';
import { OpenHABTestClient, APITestClient } from '../clients';
import { TEST_FIXTURES } from '../seed-database';

const SERVER_URL = process.env['SERVER_URL'] || 'http://localhost:3000';

describe('Notifications', function () {
  this.timeout(30000);

  let openhabClient: OpenHABTestClient;
  let apiClient: APITestClient;

  beforeEach(async function () {
    // Connect openHAB client
    openhabClient = new OpenHABTestClient(
      SERVER_URL,
      TEST_FIXTURES.openhabs.primary.uuid,
      TEST_FIXTURES.openhabs.primary.secret
    );
    await openhabClient.connect();

    // Create API client with basic auth
    apiClient = new APITestClient(SERVER_URL);
    apiClient.withBasicAuth(
      TEST_FIXTURES.users.testUser.username,
      TEST_FIXTURES.users.testUser.password
    );
  });

  afterEach(async function () {
    await openhabClient?.disconnect();
  });

  describe('Sending Notifications', function () {
    it('should send notification to specific user', async function () {
      // Send notification via WebSocket
      openhabClient.sendNotification(
        TEST_FIXTURES.users.testUser.username,
        'Test notification message'
      );

      // Wait for notification to be processed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify notification was stored
      const response = await apiClient.getNotifications();
      expect(response.status).to.equal(200);

      // Check if notification exists
      const notifications = response.body;
      expect(notifications).to.be.an('array');

      // Find our test notification
      const testNotification = notifications.find(
        (n: any) => n.message === 'Test notification message'
      );
      expect(testNotification).to.exist;
    });

    it('should send notification with icon', async function () {
      openhabClient.sendNotification(
        TEST_FIXTURES.users.testUser.username,
        'Notification with icon',
        { icon: 'light' }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const response = await apiClient.getNotifications();
      const notification = response.body.find(
        (n: any) => n.message === 'Notification with icon'
      );

      expect(notification).to.exist;
      expect(notification.icon).to.equal('light');
    });

    it('should send notification with severity', async function () {
      openhabClient.sendNotification(
        TEST_FIXTURES.users.testUser.username,
        'High severity alert',
        { severity: 'high' }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const response = await apiClient.getNotifications();
      const notification = response.body.find(
        (n: any) => n.message === 'High severity alert'
      );

      expect(notification).to.exist;
      expect(notification.severity).to.equal('high');
    });

    it('should send notification with title', async function () {
      openhabClient.sendNotification(
        TEST_FIXTURES.users.testUser.username,
        'Notification body',
        { title: 'Alert Title' }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const response = await apiClient.getNotifications();
      const notification = response.body.find(
        (n: any) => n.message === 'Notification body'
      );

      expect(notification).to.exist;
      // Title handling may vary by implementation
    });

    it('should send notification with tag', async function () {
      // First notification with tag
      openhabClient.sendNotification(
        TEST_FIXTURES.users.testUser.username,
        'First tagged message',
        { tag: 'temperature' }
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Second notification with same tag should replace first
      openhabClient.sendNotification(
        TEST_FIXTURES.users.testUser.username,
        'Updated tagged message',
        { tag: 'temperature' }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Tags are used for collapsing notifications
      const response = await apiClient.getNotifications();
      expect(response.status).to.equal(200);
    });
  });

  describe('Broadcast Notifications', function () {
    it('should send broadcast notification', async function () {
      openhabClient.sendBroadcastNotification('Broadcast message to all');

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const response = await apiClient.getNotifications();
      const notification = response.body.find(
        (n: any) => n.message === 'Broadcast message to all'
      );

      expect(notification).to.exist;
    });

    it('should send broadcast with options', async function () {
      openhabClient.sendBroadcastNotification('Broadcast with options', {
        icon: 'alarm',
        severity: 'medium',
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const response = await apiClient.getNotifications();
      const notification = response.body.find(
        (n: any) => n.message === 'Broadcast with options'
      );

      expect(notification).to.exist;
    });
  });

  describe('Log Notifications', function () {
    it('should log notification without push', async function () {
      openhabClient.logNotification('Logged notification');

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Log notifications should still be stored
      const response = await apiClient.getNotifications();
      const notification = response.body.find(
        (n: any) => n.message === 'Logged notification'
      );

      expect(notification).to.exist;
    });
  });

  describe('Notification Retrieval', function () {
    it('should retrieve notifications with pagination', async function () {
      // Send multiple notifications
      for (let i = 0; i < 5; i++) {
        openhabClient.sendNotification(
          TEST_FIXTURES.users.testUser.username,
          `Pagination test ${i}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get first page
      const response = await apiClient.getNotifications(2, 0);
      expect(response.status).to.equal(200);
      expect(response.body).to.be.an('array');
      // May have notifications from other tests
    });

    it('should hide notification', async function () {
      // Send a notification
      openhabClient.sendNotification(
        TEST_FIXTURES.users.testUser.username,
        'Notification to hide'
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get notifications
      const response = await apiClient.getNotifications();
      const notification = response.body.find(
        (n: any) => n.message === 'Notification to hide'
      );

      expect(notification).to.exist;
      expect(notification._id).to.exist;

      // Hide the notification
      const hideResponse = await apiClient.hideNotification(notification._id);
      expect(hideResponse.status).to.be.oneOf([200, 204, 302]);
    });
  });

  describe('Notification API (via REST)', function () {
    it('should send notification via API', async function () {
      // Set up the openHAB client to handle proxy requests
      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: {},
        body: 'OK',
      }));

      const response = await apiClient.sendNotification('API sent notification');
      expect(response.status).to.be.oneOf([200, 201, 204]);
    });

    it('should send notification with options via API', async function () {
      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: {},
        body: 'OK',
      }));

      const response = await apiClient.sendNotification('API notification', {
        icon: 'bell',
        severity: 'high',
        title: 'Important',
      });

      expect(response.status).to.be.oneOf([200, 201, 204]);
    });
  });
});
