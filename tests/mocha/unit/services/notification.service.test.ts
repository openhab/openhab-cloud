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

import { expect } from 'chai';
import { Types } from 'mongoose';
import {
  NotificationService,
  PayloadTooLargeError,
} from '../../../../src/services/notification.service';
import type {
  ILogger,
  IPushProvider,
  INotificationRepository,
  IUserDeviceRepository,
  NotificationPayload,
  INotification,
  IUserDevice,
  PushResult,
} from '../../../../src/types/notification';

// Mock implementations
class MockLogger implements ILogger {
  logs: { level: string; message: string; meta: unknown[] }[] = [];

  error(message: string, ...meta: unknown[]): void {
    this.logs.push({ level: 'error', message, meta });
  }
  warn(message: string, ...meta: unknown[]): void {
    this.logs.push({ level: 'warn', message, meta });
  }
  info(message: string, ...meta: unknown[]): void {
    this.logs.push({ level: 'info', message, meta });
  }
  debug(message: string, ...meta: unknown[]): void {
    this.logs.push({ level: 'debug', message, meta });
  }

  clear(): void {
    this.logs = [];
  }

  hasLogWithMessage(level: string, substring: string): boolean {
    return this.logs.some(
      log => log.level === level && log.message.includes(substring)
    );
  }
}

class MockNotificationRepository implements INotificationRepository {
  notifications: INotification[] = [];
  shouldThrow = false;

  async create(data: {
    user: Types.ObjectId | string;
    message: string;
    icon?: string;
    severity?: string;
    payload: NotificationPayload;
  }): Promise<INotification> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }

    const notification: INotification = {
      _id: new Types.ObjectId(),
      user: new Types.ObjectId(data.user.toString()),
      message: data.message,
      icon: data.icon,
      severity: data.severity,
      acknowledged: false,
      payload: data.payload,
      created: new Date(),
    };
    this.notifications.push(notification);
    return notification;
  }

  clear(): void {
    this.notifications = [];
    this.shouldThrow = false;
  }
}

class MockUserDeviceRepository implements IUserDeviceRepository {
  devices: IUserDevice[] = [];

  async findByOwner(_ownerId: string): Promise<IUserDevice[]> {
    return this.devices;
  }

  addDevice(device: Partial<IUserDevice>): void {
    this.devices.push({
      _id: new Types.ObjectId(),
      owner: new Types.ObjectId(),
      lastUpdate: new Date(),
      ...device,
    } as IUserDevice);
  }

  clear(): void {
    this.devices = [];
  }
}

class MockFCMProvider implements IPushProvider {
  readonly name = 'FCM';
  private configured: boolean;
  sendCalls: { tokens: string[]; notification: INotification }[] = [];
  hideCalls: { tokens: string[]; notificationId: string }[] = [];
  shouldFail = false;

  constructor(configured = true) {
    this.configured = configured;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async send(token: string, notification: INotification): Promise<PushResult> {
    const results = await this.sendMultiple([token], notification);
    return results[0]!;
  }

  async sendMultiple(tokens: string[], notification: INotification): Promise<PushResult[]> {
    this.sendCalls.push({ tokens, notification });
    return tokens.map(token => ({
      success: !this.shouldFail,
      token,
      error: this.shouldFail ? new Error('Send failed') : undefined,
    }));
  }

  async sendHideNotification(tokens: string[], notificationId: string): Promise<PushResult[]> {
    this.hideCalls.push({ tokens, notificationId });
    return tokens.map(token => ({
      success: !this.shouldFail,
      token,
    }));
  }

  clear(): void {
    this.sendCalls = [];
    this.hideCalls = [];
    this.shouldFail = false;
  }

  setConfigured(configured: boolean): void {
    this.configured = configured;
  }
}

describe('NotificationService', () => {
  let logger: MockLogger;
  let notificationRepo: MockNotificationRepository;
  let userDeviceRepo: MockUserDeviceRepository;
  let fcmProvider: MockFCMProvider;
  let service: NotificationService;

  beforeEach(() => {
    logger = new MockLogger();
    notificationRepo = new MockNotificationRepository();
    userDeviceRepo = new MockUserDeviceRepository();
    fcmProvider = new MockFCMProvider();
    service = new NotificationService(
      notificationRepo,
      userDeviceRepo,
      fcmProvider,
      logger
    );
  });

  afterEach(() => {
    logger.clear();
    notificationRepo.clear();
    userDeviceRepo.clear();
    fcmProvider.clear();
  });

  describe('sendToUser', () => {
    const userId = new Types.ObjectId().toString();
    const payload: NotificationPayload = {
      message: 'Test notification',
      title: 'Test',
      icon: 'bell',
      severity: 'info',
    };

    it('should save notification to database', async () => {
      await service.sendToUser(userId, payload);

      expect(notificationRepo.notifications).to.have.lengthOf(1);
      expect(notificationRepo.notifications[0]!.message).to.equal('Test notification');
    });

    it('should normalize tag from severity', async () => {
      const payloadWithSeverity: NotificationPayload = {
        message: 'Test',
        severity: 'warning',
      };

      await service.sendToUser(userId, payloadWithSeverity);

      expect(notificationRepo.notifications[0]!.payload.tag).to.equal('warning');
    });

    it('should prefer tag over severity when both present', async () => {
      const payloadWithBoth: NotificationPayload = {
        message: 'Test',
        severity: 'warning',
        tag: 'custom',
      };

      await service.sendToUser(userId, payloadWithBoth);

      expect(notificationRepo.notifications[0]!.payload.tag).to.equal('custom');
    });

    it('should throw PayloadTooLargeError when payload exceeds 1MB', async () => {
      const largePayload: NotificationPayload = {
        message: 'x'.repeat(1048577), // Just over 1MB
      };

      try {
        await service.sendToUser(userId, largePayload);
        expect.fail('Should have thrown PayloadTooLargeError');
      } catch (error) {
        expect(error).to.be.instanceOf(PayloadTooLargeError);
      }
    });

    it('should log when no devices registered', async () => {
      await service.sendToUser(userId, payload);

      expect(logger.hasLogWithMessage('info', 'No registered devices')).to.be.true;
    });

    it('should send via FCM when FCM tokens present', async () => {
      userDeviceRepo.addDevice({ fcmRegistration: 'fcm-token-1' });
      userDeviceRepo.addDevice({ fcmRegistration: 'fcm-token-2' });

      await service.sendToUser(userId, payload);

      expect(fcmProvider.sendCalls).to.have.lengthOf(1);
      expect(fcmProvider.sendCalls[0]!.tokens).to.deep.equal(['fcm-token-1', 'fcm-token-2']);
    });

    it('should log when no FCM-registered devices', async () => {
      userDeviceRepo.addDevice({ deviceType: 'ios' }); // No FCM token

      await service.sendToUser(userId, payload);

      expect(logger.hasLogWithMessage('info', 'No FCM-registered devices')).to.be.true;
    });

    it('should log warning when FCM provider not configured', async () => {
      fcmProvider.setConfigured(false);
      userDeviceRepo.addDevice({ fcmRegistration: 'fcm-token' });

      await service.sendToUser(userId, payload);

      expect(logger.hasLogWithMessage('warn', 'FCM provider not configured')).to.be.true;
    });

    it('should log failures when push send fails', async () => {
      userDeviceRepo.addDevice({ fcmRegistration: 'fcm-token' });
      fcmProvider.shouldFail = true;

      await service.sendToUser(userId, payload);

      expect(logger.hasLogWithMessage('warn', 'failures')).to.be.true;
    });
  });

  describe('saveOnly', () => {
    const userId = new Types.ObjectId().toString();
    const payload: NotificationPayload = {
      message: 'Log notification',
      icon: 'info',
      severity: 'low',
    };

    it('should save notification to database without sending push', async () => {
      userDeviceRepo.addDevice({ fcmRegistration: 'fcm-token' });

      await service.saveOnly(userId, payload);

      // Notification should be saved
      expect(notificationRepo.notifications).to.have.lengthOf(1);
      expect(notificationRepo.notifications[0]!.message).to.equal('Log notification');

      // FCM should NOT be called
      expect(fcmProvider.sendCalls).to.have.lengthOf(0);
    });

    it('should normalize tag from severity', async () => {
      await service.saveOnly(userId, { message: 'Test', severity: 'warning' });

      expect(notificationRepo.notifications[0]!.payload.tag).to.equal('warning');
    });

    it('should throw PayloadTooLargeError when payload exceeds 1MB', async () => {
      const largePayload: NotificationPayload = {
        message: 'x'.repeat(1048577),
      };

      try {
        await service.saveOnly(userId, largePayload);
        expect.fail('Should have thrown PayloadTooLargeError');
      } catch (error) {
        expect(error).to.be.instanceOf(PayloadTooLargeError);
      }
    });

    it('should preserve custom properties like media-attachment-url', async () => {
      const payloadWithMedia: NotificationPayload = {
        message: 'Photo alert',
        'media-attachment-url': 'https://example.com/image.jpg',
      };

      await service.saveOnly(userId, payloadWithMedia);

      expect(notificationRepo.notifications[0]!.payload['media-attachment-url']).to.equal(
        'https://example.com/image.jpg'
      );
    });
  });

  describe('hideNotification', () => {
    const userId = new Types.ObjectId().toString();
    const notificationId = new Types.ObjectId().toString();

    it('should send hide command via FCM', async () => {
      userDeviceRepo.addDevice({ fcmRegistration: 'fcm-token' });

      await service.hideNotification(userId, notificationId);

      expect(fcmProvider.hideCalls).to.have.lengthOf(1);
      expect(fcmProvider.hideCalls[0]!.notificationId).to.equal(notificationId);
    });

    it('should log when no devices registered', async () => {
      await service.hideNotification(userId, notificationId);

      expect(logger.hasLogWithMessage('info', 'No registered devices')).to.be.true;
    });

    it('should log when no FCM-registered devices', async () => {
      userDeviceRepo.addDevice({ deviceType: 'ios' }); // No FCM token

      await service.hideNotification(userId, notificationId);

      expect(logger.hasLogWithMessage('info', 'No FCM-registered devices')).to.be.true;
    });

    it('should log warning when FCM provider not configured', async () => {
      fcmProvider.setConfigured(false);
      userDeviceRepo.addDevice({ fcmRegistration: 'fcm-token' });

      await service.hideNotification(userId, notificationId);

      expect(logger.hasLogWithMessage('warn', 'FCM provider not configured')).to.be.true;
    });
  });
});

describe('PayloadTooLargeError', () => {
  it('should have correct error name', () => {
    const error = new PayloadTooLargeError(2000000, 1048576);
    expect(error.name).to.equal('PayloadTooLargeError');
  });

  it('should include sizes in message', () => {
    const error = new PayloadTooLargeError(2000000, 1048576);
    expect(error.message).to.include('2000000');
    expect(error.message).to.include('1048576');
  });
});
