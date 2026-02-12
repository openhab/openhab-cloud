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

export { SocketServer } from './socket-server';
export type {
  IUserRepositoryForSocket,
  IOpenhabRepositoryForSocket,
  IEventRepositoryForSocket,
} from './socket-server';

export { ConnectionManager } from './connection-manager';
export type {
  IRedisClientForConnection,
  IOpenhabRepositoryForConnection,
  BlockedResult,
  LockResult,
} from './connection-manager';

export { ProxyHandler } from './proxy-handler';

export { RequestTracker } from './request-tracker';

export type {
  ConnectionInfo,
  OpenhabSocket,
  TrackedRequest,
  ResponseHeaderData,
  ResponseContentData,
  ResponseFinishedData,
  ResponseErrorData,
  NotificationData,
  ISocketSystemConfig,
  IRedisClientForSocket,
  IRedisMulti,
} from './types';
