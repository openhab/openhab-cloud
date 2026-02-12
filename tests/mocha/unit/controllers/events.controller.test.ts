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
import { EventsController } from '../../../../src/controllers/events.controller';
import type { IEventRepositoryForEvents } from '../../../../src/controllers/events.controller';
import type { IEvent } from '../../../../src/types/models';
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

class MockEventRepository implements IEventRepositoryForEvents {
  events: IEvent[] = [];
  totalCount = 0;
  shouldThrow = false;

  async findByOpenhab(
    _openhabId: string | Types.ObjectId,
    _options: { source?: string; limit: number; skip: number }
  ): Promise<IEvent[]> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.events;
  }

  async count(): Promise<number> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.totalCount;
  }

  addEvent(event: Partial<IEvent>): void {
    this.events.push({
      _id: new Types.ObjectId(),
      openhab: new Types.ObjectId(),
      source: 'test-source',
      status: 'online',
      color: 'green',
      when: new Date(),
      ...event,
    } as IEvent);
  }

  clear(): void {
    this.events = [];
    this.totalCount = 0;
    this.shouldThrow = false;
  }
}

describe('EventsController', () => {
  let controller: EventsController;
  let eventRepository: MockEventRepository;
  let logger: MockLogger;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let renderStub: sinon.SinonStub;
  let redirectStub: sinon.SinonStub;
  let flashStub: sinon.SinonStub;

  beforeEach(() => {
    eventRepository = new MockEventRepository();
    logger = new MockLogger();
    controller = new EventsController(eventRepository, logger);

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
    eventRepository.clear();
    logger.clear();
  });

  describe('getEvents', () => {
    it('should render events page with events', async () => {
      eventRepository.addEvent({ source: 'test-source' });
      eventRepository.addEvent({ source: 'test-source-2' });
      eventRepository.totalCount = 2;

      await controller.getEvents(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('events');

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.events).to.have.lengthOf(2);
      expect(templateData.title).to.equal('Events');
    });

    it('should pass user and openhab to template', async () => {
      eventRepository.totalCount = 0;

      await controller.getEvents(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.user).to.equal(mockReq.user);
      expect(templateData.openhab).to.equal(mockReq.openhab);
    });

    it('should calculate pages correctly', async () => {
      eventRepository.totalCount = 50; // 50 events with 20 per page = 3 pages

      await controller.getEvents(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.pages).to.equal(3);
    });

    it('should use page query parameter', async () => {
      mockReq.query = { page: '2' };
      eventRepository.totalCount = 100;

      await controller.getEvents(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.page).to.equal(2);
    });

    it('should handle invalid page parameter gracefully', async () => {
      mockReq.query = { page: 'invalid' };
      eventRepository.totalCount = 0;

      await controller.getEvents(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.page).to.equal(0);
    });

    it('should handle negative page parameter', async () => {
      mockReq.query = { page: '-5' };
      eventRepository.totalCount = 0;

      await controller.getEvents(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.page).to.equal(0);
    });

    it('should pass source filter to template', async () => {
      mockReq.query = { source: 'my-source' };
      eventRepository.totalCount = 0;

      await controller.getEvents(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.source).to.equal('my-source');
    });

    it('should redirect with error when openhab is not found', async () => {
      mockReq.openhab = undefined;

      await controller.getEvents(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'openHAB instance not found')).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
      expect(renderStub.called).to.be.false;
    });

    it('should handle repository errors gracefully', async () => {
      eventRepository.shouldThrow = true;

      await controller.getEvents(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'Error loading events')).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
    });

    it('should pass flash messages to template', async () => {
      flashStub.withArgs('error').returns(['Some error']);
      flashStub.withArgs('info').returns(['Some info']);
      eventRepository.totalCount = 0;

      await controller.getEvents(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.errormessages).to.deep.equal(['Some error']);
      expect(templateData.infomessages).to.deep.equal(['Some info']);
    });
  });
});
