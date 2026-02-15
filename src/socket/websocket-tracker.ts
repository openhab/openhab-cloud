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

import type { Socket as NetSocket } from 'net';
import type { IOpenhab } from '../types/models';
import type { TrackedWebSocket } from './types';

/**
 * WebSocket Tracker
 *
 * Tracks active WebSocket proxy connections that have been upgraded
 * from HTTP. These are separate from regular HTTP proxy requests
 * because they maintain persistent bidirectional data channels.
 *
 * Each tracked connection maps a request ID to a client TCP socket
 * and the openHAB instance it connects to.
 */
export class WebSocketTracker {
  private connections: Map<number, TrackedWebSocket> = new Map();

  /**
   * Get the number of tracked WebSocket connections
   */
  size(): number {
    return this.connections.size;
  }

  /**
   * Check if a WebSocket connection with the given request ID exists
   */
  has(requestId: number): boolean {
    return this.connections.has(requestId);
  }

  /**
   * Get a tracked WebSocket connection by request ID
   *
   * @throws RangeError if connection not found
   */
  get(requestId: number): TrackedWebSocket {
    const conn = this.connections.get(requestId);
    if (!conn) {
      throw new RangeError(
        `The WebSocket connection with ID ${requestId} is not tracked`
      );
    }
    return conn;
  }

  /**
   * Register an upgraded WebSocket connection
   */
  add(requestId: number, openhab: IOpenhab, socket: NetSocket): void {
    this.connections.set(requestId, {
      openhab,
      socket,
      requestId,
      createdAt: new Date(),
    });
  }

  /**
   * Remove a tracked WebSocket connection
   */
  remove(requestId: number): boolean {
    return this.connections.delete(requestId);
  }

  /**
   * Remove and destroy all WebSocket connections for a given openHAB UUID.
   * Called when the openHAB Socket.IO connection disconnects.
   *
   * @returns The number of connections cleaned up
   */
  removeAllForUuid(uuid: string): number {
    let count = 0;
    for (const [requestId, conn] of this.connections) {
      if (conn.openhab.uuid === uuid) {
        this.connections.delete(requestId);
        if (!conn.socket.destroyed) {
          conn.socket.destroy();
        }
        count++;
      }
    }
    return count;
  }
}
