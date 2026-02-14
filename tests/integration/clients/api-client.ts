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
 * API Test Client
 *
 * HTTP client for REST API testing.
 */

import supertest from 'supertest';

/**
 * Notification from the API
 */
export interface Notification {
  _id: string;
  message: string;
  icon?: string;
  severity?: string;
  created: string;
  hidden: boolean;
}

/**
 * Notification settings
 */
export interface NotificationSettings {
  email: boolean;
  push: boolean;
}

/**
 * Device info for registration
 */
export interface DeviceInfo {
  deviceId: string;
  deviceModel: string;
  appVersion?: string;
  osVersion?: string;
}

/**
 * OAuth2 token response
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * API Test Client
 *
 * Provides methods for testing REST API endpoints.
 */
export class APITestClient {
  private request: supertest.Agent;
  private authHeader: string | null = null;

  constructor(baseUrl: string) {
    this.request = supertest.agent(baseUrl);
  }

  /**
   * Set basic auth credentials
   */
  withBasicAuth(username: string, password: string): this {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
    return this;
  }

  /**
   * Set bearer token
   */
  withBearerToken(token: string): this {
    this.authHeader = `Bearer ${token}`;
    return this;
  }

  /**
   * Clear authentication
   */
  clearAuth(): this {
    this.authHeader = null;
    return this;
  }

  /**
   * Make a GET request
   */
  async get(path: string): Promise<supertest.Response> {
    const req = this.request.get(path);
    if (this.authHeader) {
      req.set('Authorization', this.authHeader);
    }
    return req;
  }

  /**
   * Make a POST request
   */
  async post(path: string, body?: unknown): Promise<supertest.Response> {
    const req = this.request.post(path);
    if (this.authHeader) {
      req.set('Authorization', this.authHeader);
    }
    if (body) {
      req.send(body);
    }
    return req;
  }

  // ============================================
  // Notification API
  // ============================================

  /**
   * Get notifications
   */
  async getNotifications(limit = 20, skip = 0): Promise<supertest.Response> {
    return this.get(`/api/v1/notifications?limit=${limit}&skip=${skip}`);
  }

  /**
   * Send a notification
   */
  async sendNotification(
    message: string,
    options?: {
      icon?: string;
      severity?: string;
      tag?: string;
      title?: string;
    }
  ): Promise<supertest.Response> {
    return this.post('/api/v1/sendnotification', {
      message,
      ...options,
    });
  }

  /**
   * Hide a notification
   */
  async hideNotification(id: string): Promise<supertest.Response> {
    return this.get(`/api/v1/hidenotification/${id}`);
  }

  /**
   * Get notification settings
   */
  async getNotificationSettings(): Promise<supertest.Response> {
    return this.get('/api/v1/settings/notifications');
  }

  /**
   * Get proxy URL
   */
  async getProxyUrl(): Promise<supertest.Response> {
    return this.get('/api/v1/proxyurl');
  }

  /**
   * Get app IDs (no auth required)
   */
  async getAppIds(): Promise<supertest.Response> {
    const savedAuth = this.authHeader;
    this.authHeader = null;
    const response = await this.get('/api/v1/appids');
    this.authHeader = savedAuth;
    return response;
  }

  // ============================================
  // Device Registration API
  // ============================================

  /**
   * Register Android device (FCM)
   */
  async registerAndroidDevice(
    fcmToken: string,
    deviceInfo: DeviceInfo
  ): Promise<supertest.Response> {
    return this.get(
      `/addAndroidRegistration?regId=${encodeURIComponent(fcmToken)}&deviceId=${encodeURIComponent(deviceInfo.deviceId)}&deviceModel=${encodeURIComponent(deviceInfo.deviceModel || '')}`
    );
  }

  /**
   * Register iOS device (FCM)
   */
  async registerIOSDevice(
    fcmToken: string,
    deviceInfo: DeviceInfo
  ): Promise<supertest.Response> {
    return this.get(
      `/addIosRegistration?regId=${encodeURIComponent(fcmToken)}&deviceId=${encodeURIComponent(deviceInfo.deviceId)}&deviceModel=${encodeURIComponent(deviceInfo.deviceModel || '')}`
    );
  }

  // ============================================
  // Proxy Requests
  // ============================================

  /**
   * Make a proxy request to the openHAB instance
   */
  async proxyGet(path: string): Promise<supertest.Response> {
    return this.get(`/rest${path}`);
  }

  /**
   * Make a proxy POST request
   */
  async proxyPost(path: string, body?: string | Buffer): Promise<supertest.Response> {
    const req = this.request.post(`/rest${path}`);
    if (this.authHeader) {
      req.set('Authorization', this.authHeader);
    }
    if (body) {
      req.set('Content-Type', 'text/plain');
      req.send(body);
    }
    return req;
  }
}
