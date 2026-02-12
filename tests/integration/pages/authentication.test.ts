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
 * Authentication Page Tests
 *
 * Tests for login, logout, and password recovery pages.
 */

import { expect } from 'chai';
import { WebTestClient } from '../clients';
import { TEST_FIXTURES } from '../seed-database';

const SERVER_URL = process.env['SERVER_URL'] || 'http://localhost:3000';

describe('Authentication Pages', function () {
  this.timeout(30000);

  let webClient: WebTestClient;

  beforeEach(function () {
    webClient = new WebTestClient(SERVER_URL);
  });

  describe('Login Page', function () {
    it('should render login page', async function () {
      const page = await webClient.getPage('/login');

      expect(page.statusCode).to.equal(200);
      expect(page.html).to.include('form');
      expect(page.html).to.include('password');
    });

    it('should include CSRF token in login form', async function () {
      const page = await webClient.getPage('/login');

      expect(page.statusCode).to.equal(200);

      // Check for CSRF input
      const csrfInput = page.$('input[name="_csrf"]');
      expect(csrfInput.length).to.be.greaterThan(0);
    });

    it('should redirect to account after successful login', async function () {
      const success = await webClient.login(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      expect(success).to.be.true;
      expect(webClient.isLoggedIn).to.be.true;
    });

    it('should reject invalid credentials', async function () {
      const success = await webClient.login(
        TEST_FIXTURES.users.testUser.username,
        'wrong-password'
      );

      expect(success).to.be.false;
      expect(webClient.isLoggedIn).to.be.false;
    });

    it('should reject non-existent user', async function () {
      const success = await webClient.login('nonexistent@example.com', 'password');

      expect(success).to.be.false;
    });

    it('should handle empty credentials', async function () {
      const success = await webClient.login('', '');

      expect(success).to.be.false;
    });
  });

  describe('Logout', function () {
    it('should logout successfully', async function () {
      // First login
      await webClient.login(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );
      expect(webClient.isLoggedIn).to.be.true;

      // Then logout
      await webClient.logout();
      expect(webClient.isLoggedIn).to.be.false;
    });

    it('should redirect to login after logout', async function () {
      await webClient.login(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      await webClient.logout();

      // Trying to access protected page should redirect
      await webClient.expectRedirect('/account', '/login');
    });
  });

  describe('Password Recovery', function () {
    it('should render password recovery page', async function () {
      const page = await webClient.getPage('/lostpassword');

      expect(page.statusCode).to.equal(200);
      expect(page.html).to.include('form');
      expect(page.html.toLowerCase()).to.include('email');
    });

    it('should include CSRF token in recovery form', async function () {
      const page = await webClient.getPage('/lostpassword');

      const csrfInput = page.$('input[name="_csrf"]');
      expect(csrfInput.length).to.be.greaterThan(0);
    });

    it('should accept password recovery request', async function () {
      // Get the page first to get CSRF token
      await webClient.getPage('/lostpassword');

      const result = await webClient.postForm('/lostpassword', {
        username: TEST_FIXTURES.users.testUser.username,
      });

      // Should show success or redirect
      expect(result.statusCode).to.be.oneOf([200, 302]);
    });

    it('should handle non-existent email gracefully', async function () {
      await webClient.getPage('/lostpassword');

      const result = await webClient.postForm('/lostpassword', {
        username: 'nonexistent@example.com',
      });

      // Should not leak information about user existence
      expect(result.statusCode).to.be.oneOf([200, 302]);
    });
  });

  describe('Registration', function () {
    it('should include registration form on login page', async function () {
      // Registration is on the login page, not a separate /register route
      const page = await webClient.getPage('/login');

      expect(page.statusCode).to.equal(200);
      // Registration form posts to /register
      expect(page.html).to.include('action="/register"');
    });

    it('should include required fields in registration form', async function () {
      const page = await webClient.getPage('/login');

      // Check for registration fields (openHAB UUID and secret)
      const hasUsernameField = page.$('input[name="username"]').length > 0;
      const hasPasswordField = page.$('input[type="password"]').length > 0;
      const hasUuidField = page.$('input[name="openhabuuid"]').length > 0;

      expect(hasUsernameField).to.be.true;
      expect(hasPasswordField).to.be.true;
      expect(hasUuidField).to.be.true;
    });
  });

  describe('Protected Routes', function () {
    it('should redirect to login when accessing account unauthenticated', async function () {
      await webClient.expectRedirect('/account', '/login');
    });

    it('should allow access to account when authenticated', async function () {
      await webClient.login(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const page = await webClient.getPage('/account');

      expect(page.statusCode).to.equal(200);
    });

    it('should redirect to login when accessing events unauthenticated', async function () {
      await webClient.expectRedirect('/events', '/login');
    });

    it('should redirect to login when accessing items unauthenticated', async function () {
      await webClient.expectRedirect('/items', '/login');
    });
  });

  describe('Session Persistence', function () {
    it('should maintain session across requests', async function () {
      await webClient.login(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      // Access multiple pages
      const page1 = await webClient.getPage('/account');
      expect(page1.statusCode).to.equal(200);

      const page2 = await webClient.getPage('/events');
      expect(page2.statusCode).to.equal(200);

      const page3 = await webClient.getPage('/items');
      expect(page3.statusCode).to.equal(200);
    });
  });

});
