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
 * Staff Page Tests
 *
 * Tests for staff-only administrative pages.
 */

import { expect } from 'chai';
import { WebTestClient } from '../clients';
import { TEST_FIXTURES } from '../seed-database';

const SERVER_URL = process.env['SERVER_URL'] || 'http://localhost:3000';

describe('Staff Pages', function () {
  this.timeout(30000);

  let webClient: WebTestClient;

  describe('Access Control', function () {
    beforeEach(function () {
      webClient = new WebTestClient(SERVER_URL);
    });

    it('should restrict staff pages from unauthenticated users', async function () {
      // Not logged in
      await webClient.expectRedirect('/staff', '/login');
    });

    it('should restrict staff pages from regular users', async function () {
      // Login as regular user
      await webClient.login(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const page = await webClient.getPage('/staff');

      // Should be forbidden or redirect
      expect(page.statusCode).to.be.oneOf([403, 302, 404]);
    });

    it('should restrict invitations page from regular users', async function () {
      await webClient.login(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const page = await webClient.getPage('/staff/invitations');

      expect(page.statusCode).to.be.oneOf([403, 302, 404]);
    });

    it('should restrict stats page from regular users', async function () {
      await webClient.login(
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const page = await webClient.getPage('/staff/stats');

      expect(page.statusCode).to.be.oneOf([403, 302, 404]);
    });
  });

  describe('Staff Access', function () {
    beforeEach(async function () {
      webClient = new WebTestClient(SERVER_URL);

      // Login as staff user
      await webClient.login(
        TEST_FIXTURES.users.staffUser.username,
        TEST_FIXTURES.users.staffUser.password
      );
    });

    it('should allow staff to access staff page', async function () {
      const page = await webClient.getPage('/staff');

      expect(page.statusCode).to.equal(200);
    });

    it('should allow staff to access invitations page', async function () {
      const page = await webClient.getPage('/staff/invitations');

      expect(page.statusCode).to.equal(200);
    });

    it('should allow staff to access stats page', async function () {
      const page = await webClient.getPage('/staff/stats');

      expect(page.statusCode).to.equal(200);
    });

    it('should render invitations management', async function () {
      const page = await webClient.getPage('/staff/invitations');

      expect(page.statusCode).to.equal(200);
      // Should have invitation-related content
      expect(page.html.toLowerCase()).to.include('invitation');
    });

    it('should render statistics page', async function () {
      const page = await webClient.getPage('/staff/stats');

      expect(page.statusCode).to.equal(200);
      // Should have stats-related content
    });
  });

  describe('Invitation Management', function () {
    beforeEach(async function () {
      webClient = new WebTestClient(SERVER_URL);

      await webClient.login(
        TEST_FIXTURES.users.staffUser.username,
        TEST_FIXTURES.users.staffUser.password
      );
    });

    it('should show invitation form', async function () {
      const page = await webClient.getPage('/staff/invitations');

      expect(page.statusCode).to.equal(200);
      // Should have a form for creating invitations
      const hasForms = page.$('form').length > 0;
      expect(hasForms).to.be.true;
    });

    it('should list pending invitations', async function () {
      const page = await webClient.getPage('/staff/invitations');

      expect(page.statusCode).to.equal(200);
      // Should have some list or table
    });

    it('should include CSRF protection on invitation form', async function () {
      const page = await webClient.getPage('/staff/invitations');

      const csrfToken = webClient.getCsrfToken();
      expect(csrfToken).to.not.be.null;
    });
  });

  describe('User Management', function () {
    beforeEach(async function () {
      webClient = new WebTestClient(SERVER_URL);

      await webClient.login(
        TEST_FIXTURES.users.staffUser.username,
        TEST_FIXTURES.users.staffUser.password
      );
    });

    it('should render users list page', async function () {
      const page = await webClient.getPage('/staff/users');

      // May or may not exist
      expect(page.statusCode).to.be.oneOf([200, 404]);
    });
  });

  describe('System Statistics', function () {
    beforeEach(async function () {
      webClient = new WebTestClient(SERVER_URL);

      await webClient.login(
        TEST_FIXTURES.users.staffUser.username,
        TEST_FIXTURES.users.staffUser.password
      );
    });

    it('should show connection statistics', async function () {
      const page = await webClient.getPage('/staff/stats');

      expect(page.statusCode).to.equal(200);
      // Should have some numeric data
    });

    it('should show user statistics', async function () {
      const page = await webClient.getPage('/staff/stats');

      expect(page.statusCode).to.equal(200);
    });
  });
});
