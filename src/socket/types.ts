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
import type { Socket } from 'socket.io';
import type { Response } from 'express';
import type { Types } from 'mongoose';
import type { IOpenhab } from '../types/models';
import type { ConnectionInfo } from '../types/connection';

export type { ConnectionInfo };

/**
 * Extended Socket with openHAB-specific properties
 */
export interface OpenhabSocket extends Socket {
  openhab?: IOpenhab;
  openhabId?: string;
  connectionId?: string;
  redisLockKey?: string;
  handshake: Socket['handshake'] & {
    uuid?: string;
    openhabVersion?: string;
  };
}

/**
 * Tracked request/response for proxying
 */
export interface TrackedRequest {
  openhab: IOpenhab;
  response: Response;
  headersSent: boolean;
  finished: boolean;
  createdAt: Date;
}

/**
 * Response header data from openHAB
 */
export interface ResponseHeaderData {
  id: number;
  responseStatusCode: number;
  responseStatusText: string;
  headers: Record<string, string | string[]>;
}

/**
 * Response content data from openHAB
 */
export interface ResponseContentData {
  id: number;
  body: Buffer | string;
}

/**
 * Response finished/error data from openHAB
 */
export interface ResponseFinishedData {
  id: number;
}

export interface ResponseErrorData {
  id: number;
  responseStatusText: string;
}

/**
 * Notification data from openHAB
 */
export interface NotificationData {
  userId: string;
  message: string;
  icon?: string;
  severity?: string;
  tag?: string;
  title?: string;
  type?: string;
  'reference-id'?: string;
  actions?: string;
  [key: string]: unknown;
}

/**
 * System configuration for socket server
 */
export interface ISocketSystemConfig {
  getInternalAddress(): string;
  getConnectionLockTimeSeconds(): number;
}

/**
 * Tracked WebSocket proxy connection
 *
 * Represents a client WebSocket connection being proxied through
 * the cloud to an openHAB instance via Socket.IO.
 */
export interface TrackedWebSocket {
  openhab: IOpenhab;
  socket: NetSocket;
  requestId: number;
  createdAt: Date;
}

/**
 * WebSocket data from openHAB via Socket.IO
 *
 * Java emits byte[], which Socket.IO delivers as Buffer on Node.js.
 * We accept both Buffer and ArrayBuffer for compatibility.
 */
export interface WebSocketData {
  id: number;
  data: Buffer | ArrayBuffer;
}

/**
 * WebSocket close event from openHAB via Socket.IO
 *
 * Sent when the local openHAB WebSocket connection closes normally.
 */
export interface WebSocketCloseData {
  id: number;
}
