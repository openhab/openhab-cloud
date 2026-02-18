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
import sinon from 'sinon';
import { Types } from 'mongoose';
import { ApiController } from '../../../../src/controllers/api.controller';
import type {
  INotificationRepositoryForApi,
  IUserDeviceRepositoryForApi,
  IPushProviderForApi,
  ISystemConfig,
} from '../../../../src/controllers/api.controller';
import type { INotification, IUserDevice } from '../../../../src/types/models';
import type { ILogger, INotificationService, NotificationPayload } from '../../../../src/types/notification';
import type { Request, Response } from 'express';

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
}

class MockNotificationRepository implements INotificationRepositoryForApi {
  notifications: INotification[] = [];
  shouldThrow = false;

  async findByUser(
    _userId: string | Types.ObjectId,
    _options?: { limit?: number; skip?: number }
  ): Promise<INotification[]> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.notifications;
  }

  addNotification(notification: Partial<INotification>): void {
    this.notifications.push({
      _id: new Types.ObjectId(),
      user: new Types.ObjectId(),
      message: 'Test notification',
      acknowledged: false,
      created: new Date(),
      ...notification,
    } as INotification);
  }

  clear(): void {
    this.notifications = [];
    this.shouldThrow = false;
  }
}

class MockUserDeviceRepository implements IUserDeviceRepositoryForApi {
  devices: IUserDevice[] = [];
  shouldThrow = false;

  async findByOwner(_ownerId: string | Types.ObjectId): Promise<IUserDevice[]> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.devices;
  }

  addDevice(device: Partial<IUserDevice>): void {
    this.devices.push({
      _id: new Types.ObjectId(),
      owner: new Types.ObjectId(),
      deviceType: 'android',
      deviceId: 'device-123',
      lastUpdate: new Date(),
      ...device,
    } as IUserDevice);
  }

  clear(): void {
    this.devices = [];
    this.shouldThrow = false;
  }
}

class MockNotificationService implements INotificationService {
  sendCalls: { userId: string; payload: NotificationPayload }[] = [];
  hideCalls: { userId: string; notificationId: string }[] = [];
  shouldThrow = false;

  async sendToUser(userId: string, payload: NotificationPayload): Promise<void> {
    if (this.shouldThrow) {
      throw new Error('Send failed');
    }
    this.sendCalls.push({ userId, payload });
  }

  async hideNotification(userId: string, notificationId: string): Promise<void> {
    if (this.shouldThrow) {
      throw new Error('Hide failed');
    }
    this.hideCalls.push({ userId, notificationId });
  }

  clear(): void {
    this.sendCalls = [];
    this.hideCalls = [];
    this.shouldThrow = false;
  }
}

class MockPushProvider implements IPushProviderForApi {
  hideCalls: { tokens: string[]; notificationId: string }[] = [];
  shouldThrow = false;

  async sendHideNotification(tokens: string[], notificationId: string): Promise<void> {
    if (this.shouldThrow) {
      throw new Error('Push failed');
    }
    this.hideCalls.push({ tokens, notificationId });
  }

  clear(): void {
    this.hideCalls = [];
    this.shouldThrow = false;
  }
}

describe('ApiController', () => {
  let controller: ApiController;
  let notificationRepository: MockNotificationRepository;
  let userDeviceRepository: MockUserDeviceRepository;
  let notificationService: MockNotificationService;
  let pushProvider: MockPushProvider;
  let systemConfig: ISystemConfig;
  let logger: MockLogger;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let statusStub: sinon.SinonStub;
  let jsonStub: sinon.SinonStub;

  beforeEach(() => {
    notificationRepository = new MockNotificationRepository();
    userDeviceRepository = new MockUserDeviceRepository();
    notificationService = new MockNotificationService();
    pushProvider = new MockPushProvider();
    systemConfig = {
      isGcmConfigured: () => true,
      getGcmSenderId: () => 'sender-123',
      getProxyURL: () => 'https://proxy.example.com',
      getAppleId: () => 'apple-app-id',
      getAndroidId: () => 'android-app-id',
    };
    logger = new MockLogger();

    controller = new ApiController(
      notificationRepository,
      userDeviceRepository,
      notificationService,
      pushProvider,
      systemConfig,
      logger
    );

    mockReq = {
      query: {},
      params: {},
      body: {},
      user: { _id: new Types.ObjectId(), username: 'testuser' } as Express.User,
    };

    jsonStub = sinon.stub();
    statusStub = sinon.stub().returns({ json: jsonStub });
    mockRes = {
      status: statusStub,
      json: jsonStub,
    };
  });

  afterEach(() => {
    sinon.restore();
    notificationRepository.clear();
    userDeviceRepository.clear();
    notificationService.clear();
    pushProvider.clear();
    logger.clear();
  });

  describe('getNotifications', () => {
    it('should return notifications with default pagination', async () => {
      notificationRepository.addNotification({ message: 'Notification 1' });
      notificationRepository.addNotification({ message: 'Notification 2' });

      await controller.getNotifications(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(jsonStub.firstCall.args[0]).to.have.lengthOf(2);
    });

    it('should handle custom limit and skip', async () => {
      mockReq.query = { limit: '5', skip: '2' };

      await controller.getNotifications(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
    });

    it('should cap limit at 100', async () => {
      mockReq.query = { limit: '500' };

      await controller.getNotifications(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
    });

    it('should handle repository errors', async () => {
      notificationRepository.shouldThrow = true;

      await controller.getNotifications(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(500)).to.be.true;
      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
    });
  });

  describe('getNotificationSettings', () => {
    it('should return GCM config when configured', () => {
      controller.getNotificationSettings(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(jsonStub.firstCall.args[0]).to.deep.equal({
        gcm: { senderId: 'sender-123' },
      });
    });

    it('should return empty config when GCM not configured', () => {
      systemConfig.isGcmConfigured = () => false;
      controller = new ApiController(
        notificationRepository,
        userDeviceRepository,
        notificationService,
        pushProvider,
        systemConfig,
        logger
      );

      controller.getNotificationSettings(mockReq as Request, mockRes as Response, () => {});

      expect(jsonStub.firstCall.args[0]).to.deep.equal({});
    });
  });

  describe('hideNotification', () => {
    it('should send hide notification to other devices', async () => {
      const notificationId = new Types.ObjectId().toString();
      userDeviceRepository.addDevice({
        deviceId: 'device-1',
        fcmRegistration: 'fcm-token-1',
      });
      userDeviceRepository.addDevice({
        deviceId: 'device-2',
        fcmRegistration: 'fcm-token-2',
      });
      mockReq.params = { id: notificationId };
      mockReq.query = { deviceId: 'device-1' };

      await controller.hideNotification(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(pushProvider.hideCalls).to.have.lengthOf(1);
      expect(pushProvider.hideCalls[0]!.tokens).to.deep.equal(['fcm-token-2']);
    });

    it('should return 400 for invalid notification ID', async () => {
      mockReq.params = { id: 'invalid-id' };

      await controller.hideNotification(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(400)).to.be.true;
    });

    it('should handle missing notification ID', async () => {
      mockReq.params = {};

      await controller.hideNotification(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(400)).to.be.true;
    });

    it('should handle repository errors', async () => {
      const notificationId = new Types.ObjectId().toString();
      mockReq.params = { id: notificationId };
      userDeviceRepository.shouldThrow = true;

      await controller.hideNotification(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(500)).to.be.true;
    });
  });

  describe('getProxyUrl', () => {
    it('should return proxy URL', () => {
      controller.getProxyUrl(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(jsonStub.firstCall.args[0]).to.deep.equal({
        url: 'https://proxy.example.com',
      });
    });
  });

  describe('getAppIds', () => {
    it('should return app store IDs', () => {
      controller.getAppIds(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(jsonStub.firstCall.args[0]).to.deep.equal({
        ios: 'apple-app-id',
        android: 'android-app-id',
      });
    });
  });

  describe('sendNotification', () => {
    it('should send notification to user', async () => {
      mockReq.body = { message: 'Test message' };

      await controller.sendNotification(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(notificationService.sendCalls).to.have.lengthOf(1);
      expect(notificationService.sendCalls[0]!.payload.message).to.equal('Test message');
    });

    it('should include optional fields', async () => {
      mockReq.body = {
        message: 'Test message',
        title: 'Test Title',
        icon: 'bell',
        severity: 'warning',
        tag: 'custom-tag',
      };

      await controller.sendNotification(mockReq as Request, mockRes as Response, () => {});

      const payload = notificationService.sendCalls[0]!.payload;
      expect(payload.title).to.equal('Test Title');
      expect(payload.icon).to.equal('bell');
      expect(payload.severity).to.equal('warning');
      expect(payload.tag).to.equal('custom-tag');
    });

    it('should allow missing message and default to empty string', async () => {
      mockReq.body = {};

      await controller.sendNotification(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(notificationService.sendCalls[0]!.payload.message).to.equal('');
    });

    it('should allow empty message', async () => {
      mockReq.body = { message: '' };

      await controller.sendNotification(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(notificationService.sendCalls[0]!.payload.message).to.equal('');
    });

    it('should return 400 when message is not a string', async () => {
      mockReq.body = { message: 123 };

      await controller.sendNotification(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(400)).to.be.true;
    });

    it('should handle notification service errors', async () => {
      mockReq.body = { message: 'Test message' };
      notificationService.shouldThrow = true;

      await controller.sendNotification(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(500)).to.be.true;
    });

    it('should handle hideNotification type', async () => {
      mockReq.body = { message: 'Test message', type: 'hideNotification' };

      await controller.sendNotification(mockReq as Request, mockRes as Response, () => {});

      const payload = notificationService.sendCalls[0]!.payload;
      expect(payload.type).to.equal('hideNotification');
    });
  });
});
