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
 * Web Page Test Client
 *
 * Browser-like client for testing rendered HTML pages with session support.
 */

import supertest from 'supertest';
import * as cheerio from 'cheerio';

/**
 * Page result with parsed HTML
 */
export interface PageResult {
  statusCode: number;
  headers: Record<string, string>;
  html: string;
  $: cheerio.CheerioAPI;
}

/**
 * Web Test Client
 *
 * Simulates a browser session for testing web pages.
 */
export class WebTestClient {
  private agent: supertest.Agent;
  private loggedIn = false;
  private csrfToken: string | null = null;

  constructor(baseUrl: string) {
    this.agent = supertest.agent(baseUrl);
  }

  /**
   * Get a page and parse it
   */
  async getPage(path: string): Promise<PageResult> {
    const response = await this.agent.get(path);

    const $ = cheerio.load(response.text || '');

    // Extract CSRF token if present
    const csrfInput = $('input[name="_csrf"]');
    if (csrfInput.length > 0) {
      this.csrfToken = csrfInput.val() as string;
    }

    return {
      statusCode: response.status,
      headers: response.headers as Record<string, string>,
      html: response.text || '',
      $,
    };
  }

  /**
   * Post a form with CSRF token
   */
  async postForm(
    path: string,
    data: Record<string, string>
  ): Promise<PageResult> {
    // If we have a CSRF token, add it
    if (this.csrfToken && !data['_csrf']) {
      data['_csrf'] = this.csrfToken;
    }

    const response = await this.agent
      .post(path)
      .type('form')
      .send(data);

    const $ = cheerio.load(response.text || '');

    // Extract CSRF token if present
    const csrfInput = $('input[name="_csrf"]');
    if (csrfInput.length > 0) {
      this.csrfToken = csrfInput.val() as string;
    }

    return {
      statusCode: response.status,
      headers: response.headers as Record<string, string>,
      html: response.text || '',
      $,
    };
  }

  /**
   * Log in with username and password
   */
  async login(username: string, password: string): Promise<boolean> {
    // First get the login page to get CSRF token
    const loginPage = await this.getPage('/login');

    if (!this.csrfToken) {
      throw new Error('Could not find CSRF token on login page');
    }

    // Submit login form
    const response = await this.agent
      .post('/login')
      .type('form')
      .send({
        username,
        password,
        _csrf: this.csrfToken,
      })
      .redirects(0); // Don't follow redirects

    // Check if we got a redirect to home (successful login)
    if (response.status === 302) {
      const location = response.headers['location'];
      if (location === '/' || location === '/account') {
        this.loggedIn = true;
        return true;
      }
    }

    return false;
  }

  /**
   * Log out
   */
  async logout(): Promise<void> {
    await this.agent.get('/logout');
    this.loggedIn = false;
    this.csrfToken = null;
  }

  /**
   * Check if logged in
   */
  get isLoggedIn(): boolean {
    return this.loggedIn;
  }

  /**
   * Get current CSRF token
   */
  getCsrfToken(): string | null {
    return this.csrfToken;
  }

  // ============================================
  // Page Assertions
  // ============================================

  /**
   * Expect a redirect
   */
  async expectRedirect(
    path: string,
    expectedLocation: string
  ): Promise<void> {
    const response = await this.agent.get(path).redirects(0);

    if (response.status !== 302 && response.status !== 301) {
      throw new Error(`Expected redirect, got status ${response.status}`);
    }

    const location = response.headers['location'];
    if (location !== expectedLocation) {
      throw new Error(
        `Expected redirect to ${expectedLocation}, got ${location}`
      );
    }
  }

  /**
   * Expect page to contain text
   */
  async expectPageContains(path: string, expectedText: string): Promise<void> {
    const page = await this.getPage(path);

    if (!page.html.includes(expectedText)) {
      throw new Error(`Page at ${path} does not contain "${expectedText}"`);
    }
  }

  /**
   * Expect page title
   */
  async expectPageTitle(path: string, expectedTitle: string): Promise<void> {
    const page = await this.getPage(path);
    const title = page.$('title').text();

    if (title !== expectedTitle) {
      throw new Error(
        `Expected title "${expectedTitle}", got "${title}"`
      );
    }
  }

  /**
   * Expect status code
   */
  async expectStatus(path: string, expectedStatus: number): Promise<void> {
    const response = await this.agent.get(path);

    if (response.status !== expectedStatus) {
      throw new Error(
        `Expected status ${expectedStatus}, got ${response.status}`
      );
    }
  }
}
