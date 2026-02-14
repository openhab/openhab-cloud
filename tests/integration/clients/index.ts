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
 * Integration Test Clients
 *
 * Export all test clients and utilities.
 */

// WebSocket client
export { OpenHABTestClient } from './openhab-client';
export type { ProxyRequest, ProxyResponse, CommandData, NotificationOptions } from './openhab-client';

// Client manager for multiple connections
export { ClientManager } from './client-manager';

// Mock responses for proxy testing
export { mockResponses, createMockHandler } from './mock-responses';
export type { Item } from './mock-responses';

// HTTP clients
export { APITestClient } from './api-client';
export type { Notification, NotificationSettings, DeviceInfo, TokenResponse } from './api-client';

export { WebTestClient } from './web-client';
export type { PageResult } from './web-client';
