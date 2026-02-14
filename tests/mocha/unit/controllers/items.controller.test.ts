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
import { ItemsController } from '../../../../src/controllers/items.controller';
import type { IItemRepositoryForItems } from '../../../../src/controllers/items.controller';
import type { IItem } from '../../../../src/types/models';
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

class MockItemRepository implements IItemRepositoryForItems {
  items: IItem[] = [];
  lastSortParam: 'name' | 'last_update' | 'status' | null = null;
  shouldThrow = false;

  async findByOpenhab(
    _openhabId: string | Types.ObjectId,
    sort: 'name' | 'last_update' | 'status'
  ): Promise<IItem[]> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    this.lastSortParam = sort;
    return this.items;
  }

  addItem(item: Partial<IItem>): void {
    this.items.push({
      _id: new Types.ObjectId(),
      openhab: new Types.ObjectId(),
      name: 'test-item',
      type: 'Switch',
      status: 'ON',
      last_update: new Date(),
      ...item,
    } as IItem);
  }

  clear(): void {
    this.items = [];
    this.lastSortParam = null;
    this.shouldThrow = false;
  }
}

describe('ItemsController', () => {
  let controller: ItemsController;
  let itemRepository: MockItemRepository;
  let logger: MockLogger;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let renderStub: sinon.SinonStub;
  let redirectStub: sinon.SinonStub;
  let flashStub: sinon.SinonStub;

  beforeEach(() => {
    itemRepository = new MockItemRepository();
    logger = new MockLogger();
    controller = new ItemsController(itemRepository, logger);

    flashStub = sinon.stub();
    flashStub.withArgs('error').returns([]);
    flashStub.withArgs('info').returns([]);

    mockReq = {
      query: {},
      user: { _id: 'user123', username: 'testuser' } as Express.User,
      openhab: { _id: new Types.ObjectId(), uuid: 'test-uuid' } as Request['openhab'],
      flash: flashStub,
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
    itemRepository.clear();
    logger.clear();
  });

  describe('getItems', () => {
    it('should render items page with items', async () => {
      itemRepository.addItem({ name: 'Light_Switch' });
      itemRepository.addItem({ name: 'Temperature_Sensor' });

      await controller.getItems(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('items');

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.items).to.have.lengthOf(2);
      expect(templateData.title).to.equal('Items');
    });

    it('should pass user and openhab to template', async () => {
      await controller.getItems(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.user).to.equal(mockReq.user);
      expect(templateData.openhab).to.equal(mockReq.openhab);
    });

    it('should use default sort of "name"', async () => {
      await controller.getItems(mockReq as Request, mockRes as Response, () => {});

      expect(itemRepository.lastSortParam).to.equal('name');
    });

    it('should use sort=last_update when specified', async () => {
      mockReq.query = { sort: 'last_update' };

      await controller.getItems(mockReq as Request, mockRes as Response, () => {});

      expect(itemRepository.lastSortParam).to.equal('last_update');
    });

    it('should use sort=status when specified', async () => {
      mockReq.query = { sort: 'status' };

      await controller.getItems(mockReq as Request, mockRes as Response, () => {});

      expect(itemRepository.lastSortParam).to.equal('status');
    });

    it('should default to "name" for invalid sort parameter', async () => {
      mockReq.query = { sort: 'invalid' };

      await controller.getItems(mockReq as Request, mockRes as Response, () => {});

      expect(itemRepository.lastSortParam).to.equal('name');
    });

    it('should redirect with error when openhab is not found', async () => {
      mockReq.openhab = undefined;

      await controller.getItems(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'openHAB instance not found')).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
      expect(renderStub.called).to.be.false;
    });

    it('should handle repository errors gracefully', async () => {
      itemRepository.shouldThrow = true;

      await controller.getItems(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'Error loading items')).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
    });

    it('should pass flash messages to template', async () => {
      flashStub.withArgs('error').returns(['Some error']);
      flashStub.withArgs('info').returns(['Some info']);

      await controller.getItems(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.errormessages).to.deep.equal(['Some error']);
      expect(templateData.infomessages).to.deep.equal(['Some info']);
    });
  });
});
