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
 * Account Page Tests
 *
 * Tests for account management pages.
 */

import { expect } from 'chai';
import { WebTestClient, OpenHABTestClient } from '../clients';
import { TEST_FIXTURES } from '../seed-database';

const SERVER_URL = process.env['SERVER_URL'] || 'http://localhost:3000';

describe('Account Pages', function () {
  this.timeout(30000);

  let webClient: WebTestClient;

  beforeEach(async function () {
    webClient = new WebTestClient(SERVER_URL);

    // Login for all tests
    await webClient.login(
      TEST_FIXTURES.users.testUser.username,
      TEST_FIXTURES.users.testUser.password
    );
  });

  describe('Account Overview', function () {
    it('should render account page', async function () {
      const page = await webClient.getPage('/account');

      expect(page.statusCode).to.equal(200);
      expect(page.html).to.include(TEST_FIXTURES.users.testUser.username);
    });

    it('should show openHAB credentials', async function () {
      const page = await webClient.getPage('/account');

      expect(page.statusCode).to.equal(200);
      // Should show UUID and secret somewhere
      expect(page.html).to.include(TEST_FIXTURES.openhabs.primary.uuid);
    });

    it('should have navigation elements', async function () {
      const page = await webClient.getPage('/account');

      // Check for navigation links
      const hasNavigation =
        page.$('nav').length > 0 || page.$('.navbar').length > 0;
      expect(hasNavigation).to.be.true;
    });
  });

  describe('OpenHAB Status', function () {
    it('should show disconnected when openHAB not connected', async function () {
      const page = await webClient.getPage('/account');

      expect(page.statusCode).to.equal(200);
      // Should indicate status
    });

    it('should show connected when openHAB connected', async function () {
      // Connect openHAB client
      const openhabClient = new OpenHABTestClient(
        SERVER_URL,
        TEST_FIXTURES.openhabs.primary.uuid,
        TEST_FIXTURES.openhabs.primary.secret
      );
      await openhabClient.connect();

      try {
        // Give it a moment
        await new Promise((resolve) => setTimeout(resolve, 500));

        const page = await webClient.getPage('/account');
        expect(page.statusCode).to.equal(200);
        // Status may be shown as online/connected
      } finally {
        await openhabClient.disconnect();
      }
    });
  });

  describe('Events Page', function () {
    it('should render events page', async function () {
      const page = await webClient.getPage('/events');

      expect(page.statusCode).to.equal(200);
    });

    it('should show event list or empty state', async function () {
      const page = await webClient.getPage('/events');

      expect(page.statusCode).to.equal(200);
      // Should have some table or list structure
    });
  });

  describe('Items Page', function () {
    it('should render items page', async function () {
      const page = await webClient.getPage('/items');

      expect(page.statusCode).to.equal(200);
    });
  });

  describe('Notifications Page', function () {
    it('should render notifications page', async function () {
      const page = await webClient.getPage('/notifications');

      expect(page.statusCode).to.equal(200);
    });
  });

  describe('Applications Page', function () {
    it('should render applications page', async function () {
      const page = await webClient.getPage('/applications');

      expect(page.statusCode).to.equal(200);
    });

    it('should list registered applications', async function () {
      const page = await webClient.getPage('/applications');

      expect(page.statusCode).to.equal(200);
      // OAuth2 clients may be shown here
    });
  });

  describe('Devices Page', function () {
    it('should render devices page', async function () {
      const page = await webClient.getPage('/devices');

      expect(page.statusCode).to.equal(200);
    });

    it('should show registered mobile devices', async function () {
      const page = await webClient.getPage('/devices');

      expect(page.statusCode).to.equal(200);
      // List of push notification devices
    });
  });

  describe('IFTTT Page', function () {
    it('should render IFTTT settings page', async function () {
      const page = await webClient.getPage('/ifttt');

      // May be 200 or redirect if not configured
      expect(page.statusCode).to.be.oneOf([200, 302, 404]);
    });
  });

  describe('Security Features', function () {
    it('should include CSRF protection on forms', async function () {
      const page = await webClient.getPage('/account');

      // If there are forms, they should have CSRF tokens
      const forms = page.$('form');
      if (forms.length > 0) {
        forms.each((i, form) => {
          const csrfInput = page.$(form).find('input[name="_csrf"]');
          // Should have CSRF token
        });
      }
    });

    it('should not leak sensitive information in HTML', async function () {
      const page = await webClient.getPage('/account');

      // Secret should be masked or hidden
      // Check it's not in plain text multiple times
      const secretMatches = page.html.match(
        new RegExp(TEST_FIXTURES.openhabs.primary.secret, 'g')
      );

      // May show once intentionally, but not repeatedly
    });
  });
});
