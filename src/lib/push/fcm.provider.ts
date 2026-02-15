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

import * as admin from 'firebase-admin';
import crypto from 'crypto';
import fs from 'fs';
import type { INotification } from '../../types/models';
import type {
  IPushProvider,
  PushResult,
  FCMConfig,
  ILogger,
} from '../../types/notification';

/**
 * Firebase Cloud Messaging push notification provider
 *
 * Handles sending push notifications to both Android and iOS devices
 * that are registered with FCM tokens.
 */
export class FCMProvider implements IPushProvider {
  readonly name = 'FCM';
  private messaging: admin.messaging.Messaging | null = null;
  private initialized = false;

  constructor(
    private readonly config: FCMConfig | null,
    private readonly logger: ILogger
  ) {
    this.initialize();
  }

  private initialize(): void {
    if (!this.config?.serviceAccountPath) {
      this.logger.info('FCM not configured: no service account path provided');
      return;
    }

    try {
      // Validate service account file exists before attempting to load
      if (!fs.existsSync(this.config.serviceAccountPath)) {
        this.logger.error(`FCM service account file not found: ${this.config.serviceAccountPath}`);
        return;
      }

      // Only initialize if not already initialized (firebase-admin is a singleton)
      if (admin.apps.length === 0) {
        const fileContent = fs.readFileSync(this.config.serviceAccountPath, 'utf-8');
        let serviceAccountJson: Record<string, unknown>;
        try {
          serviceAccountJson = JSON.parse(fileContent) as Record<string, unknown>;
        } catch {
          this.logger.error('FCM service account file is not valid JSON');
          return;
        }

        // Firebase JSON uses snake_case (project_id, private_key, client_email)
        const projectId = serviceAccountJson['project_id'] || serviceAccountJson['projectId'];
        const privateKey = serviceAccountJson['private_key'] || serviceAccountJson['privateKey'];
        const clientEmail = serviceAccountJson['client_email'] || serviceAccountJson['clientEmail'];

        if (!projectId || !privateKey || !clientEmail) {
          this.logger.error('FCM service account file missing required fields (project_id, private_key, client_email)');
          return;
        }

        admin.initializeApp({
          credential: admin.credential.cert(this.config.serviceAccountPath),
        });
      }
      this.messaging = admin.messaging();
      this.initialized = true;
      this.logger.info('FCM provider initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize FCM provider:', error);
      this.initialized = false;
    }
  }

  isConfigured(): boolean {
    return this.initialized && this.messaging !== null;
  }

  async send(token: string, notification: INotification): Promise<PushResult> {
    const results = await this.sendMultiple([token], notification);
    return results[0] ?? { success: false, token, error: new Error('No result returned') };
  }

  async sendMultiple(tokens: string[], notification: INotification): Promise<PushResult[]> {
    const message = this.buildMessage(tokens, notification);
    return this.sendMulticast(tokens, message);
  }

  async sendHideNotification(tokens: string[], notificationId: string): Promise<PushResult[]> {
    const message: admin.messaging.MulticastMessage = {
      tokens,
      data: {
        type: 'hideNotification',
        notificationId: notificationId,
      },
      android: {
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            'content-available': 1,
          },
        },
        headers: {
          'apns-priority': '5',
        },
      },
    };
    return this.sendMulticast(tokens, message);
  }

  /** Send a multicast message via FCM, handling guards and error mapping */
  private async sendMulticast(
    tokens: string[],
    message: admin.messaging.MulticastMessage
  ): Promise<PushResult[]> {
    if (!this.isConfigured() || !this.messaging) {
      return tokens.map(token => ({
        success: false,
        token,
        error: new Error('FCM provider not configured'),
      }));
    }

    if (tokens.length === 0) {
      return [];
    }

    try {
      this.logger.info(`Sending FCM message to ${tokens.length} device(s)`);
      const response = await this.messaging.sendEachForMulticast(message);

      return response.responses.map((resp, index) => ({
        success: resp.success,
        token: tokens[index] ?? '',
        error: resp.error ? new Error(resp.error.message) : undefined,
        response: resp,
      }));
    } catch (error) {
      this.logger.error('FCM send error:', error);
      return tokens.map(token => ({
        success: false,
        token,
        error: error instanceof Error ? error : new Error(String(error)),
      }));
    }
  }

  private buildMessage(
    tokens: string[],
    notification: INotification
  ): admin.messaging.MulticastMessage {
    const payload = notification.payload;
    const data: Record<string, string> = {};

    // Convert all payload values to strings (FCM requirement)
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) {
        continue;
      }
      data[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }

    // Add standard fields
    data['type'] = data['type'] ?? 'notification';
    data['persistedId'] = notification._id.toString();
    data['timestamp'] = notification.created.getTime().toString();

    const isHideNotification = data['type'] === 'hideNotification';

    // Build APNs configuration
    const apns: admin.messaging.ApnsConfig = {
      payload: {
        aps: isHideNotification
          ? { 'content-available': 1 }
          : {
              'mutable-content': 1,
              badge: 0,
              alert: { body: payload.message },
              sound: 'default',
              ...(data['title'] && { title: data['title'] }),
            },
      },
      headers: isHideNotification
        ? { 'apns-priority': '5' }
        : {},
    };

    // Build Android configuration
    const android: admin.messaging.AndroidConfig = {
      priority: 'high',
    };

    // Handle reference-id for notification collapsing
    const refId = payload['reference-id'];
    if (refId && !isHideNotification) {
      apns.headers = apns.headers ?? {};
      apns.headers['apns-collapse-id'] = String(refId);
      android.collapseKey = String(refId);
    }

    // Handle actions (iOS dynamic categories)
    if (payload.actions && !isHideNotification && apns.payload?.aps) {
      const category = crypto
        .createHash('sha256')
        .update(String(payload.actions))
        .digest('hex');
      (apns.payload.aps as Record<string, unknown>)['category'] = category;
    }

    return {
      tokens,
      data,
      android,
      apns,
    };
  }
}
