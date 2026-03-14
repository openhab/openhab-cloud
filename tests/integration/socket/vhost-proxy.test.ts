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
 * VHost Proxy Detection Integration Tests
 *
 * Validates that the vhost detection middleware correctly routes requests
 * based on hostname: proxy hostname requests are proxied to openHAB for
 * any path, while main hostname requests use normal web routes.
 *
 * Test config (docker/config.test.json):
 *   host: "openhab-cloud.test"
 *   proxyHost: "proxy.openhab-cloud.test"
 *   port: 3000
 */

import { expect } from 'chai';
import {
  OpenHABTestClient,
  APITestClient,
  ProxyRequest,
} from '../clients';
import { TEST_FIXTURES } from '../seed-database';

const SERVER_URL = process.env['SERVER_URL'] || 'http://localhost:3000';

// These must match docker/config.test.json
const PROXY_HOST = 'proxy.openhab-cloud.test';
const REMOTE_HOST = 'remote.openhab-cloud.test';
const MAIN_HOST = 'openhab-cloud.test';

describe('VHost Proxy Detection', function () {
  this.timeout(30000);

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
  });

  afterEach(async function () {
    apiClient.clearHost();
    apiClient.clearAuth();
    await openhabClient?.disconnect();
  });

  // ============================================
  // Group 1: Vhost proxy via proxyHost
  // ============================================

  describe('Vhost proxy mode (Host = proxyHost)', function () {
    beforeEach(function () {
      apiClient
        .withHost(PROXY_HOST)
        .withBasicAuth(
          TEST_FIXTURES.users.testUser.username,
          TEST_FIXTURES.users.testUser.password
        );
    });

    it('should proxy GET /rest/items via vhost', async function () {
      const receivedRequests: ProxyRequest[] = [];

      openhabClient.onRequest((req) => {
        receivedRequests.push(req);
        return {
          id: req.id,
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{ name: 'Switch1', state: 'ON' }]),
        };
      });

      const response = await apiClient.get('/rest/items');

      expect(response.status).to.equal(200);
      expect(receivedRequests).to.have.length(1);
      expect(receivedRequests[0].path).to.equal('/rest/items');
    });

    it('should proxy web page paths via vhost (not return login page)', async function () {
      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: 'openhab-proxied-response',
      }));

      const response = await apiClient.get('/login');

      expect(response.status).to.equal(200);
      expect(response.text).to.equal('openhab-proxied-response');
      // Should NOT contain HTML login form
      expect(response.text).to.not.include('<form');
    });

    it('should proxy root path via vhost (not return homepage)', async function () {
      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: 'openhab-root-response',
      }));

      const response = await apiClient.get('/');

      expect(response.status).to.equal(200);
      expect(response.text).to.equal('openhab-root-response');
    });

    it('should proxy POST requests via vhost', async function () {
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

      const response = await apiClient.post('/items/Switch1', 'ON');

      expect(response.status).to.equal(200);
      expect(receivedRequest).to.not.be.null;
      expect(receivedRequest!.method).to.equal('POST');
      expect(receivedRequest!.path).to.include('/items/Switch1');
    });

    it('should not modify the request path (no /remote prefix)', async function () {
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

      await apiClient.get('/my/custom/path');

      expect(receivedRequest).to.not.be.null;
      expect(receivedRequest!.path).to.equal('/my/custom/path');
      expect(receivedRequest!.path).to.not.include('/remote');
    });

    it('should forward proxyHost as Host header to openHAB', async function () {
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

      await apiClient.get('/items');

      expect(receivedRequest).to.not.be.null;
      expect(receivedRequest!.headers['host']).to.equal(
        `${PROXY_HOST}:3000`
      );
    });

    it('should require authentication for vhost proxy', async function () {
      apiClient.clearAuth();

      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: {},
        body: 'should-not-reach',
      }));

      const response = await apiClient.get('/items');

      expect(response.status).to.equal(401);
    });

    it('should not require CSRF token for POST via vhost', async function () {
      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: 'OK',
      }));

      // POST without CSRF token — should succeed because vhost skips CSRF
      const response = await apiClient.post('/items/Switch1', 'ON');

      expect(response.status).to.equal(200);
      expect(response.text).to.equal('OK');
    });
  });

  // ============================================
  // Group 2: Vhost proxy via remote.<mainHost>
  // ============================================

  describe('Vhost proxy mode (Host = remote.<mainHost>)', function () {
    beforeEach(function () {
      apiClient
        .withHost(REMOTE_HOST)
        .withBasicAuth(
          TEST_FIXTURES.users.testUser.username,
          TEST_FIXTURES.users.testUser.password
        );
    });

    it('should proxy via remote.<mainHost> subdomain', async function () {
      const receivedRequests: ProxyRequest[] = [];

      openhabClient.onRequest((req) => {
        receivedRequests.push(req);
        return {
          id: req.id,
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{ name: 'Switch1', state: 'ON' }]),
        };
      });

      const response = await apiClient.get('/rest/items');

      expect(response.status).to.equal(200);
      expect(receivedRequests).to.have.length(1);
    });

    it('should proxy web page paths via remote subdomain', async function () {
      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: 'openhab-remote-response',
      }));

      const response = await apiClient.get('/login');

      expect(response.status).to.equal(200);
      expect(response.text).to.equal('openhab-remote-response');
      expect(response.text).to.not.include('<form');
    });
  });

  // ============================================
  // Group 3: Non-vhost (normal routing)
  // ============================================

  describe('Non-vhost mode (normal routing)', function () {
    it('should serve login page when Host is not a proxy host', async function () {
      // No host override — uses default localhost
      const response = await apiClient.get('/login');

      expect(response.status).to.equal(200);
      expect(response.text).to.include('<form');
      expect(response.text).to.include('password');
    });

    it('should serve homepage when Host is not a proxy host', async function () {
      const response = await apiClient.get('/');

      expect(response.status).to.equal(200);
      // Homepage is HTML, not a proxy response
      expect(response.headers['content-type']).to.include('text/html');
    });

    it('should still proxy /rest/items via path-based routing', async function () {
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const receivedRequests: ProxyRequest[] = [];

      openhabClient.onRequest((req) => {
        receivedRequests.push(req);
        return {
          id: req.id,
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{ name: 'Switch1', state: 'ON' }]),
        };
      });

      const response = await apiClient.get('/rest/items');

      expect(response.status).to.equal(200);
      expect(receivedRequests).to.have.length(1);
    });

    it('should not forward proxyHost header for path-based proxy', async function () {
      apiClient.withBasicAuth(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

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

      // No host override — path-based proxy uses the original Host header
      await apiClient.get('/rest/items');

      expect(receivedRequest).to.not.be.null;
      expect(receivedRequest!.headers['host']).to.not.equal(
        `${PROXY_HOST}:3000`
      );
    });
  });

  // ============================================
  // Group 4: Contrast tests
  // ============================================

  describe('Vhost vs non-vhost contrast', function () {
    it('/login should return HTML for mainHost but proxy for proxyHost', async function () {
      openhabClient.onRequest((req) => ({
        id: req.id,
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: 'openhab-proxied',
      }));

      // Non-vhost: should return login page
      apiClient.clearHost();
      const webResponse = await apiClient.get('/login');
      expect(webResponse.status).to.equal(200);
      expect(webResponse.text).to.include('<form');

      // Vhost: should proxy to openHAB
      apiClient
        .withHost(PROXY_HOST)
        .withBasicAuth(
          TEST_FIXTURES.users.testUser.username,
          TEST_FIXTURES.users.testUser.password
        );
      const proxyResponse = await apiClient.get('/login');
      expect(proxyResponse.status).to.equal(200);
      expect(proxyResponse.text).to.equal('openhab-proxied');
    });
  });

  // ============================================
  // Group 5: Security — hostname matching
  // ============================================

  describe('Security - hostname matching', function () {
    it('should not match hostnames starting with "remote-" (not "remote.")', async function () {
      apiClient.withHost('remote-evil.com');

      const response = await apiClient.get('/login');

      // Should get login page, not proxied
      expect(response.status).to.equal(200);
      expect(response.text).to.include('<form');
    });

    it('should not match subdomains of the proxy host', async function () {
      apiClient.withHost('sub.proxy.openhab-cloud.test');

      const response = await apiClient.get('/login');

      expect(response.status).to.equal(200);
      expect(response.text).to.include('<form');
    });

    it('should not match arbitrary hosts', async function () {
      apiClient.withHost('evil.example.com');

      const response = await apiClient.get('/login');

      expect(response.status).to.equal(200);
      expect(response.text).to.include('<form');
    });

    it('should handle case-insensitive proxyHost matching', async function () {
      apiClient
        .withHost('PROXY.OPENHAB-CLOUD.TEST')
        .withBasicAuth(
          TEST_FIXTURES.users.testUser.username,
          TEST_FIXTURES.users.testUser.password
        );

      const receivedRequests: ProxyRequest[] = [];

      openhabClient.onRequest((req) => {
        receivedRequests.push(req);
        return {
          id: req.id,
          status: 200,
          headers: {},
          body: 'OK',
        };
      });

      const response = await apiClient.get('/rest/items');

      expect(response.status).to.equal(200);
      expect(receivedRequests).to.have.length(1);
    });

    it('should handle case-insensitive remote.<mainHost> matching', async function () {
      apiClient
        .withHost('REMOTE.OPENHAB-CLOUD.TEST')
        .withBasicAuth(
          TEST_FIXTURES.users.testUser.username,
          TEST_FIXTURES.users.testUser.password
        );

      const receivedRequests: ProxyRequest[] = [];

      openhabClient.onRequest((req) => {
        receivedRequests.push(req);
        return {
          id: req.id,
          status: 200,
          headers: {},
          body: 'OK',
        };
      });

      const response = await apiClient.get('/rest/items');

      expect(response.status).to.equal(200);
      expect(receivedRequests).to.have.length(1);
    });
  });

  // ============================================
  // Group 6: Error handling
  // ============================================

  describe('Error handling', function () {
    it('should return 500 when openHAB not connected via vhost', async function () {
      await openhabClient.disconnect();

      // Wait for connection cache invalidation
      await new Promise((resolve) => setTimeout(resolve, 500));

      apiClient
        .withHost(PROXY_HOST)
        .withBasicAuth(
          TEST_FIXTURES.users.testUser.username,
          TEST_FIXTURES.users.testUser.password
        );

      const response = await apiClient.get('/items');

      expect(response.status).to.equal(500);
    });
  });
});
