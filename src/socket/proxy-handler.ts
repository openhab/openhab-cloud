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

import type { Server as SocketIOServer } from 'socket.io';
import type { ILogger } from '../types/notification';
import type { RequestTracker } from './request-tracker';
import type { WebSocketTracker } from './websocket-tracker';
import { writeWithBackpressure } from './socket-writer';
import type {
  OpenhabSocket,
  ResponseHeaderData,
  ResponseContentData,
  ResponseFinishedData,
  ResponseErrorData,
  WebSocketData,
  WebSocketCloseData,
} from './types';

/**
 * Proxy Handler
 *
 * Handles response events from openHAB connections and writes them
 * to the corresponding HTTP response objects.
 *
 * Also handles WebSocket proxy connections: when openHAB responds with
 * 101 Switching Protocols, the handler upgrades the client connection
 * to a bidirectional WebSocket tunnel through Socket.IO.
 *
 * Events handled:
 * - responseHeader: HTTP headers from openHAB (including 101 upgrade)
 * - responseContentBinary: Response body chunks
 * - responseFinished: Response complete
 * - responseError: Error from openHAB
 * - websocket: Bidirectional WebSocket data from openHAB
 */
export class ProxyHandler {
  constructor(
    private readonly requestTracker: RequestTracker,
    private readonly webSocketTracker: WebSocketTracker,
    private readonly io: SocketIOServer,
    private readonly logger: ILogger
  ) {}

  /**
   * Handle response header from openHAB
   *
   * Writes the HTTP status code and headers to the client response.
   */
  handleResponseHeader(socket: OpenhabSocket, data: ResponseHeaderData): void {
    const requestId = data.id;

    if (!this.requestTracker.has(requestId)) {
      // Request no longer tracked - tell openHAB to cancel
      socket.emit('cancel', { id: requestId });
      return;
    }

    try {
      const request = this.requestTracker.get(requestId);

      // Verify the socket owns this request
      if (socket.handshake.uuid !== request.openhab.uuid) {
        this.logger.warn(
          `responseHeader: ${socket.handshake.uuid} tried to respond to request owned by ${request.openhab.uuid}`
        );
        return;
      }

      // Don't send headers twice
      if (request.headersSent) {
        this.logger.warn(
          `responseHeader: Headers already sent for request ${requestId}`
        );
        return;
      }

      // Handle WebSocket upgrade (101 Switching Protocols)
      if (data.responseStatusCode === 101) {
        this.handleWebSocketUpgrade(socket, request, data);
        return;
      }

      request.response.writeHead(
        data.responseStatusCode,
        data.responseStatusText,
        data.headers
      );
      this.requestTracker.markHeadersSent(requestId);
    } catch (error) {
      this.logger.error(`Error handling responseHeader for ${requestId}:`, error);
    }
  }

  /**
   * Handle response content from openHAB
   *
   * Writes a chunk of response body to the client.
   */
  handleResponseContent(socket: OpenhabSocket, data: ResponseContentData): void {
    const requestId = data.id;

    if (!this.requestTracker.has(requestId)) {
      socket.emit('cancel', { id: requestId });
      return;
    }

    try {
      const request = this.requestTracker.get(requestId);

      // Verify the socket owns this request
      if (socket.handshake.uuid !== request.openhab.uuid) {
        this.logger.warn(
          `responseContentBinary: ${socket.handshake.uuid} tried to respond to request owned by ${request.openhab.uuid}`
        );
        return;
      }

      request.response.write(data.body);
    } catch (error) {
      this.logger.error(`Error handling responseContent for ${requestId}:`, error);
    }
  }

  /**
   * Handle response finished from openHAB
   *
   * Ends the HTTP response and cleans up tracking.
   */
  handleResponseFinished(socket: OpenhabSocket, data: ResponseFinishedData): void {
    const requestId = data.id;

    if (!this.requestTracker.has(requestId)) {
      return;
    }

    try {
      const request = this.requestTracker.get(requestId);

      // Verify the socket owns this request
      if (socket.handshake.uuid !== request.openhab.uuid) {
        this.logger.warn(
          `responseFinished: ${socket.handshake.uuid} tried to respond to request owned by ${request.openhab.uuid}`
        );
        return;
      }

      request.response.end();
      this.requestTracker.markFinished(requestId);
      this.requestTracker.safeRemove(requestId);
    } catch (error) {
      this.logger.error(`Error handling responseFinished for ${requestId}:`, error);
    }
  }

  /**
   * Handle response error from openHAB
   *
   * Sends an error response to the client.
   */
  handleResponseError(socket: OpenhabSocket, data: ResponseErrorData): void {
    const requestId = data.id;

    if (!this.requestTracker.has(requestId)) {
      return;
    }

    try {
      const request = this.requestTracker.get(requestId);

      // Verify the socket owns this request
      if (socket.handshake.uuid !== request.openhab.uuid) {
        this.logger.warn(
          `responseError: ${socket.handshake.uuid} tried to respond to request owned by ${request.openhab.uuid}`
        );
        return;
      }

      // Send error response if headers not yet sent
      if (!request.headersSent) {
        request.response.status(500).send(data.responseStatusText);
      } else {
        // Headers already sent, just end the response
        request.response.end();
      }

      this.requestTracker.markFinished(requestId);
      this.requestTracker.safeRemove(requestId);
    } catch (error) {
      this.logger.error(`Error handling responseError for ${requestId}:`, error);
    }
  }

  /**
   * Sanitize a string for use in raw HTTP headers.
   * Strips CR, LF, and NUL bytes to prevent header injection / response splitting.
   */
  private sanitizeHeaderValue(value: string): string {
    return value.replace(/[\r\n\0]/g, '');
  }

  /**
   * Handle WebSocket upgrade (101 Switching Protocols)
   *
   * When openHAB responds with 101, we write raw HTTP upgrade headers
   * to the client's TCP socket and set up a bidirectional data tunnel.
   */
  private handleWebSocketUpgrade(
    openhabSocket: OpenhabSocket,
    request: import('./types').TrackedRequest,
    data: ResponseHeaderData
  ): void {
    const requestId = data.id;
    const clientSocket = request.response.socket;

    if (!clientSocket || clientSocket.destroyed) {
      this.logger.warn(`WebSocket upgrade: client socket unavailable for request ${requestId}`);
      openhabSocket.emit('cancel', { id: requestId });
      this.requestTracker.safeRemove(requestId);
      return;
    }

    // Detach the socket from the HTTP layer.
    //
    // When the request arrives through Express (e.g., a reverse proxy stripped
    // the Connection: Upgrade header so server.on('upgrade') didn't fire), the
    // HTTP parser's 'data' listener is still attached to the socket.  If not
    // removed, the parser will try to interpret incoming WebSocket frames as
    // HTTP requests, causing a parse error that destroys the socket.
    //
    // When the request arrives through server.on('upgrade'), Node.js has
    // already freed the parser, making this a safe no-op.
    clientSocket.removeAllListeners('data');

    // Detach the ServerResponse from the socket so its lifecycle events
    // (close, finish) don't interfere with the WebSocket connection.
    const httpResponse = request.response as unknown as import('http').ServerResponse;
    if (typeof httpResponse.detachSocket === 'function') {
      httpResponse.detachSocket(clientSocket);
    }

    // Build raw HTTP 101 response
    // We can't use response.writeHead() for 101 — it would close the HTTP response
    // Sanitize all values to prevent HTTP header injection / response splitting
    const statusText = this.sanitizeHeaderValue(data.responseStatusText || 'Switching Protocols');
    let rawResponse = `HTTP/1.1 101 ${statusText}\r\n`;
    for (const [key, value] of Object.entries(data.headers)) {
      const safeKey = this.sanitizeHeaderValue(key);
      if (Array.isArray(value)) {
        for (const v of value) {
          rawResponse += `${safeKey}: ${this.sanitizeHeaderValue(v)}\r\n`;
        }
      } else if (typeof value === 'string') {
        rawResponse += `${safeKey}: ${this.sanitizeHeaderValue(value)}\r\n`;
      }
    }
    rawResponse += '\r\n';

    // Write the 101 response directly to the TCP socket
    clientSocket.write(rawResponse);

    // Mark the socket as upgraded so the synthetic ServerResponse's
    // 'finish' handler in app.ts will not destroy this socket.
    (clientSocket as import('net').Socket & { __upgraded?: boolean }).__upgraded = true;

    // Configure socket for WebSocket mode
    clientSocket.setTimeout(0);
    clientSocket.setNoDelay(true);

    // Register in WebSocket tracker and remove from HTTP request tracker
    this.webSocketTracker.add(requestId, request.openhab, clientSocket);
    this.requestTracker.safeRemove(requestId);

    this.logger.info(
      `WebSocket proxy established: request ${requestId} for ${request.openhab.uuid}`
    );

    // Forward client → openHAB data
    clientSocket.on('data', (chunk: Buffer) => {
      openhabSocket.emit('websocket', requestId, chunk);
    });

    // Ensure the socket is in flowing mode so 'data' events fire.
    // After removeAllListeners('data') above, the stream may have
    // transitioned to paused mode; resume() restores flowing mode.
    clientSocket.resume();

    // Clean up on client socket close/error — use a flag to ensure
    // this only runs once even though multiple events may fire (e.g.
    // 'error' followed by 'close').
    let cleanedUp = false;
    const cleanup = (reason: string) => {
      if (cleanedUp) return;
      cleanedUp = true;
      this.webSocketTracker.remove(requestId);
      openhabSocket.emit('cancel', { id: requestId });
      this.logger.info(`WebSocket proxy closed (${reason}): request ${requestId}`);
    };

    clientSocket.on('close', () => cleanup('close'));
    clientSocket.on('error', (err) => {
      this.logger.warn(`WebSocket client socket error for request ${requestId}: ${err.message}`);
      cleanup('error');
    });
    clientSocket.on('end', () => cleanup('end'));
  }

  /**
   * Handle WebSocket data from openHAB (openHAB → client direction)
   *
   * Looks up the request in the WebSocket tracker, verifies UUID ownership,
   * and writes data to the client socket with backpressure handling.
   */
  handleWebSocketData(openhabSocket: OpenhabSocket, data: WebSocketData): void {
    const requestId = data.id;

    if (!this.webSocketTracker.has(requestId)) {
      openhabSocket.emit('cancel', { id: requestId });
      return;
    }

    try {
      const conn = this.webSocketTracker.get(requestId);

      // Verify the socket owns this connection
      if (openhabSocket.handshake.uuid !== conn.openhab.uuid) {
        this.logger.warn(
          `websocket: ${openhabSocket.handshake.uuid} tried to send data to connection owned by ${conn.openhab.uuid}`
        );
        return;
      }

      writeWithBackpressure(conn.socket, data.data).catch((err) => {
        this.logger.warn(`WebSocket write error for request ${requestId}: ${err.message}`);
        if (!conn.socket.destroyed) {
          conn.socket.destroy();
        }
        this.webSocketTracker.remove(requestId);
        openhabSocket.emit('cancel', { id: requestId });
      });
    } catch (error) {
      this.logger.error(`Error handling websocket data for ${requestId}:`, error);
    }
  }

  /**
   * Handle WebSocket close from openHAB
   *
   * Sent when the local openHAB WebSocket connection closes normally.
   * Destroys the corresponding client socket and removes from tracker.
   */
  handleWebSocketClose(socket: OpenhabSocket, data: WebSocketCloseData): void {
    const requestId = data.id;

    if (!this.webSocketTracker.has(requestId)) {
      return;
    }

    try {
      const conn = this.webSocketTracker.get(requestId);

      // Verify the socket owns this connection
      if (socket.handshake.uuid !== conn.openhab.uuid) {
        this.logger.warn(
          `websocketClose: ${socket.handshake.uuid} tried to close connection owned by ${conn.openhab.uuid}`
        );
        return;
      }

      this.logger.info(`WebSocket proxy closed by openHAB: request ${requestId}`);
      if (!conn.socket.destroyed) {
        conn.socket.destroy();
      }
      this.webSocketTracker.remove(requestId);
    } catch (error) {
      this.logger.error(`Error handling websocketClose for ${requestId}:`, error);
    }
  }

  /**
   * Clean up orphaned requests
   *
   * Called periodically to remove requests that are finished but
   * weren't properly cleaned up, and notify openHAB to cancel them.
   */
  cleanupOrphanedRequests(): void {
    const orphaned = this.requestTracker.cleanupOrphaned();

    for (const { requestId, openhabUuid } of orphaned) {
      this.logger.debug(`Expiring orphaned response ${requestId}`);
      // Notify openHAB to cancel processing this request
      this.io.sockets.in(openhabUuid).emit('cancel', { id: requestId });
    }

    if (orphaned.length > 0) {
      this.logger.info(`Cleaned up ${orphaned.length} orphaned requests`);
    }
  }

  /**
   * Cancel a request and notify openHAB
   *
   * @param requestId - The request ID to cancel
   * @param uuid - The openHAB UUID to notify
   */
  cancelRequest(requestId: number, uuid: string): void {
    this.io.to(uuid).emit('cancel', { id: requestId });
    this.requestTracker.safeRemove(requestId);
  }

}
