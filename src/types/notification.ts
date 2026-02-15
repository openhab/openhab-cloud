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

import type { Types } from 'mongoose';
import type { INotification, NotificationPayload, IUserDevice } from './models';

export type { NotificationPayload };

/**
 * Result of a push notification send attempt
 */
export interface PushResult {
  success: boolean;
  token: string;
  error?: Error;
  response?: unknown;
}

/**
 * Configuration for FCM (Firebase Cloud Messaging)
 */
export interface FCMConfig {
  serviceAccountPath: string;
}

/**
 * Interface for push notification providers
 */
export interface IPushProvider {
  /**
   * Name of the provider for logging
   */
  readonly name: string;

  /**
   * Check if this provider is properly configured and ready
   */
  isConfigured(): boolean;

  /**
   * Send a notification to a single device token
   */
  send(token: string, notification: INotification): Promise<PushResult>;

  /**
   * Send a notification to multiple device tokens
   */
  sendMultiple(tokens: string[], notification: INotification): Promise<PushResult[]>;

  /**
   * Send a "hide notification" command to devices
   */
  sendHideNotification(tokens: string[], notificationId: string): Promise<PushResult[]>;
}

/**
 * Interface for the notification service
 */
export interface INotificationService {
  /**
   * Send a notification to a user (persists and sends push)
   */
  sendToUser(userId: string, payload: NotificationPayload): Promise<void>;

  /**
   * Save a notification without sending push (for log notifications)
   */
  saveOnly(userId: string, payload: NotificationPayload): Promise<void>;

  /**
   * Hide/dismiss a notification on user devices
   */
  hideNotification(userId: string, notificationId: string): Promise<void>;
}

/**
 * Logger interface for dependency injection
 */
export interface ILogger {
  error(message: string, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  info(message: string, ...meta: unknown[]): void;
  debug(message: string, ...meta: unknown[]): void;
}

/**
 * Repository interface for Notification model
 */
export interface INotificationRepository {
  create(data: {
    user: Types.ObjectId | string;
    message: string;
    icon?: string;
    severity?: string;
    payload: NotificationPayload;
  }): Promise<INotification>;
}

/**
 * Repository interface for UserDevice model
 */
export interface IUserDeviceRepository {
  findByOwner(ownerId: string): Promise<IUserDevice[]>;
}
