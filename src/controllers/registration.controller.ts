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

import type { RequestHandler } from 'express';
import type { Types } from 'mongoose';
import type { IUserDevice, DeviceType } from '../types/models';
import type { ILogger } from '../types/notification';

/**
 * Repository interface for UserDevice operations
 */
export interface IUserDeviceRepositoryForRegistration {
  findByOwnerAndDeviceId(
    ownerId: string | Types.ObjectId,
    deviceType: DeviceType,
    deviceId: string
  ): Promise<IUserDevice | null>;
  create(data: {
    owner: Types.ObjectId | string;
    deviceType: DeviceType;
    deviceId: string;
    fcmRegistration?: string;
    iosDeviceToken?: string;
    deviceModel?: string;
  }): Promise<IUserDevice>;
  updateFcmRegistration(
    id: string | Types.ObjectId,
    fcmRegistration: string
  ): Promise<void>;
  updateIosDeviceToken(
    id: string | Types.ObjectId,
    iosDeviceToken: string
  ): Promise<void>;
}

/**
 * Registration Controller
 *
 * Handles device registration for push notifications:
 * - FCM registration (Android and iOS via Firebase)
 * - Apple APNs registration (legacy iOS)
 */
export class RegistrationController {
  constructor(
    private readonly userDeviceRepository: IUserDeviceRepositoryForRegistration,
    private readonly logger: ILogger
  ) {}

  /**
   * GET /api/v1/settings/notifications/android
   *
   * Register an Android device for FCM push notifications.
   * Query params: regId, deviceId, deviceModel (optional)
   */
  registerAndroid: RequestHandler = async (req, res) => {
    await this.registerDevice(req, res, 'android');
  };

  /**
   * GET /api/v1/settings/notifications/ios
   *
   * Register an iOS device for FCM push notifications.
   * Query params: regId, deviceId, deviceModel (optional)
   */
  registerIos: RequestHandler = async (req, res) => {
    await this.registerDevice(req, res, 'ios');
  };

  /**
   * Register a device for FCM push notifications.
   */
  private async registerDevice(
    req: Parameters<RequestHandler>[0],
    res: Parameters<RequestHandler>[1],
    deviceType: DeviceType
  ): Promise<void> {
    this.logger.info(`registerDevice called for ${deviceType}, user: ${req.user?.username}, query: ${JSON.stringify(req.query)}`);
    try {
      const regIdParam = req.query['regId'];
      const deviceIdParam = req.query['deviceId'];
      const deviceModelParam = req.query['deviceModel'];

      // Validate required parameters (match original response format)
      if (!regIdParam || typeof regIdParam !== 'string' || !deviceIdParam || typeof deviceIdParam !== 'string') {
        this.logger.warn(`Missing parameters: regId=${!!regIdParam}, deviceId=${!!deviceIdParam}`);
        res.status(404).send('Parameters missing');
        return;
      }

      const regId = regIdParam;
      const deviceId = deviceIdParam;
      const deviceModel = typeof deviceModelParam === 'string' ? deviceModelParam : undefined;

      // Try to find existing device
      const existingDevice = await this.userDeviceRepository.findByOwnerAndDeviceId(
        req.user!._id,
        deviceType,
        deviceId
      );

      if (existingDevice) {
        // Update the existing device's registration
        this.logger.info(`Found ${deviceType} device for user ${req.user!.username}, updating fcmReg`);
        await this.userDeviceRepository.updateFcmRegistration(existingDevice._id, regId);
        this.logger.info(`Updated device ${existingDevice._id}`);
        res.status(200).json({ userId: req.user!._id.toString() });
      } else {
        // Create new device registration
        this.logger.info(`Registering new ${deviceType} device for user ${req.user!.username}, owner: ${req.user!._id}`);
        const newDevice = await this.userDeviceRepository.create({
          owner: req.user!._id,
          deviceType,
          deviceId,
          fcmRegistration: regId,
          deviceModel,
        });
        this.logger.info(`Created device ${newDevice._id} for owner ${newDevice.owner}`);
        res.status(200).json({ userId: newDevice.owner.toString() });
      }
    } catch (error) {
      this.logger.error('Error registering device:', error);
      res.status(500).send('Internal server error');
    }
  }

  /**
   * GET /api/v1/settings/notifications/apple
   *
   * Register an iOS device using Apple Push Notification service.
   * Query params: regId (APNs device token), deviceId, deviceModel (optional)
   *
   * @deprecated Use iOS FCM registration instead
   */
  registerApple: RequestHandler = async (req, res) => {
    this.logger.info(`registerApple called, user: ${req.user?.username}, query: ${JSON.stringify(req.query)}`);
    try {
      const regIdParam = req.query['regId'];
      const deviceIdParam = req.query['deviceId'];
      const deviceModelParam = req.query['deviceModel'];

      // Validate required parameters (match original response format)
      if (!regIdParam || typeof regIdParam !== 'string' || !deviceIdParam || typeof deviceIdParam !== 'string') {
        this.logger.warn(`Missing parameters: regId=${!!regIdParam}, deviceId=${!!deviceIdParam}`);
        res.status(404).send('Parameters missing');
        return;
      }

      const regId = regIdParam;
      const deviceId = deviceIdParam;
      const deviceModel = typeof deviceModelParam === 'string' ? deviceModelParam : undefined;

      // Try to find existing device
      const existingDevice = await this.userDeviceRepository.findByOwnerAndDeviceId(
        req.user!._id,
        'ios',
        deviceId
      );

      if (existingDevice) {
        // Update the existing device's token
        this.logger.info(`Found iOS device for user ${req.user!.username}, updating`);
        await this.userDeviceRepository.updateIosDeviceToken(existingDevice._id, regId);
        res.status(200).json({ userId: req.user!._id.toString() });
      } else {
        // Create new device registration
        this.logger.info(`Registering new iOS device for user ${req.user!.username}`);
        const newDevice = await this.userDeviceRepository.create({
          owner: req.user!._id,
          deviceType: 'ios',
          deviceId,
          iosDeviceToken: regId,
          deviceModel,
        });
        res.status(200).json({ userId: newDevice.owner.toString() });
      }
    } catch (error) {
      this.logger.error('Error registering Apple device:', error);
      res.status(500).send('Internal server error');
    }
  };
}
