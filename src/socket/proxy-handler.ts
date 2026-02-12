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
import type {
  OpenhabSocket,
  ResponseHeaderData,
  ResponseContentData,
  ResponseFinishedData,
  ResponseErrorData,
} from './types';

/**
 * Proxy Handler
 *
 * Handles response events from openHAB connections and writes them
 * to the corresponding HTTP response objects.
 *
 * Events handled:
 * - responseHeader: HTTP headers from openHAB
 * - responseContentBinary: Response body chunks
 * - responseFinished: Response complete
 * - responseError: Error from openHAB
 */
export class ProxyHandler {
  constructor(
    private readonly requestTracker: RequestTracker,
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

  /**
   * Get the request tracker instance
   */
  getRequestTracker(): RequestTracker {
    return this.requestTracker;
  }
}
