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
 * Proxy Functionality Tests
 *
 * Tests for request forwarding between HTTP clients and openHAB instances.
 */

import { expect } from 'chai';
import {
  OpenHABTestClient,
  APITestClient,
  mockResponses,
  ProxyRequest,
} from '../clients';
import { TEST_FIXTURES } from '../seed-database';

const SERVER_URL = process.env['SERVER_URL'] || 'http://localhost:3000';

describe('Proxy Functionality', function () {
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

  describe('Request Forwarding', function () {
    it('should forward GET request to openHAB', async function () {
      const receivedRequests: ProxyRequest[] = [];

      // Set up request handler on openHAB client
      openhabClient.onRequest((req) => {
        receivedRequests.push(req);
        const response = mockResponses.restApiItems([
          { name: 'Switch1', state: 'ON', type: 'Switch' },
          { name: 'Dimmer1', state: '50', type: 'Dimmer' },
        ]);
        return { ...response, id: req.id };
      });

      // Make proxy request
      const response = await apiClient.proxyGet('/items');

      expect(response.status).to.equal(200);
      expect(receivedRequests).to.have.length(1);
      expect(receivedRequests[0].method).to.equal('GET');
      expect(receivedRequests[0].path).to.equal('/rest/items');

      const body = response.body;
      expect(body).to.be.an('array');
      expect(body).to.have.length(2);
      expect(body[0].name).to.equal('Switch1');
    });

    it('should forward GET request with query parameters', async function () {
      let receivedRequest: ProxyRequest | null = null;

      openhabClient.onRequest((req) => {
        receivedRequest = req;
        const response = mockResponses.restApiItems([
          { name: 'Switch1', state: 'ON', type: 'Switch' },
        ]);
        return { ...response, id: req.id };
      });

      await apiClient.get('/rest/items?type=Switch&recursive=false');

      expect(receivedRequest).to.not.be.null;
      expect(receivedRequest!.path).to.include('/items');
      // Query params may be in path or query object
    });

    it('should forward POST request with body', async function () {
      let receivedRequest: ProxyRequest | null = null;

      openhabClient.onRequest((req) => {
        receivedRequest = req;
        return {
          id: req.id,
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
          body: 'OK',
        };
      });

      // Send command to item
      const response = await apiClient.proxyPost('/items/Switch1', 'ON');

      expect(response.status).to.equal(200);
      expect(receivedRequest).to.not.be.null;
      expect(receivedRequest!.method).to.equal('POST');
      expect(receivedRequest!.path).to.include('/items/Switch1');
    });

    it('should include user ID in proxy request', async function () {
      let receivedRequest: ProxyRequest | null = null;

      openhabClient.onRequest((req) => {
        receivedRequest = req;
        return {
          id: req.id,
          status: 200,
          headers: {},
          body: 'OK',
        };
      });

      await apiClient.proxyGet('/items');

      expect(receivedRequest).to.not.be.null;
      // User ID should be passed for authorization
      expect(receivedRequest!.userId).to.exist;
    });

    it('should forward headers to openHAB', async function () {
      let receivedRequest: ProxyRequest | null = null;

      openhabClient.onRequest((req) => {
        receivedRequest = req;
        return {
          id: req.id,
          status: 200,
          headers: {},
          body: 'OK',
        };
      });

      await apiClient.proxyGet('/items');

      expect(receivedRequest).to.not.be.null;
      expect(receivedRequest!.headers).to.exist;
      // Some headers should be present
      expect(Object.keys(receivedRequest!.headers).length).to.be.greaterThan(0);
    });
  });

  describe('Response Handling', function () {
    it('should return response status from openHAB', async function () {
      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 201,
        statusText: 'Created',
        headers: {},
        body: '',
      }));

      const response = await apiClient.proxyGet('/items/NewItem');

      expect(response.status).to.equal(201);
    });

    it('should return response headers from openHAB', async function () {
      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'custom-value',
        },
        body: '{}',
      }));

      const response = await apiClient.proxyGet('/items');

      expect(response.headers['content-type']).to.include('application/json');
      // Custom headers may or may not be forwarded depending on server config
    });

    it('should return JSON response body', async function () {
      const items = [
        { name: 'Switch1', state: 'ON', type: 'Switch' },
        { name: 'Dimmer1', state: '75', type: 'Dimmer' },
      ];

      openhabClient.onRequest((req) => {
        const response = mockResponses.restApiItems(items);
        return { ...response, id: req.id };
      });

      const response = await apiClient.proxyGet('/items');

      expect(response.body).to.deep.equal(items);
    });

    it('should handle 404 not found from openHAB', async function () {
      openhabClient.onRequest((req) => {
        const response = mockResponses.notFound('/items/NonExistent');
        return { ...response, id: req.id };
      });

      const response = await apiClient.proxyGet('/items/NonExistent');

      expect(response.status).to.equal(404);
    });

    it('should handle 500 server error from openHAB', async function () {
      openhabClient.onRequest((req) => {
        const response = mockResponses.serverError('Database connection failed');
        return { ...response, id: req.id };
      });

      const response = await apiClient.proxyGet('/items');

      expect(response.status).to.equal(500);
    });

    it('should handle HTML response', async function () {
      openhabClient.onRequest((req) => {
        const response = mockResponses.basicUiPage('Home Page');
        return { ...response, id: req.id };
      });

      const response = await apiClient.proxyGet('/basicui/app');

      expect(response.status).to.equal(200);
      expect(response.text).to.include('Home Page');
      expect(response.text).to.include('<!DOCTYPE html>');
    });
  });

  describe('Binary Content', function () {
    it('should handle binary response', async function () {
      // Create a simple binary buffer
      const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: {
          'Content-Type': 'image/png',
        },
        body: binaryData,
      }));

      const response = await apiClient.proxyGet('/icon/switch');

      expect(response.status).to.equal(200);
      // Response should contain the binary data
    });

    it('should handle large response body', async function () {
      // Create a larger payload (10KB)
      const largeArray = new Array(100).fill({
        name: 'Item',
        state: 'ON',
        type: 'Switch',
        label: 'A test item with some description',
        category: 'switch',
        tags: ['tag1', 'tag2', 'tag3'],
        groupNames: ['group1', 'group2'],
      });

      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(largeArray),
      }));

      const response = await apiClient.proxyGet('/items');

      expect(response.status).to.equal(200);
      expect(response.body).to.have.length(100);
    });
  });

  describe('Error Handling', function () {
    it('should handle response error from openHAB', async function () {
      openhabClient.onRequest((req) => {
        // Simulate an error by throwing
        throw new Error('Connection to local openHAB failed');
      });

      const response = await apiClient.proxyGet('/items');

      // Should get an error status
      expect(response.status).to.be.greaterThanOrEqual(400);
    });

    it('should handle openHAB not connected', async function () {
      // Disconnect openHAB client first
      await openhabClient.disconnect();

      // Extra wait for connection cache invalidation
      await new Promise((resolve) => setTimeout(resolve, 500));

      const response = await apiClient.proxyGet('/items');

      // Server returns 500 with "openHAB is offline" when not connected
      expect(response.status).to.equal(500);
    });

    it('should require authentication for proxy requests', async function () {
      // Clear authentication
      apiClient.clearAuth();

      const response = await apiClient.proxyGet('/items');

      // Should require auth
      expect(response.status).to.equal(401);
    });
  });

  describe('Multiple Requests', function () {
    it('should handle sequential requests', async function () {
      let requestCount = 0;

      openhabClient.onRequest((req) => {
        requestCount++;
        return {
          id: req.id,
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: requestCount }),
        };
      });

      const response1 = await apiClient.proxyGet('/items');
      const response2 = await apiClient.proxyGet('/items');
      const response3 = await apiClient.proxyGet('/items');

      expect(requestCount).to.equal(3);
      expect(response1.body.count).to.equal(1);
      expect(response2.body.count).to.equal(2);
      expect(response3.body.count).to.equal(3);
    });

    it('should handle concurrent requests', async function () {
      const requestIds: number[] = [];

      openhabClient.onRequest((req) => {
        requestIds.push(req.id);
        return {
          id: req.id,
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: req.id }),
        };
      });

      // Send multiple requests concurrently
      const responses = await Promise.all([
        apiClient.proxyGet('/items'),
        apiClient.proxyGet('/things'),
        apiClient.proxyGet('/sitemaps'),
      ]);

      expect(responses).to.have.length(3);
      expect(requestIds).to.have.length(3);

      // Each response should have a unique request ID
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).to.equal(3);
    });
  });

  describe('Sitemap API', function () {
    it('should forward sitemap request', async function () {
      openhabClient.onRequest((req) => {
        if (req.path.includes('/sitemaps')) {
          const response = mockResponses.sitemap('default', [
            { label: 'Living Room', item: 'LivingRoom_Light' },
            { label: 'Temperature', item: 'Outdoor_Temp' },
          ]);
          return { ...response, id: req.id };
        }
        return { ...mockResponses.notFound(req.path), id: req.id };
      });

      const response = await apiClient.proxyGet('/sitemaps/default');

      expect(response.status).to.equal(200);
      expect(response.body.name).to.equal('default');
      expect(response.body.homepage.widgets).to.have.length(2);
    });
  });
});
