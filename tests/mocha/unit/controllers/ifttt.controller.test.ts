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
import { IftttController } from '../../../../src/controllers/ifttt.controller';
import type {
  IOpenhabRepositoryForIfttt,
  IItemRepositoryForIfttt,
  IEventRepositoryForIfttt,
  ISocketEmitterForIfttt,
  IIftttConfig,
  IConnectionInfo,
} from '../../../../src/controllers/ifttt.controller';
import type { IOpenhab, IItem, IEvent } from '../../../../src/types/models';
import type { ILogger } from '../../../../src/types/notification';
import type { Request, Response, NextFunction } from 'express';

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

class MockOpenhabRepository implements IOpenhabRepositoryForIfttt {
  openhabs: IOpenhab[] = [];
  connectionInfoMap: Map<string, IConnectionInfo> = new Map();
  shouldThrow = false;

  async findByAccount(accountId: string | Types.ObjectId): Promise<IOpenhab | null> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.openhabs.find(o => o.account.toString() === accountId.toString()) || null;
  }

  async getConnectionInfo(openhabId: string | Types.ObjectId): Promise<IConnectionInfo | null> {
    if (this.shouldThrow) throw new Error('Redis error');
    return this.connectionInfoMap.get(openhabId.toString()) || null;
  }

  addOpenhab(openhab: Partial<IOpenhab>): IOpenhab {
    const newOpenhab = {
      _id: new Types.ObjectId(),
      uuid: 'test-uuid-' + Date.now(),
      secret: 'test-secret',
      account: new Types.ObjectId(),
      ...openhab,
    } as IOpenhab;
    this.openhabs.push(newOpenhab);
    return newOpenhab;
  }

  setConnectionInfo(openhabId: string | Types.ObjectId, info: IConnectionInfo): void {
    this.connectionInfoMap.set(openhabId.toString(), info);
  }

  clear(): void {
    this.openhabs = [];
    this.connectionInfoMap.clear();
    this.shouldThrow = false;
  }
}

class MockItemRepository implements IItemRepositoryForIfttt {
  items: IItem[] = [];
  shouldThrow = false;

  async findByOpenhab(openhabId: string | Types.ObjectId): Promise<IItem[]> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.items.filter(i => i.openhab.toString() === openhabId.toString());
  }

  async findByOpenhabAndName(openhabId: string | Types.ObjectId, name: string): Promise<IItem | null> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.items.find(
      i => i.openhab.toString() === openhabId.toString() && i.name === name
    ) || null;
  }

  addItem(item: Partial<IItem>): IItem {
    const newItem = {
      _id: new Types.ObjectId(),
      name: 'TestItem',
      openhab: new Types.ObjectId(),
      ...item,
    } as IItem;
    this.items.push(newItem);
    return newItem;
  }

  clear(): void {
    this.items = [];
    this.shouldThrow = false;
  }
}

class MockEventRepository implements IEventRepositoryForIfttt {
  events: IEvent[] = [];
  shouldThrow = false;

  async findByOpenhabAndSource(
    openhabId: string | Types.ObjectId,
    source: string,
    options: { status?: string; limit: number }
  ): Promise<IEvent[]> {
    if (this.shouldThrow) throw new Error('Database error');
    let result = this.events.filter(
      e => e.openhab.toString() === openhabId.toString() && e.source === source
    );
    if (options.status) {
      result = result.filter(e => e.status === options.status);
    }
    return result.slice(0, options.limit);
  }

  async findRaisedAbove(
    openhabId: string | Types.ObjectId,
    source: string,
    value: number,
    limit: number
  ): Promise<IEvent[]> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.events.filter(
      e =>
        e.openhab.toString() === openhabId.toString() &&
        e.source === source &&
        (e.numericStatus ?? 0) > value &&
        (e.oldNumericStatus ?? 0) <= value
    ).slice(0, limit);
  }

  async findDroppedBelow(
    openhabId: string | Types.ObjectId,
    source: string,
    value: number,
    limit: number
  ): Promise<IEvent[]> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.events.filter(
      e =>
        e.openhab.toString() === openhabId.toString() &&
        e.source === source &&
        (e.numericStatus ?? 0) < value &&
        (e.oldNumericStatus ?? 0) >= value
    ).slice(0, limit);
  }

  addEvent(event: Partial<IEvent>): IEvent {
    const newEvent = {
      _id: new Types.ObjectId(),
      openhab: new Types.ObjectId(),
      source: 'TestItem',
      status: 'ON',
      when: new Date(),
      ...event,
    } as IEvent;
    this.events.push(newEvent);
    return newEvent;
  }

  clear(): void {
    this.events = [];
    this.shouldThrow = false;
  }
}

class MockSocketEmitter implements ISocketEmitterForIfttt {
  emittedCommands: { uuid: string; item: string; command: string }[] = [];

  emitCommand(uuid: string, item: string, command: string): void {
    this.emittedCommands.push({ uuid, item, command });
  }

  clear(): void {
    this.emittedCommands = [];
  }
}

class MockIftttConfig implements IIftttConfig {
  channelKey = 'test-channel-key';
  testToken = 'test-token';
  baseURL = 'https://myopenhab.org';
  internalAddress = 'localhost:3000';

  getChannelKey(): string {
    return this.channelKey;
  }
  getTestToken(): string {
    return this.testToken;
  }
  getBaseURL(): string {
    return this.baseURL;
  }
  getInternalAddress(): string {
    return this.internalAddress;
  }
}

describe('IftttController', () => {
  let controller: IftttController;
  let openhabRepository: MockOpenhabRepository;
  let itemRepository: MockItemRepository;
  let eventRepository: MockEventRepository;
  let socketEmitter: MockSocketEmitter;
  let config: MockIftttConfig;
  let logger: MockLogger;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFunction: NextFunction;
  let statusStub: sinon.SinonStub;
  let jsonStub: sinon.SinonStub;
  let sendStub: sinon.SinonStub;
  let redirectStub: sinon.SinonStub;

  beforeEach(() => {
    openhabRepository = new MockOpenhabRepository();
    itemRepository = new MockItemRepository();
    eventRepository = new MockEventRepository();
    socketEmitter = new MockSocketEmitter();
    config = new MockIftttConfig();
    logger = new MockLogger();

    controller = new IftttController(
      openhabRepository,
      itemRepository,
      eventRepository,
      socketEmitter,
      config,
      logger
    );

    jsonStub = sinon.stub();
    sendStub = sinon.stub();
    redirectStub = sinon.stub();
    statusStub = sinon.stub().returns({ json: jsonStub, send: sendStub });

    mockReq = {
      headers: {},
      body: {},
      path: '/ifttt/v1/actions/command',
      user: {
        _id: new Types.ObjectId(),
        username: 'testuser',
        account: new Types.ObjectId(),
      } as Express.User,
      logIn: sinon.stub().callsArg(1),
    };

    mockRes = {
      status: statusStub,
      json: jsonStub,
      send: sendStub,
      redirect: redirectStub,
    };

    nextFunction = sinon.stub();
  });

  afterEach(() => {
    sinon.restore();
    openhabRepository.clear();
    itemRepository.clear();
    eventRepository.clear();
    socketEmitter.clear();
    logger.clear();
  });

  describe('ensureChannelKey', () => {
    it('should reject requests without channel key', () => {
      controller.ensureChannelKey(mockReq as Request, mockRes as Response, nextFunction);

      expect(statusStub.calledWith(401)).to.be.true;
      expect(sendStub.calledWith('Bad request')).to.be.true;
    });

    it('should reject requests with invalid channel key', () => {
      mockReq.headers = { 'ifttt-channel-key': 'wrong-key' };

      controller.ensureChannelKey(mockReq as Request, mockRes as Response, nextFunction);

      expect(statusStub.calledWith(401)).to.be.true;
      expect(sendStub.calledWith('Bad request')).to.be.true;
    });

    it('should call next for valid channel key', () => {
      mockReq.headers = { 'ifttt-channel-key': config.channelKey };

      controller.ensureChannelKey(mockReq as Request, mockRes as Response, nextFunction);

      expect((nextFunction as sinon.SinonStub).calledOnce).to.be.true;
    });
  });

  describe('getUserInfo', () => {
    it('should return user info', () => {
      mockReq.user = {
        _id: new Types.ObjectId(),
        username: 'testuser',
        account: new Types.ObjectId(),
      } as Express.User;

      controller.getUserInfo(mockReq as Request, mockRes as Response, nextFunction);

      expect(jsonStub.calledOnce).to.be.true;
      const responseData = jsonStub.firstCall.args[0];
      expect(responseData.data.name).to.equal('testuser');
      expect(responseData.data.url).to.equal('https://myopenhab.org/account');
    });
  });

  describe('getStatus', () => {
    it('should return service OK', () => {
      controller.getStatus(mockReq as Request, mockRes as Response, nextFunction);

      expect(sendStub.calledWith('service OK')).to.be.true;
    });
  });

  describe('getTestSetup', () => {
    it('should return test setup data', () => {
      controller.getTestSetup(mockReq as Request, mockRes as Response, nextFunction);

      expect(jsonStub.calledOnce).to.be.true;
      const responseData = jsonStub.firstCall.args[0];
      expect(responseData.data.accessToken).to.equal('test-token');
      expect(responseData.data.samples.triggers.itemstate).to.exist;
      expect(responseData.data.samples.actions.command).to.exist;
    });
  });

  describe('actionCommand', () => {
    it('should reject requests without actionFields', async () => {
      mockReq.body = {};

      await controller.actionCommand(mockReq as Request, mockRes as Response, nextFunction);

      expect(statusStub.calledWith(400)).to.be.true;
      expect(jsonStub.firstCall.args[0].errors[0].message).to.equal('No actionfields');
    });

    it('should reject requests with incomplete actionFields', async () => {
      mockReq.body = { actionFields: { item: 'Light' } };

      await controller.actionCommand(mockReq as Request, mockRes as Response, nextFunction);

      expect(statusStub.calledWith(400)).to.be.true;
      expect(jsonStub.firstCall.args[0].errors[0].message).to.equal('Actionfields incomplete');
    });

    it('should reject requests when openhab not found', async () => {
      mockReq.body = { actionFields: { item: 'Light', command: 'ON' } };

      await controller.actionCommand(mockReq as Request, mockRes as Response, nextFunction);

      expect(statusStub.calledWith(400)).to.be.true;
      expect(jsonStub.firstCall.args[0].errors[0].message).to.equal('Request failed');
    });

    it('should emit command when openhab found and on same server', async () => {
      const openhab = openhabRepository.addOpenhab({ account: mockReq.user!.account });
      openhabRepository.setConnectionInfo(openhab._id, {
        serverAddress: config.internalAddress,
        connectionId: 'conn-1',
        connectionTime: new Date().toISOString(),
      });
      mockReq.body = { actionFields: { item: 'Light', command: 'ON' } };

      await controller.actionCommand(mockReq as Request, mockRes as Response, nextFunction);

      expect(socketEmitter.emittedCommands).to.have.lengthOf(1);
      expect(socketEmitter.emittedCommands[0].uuid).to.equal(openhab.uuid);
      expect(socketEmitter.emittedCommands[0].item).to.equal('Light');
      expect(socketEmitter.emittedCommands[0].command).to.equal('ON');
      expect(jsonStub.firstCall.args[0].data[0].id).to.equal('12345');
    });

    it('should redirect when openhab on different server', async () => {
      const openhab = openhabRepository.addOpenhab({ account: mockReq.user!.account });
      openhabRepository.setConnectionInfo(openhab._id, {
        serverAddress: 'other-server:3000',
        connectionId: 'conn-1',
        connectionTime: new Date().toISOString(),
      });
      mockReq.body = { actionFields: { item: 'Light', command: 'ON' } };

      await controller.actionCommand(mockReq as Request, mockRes as Response, nextFunction);

      expect(redirectStub.calledOnce).to.be.true;
      expect(redirectStub.firstCall.args[0]).to.equal(307);
      expect(redirectStub.firstCall.args[1]).to.include('other-server:3000');
    });

    it('should emit command when no connection info (offline)', async () => {
      const openhab = openhabRepository.addOpenhab({ account: mockReq.user!.account });
      mockReq.body = { actionFields: { item: 'Light', command: 'ON' } };

      await controller.actionCommand(mockReq as Request, mockRes as Response, nextFunction);

      expect(socketEmitter.emittedCommands).to.have.lengthOf(1);
      expect(jsonStub.firstCall.args[0].data[0].id).to.equal('12345');
    });

    it('should handle repository errors', async () => {
      openhabRepository.shouldThrow = true;
      mockReq.body = { actionFields: { item: 'Light', command: 'ON' } };

      await controller.actionCommand(mockReq as Request, mockRes as Response, nextFunction);

      expect(statusStub.calledWith(400)).to.be.true;
      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
    });
  });

  describe('actionCommandItemOptions', () => {
    it('should return list of items', async () => {
      const openhab = openhabRepository.addOpenhab({ account: mockReq.user!.account });
      itemRepository.addItem({ openhab: openhab._id, name: 'Light_Kitchen' });
      itemRepository.addItem({ openhab: openhab._id, name: 'Light_Bedroom' });

      await controller.actionCommandItemOptions(mockReq as Request, mockRes as Response, nextFunction);

      expect(jsonStub.calledOnce).to.be.true;
      const responseData = jsonStub.firstCall.args[0].data;
      expect(responseData).to.have.lengthOf(2);
      expect(responseData[0].label).to.equal('Light_Kitchen');
      expect(responseData[0].value).to.equal('Light_Kitchen');
    });

    it('should reject when openhab not found', async () => {
      await controller.actionCommandItemOptions(mockReq as Request, mockRes as Response, nextFunction);

      expect(statusStub.calledWith(400)).to.be.true;
    });
  });

  describe('triggerItemState', () => {
    it('should reject when openhab not found', async () => {
      mockReq.body = { triggerFields: { item: 'Light', status: 'ON' } };

      await controller.triggerItemState(mockReq as Request, mockRes as Response, nextFunction);

      expect(statusStub.calledWith(400)).to.be.true;
      expect(jsonStub.firstCall.args[0].errors[0].message).to.equal('No openhab');
    });

    it('should reject when triggerFields missing', async () => {
      openhabRepository.addOpenhab({ account: mockReq.user!.account });
      mockReq.body = {};

      await controller.triggerItemState(mockReq as Request, mockRes as Response, nextFunction);

      expect(statusStub.calledWith(400)).to.be.true;
      expect(jsonStub.firstCall.args[0].errors[0].message).to.equal('No triggerFields');
    });

    it('should reject when item not found', async () => {
      openhabRepository.addOpenhab({ account: mockReq.user!.account });
      mockReq.body = { triggerFields: { item: 'NonExistent', status: 'ON' } };

      await controller.triggerItemState(mockReq as Request, mockRes as Response, nextFunction);

      expect(statusStub.calledWith(400)).to.be.true;
      expect(jsonStub.firstCall.args[0].errors[0].message).to.equal('No item');
    });

    it('should return empty array for limit <= 0', async () => {
      const openhab = openhabRepository.addOpenhab({ account: mockReq.user!.account });
      itemRepository.addItem({ openhab: openhab._id, name: 'Light' });
      mockReq.body = { triggerFields: { item: 'Light', status: 'ON' }, limit: 0 };

      await controller.triggerItemState(mockReq as Request, mockRes as Response, nextFunction);

      expect(jsonStub.firstCall.args[0].data).to.deep.equal([]);
    });

    it('should return matching events', async () => {
      const openhab = openhabRepository.addOpenhab({ account: mockReq.user!.account });
      itemRepository.addItem({ openhab: openhab._id, name: 'Light' });
      eventRepository.addEvent({ openhab: openhab._id, source: 'Light', status: 'ON' });
      eventRepository.addEvent({ openhab: openhab._id, source: 'Light', status: 'OFF' });
      mockReq.body = { triggerFields: { item: 'Light', status: 'ON' } };

      await controller.triggerItemState(mockReq as Request, mockRes as Response, nextFunction);

      expect(jsonStub.calledOnce).to.be.true;
      const responseData = jsonStub.firstCall.args[0].data;
      expect(responseData).to.have.lengthOf(1);
      expect(responseData[0].item).to.equal('Light');
      expect(responseData[0].status).to.equal('ON');
    });
  });

  describe('triggerItemRaisedAbove', () => {
    it('should return events where value raised above threshold', async () => {
      const openhab = openhabRepository.addOpenhab({ account: mockReq.user!.account });
      itemRepository.addItem({ openhab: openhab._id, name: 'Temperature' });
      eventRepository.addEvent({
        openhab: openhab._id,
        source: 'Temperature',
        status: '21',
        numericStatus: 21,
        oldNumericStatus: 18,
      });
      eventRepository.addEvent({
        openhab: openhab._id,
        source: 'Temperature',
        status: '18',
        numericStatus: 18,
        oldNumericStatus: 22,
      });
      mockReq.body = { triggerFields: { item: 'Temperature', value: '20' } };

      await controller.triggerItemRaisedAbove(mockReq as Request, mockRes as Response, nextFunction);

      expect(jsonStub.calledOnce).to.be.true;
      const responseData = jsonStub.firstCall.args[0].data;
      expect(responseData).to.have.lengthOf(1);
      expect(responseData[0].status).to.equal('21');
    });

    it('should reject when openhab not found', async () => {
      mockReq.body = { triggerFields: { item: 'Temperature', value: '20' } };

      await controller.triggerItemRaisedAbove(mockReq as Request, mockRes as Response, nextFunction);

      expect(statusStub.calledWith(400)).to.be.true;
    });
  });

  describe('triggerItemDroppedBelow', () => {
    it('should return events where value dropped below threshold', async () => {
      const openhab = openhabRepository.addOpenhab({ account: mockReq.user!.account });
      itemRepository.addItem({ openhab: openhab._id, name: 'Temperature' });
      eventRepository.addEvent({
        openhab: openhab._id,
        source: 'Temperature',
        status: '18',
        numericStatus: 18,
        oldNumericStatus: 22,
      });
      eventRepository.addEvent({
        openhab: openhab._id,
        source: 'Temperature',
        status: '21',
        numericStatus: 21,
        oldNumericStatus: 18,
      });
      mockReq.body = { triggerFields: { item: 'Temperature', value: '20' } };

      await controller.triggerItemDroppedBelow(mockReq as Request, mockRes as Response, nextFunction);

      expect(jsonStub.calledOnce).to.be.true;
      const responseData = jsonStub.firstCall.args[0].data;
      expect(responseData).to.have.lengthOf(1);
      expect(responseData[0].status).to.equal('18');
    });

    it('should reject when openhab not found', async () => {
      mockReq.body = { triggerFields: { item: 'Temperature', value: '20' } };

      await controller.triggerItemDroppedBelow(mockReq as Request, mockRes as Response, nextFunction);

      expect(statusStub.calledWith(400)).to.be.true;
    });
  });

  describe('triggerItemOptions', () => {
    it('should return list of items', async () => {
      const openhab = openhabRepository.addOpenhab({ account: mockReq.user!.account });
      itemRepository.addItem({ openhab: openhab._id, name: 'Light' });
      itemRepository.addItem({ openhab: openhab._id, name: 'Temperature' });

      await controller.triggerItemOptions(mockReq as Request, mockRes as Response, nextFunction);

      expect(jsonStub.calledOnce).to.be.true;
      const responseData = jsonStub.firstCall.args[0].data;
      expect(responseData).to.have.lengthOf(2);
    });

    it('should reject when openhab not found', async () => {
      await controller.triggerItemOptions(mockReq as Request, mockRes as Response, nextFunction);

      expect(statusStub.calledWith(400)).to.be.true;
    });

    it('should handle repository errors', async () => {
      openhabRepository.shouldThrow = true;

      await controller.triggerItemOptions(mockReq as Request, mockRes as Response, nextFunction);

      expect(statusStub.calledWith(400)).to.be.true;
      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
    });
  });
});
