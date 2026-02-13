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

import type { Server as HttpServer } from 'http';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { v1 as uuidv1 } from 'uuid';
import type { Types } from 'mongoose';
import type { IOpenhab, IUser, IEvent } from '../types/models';
import type { ILogger, INotificationService, NotificationPayload } from '../types/notification';
import type {
  OpenhabSocket,
  ISocketSystemConfig,
  NotificationData,
  ResponseHeaderData,
  ResponseContentData,
  ResponseFinishedData,
  ResponseErrorData,
} from './types';
import { ConnectionManager } from './connection-manager';
import { ProxyHandler } from './proxy-handler';
import { RequestTracker } from './request-tracker';
import { invalidateConnectionCache } from '../routes/middleware';

/**
 * Repository interface for User operations
 */
export interface IUserRepositoryForSocket {
  findByUsername(username: string): Promise<IUser | null>;
  findByAccount(accountId: string | Types.ObjectId): Promise<IUser[]>;
}

/**
 * Repository interface for OpenHAB operations
 */
export interface IOpenhabRepositoryForSocket {
  findById(id: string | Types.ObjectId): Promise<IOpenhab | null>;
  updateLastOnline(id: string | Types.ObjectId): Promise<void>;
}

/**
 * Repository interface for Event operations
 */
export interface IEventRepositoryForSocket {
  create(data: {
    openhab: Types.ObjectId | string;
    source: string;
    status: string;
    color: string;
  }): Promise<IEvent>;
}

/**
 * Socket Server
 *
 * Main orchestrator for WebSocket connections from openHAB instances.
 * Handles:
 * - Connection authentication and locking
 * - Proxy response forwarding
 * - Notifications from openHAB
 * - Connection lifecycle events
 */
export class SocketServer {
  private io: SocketIOServer | null = null;
  private isShuttingDown = false;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private requestTracker: RequestTracker;
  private proxyHandler: ProxyHandler | null = null;

  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly userRepository: IUserRepositoryForSocket,
    private readonly openhabRepository: IOpenhabRepositoryForSocket,
    private readonly eventRepository: IEventRepositoryForSocket,
    private readonly notificationService: INotificationService,
    private readonly systemConfig: ISocketSystemConfig,
    private readonly logger: ILogger
  ) {
    this.requestTracker = new RequestTracker();
  }

  /**
   * Initialize the Socket.IO server
   *
   * @param httpServer - The HTTP server to attach to
   */
  initialize(httpServer: HttpServer): void {
    // Dynamic import of socket.io to avoid issues with CommonJS/ESM
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const socketio = require('socket.io') as (server: HttpServer, opts?: unknown) => SocketIOServer;

    this.io = socketio(httpServer, {
      maxHttpBufferSize: 1e8, // 100MB
    });

    this.proxyHandler = new ProxyHandler(this.requestTracker, this.io!, this.logger);

    this.setupMiddleware();
    this.setupConnectionHandlers();
    this.startCleanupInterval();

    this.logger.info('Socket.IO server initialized');
  }

  /**
   * Set up authentication middleware
   */
  private setupMiddleware(): void {
    if (!this.io) return;

    // Check for shutdown
    this.io.use((socket, next) => {
      if (this.isShuttingDown) {
        return next(new Error('Shutting down'));
      }
      next();
    });

    // Check if blocked
    this.io.use(async (socket, next) => {
      const uuid = this.getUuidFromSocket(socket);
      if (!uuid) {
        return next(new Error('missing uuid'));
      }

      const blockResult = await this.connectionManager.isBlocked(uuid);
      if (blockResult.blocked) {
        if (blockResult.ttl) {
          return next(new Error(`try again in ${blockResult.ttl} seconds`));
        }
        return next(new Error('your connection is blocked'));
      }

      next();
    });

    // Authenticate
    this.io.use(async (socket, next) => {
      const openhabSocket = socket as OpenhabSocket;
      const uuid = this.getUuidFromSocket(socket);
      const secret = socket.handshake.headers['secret'] as string | undefined;
      const version = (socket.handshake.headers['openhabversion'] as string) || 'unknown';

      if (!uuid || !secret) {
        return next(new Error('missing credentials'));
      }

      openhabSocket.handshake.uuid = uuid;
      openhabSocket.handshake.openhabVersion = version;

      this.logger.info(`Authorizing openHAB connection: ${uuid} version ${version}`);

      const openhab = await this.connectionManager.authenticate(uuid, secret);
      if (!openhab) {
        this.logger.info(`openHAB not found: ${uuid}`);
        await this.connectionManager.blockUuid(uuid, version);
        return next(new Error('not authorized'));
      }

      openhabSocket.openhab = openhab;
      openhabSocket.openhabId = openhab._id.toString();
      next();
    });

    // Acquire connection lock
    this.io.use(async (socket, next) => {
      const openhabSocket = socket as OpenhabSocket;
      const connectionId = uuidv1();
      openhabSocket.connectionId = connectionId;

      const openhabId = openhabSocket.openhab!._id.toString();
      const version = openhabSocket.handshake.openhabVersion || 'unknown';

      this.logger.info(
        `Acquiring lock for ${openhabSocket.handshake.uuid}, connectionId ${connectionId}`
      );

      openhabSocket.redisLockKey = this.connectionManager.getLockKey(openhabId);

      const lockResult = await this.connectionManager.acquireLock(
        openhabId,
        connectionId,
        version
      );

      if (!lockResult.acquired) {
        return next(new Error(lockResult.error || 'connection lock error'));
      }

      next();
    });
  }

  /**
   * Set up connection event handlers
   */
  private setupConnectionHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      const openhabSocket = socket as OpenhabSocket;

      this.logger.info(
        `Connection success: ${openhabSocket.handshake.uuid}, connectionId ${openhabSocket.connectionId}`
      );

      // Join room for this openHAB UUID
      socket.join(openhabSocket.handshake.uuid!);

      // Invalidate connection cache so middleware sees updated status
      invalidateConnectionCache(openhabSocket.openhabId!);

      // Save connection event
      this.saveConnectionEvent(openhabSocket.openhab!, 'online', 'good');

      // Handle ping (heartbeat) - renew lock
      socket.conn.on('packet', (packet: { type: string }) => {
        if (packet.type === 'ping') {
          this.handlePing(openhabSocket);
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(openhabSocket);
      });

      // Proxy response handlers
      socket.on('responseHeader', (data: ResponseHeaderData) => {
        this.proxyHandler?.handleResponseHeader(openhabSocket, data);
      });

      socket.on('responseContentBinary', (data: ResponseContentData) => {
        this.proxyHandler?.handleResponseContent(openhabSocket, data);
      });

      socket.on('responseFinished', (data: ResponseFinishedData) => {
        this.proxyHandler?.handleResponseFinished(openhabSocket, data);
      });

      socket.on('responseError', (data: ResponseErrorData) => {
        this.proxyHandler?.handleResponseError(openhabSocket, data);
      });

      // Notification handlers
      socket.on('notification', (data: NotificationData) => {
        this.handleNotification(openhabSocket, data);
      });

      socket.on('broadcastnotification', (data: NotificationData) => {
        this.handleBroadcastNotification(openhabSocket, data);
      });

      socket.on('lognotification', (data: NotificationData) => {
        this.handleLogNotification(openhabSocket, data);
      });
    });
  }

  /**
   * Handle ping/heartbeat from client
   */
  private async handlePing(socket: OpenhabSocket): Promise<void> {
    if (!socket.redisLockKey || !socket.connectionId) return;

    const stillOwnsLock = await this.connectionManager.renewLock(
      socket.redisLockKey,
      socket.connectionId
    );

    if (!stillOwnsLock) {
      this.logger.error(
        `Lost lock during ping for ${socket.handshake.uuid}, disconnecting`
      );
      socket.disconnect();
    }
  }

  /**
   * Handle client disconnect
   */
  private async handleDisconnect(socket: OpenhabSocket): Promise<void> {
    this.logger.info(
      `Disconnected: ${socket.handshake.uuid}, connectionId ${socket.connectionId}`
    );

    if (socket.redisLockKey && socket.connectionId && socket.openhab) {
      this.logger.info(
        `Releasing lock ${socket.redisLockKey} for connectionId ${socket.connectionId}`
      );
      await this.connectionManager.releaseLock(
        socket.redisLockKey,
        socket.connectionId,
        socket.openhab._id.toString()
      );
      this.logger.info(`Lock released for ${socket.handshake.uuid}`);

      // Invalidate connection cache so middleware sees updated status
      invalidateConnectionCache(socket.openhabId!);

      // Save offline event
      this.saveConnectionEvent(socket.openhab, 'offline', 'bad');
    } else {
      this.logger.warn(
        `Cannot release lock - missing data: redisLockKey=${socket.redisLockKey}, connectionId=${socket.connectionId}, openhab=${!!socket.openhab}`
      );
    }
  }

  /**
   * Handle notification request from openHAB
   */
  private async handleNotification(
    socket: OpenhabSocket,
    data: NotificationData
  ): Promise<void> {
    this.logger.info(
      `Notification request from ${socket.handshake.uuid} to user ${data.userId}`
    );

    try {
      const user = await this.userRepository.findByUsername(data.userId);
      if (!user) {
        this.logger.warn(`User not found: ${data.userId}`);
        return;
      }

      // Verify the openHAB belongs to this user's account
      const openhab = await this.openhabRepository.findById(socket.openhabId!);
      if (!openhab || openhab.account.toString() !== user.account.toString()) {
        this.logger.warn(
          `openHAB ${socket.handshake.uuid} requested notification for user ${data.userId} which it does not belong to`
        );
        return;
      }

      // Pass entire data object to preserve all custom properties (like media-attachment-url)
      const payload: NotificationPayload = {
        ...data,
        message: data.message, // ensure required field is present
        type: data.type as 'notification' | 'hideNotification' | undefined,
      };

      await this.notificationService.sendToUser(user._id.toString(), payload);
    } catch (error) {
      this.logger.error(`Error sending notification:`, error);
    }
  }

  /**
   * Handle broadcast notification request from openHAB
   */
  private async handleBroadcastNotification(
    socket: OpenhabSocket,
    data: NotificationData
  ): Promise<void> {
    try {
      const openhab = await this.openhabRepository.findById(socket.openhabId!);
      if (!openhab) {
        this.logger.warn(`openHAB not found: ${socket.openhabId}`);
        return;
      }

      const users = await this.userRepository.findByAccount(openhab.account);
      if (!users || users.length === 0) {
        this.logger.debug('No users found for openHAB');
        return;
      }

      // Pass entire data object to preserve all custom properties (like media-attachment-url)
      const payload: NotificationPayload = {
        ...data,
        message: data.message, // ensure required field is present
        type: data.type as 'notification' | 'hideNotification' | undefined,
      };

      for (const user of users) {
        try {
          await this.notificationService.sendToUser(user._id.toString(), payload);
        } catch (error) {
          this.logger.warn(
            `Could not send broadcast notification to ${user.username}:`,
            error
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error handling broadcast notification:`, error);
    }
  }

  /**
   * Handle log notification request from openHAB (save without sending push)
   */
  private async handleLogNotification(
    socket: OpenhabSocket,
    data: NotificationData
  ): Promise<void> {
    try {
      const openhab = await this.openhabRepository.findById(socket.openhabId!);
      if (!openhab) {
        this.logger.warn(`openHAB not found: ${socket.openhabId}`);
        return;
      }

      const users = await this.userRepository.findByAccount(openhab.account);
      if (!users || users.length === 0) {
        this.logger.debug('No users found for openHAB');
        return;
      }

      // Pass entire data object to preserve all custom properties (like media-attachment-url)
      const payload: NotificationPayload = {
        ...data,
        message: data.message, // ensure required field is present
        type: data.type as 'notification' | 'hideNotification' | undefined,
      };

      // Save notification for each user (no push)
      this.logger.info(`Saving log notification for ${users.length} users: ${data.message}`);
      for (const user of users) {
        try {
          await this.notificationService.saveOnly(user._id.toString(), payload);
        } catch (error) {
          this.logger.warn(`Could not save log notification for ${user.username}:`, error);
        }
      }
    } catch (error) {
      this.logger.error(`Error handling log notification:`, error);
    }
  }

  /**
   * Save a connection event to the database
   */
  private async saveConnectionEvent(
    openhab: IOpenhab,
    status: string,
    color: string
  ): Promise<void> {
    try {
      await this.eventRepository.create({
        openhab: openhab._id,
        source: 'openhab',
        status,
        color,
      });
    } catch (error) {
      this.logger.error(`Error saving connection event:`, error);
    }
  }

  /**
   * Start periodic cleanup of orphaned requests
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.logger.debug(`Checking orphaned requests (${this.requestTracker.size()})`);
      this.proxyHandler?.cleanupOrphanedRequests();
    }, 60000);
  }

  /**
   * Get UUID from socket handshake
   */
  private getUuidFromSocket(socket: Socket): string | undefined {
    return (
      (socket.handshake.query['uuid'] as string) ||
      (socket.handshake.headers['uuid'] as string)
    );
  }

  /**
   * Get the Socket.IO server instance
   */
  getIO(): SocketIOServer | null {
    return this.io;
  }

  /**
   * Get the request tracker instance
   */
  getRequestTracker(): RequestTracker {
    return this.requestTracker;
  }

  /**
   * Get the proxy handler instance
   */
  getProxyHandler(): ProxyHandler | null {
    return this.proxyHandler;
  }

  /**
   * Gracefully shut down the socket server
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.io) {
      return new Promise((resolve) => {
        // Socket.IO v2 doesn't have disconnectSockets, iterate through sockets
        const sockets = this.io!.sockets.sockets;
        if (sockets) {
          Object.keys(sockets).forEach((id) => {
            const socket = sockets[id];
            if (socket) {
              socket.disconnect(true);
            }
          });
        }
        this.logger.info('All socket.io connections closed');
        resolve();
      });
    }
  }
}
