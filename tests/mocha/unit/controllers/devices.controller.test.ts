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
import { DevicesController } from '../../../../src/controllers/devices.controller';
import type {
  IUserDeviceRepositoryForDevices,
  INotificationRepositoryForDevices,
  IPushProviderForDevices,
  IDevicesSystemConfig,
} from '../../../../src/controllers/devices.controller';
import type { IUserDevice, INotification } from '../../../../src/types/models';
import type { ILogger, NotificationPayload } from '../../../../src/types/notification';
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

class MockUserDeviceRepository implements IUserDeviceRepositoryForDevices {
  devices: IUserDevice[] = [];
  deletedIds: (string | Types.ObjectId)[] = [];
  shouldThrow = false;

  async findByOwner(_ownerId: string | Types.ObjectId): Promise<IUserDevice[]> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.devices;
  }

  async findByIdAndOwner(
    id: string | Types.ObjectId,
    _ownerId: string | Types.ObjectId
  ): Promise<IUserDevice | null> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.devices.find(d => d._id.toString() === id.toString()) || null;
  }

  async deleteById(id: string | Types.ObjectId): Promise<void> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    this.deletedIds.push(id);
  }

  addDevice(device: Partial<IUserDevice>): IUserDevice {
    const newDevice = {
      _id: new Types.ObjectId(),
      owner: new Types.ObjectId(),
      deviceType: 'android',
      lastUpdate: new Date(),
      ...device,
    } as IUserDevice;
    this.devices.push(newDevice);
    return newDevice;
  }

  clear(): void {
    this.devices = [];
    this.deletedIds = [];
    this.shouldThrow = false;
  }
}

class MockNotificationRepository implements INotificationRepositoryForDevices {
  notifications: INotification[] = [];
  shouldThrow = false;

  async create(data: {
    user: Types.ObjectId | string;
    message: string;
    payload: NotificationPayload;
  }): Promise<INotification> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    const notification = {
      _id: new Types.ObjectId(),
      user: new Types.ObjectId(data.user.toString()),
      message: data.message,
      payload: data.payload,
      acknowledged: false,
      created: new Date(),
    } as INotification;
    this.notifications.push(notification);
    return notification;
  }

  clear(): void {
    this.notifications = [];
    this.shouldThrow = false;
  }
}

class MockPushProvider implements IPushProviderForDevices {
  configured = true;
  sendCalls: { token: string; notification: INotification }[] = [];
  shouldThrow = false;

  isConfigured(): boolean {
    return this.configured;
  }

  async send(token: string, notification: INotification): Promise<void> {
    if (this.shouldThrow) {
      throw new Error('Push failed');
    }
    this.sendCalls.push({ token, notification });
  }

  clear(): void {
    this.sendCalls = [];
    this.shouldThrow = false;
    this.configured = true;
  }
}

describe('DevicesController', () => {
  let controller: DevicesController;
  let deviceRepository: MockUserDeviceRepository;
  let notificationRepository: MockNotificationRepository;
  let pushProvider: MockPushProvider;
  let systemConfig: IDevicesSystemConfig;
  let logger: MockLogger;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let renderStub: sinon.SinonStub;
  let redirectStub: sinon.SinonStub;
  let flashStub: sinon.SinonStub;

  beforeEach(() => {
    deviceRepository = new MockUserDeviceRepository();
    notificationRepository = new MockNotificationRepository();
    pushProvider = new MockPushProvider();
    systemConfig = {
      getBaseURL: () => 'http://localhost',
      getAppleLink: () => 'https://apple.com/app',
      getAndroidLink: () => 'https://play.google.com/app',
    };
    logger = new MockLogger();
    controller = new DevicesController(
      deviceRepository,
      notificationRepository,
      pushProvider,
      systemConfig,
      logger
    );

    flashStub = sinon.stub();
    flashStub.withArgs('error').returns([]);
    flashStub.withArgs('info').returns([]);

    mockReq = {
      params: {},
      user: { _id: new Types.ObjectId(), username: 'testuser' } as Express.User,
      flash: flashStub,
      validatedBody: {},
    };

    renderStub = sinon.stub();
    redirectStub = sinon.stub();
    mockRes = {
      render: renderStub,
      redirect: redirectStub,
    };
  });

  afterEach(() => {
    sinon.restore();
    deviceRepository.clear();
    notificationRepository.clear();
    pushProvider.clear();
    logger.clear();
  });

  describe('getDevices', () => {
    it('should render devices page with devices', async () => {
      deviceRepository.addDevice({ deviceType: 'android', deviceModel: 'Pixel 5' });
      deviceRepository.addDevice({ deviceType: 'ios', deviceModel: 'iPhone 12' });

      await controller.getDevices(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('devices');

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.userDevices).to.have.lengthOf(2);
      expect(templateData.title).to.equal('Devices');
    });

    it('should select first device by default', async () => {
      const device1 = deviceRepository.addDevice({ deviceModel: 'Device 1' });
      deviceRepository.addDevice({ deviceModel: 'Device 2' });

      await controller.getDevices(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.selectedDeviceId).to.equal(device1._id.toString());
      expect(templateData.selectedDeviceArrayId).to.equal(0);
    });

    it('should select device by id param', async () => {
      deviceRepository.addDevice({ deviceModel: 'Device 1' });
      const device2 = deviceRepository.addDevice({ deviceModel: 'Device 2' });
      mockReq.params = { id: device2._id.toString() };

      await controller.getDevices(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.selectedDeviceId).to.equal(device2._id.toString());
      expect(templateData.selectedDeviceArrayId).to.equal(1);
    });

    it('should pass system config URLs to template', async () => {
      await controller.getDevices(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.baseUrl).to.equal('http://localhost');
      expect(templateData.appleLink).to.equal('https://apple.com/app');
      expect(templateData.androidLink).to.equal('https://play.google.com/app');
    });

    it('should handle repository errors gracefully', async () => {
      deviceRepository.shouldThrow = true;

      await controller.getDevices(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'Error loading devices')).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
    });
  });

  describe('sendMessage', () => {
    let device: IUserDevice;

    beforeEach(() => {
      device = deviceRepository.addDevice({
        fcmRegistration: 'fcm-token-123',
      });
      mockReq.params = { id: device._id.toString() };
      (mockReq as Request).validatedBody = { messagetext: 'Test message' };
    });

    it('should send message to device and redirect', async () => {
      await controller.sendMessage(mockReq as Request, mockRes as Response, () => {});

      expect(notificationRepository.notifications).to.have.lengthOf(1);
      expect(pushProvider.sendCalls).to.have.lengthOf(1);
      expect(flashStub.calledWith('info', 'Your message was sent')).to.be.true;
      expect(redirectStub.calledWith(`/devices/${device._id}`)).to.be.true;
    });

    it('should create notification with correct message', async () => {
      await controller.sendMessage(mockReq as Request, mockRes as Response, () => {});

      const notification = notificationRepository.notifications[0];
      expect(notification!.message).to.equal('Test message');
    });

    it('should show error when device not found', async () => {
      mockReq.params = { id: new Types.ObjectId().toString() };

      await controller.sendMessage(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Device not found')).to.be.true;
      expect(redirectStub.calledWith('/devices')).to.be.true;
    });

    it('should show error when device id is missing', async () => {
      mockReq.params = {};

      await controller.sendMessage(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Invalid device')).to.be.true;
      expect(redirectStub.calledWith('/devices')).to.be.true;
    });

    it('should reject invalid ObjectId format', async () => {
      mockReq.params = { id: 'invalid-id' };

      await controller.sendMessage(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Invalid device ID')).to.be.true;
      expect(redirectStub.calledWith('/devices')).to.be.true;
    });

    it('should show error when device has no FCM registration', async () => {
      const deviceWithoutFcm = deviceRepository.addDevice({});
      mockReq.params = { id: deviceWithoutFcm._id.toString() };

      await controller.sendMessage(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Device does not have push notifications configured'))
        .to.be.true;
    });

    it('should show error when push provider not configured', async () => {
      pushProvider.configured = false;

      await controller.sendMessage(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Device does not have push notifications configured'))
        .to.be.true;
    });

    it('should handle errors gracefully', async () => {
      pushProvider.shouldThrow = true;

      await controller.sendMessage(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'There was an error processing your request')).to.be
        .true;
    });

    it('should log message sending', async () => {
      await controller.sendMessage(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'info' && l.message.includes('Sending message'))).to
        .be.true;
    });
  });

  describe('deleteDevice', () => {
    let device: IUserDevice;

    beforeEach(() => {
      device = deviceRepository.addDevice({});
      mockReq.params = { id: device._id.toString() };
    });

    it('should delete device and redirect', async () => {
      await controller.deleteDevice(mockReq as Request, mockRes as Response, () => {});

      expect(deviceRepository.deletedIds).to.have.lengthOf(1);
      expect(redirectStub.calledWith('/devices')).to.be.true;
    });

    it('should not error when device not found', async () => {
      mockReq.params = { id: new Types.ObjectId().toString() };

      await controller.deleteDevice(mockReq as Request, mockRes as Response, () => {});

      expect(deviceRepository.deletedIds).to.have.lengthOf(0);
      expect(redirectStub.calledWith('/devices')).to.be.true;
    });

    it('should redirect when device id is missing', async () => {
      mockReq.params = {};

      await controller.deleteDevice(mockReq as Request, mockRes as Response, () => {});

      expect(redirectStub.calledWith('/devices')).to.be.true;
    });

    it('should reject invalid ObjectId format', async () => {
      mockReq.params = { id: 'invalid-id' };

      await controller.deleteDevice(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Invalid device ID')).to.be.true;
      expect(redirectStub.calledWith('/devices')).to.be.true;
    });

    it('should handle errors gracefully', async () => {
      deviceRepository.shouldThrow = true;

      await controller.deleteDevice(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'Error deleting device')).to.be.true;
    });

    it('should log deletion attempt', async () => {
      await controller.deleteDevice(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'info' && l.message.includes('Deleting device'))).to
        .be.true;
    });
  });
});
