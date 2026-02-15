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
import type { IUserDevice, INotification } from '../types/models';
import type { ILogger, NotificationPayload } from '../types/notification';
import type { ValidatedRequest } from '../middleware/validation.middleware';
import type { SendMessageInput } from '../schemas';

/**
 * Repository interface for UserDevice operations
 */
export interface IUserDeviceRepositoryForDevices {
  findByOwner(ownerId: string | Types.ObjectId): Promise<IUserDevice[]>;
  findByIdAndOwner(
    id: string | Types.ObjectId,
    ownerId: string | Types.ObjectId
  ): Promise<IUserDevice | null>;
  deleteById(id: string | Types.ObjectId): Promise<void>;
}

/**
 * Repository interface for Notification operations
 */
export interface INotificationRepositoryForDevices {
  create(data: {
    user: Types.ObjectId | string;
    message: string;
    payload: NotificationPayload;
  }): Promise<INotification>;
}

/**
 * Push provider interface
 */
export interface IPushProviderForDevices {
  isConfigured(): boolean;
  send(token: string, notification: INotification): Promise<void>;
}

/**
 * System configuration interface
 */
export interface IDevicesSystemConfig {
  getBaseURL(): string;
  getAppleLink(): string;
  getAndroidLink(): string;
}

/**
 * Devices Controller
 *
 * Handles device management routes:
 * - View devices
 * - Send test messages
 * - Delete devices
 */
export class DevicesController {
  constructor(
    private readonly userDeviceRepository: IUserDeviceRepositoryForDevices,
    private readonly notificationRepository: INotificationRepositoryForDevices,
    private readonly pushProvider: IPushProviderForDevices,
    private readonly systemConfig: IDevicesSystemConfig,
    private readonly logger: ILogger
  ) {}

  /**
   * GET /devices
   * GET /devices/:id
   *
   * Display list of user's devices.
   */
  getDevices: RequestHandler = async (req, res) => {
    try {
      const userDevices = await this.userDeviceRepository.findByOwner(req.user!._id);

      // Determine selected device
      let selectedDeviceId = '';
      let selectedDeviceArrayId = 0;

      const idParam = req.params['id'];
      if (idParam && typeof idParam === 'string') {
        selectedDeviceId = idParam;
      } else if (userDevices.length > 0 && userDevices[0]) {
        selectedDeviceId = userDevices[0]._id.toString();
      }

      // Find the array index of selected device
      for (let i = 0; i < userDevices.length; i++) {
        const device = userDevices[i];
        if (device && device._id.toString() === selectedDeviceId) {
          selectedDeviceArrayId = i;
          break;
        }
      }

      res.render('devices', {
        userDevices,
        title: 'Devices',
        user: req.user,
        selectedDeviceId,
        selectedDeviceArrayId,
        baseUrl: this.systemConfig.getBaseURL(),
        appleLink: this.systemConfig.getAppleLink(),
        androidLink: this.systemConfig.getAndroidLink(),
        errormessages: req.flash('error'),
        infomessages: req.flash('info'),
      });
    } catch (error) {
      this.logger.error('Error getting devices:', error);
      req.flash('error', 'Error loading devices');
      res.redirect('/');
    }
  };

  /**
   * POST /devices/:id/sendmessage
   *
   * Send a test message to a specific device.
   */
  sendMessage: RequestHandler = async (req: Request, res) => {
    const typedReq = req as ValidatedRequest<SendMessageInput>;
    const deviceIdParam = req.params['id'];

    if (!deviceIdParam || typeof deviceIdParam !== 'string') {
      req.flash('error', 'Invalid device');
      return res.redirect('/devices');
    }

    // Validate ObjectId format to prevent MongoDB errors
    if (!/^[0-9a-fA-F]{24}$/.test(deviceIdParam)) {
      req.flash('error', 'Invalid device ID');
      return res.redirect('/devices');
    }

    const deviceId = deviceIdParam;

    try {
      this.logger.info(`Sending message to device ${deviceId}`);

      const message = typedReq.validatedBody.messagetext;

      // Create the notification
      const notification = await this.notificationRepository.create({
        user: req.user!._id,
        message,
        payload: { message },
      });

      // Find the device
      const device = await this.userDeviceRepository.findByIdAndOwner(deviceId, req.user!._id);

      if (!device) {
        req.flash('error', 'Device not found');
        return res.redirect('/devices');
      }

      // Send the notification
      this.logger.info(`Device fcmRegistration: ${device.fcmRegistration ? 'yes' : 'no'}, pushProvider configured: ${this.pushProvider.isConfigured()}`);
      if (device.fcmRegistration && this.pushProvider.isConfigured()) {
        await this.pushProvider.send(device.fcmRegistration, notification);
        req.flash('info', 'Your message was sent');
      } else {
        req.flash('error', 'Device does not have push notifications configured');
      }

      res.redirect(`/devices/${device._id}`);
    } catch (error) {
      this.logger.error('Error sending message:', error);
      req.flash('error', 'There was an error processing your request');
      res.redirect(`/devices/${deviceId}`);
    }
  };

  /**
   * GET /devices/:id/delete
   *
   * Delete a device registration.
   */
  deleteDevice: RequestHandler = async (req, res) => {
    const deviceIdParam = req.params['id'];

    if (!deviceIdParam || typeof deviceIdParam !== 'string') {
      return res.redirect('/devices');
    }

    // Validate ObjectId format to prevent MongoDB errors
    if (!/^[0-9a-fA-F]{24}$/.test(deviceIdParam)) {
      req.flash('error', 'Invalid device ID');
      return res.redirect('/devices');
    }

    const deviceId = deviceIdParam;

    try {
      this.logger.info(`Deleting device ${deviceId}`);

      const device = await this.userDeviceRepository.findByIdAndOwner(deviceId, req.user!._id);

      if (device) {
        await this.userDeviceRepository.deleteById(device._id);
      }

      res.redirect('/devices');
    } catch (error) {
      this.logger.error('Error deleting device:', error);
      req.flash('error', 'Error deleting device');
      res.redirect('/devices');
    }
  };
}
