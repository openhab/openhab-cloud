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
 * The cloud proxy is a raw TCP tunnel — it forwards bytes without interpreting
 * WebSocket frames. openHAB→client data must therefore be properly framed.
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
 * Build a WebSocket base URL (no auth)
 */
function wsBaseUrl(path: string): string {
  return SERVER_URL.replace('http://', 'ws://').replace('https://', 'wss://') + path;
}

/**
 * Build basic auth headers for WebSocket connections.
 *
 * We pass auth via headers rather than URL credentials because the URL API
 * percent-encodes special characters (e.g. @ → %40) and the ws library
 * does not decode them before building the Authorization header, causing
 * passport to receive percent-encoded credentials that don't match.
 */
function basicAuthHeaders(username: string, password: string): Record<string, string> {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return { Authorization: `Basic ${credentials}` };
}

/**
 * Create a WebSocket frame (server→client, unmasked) from a payload.
 *
 * The proxy is a raw TCP tunnel, so data sent from the openHAB side must
 * be properly framed for the ws client to parse it.
 *
 * @param payload - The data to frame
 * @param opcode  - 0x01 for text, 0x02 for binary (default: auto-detect)
 */
function frameWebSocketMessage(payload: Buffer, opcode?: number): Buffer {
  const op = opcode ?? (typeof payload === 'string' ? 0x01 : 0x02);
  const len = payload.length;

  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | op; // FIN + opcode
    header[1] = len;       // no MASK bit (server→client)
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | op;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | op;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

const AUTH_HEADERS = basicAuthHeaders(
  TEST_FIXTURES.users.testUser.username,
  TEST_FIXTURES.users.testUser.password
);

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

  /** Set up the openHAB client to handle WebSocket upgrades */
  function handleUpgrade(): void {
    openhabClient.onRequest((req: ProxyRequest) => {
      if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
        openhabClient.sendUpgradeResponse(req.id, req.headers['sec-websocket-key']);
        return null as unknown as import('../clients').ProxyResponse;
      }
      return { id: req.id, status: 404, headers: {}, body: 'Not found' };
    });
  }

  describe('Connection Upgrade', function () {
    it('should establish WebSocket connection through proxy', function (done) {
      handleUpgrade();

      const ws = new WebSocket(wsBaseUrl('/ws/test'), { headers: AUTH_HEADERS });
      let wsError: Error | undefined;

      ws.on('open', () => {
        expect(ws.readyState).to.equal(WebSocket.OPEN);
        // Use terminate() for immediate close — ws.close() sends a Close
        // frame and waits for a response, but the raw TCP tunnel doesn't
        // interpret WebSocket frames so no response would arrive.
        ws.terminate();
      });

      ws.on('error', (err) => { wsError = err; });
      ws.on('close', () => { done(wsError); });
    });

    it('should reject WebSocket without authentication', function (done) {
      const ws = new WebSocket(wsBaseUrl('/ws/test'));

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
        const ws = new WebSocket(wsBaseUrl('/ws/test'), { headers: AUTH_HEADERS });

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

      handleUpgrade();

      openhabClient.onWebSocket((_requestId: number, data: Buffer) => {
        receivedData.push(data);
      });

      const ws = new WebSocket(wsBaseUrl('/ws/test'), { headers: AUTH_HEADERS });
      let wsError: Error | undefined;

      ws.on('open', () => {
        ws.send(testMessage);
        // Wait a bit for the data to arrive via Socket.IO
        setTimeout(() => {
          expect(receivedData.length).to.be.greaterThan(0);
          ws.terminate();
        }, 1000);
      });

      ws.on('error', (err) => { wsError = err; });
      ws.on('close', () => { done(wsError); });
    });

    it('should forward data from openHAB to client', function (done) {
      const receivedMessages: Buffer[] = [];
      const testPayload = Buffer.from('Hello from openHAB');

      openhabClient.onRequest((req: ProxyRequest) => {
        if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
          openhabClient.sendUpgradeResponse(req.id, req.headers['sec-websocket-key']);
          // After upgrade, send a properly framed WebSocket text message
          setTimeout(() => {
            const frame = frameWebSocketMessage(testPayload, 0x01);
            openhabClient.sendWebSocketData(req.id, frame);
          }, 500);
          return null as unknown as import('../clients').ProxyResponse;
        }
        return { id: req.id, status: 404, headers: {}, body: 'Not found' };
      });

      const ws = new WebSocket(wsBaseUrl('/ws/test'), { headers: AUTH_HEADERS });
      let wsError: Error | undefined;

      ws.on('message', (data: Buffer) => {
        receivedMessages.push(data);
      });

      ws.on('open', () => {
        // Wait for data from openHAB
        setTimeout(() => {
          expect(receivedMessages.length).to.be.greaterThan(0);
          expect(receivedMessages[0].toString()).to.equal('Hello from openHAB');
          ws.terminate();
        }, 1500);
      });

      ws.on('error', (err) => { wsError = err; });
      ws.on('close', () => { done(wsError); });
    });

    it('should handle binary data', function (done) {
      const binaryPayload = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
      const receivedData: Buffer[] = [];

      openhabClient.onRequest((req: ProxyRequest) => {
        if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
          openhabClient.sendUpgradeResponse(req.id, req.headers['sec-websocket-key']);
          // Send a properly framed WebSocket binary message
          setTimeout(() => {
            const frame = frameWebSocketMessage(binaryPayload, 0x02);
            openhabClient.sendWebSocketData(req.id, frame);
          }, 500);
          return null as unknown as import('../clients').ProxyResponse;
        }
        return { id: req.id, status: 404, headers: {}, body: 'Not found' };
      });

      const ws = new WebSocket(wsBaseUrl('/ws/test'), { headers: AUTH_HEADERS });
      let wsError: Error | undefined;

      ws.on('message', (data: Buffer) => {
        receivedData.push(Buffer.from(data));
      });

      ws.on('open', () => {
        setTimeout(() => {
          expect(receivedData.length).to.be.greaterThan(0);
          expect(Buffer.compare(receivedData[0], binaryPayload)).to.equal(0);
          ws.terminate();
        }, 1500);
      });

      ws.on('error', (err) => { wsError = err; });
      ws.on('close', () => { done(wsError); });
    });
  });

  describe('Disconnect Handling', function () {
    it('should send cancel when client closes WebSocket', function (done) {
      let capturedRequestId: number | null = null;
      const cancelledIds: number[] = [];

      openhabClient.onRequest((req: ProxyRequest) => {
        if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
          capturedRequestId = req.id;
          openhabClient.sendUpgradeResponse(req.id, req.headers['sec-websocket-key']);
          return null as unknown as import('../clients').ProxyResponse;
        }
        return { id: req.id, status: 404, headers: {}, body: 'Not found' };
      });

      openhabClient.onCancel((requestId: number) => {
        cancelledIds.push(requestId);
      });

      const ws = new WebSocket(wsBaseUrl('/ws/test'), { headers: AUTH_HEADERS });

      ws.on('open', () => {
        // Terminate from client side (immediate socket destruction)
        setTimeout(() => {
          ws.terminate();
        }, 500);
      });

      ws.on('error', () => { /* ignored — we only care about cancel */ });
      ws.on('close', () => {
        // Wait for cancel event to propagate
        setTimeout(() => {
          expect(capturedRequestId).to.not.be.null;
          expect(cancelledIds).to.include(capturedRequestId!);
          done();
        }, 1000);
      });
    });

    it('should close client WebSocket when openHAB disconnects', function (done) {
      handleUpgrade();

      const ws = new WebSocket(wsBaseUrl('/ws/test'), { headers: AUTH_HEADERS });
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        done();
      };

      ws.on('open', () => {
        // Disconnect openHAB while WebSocket is active
        setTimeout(async () => {
          await openhabClient.disconnect();
        }, 500);
      });

      ws.on('close', finish);
      ws.on('error', finish); // Error is also acceptable — connection was severed
    });
  });
});
