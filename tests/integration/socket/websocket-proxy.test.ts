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
 * WebSocket Proxy Tests
 *
 * Tests for WebSocket connections proxied through the cloud to openHAB instances.
 */

import { expect } from 'chai';
import WebSocket from 'ws';
import {
  OpenHABTestClient,
  ProxyRequest,
} from '../clients';
import { TEST_FIXTURES } from '../seed-database';

const SERVER_URL = process.env['SERVER_URL'] || 'http://localhost:3000';

/**
 * Create a WebSocket URL with basic auth
 */
function wsUrl(path: string, username: string, password: string): string {
  const base = SERVER_URL.replace('http://', 'ws://').replace('https://', 'wss://');
  const url = new URL(path, base);
  url.username = username;
  url.password = password;
  return url.toString();
}

/**
 * Create a WebSocket URL without auth
 */
function wsUrlNoAuth(path: string): string {
  return SERVER_URL.replace('http://', 'ws://').replace('https://', 'wss://') + path;
}

describe('WebSocket Proxy', function () {
  this.timeout(30000);

  let openhabClient: OpenHABTestClient;

  beforeEach(async function () {
    openhabClient = new OpenHABTestClient(
      SERVER_URL,
      TEST_FIXTURES.openhabs.primary.uuid,
      TEST_FIXTURES.openhabs.primary.secret
    );
    await openhabClient.connect();
  });

  afterEach(async function () {
    await openhabClient?.disconnect();
  });

  describe('Connection Upgrade', function () {
    it('should establish WebSocket connection through proxy', function (done) {
      // Set up openHAB to accept WebSocket upgrade requests
      openhabClient.onRequest((req: ProxyRequest) => {
        if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
          // Respond with 101 Switching Protocols
          openhabClient.sendUpgradeResponse(req.id);
          // Return nothing — the 101 is sent manually above
          return null as unknown as import('../clients').ProxyResponse;
        }
        return { id: req.id, status: 404, headers: {}, body: 'Not found' };
      });

      const url = wsUrl(
        '/ws/test',
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const ws = new WebSocket(url);

      ws.on('open', () => {
        expect(ws.readyState).to.equal(WebSocket.OPEN);
        ws.close();
      });

      ws.on('close', () => {
        done();
      });

      ws.on('error', (err) => {
        done(err);
      });
    });

    it('should reject WebSocket without authentication', function (done) {
      const url = wsUrlNoAuth('/ws/test');
      const ws = new WebSocket(url);

      ws.on('open', () => {
        done(new Error('Expected connection to be rejected'));
      });

      ws.on('unexpected-response', (_req, res) => {
        expect(res.statusCode).to.equal(401);
        done();
      });

      ws.on('error', () => {
        // Connection rejected — this is expected
        done();
      });
    });

    it('should return error when openHAB is offline', async function () {
      // Disconnect openHAB first
      await openhabClient.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 500));

      return new Promise<void>((resolve, reject) => {
        const url = wsUrl(
          '/ws/test',
          TEST_FIXTURES.users.testUser.username,
          TEST_FIXTURES.users.testUser.password
        );

        const ws = new WebSocket(url);

        ws.on('open', () => {
          reject(new Error('Expected connection to fail'));
        });

        ws.on('unexpected-response', (_req, res) => {
          expect(res.statusCode).to.equal(500);
          resolve();
        });

        ws.on('error', () => {
          // Connection error — openHAB is offline
          resolve();
        });
      });
    });
  });

  describe('Bidirectional Data Flow', function () {
    it('should forward data from client to openHAB', function (done) {
      const receivedData: Buffer[] = [];
      const testMessage = 'Hello from client';

      openhabClient.onRequest((req: ProxyRequest) => {
        if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
          openhabClient.sendUpgradeResponse(req.id);
          return null as unknown as import('../clients').ProxyResponse;
        }
        return { id: req.id, status: 404, headers: {}, body: 'Not found' };
      });

      openhabClient.onWebSocket((_requestId: number, data: Buffer) => {
        receivedData.push(data);
      });

      const url = wsUrl(
        '/ws/test',
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const ws = new WebSocket(url);

      ws.on('open', () => {
        ws.send(testMessage);
        // Wait a bit for the data to arrive via Socket.IO
        setTimeout(() => {
          expect(receivedData.length).to.be.greaterThan(0);
          // The data will include WebSocket framing — just verify something arrived
          ws.close();
        }, 1000);
      });

      ws.on('close', () => {
        done();
      });

      ws.on('error', (err) => {
        done(err);
      });
    });

    it('should forward data from openHAB to client', function (done) {
      const receivedMessages: Buffer[] = [];
      const testData = Buffer.from('Hello from openHAB');

      openhabClient.onRequest((req: ProxyRequest) => {
        if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
          openhabClient.sendUpgradeResponse(req.id);
          // After upgrade, send some data back
          setTimeout(() => {
            openhabClient.sendWebSocketData(req.id, testData);
          }, 500);
          return null as unknown as import('../clients').ProxyResponse;
        }
        return { id: req.id, status: 404, headers: {}, body: 'Not found' };
      });

      const url = wsUrl(
        '/ws/test',
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const ws = new WebSocket(url);

      ws.on('message', (data: Buffer) => {
        receivedMessages.push(data);
      });

      ws.on('open', () => {
        // Wait for data from openHAB
        setTimeout(() => {
          expect(receivedMessages.length).to.be.greaterThan(0);
          ws.close();
        }, 1500);
      });

      ws.on('close', () => {
        done();
      });

      ws.on('error', (err) => {
        done(err);
      });
    });

    it('should handle binary data', function (done) {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
      const receivedData: Buffer[] = [];

      openhabClient.onRequest((req: ProxyRequest) => {
        if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
          openhabClient.sendUpgradeResponse(req.id);
          setTimeout(() => {
            openhabClient.sendWebSocketData(req.id, binaryData);
          }, 500);
          return null as unknown as import('../clients').ProxyResponse;
        }
        return { id: req.id, status: 404, headers: {}, body: 'Not found' };
      });

      const url = wsUrl(
        '/ws/test',
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const ws = new WebSocket(url);

      ws.on('message', (data: Buffer) => {
        receivedData.push(Buffer.from(data));
      });

      ws.on('open', () => {
        setTimeout(() => {
          expect(receivedData.length).to.be.greaterThan(0);
          ws.close();
        }, 1500);
      });

      ws.on('close', () => {
        done();
      });

      ws.on('error', (err) => {
        done(err);
      });
    });
  });

  describe('Disconnect Handling', function () {
    it('should send cancel when client closes WebSocket', function (done) {
      let capturedRequestId: number | null = null;
      const cancelledIds: number[] = [];

      openhabClient.onRequest((req: ProxyRequest) => {
        if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
          capturedRequestId = req.id;
          openhabClient.sendUpgradeResponse(req.id);
          return null as unknown as import('../clients').ProxyResponse;
        }
        return { id: req.id, status: 404, headers: {}, body: 'Not found' };
      });

      openhabClient.onCancel((requestId: number) => {
        cancelledIds.push(requestId);
      });

      const url = wsUrl(
        '/ws/test',
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const ws = new WebSocket(url);

      ws.on('open', () => {
        // Close from client side
        setTimeout(() => {
          ws.close();
        }, 500);
      });

      ws.on('close', () => {
        // Wait for cancel event to propagate
        setTimeout(() => {
          expect(capturedRequestId).to.not.be.null;
          expect(cancelledIds).to.include(capturedRequestId!);
          done();
        }, 1000);
      });

      ws.on('error', (err) => {
        done(err);
      });
    });

    it('should close client WebSocket when openHAB disconnects', function (done) {
      openhabClient.onRequest((req: ProxyRequest) => {
        if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
          openhabClient.sendUpgradeResponse(req.id);
          return null as unknown as import('../clients').ProxyResponse;
        }
        return { id: req.id, status: 404, headers: {}, body: 'Not found' };
      });

      const url = wsUrl(
        '/ws/test',
        TEST_FIXTURES.users.testUser.username,
        TEST_FIXTURES.users.testUser.password
      );

      const ws = new WebSocket(url);

      ws.on('open', () => {
        // Disconnect openHAB while WebSocket is active
        setTimeout(async () => {
          await openhabClient.disconnect();
        }, 500);
      });

      ws.on('close', () => {
        // Client should be notified of closure
        done();
      });

      ws.on('error', () => {
        // Error is also acceptable — connection was severed
        done();
      });
    });
  });
});
