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

import type { RequestHandler, Request } from 'express';
import type { Types } from 'mongoose';
import type { INotification, IUserDevice } from '../types/models';
import type { ILogger, INotificationService, NotificationPayload } from '../types/notification';

/**
 * Repository interface for Notification operations
 */
export interface INotificationRepositoryForApi {
  findByUser(
    userId: string | Types.ObjectId,
    options?: { limit?: number; skip?: number }
  ): Promise<INotification[]>;
}

/**
 * Repository interface for UserDevice operations
 */
export interface IUserDeviceRepositoryForApi {
  findByOwner(ownerId: string | Types.ObjectId): Promise<IUserDevice[]>;
}

/**
 * Push provider interface for hiding notifications
 */
export interface IPushProviderForApi {
  sendHideNotification(tokens: string[], notificationId: string): Promise<void>;
}

/**
 * System configuration interface
 */
export interface ISystemConfig {
  isGcmConfigured(): boolean;
  getGcmSenderId(): string;
  getProxyURL(): string;
  getAppleId(): string;
  getAndroidId(): string;
}

/**
 * API Controller
 *
 * Handles REST API endpoints for mobile apps:
 * - Notifications
 * - App settings
 * - Push notification configuration
 */
export class ApiController {
  constructor(
    private readonly notificationRepository: INotificationRepositoryForApi,
    private readonly userDeviceRepository: IUserDeviceRepositoryForApi,
    private readonly notificationService: INotificationService,
    private readonly pushProvider: IPushProviderForApi,
    private readonly systemConfig: ISystemConfig,
    private readonly logger: ILogger
  ) {}

  /**
   * GET /api/v1/notifications
   *
   * Get user's notifications with pagination.
   * Query params: limit (default 10), skip (default 0)
   */
  getNotifications: RequestHandler = async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(100, parseInt(req.query['limit'] as string) || 10));
      const skip = Math.max(0, parseInt(req.query['skip'] as string) || 0);

      const notifications = await this.notificationRepository.findByUser(req.user!._id, {
        limit,
        skip,
      });

      res.status(200).json(notifications);
    } catch (error) {
      this.logger.error('Error getting notifications:', error);
      res.status(500).json({
        errors: [{ message: 'Error getting notifications' }],
      });
    }
  };

  /**
   * GET /api/v1/settings/notifications
   *
   * Get notification settings including GCM/FCM configuration.
   */
  getNotificationSettings: RequestHandler = (_req, res) => {
    const config: { gcm?: { senderId: string } } = {};

    if (this.systemConfig.isGcmConfigured()) {
      config.gcm = {
        senderId: this.systemConfig.getGcmSenderId(),
      };
    }

    res.status(200).json(config);
  };

  /**
   * GET /api/v1/hidenotification/:id
   *
   * Hide/dismiss a notification on other devices.
   * Query param: deviceId (optional) - the device that initiated the hide
   */
  hideNotification: RequestHandler = async (req, res) => {
    try {
      const persistedId = req.params['id'];
      const deviceIdParam = req.query['deviceId'];
      const deviceId = Array.isArray(deviceIdParam) ? deviceIdParam[0] : deviceIdParam;

      // Validate notification ID format
      if (!persistedId || typeof persistedId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(persistedId)) {
        res.status(400).json({
          errors: [{ message: 'Invalid notification ID' }],
        });
        return;
      }

      const userDevices = await this.userDeviceRepository.findByOwner(req.user!._id);

      // Collect FCM tokens from all devices except the one that initiated the hide
      const registrationIds = userDevices
        .filter(device => device.deviceId !== deviceId && device.fcmRegistration)
        .map(device => device.fcmRegistration!);

      if (registrationIds.length > 0) {
        this.logger.debug(
          `Hiding notification ${persistedId} on device ${deviceId} to ${JSON.stringify(registrationIds)}`
        );
        await this.pushProvider.sendHideNotification(registrationIds, persistedId);
      }

      res.status(200).json({});
    } catch (error) {
      this.logger.error('Error hiding notification:', error);
      res.status(500).json({
        errors: [{ message: 'Error hiding notification' }],
      });
    }
  };

  /**
   * GET /api/v1/proxyurl
   *
   * Get the proxy URL for the current server.
   */
  getProxyUrl: RequestHandler = (_req, res) => {
    res.status(200).json({
      url: this.systemConfig.getProxyURL(),
    });
  };

  /**
   * GET /api/v1/appids
   *
   * Get app store IDs for iOS and Android apps.
   * This endpoint does not require authentication.
   */
  getAppIds: RequestHandler = (_req, res) => {
    res.status(200).json({
      ios: this.systemConfig.getAppleId(),
      android: this.systemConfig.getAndroidId(),
    });
  };

  /**
   * POST /api/v1/sendnotification
   *
   * Send a notification to the authenticated user.
   */
  sendNotification: RequestHandler = async (req, res) => {
    try {
      const body = req.body;

      // Validate required message field
      if (!body || typeof body.message !== 'string' || body.message.trim() === '') {
        res.status(400).json({
          errors: [{ message: 'Message is required' }],
        });
        return;
      }

      // Pass entire body to preserve all custom properties (like media-attachment-url)
      const data: NotificationPayload = {
        ...body,
        message: body.message, // ensure required field is present
        type: (body.type === 'hideNotification' ? 'hideNotification' : 'notification') as 'notification' | 'hideNotification',
      };

      this.logger.debug('sendNotificationToUser ' + JSON.stringify(data));

      await this.notificationService.sendToUser(req.user!._id.toString(), data);

      res.status(200).json('OK');
    } catch (error) {
      this.logger.error('Error sending notification:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json(message);
    }
  };
}
