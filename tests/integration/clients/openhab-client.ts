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
 * OpenHAB Test Client
 *
 * TypeScript Socket.IO client that simulates an openHAB instance
 * for integration testing.
 */

import { createHash } from 'crypto';
import { io, Socket } from 'socket.io-client';

/**
 * Proxy request from the server
 */
export interface ProxyRequest {
  id: number;
  method: string;
  headers: Record<string, string>;
  path: string;
  query: Record<string, string>;
  body?: string | Buffer;
  userId?: string;
}

/**
 * Proxy response to send back
 */
export interface ProxyResponse {
  id: number;
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}

/**
 * Command from the server
 */
export interface CommandData {
  item: string;
  command: string;
}

/**
 * Notification options
 */
export interface NotificationOptions {
  icon?: string;
  severity?: string;
  tag?: string;
  title?: string;
  onClickAction?: string;
  mediaAttachmentUrl?: string;
  actionButton1?: string;
  actionButton2?: string;
  actionButton3?: string;
}

/**
 * Notification data
 */
export interface NotificationData {
  userId?: string;
  message: string;
  icon?: string;
  severity?: string;
  tag?: string;
  title?: string;
  'on-click'?: string;
  'media-attachment-url'?: string;
  'action-button-1'?: string;
  'action-button-2'?: string;
  'action-button-3'?: string;
}

/**
 * OpenHAB Test Client
 *
 * Simulates an openHAB instance connecting to the cloud service.
 */
export class OpenHABTestClient {
  private socket: Socket | null = null;
  private connected = false;
  private connectionIdInternal: string | undefined;

  private requestHandler: ((request: ProxyRequest) => Promise<ProxyResponse> | ProxyResponse) | null =
    null;
  private commandHandler: ((command: CommandData) => void) | null = null;
  private cancelHandler: ((requestId: number) => void) | null = null;
  private webSocketHandler: ((requestId: number, data: Buffer) => void) | null = null;

  constructor(
    private readonly serverUrl: string,
    private readonly uuid: string,
    private readonly secret: string,
    private readonly version: string = '4.0.0'
  ) {}

  /**
   * Connect to the cloud server
   */
  async connect(): Promise<void> {
    if (this.socket) {
      throw new Error('Already connected');
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      const timeout = setTimeout(() => {
        settle(() => {
          if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
          }
          reject(new Error('Connection timeout'));
        });
      }, 10000);

      this.socket = io(this.serverUrl, {
        query: { uuid: this.uuid },
        extraHeaders: {
          secret: this.secret,
          openhabversion: this.version,
        },
        // Start with polling to send headers, then upgrade to websocket
        transports: ['polling', 'websocket'],
        reconnection: false,
        timeout: 10000,
      });

      this.socket.on('connect', () => {
        settle(() => {
          clearTimeout(timeout);
          this.connected = true;
          resolve();
        });
      });

      this.socket.on('connect_error', (err) => {
        settle(() => {
          clearTimeout(timeout);
          this.socket?.disconnect();
          this.socket = null;
          reject(err);
        });
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        this.connectionIdInternal = undefined;
      });

      // Handle proxy requests
      this.socket.on('request', async (data: ProxyRequest) => {
        if (this.requestHandler) {
          try {
            const response = await this.requestHandler(data);
            this.sendResponse(response);
          } catch (err) {
            this.sendResponseError(data.id, err instanceof Error ? err.message : 'Unknown error');
          }
        }
      });

      // Handle commands
      this.socket.on('command', (data: CommandData) => {
        if (this.commandHandler) {
          this.commandHandler(data);
        }
      });

      // Handle cancel
      this.socket.on('cancel', (data: { id: number }) => {
        if (this.cancelHandler) {
          this.cancelHandler(data.id);
        }
      });

      // Handle WebSocket proxy data (client → openHAB direction)
      this.socket.on('websocket', (requestId: number, data: Buffer) => {
        if (this.webSocketHandler) {
          this.webSocketHandler(requestId, data);
        }
      });
    });
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.requestHandler = null;
      this.commandHandler = null;
      this.cancelHandler = null;
      this.webSocketHandler = null;
      // Wait for server-side lock release (Redis WATCH+MULTI+DEL)
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  /**
   * Wait for connection to be established
   */
  async waitForConnection(timeoutMs = 5000): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        if (this.connected) {
          clearTimeout(timeout);
          clearInterval(check);
          resolve();
        }
      }, 100);

      const timeout = setTimeout(() => {
        clearInterval(check);
        reject(new Error('Connection timeout'));
      }, timeoutMs);
    });
  }

  /**
   * Set handler for proxy requests
   */
  onRequest(handler: (request: ProxyRequest) => Promise<ProxyResponse> | ProxyResponse): void {
    this.requestHandler = handler;
  }

  /**
   * Set handler for commands
   */
  onCommand(handler: (command: CommandData) => void): void {
    this.commandHandler = handler;
  }

  /**
   * Set handler for cancel events
   */
  onCancel(handler: (requestId: number) => void): void {
    this.cancelHandler = handler;
  }

  /**
   * Send a complete proxy response
   */
  private sendResponse(response: ProxyResponse): void {
    if (!this.socket) return;

    // Send headers
    this.socket.emit('responseHeader', {
      id: response.id,
      headers: response.headers || {},
      responseStatusCode: response.status,
      responseStatusText: response.statusText || 'OK',
    });

    // Send body if present
    if (response.body) {
      const content = typeof response.body === 'string' ? Buffer.from(response.body) : response.body;
      this.socket.emit('responseContentBinary', {
        id: response.id,
        body: content,
      });
    }

    // Signal completion
    this.socket.emit('responseFinished', {
      id: response.id,
    });
  }

  /**
   * Send response header
   */
  sendResponseHeader(requestId: number, status: number, headers: Record<string, string>): void {
    if (!this.socket) return;

    this.socket.emit('responseHeader', {
      id: requestId,
      headers,
      responseStatusCode: status,
      responseStatusText: 'OK',
    });
  }

  /**
   * Send response content
   */
  sendResponseContent(requestId: number, body: Buffer | string): void {
    if (!this.socket) return;

    const content = typeof body === 'string' ? Buffer.from(body) : body;
    this.socket.emit('responseContentBinary', {
      id: requestId,
      body: content,
    });
  }

  /**
   * Signal response complete
   */
  sendResponseFinished(requestId: number): void {
    if (!this.socket) return;

    this.socket.emit('responseFinished', {
      id: requestId,
    });
  }

  /**
   * Send response error
   */
  sendResponseError(requestId: number, error: string): void {
    if (!this.socket) return;

    this.socket.emit('responseError', {
      id: requestId,
      error,
    });
  }

  /**
   * Send notification to a specific user
   */
  sendNotification(userId: string, message: string, options?: NotificationOptions): void {
    if (!this.socket) return;

    const data: NotificationData = {
      userId,
      message,
      ...this.mapOptions(options),
    };

    this.socket.emit('notification', data);
  }

  /**
   * Send broadcast notification to all account users
   */
  sendBroadcastNotification(message: string, options?: NotificationOptions): void {
    if (!this.socket) return;

    const data: NotificationData = {
      message,
      ...this.mapOptions(options),
    };

    this.socket.emit('broadcastnotification', data);
  }

  /**
   * Log notification without push
   */
  logNotification(message: string, options?: NotificationOptions): void {
    if (!this.socket) return;

    const data: NotificationData = {
      message,
      ...this.mapOptions(options),
    };

    this.socket.emit('lognotification', data);
  }

  /**
   * Map options to notification data format
   */
  private mapOptions(options?: NotificationOptions): Partial<NotificationData> {
    if (!options) return {};

    return {
      icon: options.icon,
      severity: options.severity,
      tag: options.tag,
      title: options.title,
      'on-click': options.onClickAction,
      'media-attachment-url': options.mediaAttachmentUrl,
      'action-button-1': options.actionButton1,
      'action-button-2': options.actionButton2,
      'action-button-3': options.actionButton3,
    };
  }

  /**
   * Set handler for WebSocket proxy data (client → openHAB direction)
   */
  onWebSocket(handler: (requestId: number, data: Buffer) => void): void {
    this.webSocketHandler = handler;
  }

  /**
   * Send WebSocket data back to client (openHAB → client direction)
   */
  sendWebSocketData(requestId: number, data: Buffer | string): void {
    if (!this.socket) return;

    const content = typeof data === 'string' ? Buffer.from(data) : data;
    this.socket.emit('websocket', requestId, content);
  }

  /**
   * Send a 101 Switching Protocols response header (for WebSocket upgrade)
   *
   * @param requestId - The proxy request ID
   * @param wsKeyOrHeaders - Either the client's Sec-WebSocket-Key string
   *   (used to compute Sec-WebSocket-Accept per RFC 6455) or a headers object.
   */
  sendUpgradeResponse(requestId: number, wsKeyOrHeaders?: string | Record<string, string>): void {
    if (!this.socket) return;

    let extraHeaders: Record<string, string> = {};
    if (typeof wsKeyOrHeaders === 'string') {
      // Compute Sec-WebSocket-Accept per RFC 6455 Section 4.2.2
      const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
      const accept = createHash('sha1')
        .update(wsKeyOrHeaders + GUID)
        .digest('base64');
      extraHeaders = { 'Sec-WebSocket-Accept': accept };
    } else if (wsKeyOrHeaders) {
      extraHeaders = wsKeyOrHeaders;
    }

    this.socket.emit('responseHeader', {
      id: requestId,
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        ...extraHeaders,
      },
      responseStatusCode: 101,
      responseStatusText: 'Switching Protocols',
    });
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the connection ID
   */
  get connectionId(): string | undefined {
    return this.connectionIdInternal;
  }

  /**
   * Get the underlying socket (for testing)
   */
  get rawSocket(): Socket | null {
    return this.socket;
  }
}
