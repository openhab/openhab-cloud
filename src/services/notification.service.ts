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
import type {
  NotificationPayload,
  INotification,
  IUserDevice,
  IPushProvider,
  ILogger,
  INotificationRepository,
  IUserDeviceRepository,
  INotificationService,
} from '../types/notification';

/**
 * Maximum size for notification payload in bytes (1MB)
 */
const MAX_PAYLOAD_SIZE_BYTES = 1048576;

/**
 * Error thrown when notification payload exceeds size limit
 */
export class PayloadTooLargeError extends Error {
  constructor(actualSize: number, maxSize: number) {
    super(`Notification payload exceeds maximum size: ${actualSize} bytes (max: ${maxSize} bytes)`);
    this.name = 'PayloadTooLargeError';
  }
}

/**
 * Notification Service
 *
 * Orchestrates the saving and delivery of push notifications to user devices.
 * Uses FCM (Firebase Cloud Messaging) for both Android and iOS devices.
 */
export class NotificationService implements INotificationService {
  constructor(
    private readonly notificationRepository: INotificationRepository,
    private readonly userDeviceRepository: IUserDeviceRepository,
    private readonly fcmProvider: IPushProvider,
    private readonly logger: ILogger
  ) {}

  /**
   * Send a notification to a user
   *
   * This method:
   * 1. Validates the payload size
   * 2. Persists the notification to the database
   * 3. Looks up the user's registered devices
   * 4. Sends push notifications via FCM
   *
   * @param userId - The user ID to send notification to
   * @param payload - The notification payload
   * @throws PayloadTooLargeError if payload exceeds size limit
   */
  async sendToUser(userId: string, payload: NotificationPayload): Promise<void> {
    // Validate payload size
    const payloadJson = JSON.stringify(payload);
    const payloadSize = Buffer.byteLength(payloadJson, 'utf8');

    if (payloadSize > MAX_PAYLOAD_SIZE_BYTES) {
      throw new PayloadTooLargeError(payloadSize, MAX_PAYLOAD_SIZE_BYTES);
    }

    // Normalize tag/severity (tag is replacing severity in OH 4.2)
    const normalizedPayload: NotificationPayload = {
      ...payload,
      tag: payload.tag ?? payload.severity,
    };

    // Persist notification
    const notification = await this.notificationRepository.create({
      user: userId as unknown as Types.ObjectId,
      message: normalizedPayload.message,
      icon: normalizedPayload.icon,
      severity: normalizedPayload.tag, // legacy field
      payload: normalizedPayload,
    });

    this.logger.info(`Notification ${notification._id} saved for user ${userId}`);

    // Get user devices
    const devices = await this.userDeviceRepository.findByOwner(userId);

    if (devices.length === 0) {
      this.logger.info(`No registered devices for user ${userId}`);
      return;
    }

    // Extract FCM tokens
    const fcmTokens = this.extractFCMTokens(devices);

    if (fcmTokens.length === 0) {
      this.logger.info(`No FCM-registered devices for user ${userId}`);
      return;
    }

    // Send via FCM
    await this.sendViaFCM(fcmTokens, notification);
  }

  /**
   * Hide/dismiss a notification on user devices
   *
   * Sends a "hideNotification" command to all user devices via FCM.
   *
   * @param userId - The user ID
   * @param notificationId - The notification ID to hide
   */
  async hideNotification(userId: string, notificationId: string): Promise<void> {
    const devices = await this.userDeviceRepository.findByOwner(userId);

    if (devices.length === 0) {
      this.logger.info(`No registered devices for user ${userId}`);
      return;
    }

    const fcmTokens = this.extractFCMTokens(devices);

    if (fcmTokens.length === 0) {
      this.logger.info(`No FCM-registered devices for user ${userId}`);
      return;
    }

    if (!this.fcmProvider.isConfigured()) {
      this.logger.warn('FCM provider not configured');
      return;
    }

    const results = await this.fcmProvider.sendHideNotification(fcmTokens, notificationId);
    const successCount = results.filter(r => r.success).length;

    this.logger.info(`Hide notification sent: ${successCount}/${results.length} successful`);
  }

  /**
   * Extract FCM tokens from devices
   */
  private extractFCMTokens(devices: IUserDevice[]): string[] {
    return devices
      .filter(d => d.fcmRegistration)
      .map(d => d.fcmRegistration!)
      .filter(Boolean);
  }

  /**
   * Send notification via FCM
   */
  private async sendViaFCM(tokens: string[], notification: INotification): Promise<void> {
    if (!this.fcmProvider.isConfigured()) {
      this.logger.warn('FCM provider not configured, skipping notifications');
      return;
    }

    this.logger.info(`Sending FCM notification to ${tokens.length} device(s)`);
    const results = await this.fcmProvider.sendMultiple(tokens, notification);

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    if (failureCount > 0) {
      this.logger.warn(`FCM notification: ${successCount} success, ${failureCount} failures`);
      results
        .filter(r => !r.success)
        .forEach(r => {
          this.logger.debug(`FCM failure for token ${r.token.substring(0, 8)}...: ${r.error?.message}`);
        });
    } else {
      this.logger.info(`FCM notification sent successfully to ${successCount} device(s)`);
    }
  }
}
