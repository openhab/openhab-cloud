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
import { RegistrationController } from '../../../../src/controllers/registration.controller';
import type { IUserDeviceRepositoryForRegistration } from '../../../../src/controllers/registration.controller';
import type { IUserDevice, DeviceType } from '../../../../src/types/models';
import type { ILogger } from '../../../../src/types/notification';
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

class MockUserDeviceRepository implements IUserDeviceRepositoryForRegistration {
  devices: IUserDevice[] = [];
  createdDevices: Partial<IUserDevice>[] = [];
  updatedFcmRegistrations: { id: string | Types.ObjectId; fcmRegistration: string }[] = [];
  updatedIosTokens: { id: string | Types.ObjectId; iosDeviceToken: string }[] = [];
  shouldThrow = false;

  async findByOwnerAndDeviceId(
    _ownerId: string | Types.ObjectId,
    deviceType: DeviceType,
    deviceId: string
  ): Promise<IUserDevice | null> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return (
      this.devices.find(d => d.deviceType === deviceType && d.deviceId === deviceId) || null
    );
  }

  async create(data: {
    owner: Types.ObjectId | string;
    deviceType: DeviceType;
    deviceId: string;
    fcmRegistration?: string;
    iosDeviceToken?: string;
    deviceModel?: string;
  }): Promise<IUserDevice> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    this.createdDevices.push(data);
    return {
      _id: new Types.ObjectId(),
      owner: new Types.ObjectId(data.owner.toString()),
      deviceType: data.deviceType,
      deviceId: data.deviceId,
      fcmRegistration: data.fcmRegistration,
      iosDeviceToken: data.iosDeviceToken,
      deviceModel: data.deviceModel,
      lastUpdate: new Date(),
    } as IUserDevice;
  }

  async updateFcmRegistration(id: string | Types.ObjectId, fcmRegistration: string): Promise<void> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    this.updatedFcmRegistrations.push({ id, fcmRegistration });
  }

  async updateIosDeviceToken(id: string | Types.ObjectId, iosDeviceToken: string): Promise<void> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    this.updatedIosTokens.push({ id, iosDeviceToken });
  }

  addDevice(device: Partial<IUserDevice>): IUserDevice {
    const newDevice = {
      _id: new Types.ObjectId(),
      owner: new Types.ObjectId(),
      deviceType: 'android' as DeviceType,
      deviceId: 'device-123',
      lastUpdate: new Date(),
      ...device,
    } as IUserDevice;
    this.devices.push(newDevice);
    return newDevice;
  }

  clear(): void {
    this.devices = [];
    this.createdDevices = [];
    this.updatedFcmRegistrations = [];
    this.updatedIosTokens = [];
    this.shouldThrow = false;
  }
}

describe('RegistrationController', () => {
  let controller: RegistrationController;
  let userDeviceRepository: MockUserDeviceRepository;
  let logger: MockLogger;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let statusStub: sinon.SinonStub;
  let jsonStub: sinon.SinonStub;
  let sendStub: sinon.SinonStub;

  beforeEach(() => {
    userDeviceRepository = new MockUserDeviceRepository();
    logger = new MockLogger();
    controller = new RegistrationController(userDeviceRepository, logger);

    mockReq = {
      query: {},
      user: { _id: new Types.ObjectId(), username: 'testuser' } as Express.User,
    };

    jsonStub = sinon.stub();
    sendStub = sinon.stub();
    statusStub = sinon.stub().returns({ json: jsonStub, send: sendStub });
    mockRes = {
      status: statusStub,
      json: jsonStub,
      send: sendStub,
    };
  });

  afterEach(() => {
    sinon.restore();
    userDeviceRepository.clear();
    logger.clear();
  });

  describe('registerAndroid', () => {
    it('should register new Android device', async () => {
      mockReq.query = { regId: 'fcm-token-123', deviceId: 'device-abc' };

      await controller.registerAndroid(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(jsonStub.calledOnce).to.be.true;
      expect(userDeviceRepository.createdDevices).to.have.lengthOf(1);
      expect(userDeviceRepository.createdDevices[0]!.deviceType).to.equal('android');
      expect(userDeviceRepository.createdDevices[0]!.fcmRegistration).to.equal('fcm-token-123');
    });

    it('should update existing Android device', async () => {
      const existingDevice = userDeviceRepository.addDevice({
        deviceType: 'android',
        deviceId: 'device-abc',
      });
      mockReq.query = { regId: 'new-fcm-token', deviceId: 'device-abc' };

      await controller.registerAndroid(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(userDeviceRepository.updatedFcmRegistrations).to.have.lengthOf(1);
      expect(userDeviceRepository.updatedFcmRegistrations[0]!.id).to.deep.equal(existingDevice._id);
      expect(userDeviceRepository.updatedFcmRegistrations[0]!.fcmRegistration).to.equal(
        'new-fcm-token'
      );
    });

    it('should include device model when provided', async () => {
      mockReq.query = { regId: 'fcm-token', deviceId: 'device-abc', deviceModel: 'Pixel 5' };

      await controller.registerAndroid(mockReq as Request, mockRes as Response, () => {});

      expect(userDeviceRepository.createdDevices[0]!.deviceModel).to.equal('Pixel 5');
    });

    it('should return 400 when regId is missing', async () => {
      mockReq.query = { deviceId: 'device-abc' };

      await controller.registerAndroid(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(400)).to.be.true;
      expect(jsonStub.firstCall.args[0].error).to.include('Registration ID');
    });

    it('should return 400 when deviceId is missing', async () => {
      mockReq.query = { regId: 'fcm-token' };

      await controller.registerAndroid(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(400)).to.be.true;
      expect(jsonStub.firstCall.args[0].error).to.include('Device ID');
    });

    it('should handle repository errors', async () => {
      userDeviceRepository.shouldThrow = true;
      mockReq.query = { regId: 'fcm-token', deviceId: 'device-abc' };

      await controller.registerAndroid(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(500)).to.be.true;
      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
    });
  });

  describe('registerIos', () => {
    it('should register new iOS device', async () => {
      mockReq.query = { regId: 'fcm-token-ios', deviceId: 'device-ios' };

      await controller.registerIos(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(userDeviceRepository.createdDevices).to.have.lengthOf(1);
      expect(userDeviceRepository.createdDevices[0]!.deviceType).to.equal('ios');
    });

    it('should update existing iOS device', async () => {
      const existingDevice = userDeviceRepository.addDevice({
        deviceType: 'ios',
        deviceId: 'device-ios',
      });
      mockReq.query = { regId: 'new-fcm-token', deviceId: 'device-ios' };

      await controller.registerIos(mockReq as Request, mockRes as Response, () => {});

      expect(userDeviceRepository.updatedFcmRegistrations).to.have.lengthOf(1);
      expect(userDeviceRepository.updatedFcmRegistrations[0]!.id).to.deep.equal(existingDevice._id);
    });

    it('should return 400 when regId is missing', async () => {
      mockReq.query = { deviceId: 'device-ios' };

      await controller.registerIos(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(400)).to.be.true;
    });
  });

  describe('registerApple', () => {
    it('should register new Apple device with APNs token', async () => {
      mockReq.query = { regId: 'apns-token', deviceId: 'device-apple' };

      await controller.registerApple(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(sendStub.calledWith('Added')).to.be.true;
      expect(userDeviceRepository.createdDevices).to.have.lengthOf(1);
      expect(userDeviceRepository.createdDevices[0]!.deviceType).to.equal('ios');
      expect(userDeviceRepository.createdDevices[0]!.iosDeviceToken).to.equal('apns-token');
    });

    it('should update existing Apple device token', async () => {
      const existingDevice = userDeviceRepository.addDevice({
        deviceType: 'ios',
        deviceId: 'device-apple',
      });
      mockReq.query = { regId: 'new-apns-token', deviceId: 'device-apple' };

      await controller.registerApple(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(sendStub.calledWith('Updated')).to.be.true;
      expect(userDeviceRepository.updatedIosTokens).to.have.lengthOf(1);
      expect(userDeviceRepository.updatedIosTokens[0]!.id).to.deep.equal(existingDevice._id);
    });

    it('should return 400 when regId is missing', async () => {
      mockReq.query = { deviceId: 'device-apple' };

      await controller.registerApple(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(400)).to.be.true;
    });

    it('should return 400 when deviceId is missing', async () => {
      mockReq.query = { regId: 'apns-token' };

      await controller.registerApple(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(400)).to.be.true;
    });

    it('should handle repository errors', async () => {
      userDeviceRepository.shouldThrow = true;
      mockReq.query = { regId: 'apns-token', deviceId: 'device-apple' };

      await controller.registerApple(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(500)).to.be.true;
      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
    });
  });
});
