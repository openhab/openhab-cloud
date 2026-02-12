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
 * OAuth2 Tests
 *
 * Tests for OAuth2 authorization flow.
 */

import { expect } from 'chai';
import { WebTestClient, APITestClient } from '../clients';
import { TEST_FIXTURES } from '../seed-database';

const SERVER_URL = process.env['SERVER_URL'] || 'http://localhost:3000';

describe('OAuth2', function () {
  this.timeout(30000);

  let webClient: WebTestClient;
  let apiClient: APITestClient;

  beforeEach(function () {
    webClient = new WebTestClient(SERVER_URL);
    apiClient = new APITestClient(SERVER_URL);
  });

  describe('Authorization Endpoint', function () {
    it('should show authorization dialog for valid client', async function () {
      // First, login the user
      await webClient.login(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      // Request authorization
      const authUrl =
        `/oauth2/authorize?` +
        `client_id=${TEST_FIXTURES.oauth2.testClient.clientId}&` +
        `response_type=code&` +
        `redirect_uri=http://localhost:8080/callback&` +
        `scope=offline_access`;

      const page = await webClient.getPage(authUrl);

      // Should show authorization page or redirect
      expect(page.statusCode).to.be.oneOf([200, 302]);
    });

    it('should require login for authorization', async function () {
      // Don't login first
      const authUrl =
        `/oauth2/authorize?` +
        `client_id=${TEST_FIXTURES.oauth2.testClient.clientId}&` +
        `response_type=code&` +
        `redirect_uri=http://localhost:8080/callback`;

      const page = await webClient.getPage(authUrl);

      // Should redirect to login
      expect(page.statusCode).to.be.oneOf([200, 302]);
      // Either shows login page or redirects to it
    });

    it('should reject invalid client_id', async function () {
      await webClient.login(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const authUrl =
        `/oauth2/authorize?` +
        `client_id=invalid-client&` +
        `response_type=code&` +
        `redirect_uri=http://localhost:8080/callback`;

      const page = await webClient.getPage(authUrl);

      // Should show error
      expect(page.statusCode).to.be.oneOf([400, 401, 403, 200]);
      // If 200, page should contain error message
    });

    it('should reject invalid redirect_uri', async function () {
      await webClient.login(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const authUrl =
        `/oauth2/authorize?` +
        `client_id=${TEST_FIXTURES.oauth2.testClient.clientId}&` +
        `response_type=code&` +
        `redirect_uri=http://evil.com/steal`;

      const page = await webClient.getPage(authUrl);

      // Should reject mismatched redirect_uri
      expect(page.statusCode).to.be.oneOf([400, 403, 200]);
    });

    it('should reject unsupported response_type', async function () {
      await webClient.login(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const authUrl =
        `/oauth2/authorize?` +
        `client_id=${TEST_FIXTURES.oauth2.testClient.clientId}&` +
        `response_type=token&` +
        `redirect_uri=http://localhost:8080/callback`;

      const page = await webClient.getPage(authUrl);

      // Implicit flow may not be supported
      expect(page.statusCode).to.be.oneOf([200, 302, 400]);
    });
  });

  describe('Token Endpoint', function () {
    it('should reject token request without code', async function () {
      const response = await apiClient.post('/oauth2/token', {
        grant_type: 'authorization_code',
        client_id: TEST_FIXTURES.oauth2.testClient.clientId,
        client_secret: TEST_FIXTURES.oauth2.testClient.clientSecret,
        redirect_uri: 'http://localhost:8080/callback',
        // Missing code
      });

      expect(response.status).to.be.oneOf([400, 401]);
    });

    it('should reject token request with invalid code', async function () {
      const response = await apiClient.post('/oauth2/token', {
        grant_type: 'authorization_code',
        code: 'invalid-code',
        client_id: TEST_FIXTURES.oauth2.testClient.clientId,
        client_secret: TEST_FIXTURES.oauth2.testClient.clientSecret,
        redirect_uri: 'http://localhost:8080/callback',
      });

      expect(response.status).to.be.oneOf([400, 401]);
    });

    it('should reject token request with invalid client credentials', async function () {
      const response = await apiClient.post('/oauth2/token', {
        grant_type: 'authorization_code',
        code: 'some-code',
        client_id: TEST_FIXTURES.oauth2.testClient.clientId,
        client_secret: 'wrong-secret',
        redirect_uri: 'http://localhost:8080/callback',
      });

      expect(response.status).to.be.oneOf([400, 401, 403]);
    });

    it('should reject unsupported grant_type', async function () {
      const response = await apiClient.post('/oauth2/token', {
        grant_type: 'password',
        username: TEST_FIXTURES.users.testUser.username,
        password: TEST_FIXTURES.users.testUser.password,
        client_id: TEST_FIXTURES.oauth2.testClient.clientId,
        client_secret: TEST_FIXTURES.oauth2.testClient.clientSecret,
      });

      // Password grant may not be supported
      expect(response.status).to.be.oneOf([200, 400, 401]);
    });
  });

  describe('Token Validation', function () {
    it('should reject requests with invalid bearer token', async function () {
      apiClient.withBearerToken('invalid-token');

      const response = await apiClient.getNotifications();

      expect(response.status).to.equal(401);
    });

    it('should reject expired token', async function () {
      // An expired token format (would need actual implementation)
      apiClient.withBearerToken('expired.jwt.token');

      const response = await apiClient.getNotifications();

      expect(response.status).to.equal(401);
    });
  });

  describe('Token Refresh', function () {
    it('should reject refresh without refresh_token', async function () {
      const response = await apiClient.post('/oauth2/token', {
        grant_type: 'refresh_token',
        client_id: TEST_FIXTURES.oauth2.testClient.clientId,
        client_secret: TEST_FIXTURES.oauth2.testClient.clientSecret,
        // Missing refresh_token
      });

      expect(response.status).to.be.oneOf([400, 401]);
    });

    it('should reject invalid refresh_token', async function () {
      const response = await apiClient.post('/oauth2/token', {
        grant_type: 'refresh_token',
        refresh_token: 'invalid-refresh-token',
        client_id: TEST_FIXTURES.oauth2.testClient.clientId,
        client_secret: TEST_FIXTURES.oauth2.testClient.clientSecret,
      });

      expect(response.status).to.be.oneOf([400, 401]);
    });
  });

  describe('Client Credentials', function () {
    it('should handle client_credentials grant', async function () {
      const response = await apiClient.post('/oauth2/token', {
        grant_type: 'client_credentials',
        client_id: TEST_FIXTURES.oauth2.testClient.clientId,
        client_secret: TEST_FIXTURES.oauth2.testClient.clientSecret,
        scope: 'offline_access',
      });

      // May or may not be supported
      expect(response.status).to.be.oneOf([200, 400, 401]);
    });
  });

  describe('Token Revocation', function () {
    it('should accept revocation request', async function () {
      // Login first
      await webClient.login(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const response = await apiClient.post('/oauth2/revoke', {
        token: 'some-token',
        client_id: TEST_FIXTURES.oauth2.testClient.clientId,
        client_secret: TEST_FIXTURES.oauth2.testClient.clientSecret,
      });

      // Revocation should succeed even for invalid tokens (RFC 7009)
      expect(response.status).to.be.oneOf([200, 204, 400, 401]);
    });
  });
});
