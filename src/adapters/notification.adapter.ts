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
 * Notification System Adapter
 *
 * This adapter bridges the legacy JavaScript code (app.js, socket-io.js)
 * with the new TypeScript notification service.
 *
 * It provides the same API as the old notificationsender/index.js module
 * so it can be used as a drop-in replacement.
 */

import type { ILogger, FCMConfig, NotificationPayload } from '../types/notification';
import { NotificationService } from '../services/notification.service';
import { NotificationRepository, type NotificationModel } from '../repositories/notification.repository';
import { UserDeviceRepository, type UserDeviceModel } from '../repositories/userdevice.repository';
import { FCMProvider } from '../lib/push/fcm.provider';

// Type for existing system module
interface SystemModule {
  isGcmConfigured(): boolean;
  getFirebaseServiceFile(): string;
}

/**
 * Logger adapter that wraps the existing Winston logger
 */
class LoggerAdapter implements ILogger {
  constructor(private readonly winston: {
    error: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  }) {}

  error(message: string, ...meta: unknown[]): void {
    this.winston.error(message, ...meta);
  }

  warn(message: string, ...meta: unknown[]): void {
    this.winston.warn(message, ...meta);
  }

  info(message: string, ...meta: unknown[]): void {
    this.winston.info(message, ...meta);
  }

  debug(message: string, ...meta: unknown[]): void {
    this.winston.debug(message, ...meta);
  }
}

/**
 * Create the notification service with all dependencies
 *
 * This factory function creates the full notification service stack
 * using the existing Mongoose models and configuration.
 */
export function createNotificationService(dependencies: {
  NotificationModel: NotificationModel;
  UserDeviceModel: UserDeviceModel;
  logger: {
    error: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  system: SystemModule;
}): NotificationService {
  const { NotificationModel, UserDeviceModel, logger, system } = dependencies;

  // Wrap the logger
  const loggerAdapter = new LoggerAdapter(logger);

  // Create repositories
  const notificationRepository = new NotificationRepository(NotificationModel);
  const userDeviceRepository = new UserDeviceRepository(UserDeviceModel);

  // Create FCM config
  const fcmConfig: FCMConfig | null = system.isGcmConfigured()
    ? { serviceAccountPath: system.getFirebaseServiceFile() }
    : null;

  // Create FCM provider
  const fcmProvider = new FCMProvider(fcmConfig, loggerAdapter);

  // Create and return the service
  return new NotificationService(
    notificationRepository,
    userDeviceRepository,
    fcmProvider,
    loggerAdapter
  );
}

/**
 * Create a legacy-compatible notification sender module
 *
 * This creates an object that matches the API of the old
 * notificationsender/index.js module, allowing drop-in replacement.
 */
export function createLegacyNotificationSender(dependencies: {
  NotificationModel: NotificationModel;
  UserDeviceModel: UserDeviceModel;
  logger: {
    error: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  system: SystemModule;
}): {
  sendNotification: (userId: string, data: NotificationPayload) => Promise<void>;
  hideNotification: (userId: string, notificationId: string) => Promise<void>;
} {
  const service = createNotificationService(dependencies);

  return {
    /**
     * Send notification - matches old API
     */
    sendNotification: async (userId: string, data: NotificationPayload): Promise<void> => {
      await service.sendToUser(userId, data);
    },

    /**
     * Hide notification
     */
    hideNotification: async (userId: string, notificationId: string): Promise<void> => {
      await service.hideNotification(userId, notificationId);
    },
  };
}
