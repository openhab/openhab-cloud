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
import { NotificationsViewController } from '../../../../src/controllers/notifications-view.controller';
import type { INotificationRepositoryForView } from '../../../../src/controllers/notifications-view.controller';
import type { INotification } from '../../../../src/types/models';
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

class MockNotificationRepository implements INotificationRepositoryForView {
  notifications: INotification[] = [];
  totalCount = 0;
  shouldThrow = false;

  async findByUser(
    _userId: string | Types.ObjectId,
    _options: { limit: number; skip: number }
  ): Promise<INotification[]> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.notifications;
  }

  async count(): Promise<number> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.totalCount;
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
    this.totalCount = 0;
    this.shouldThrow = false;
  }
}

describe('NotificationsViewController', () => {
  let controller: NotificationsViewController;
  let notificationRepository: MockNotificationRepository;
  let logger: MockLogger;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let renderStub: sinon.SinonStub;
  let redirectStub: sinon.SinonStub;
  let flashStub: sinon.SinonStub;

  beforeEach(() => {
    notificationRepository = new MockNotificationRepository();
    logger = new MockLogger();
    controller = new NotificationsViewController(notificationRepository, logger);

    flashStub = sinon.stub();
    flashStub.withArgs('error').returns([]);
    flashStub.withArgs('info').returns([]);

    mockReq = {
      query: {},
      user: { _id: new Types.ObjectId(), username: 'testuser' } as Express.User,
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
    notificationRepository.clear();
    logger.clear();
  });

  describe('getNotifications', () => {
    it('should render notifications page with notifications', async () => {
      notificationRepository.addNotification({ message: 'Notification 1' });
      notificationRepository.addNotification({ message: 'Notification 2' });
      notificationRepository.totalCount = 2;

      await controller.getNotifications(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('notifications');

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.notifications).to.have.lengthOf(2);
      expect(templateData.title).to.equal('Notifications');
    });

    it('should pass user and openhab to template', async () => {
      notificationRepository.totalCount = 0;

      await controller.getNotifications(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.user).to.equal(mockReq.user);
      expect(templateData.openhab).to.equal(mockReq.openhab);
    });

    it('should calculate pages correctly', async () => {
      notificationRepository.totalCount = 50; // 50 notifications with 20 per page = 3 pages

      await controller.getNotifications(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.pages).to.equal(3);
    });

    it('should use page query parameter', async () => {
      mockReq.query = { page: '2' };
      notificationRepository.totalCount = 100;

      await controller.getNotifications(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.page).to.equal(2);
    });

    it('should handle invalid page parameter gracefully', async () => {
      mockReq.query = { page: 'invalid' };
      notificationRepository.totalCount = 0;

      await controller.getNotifications(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.page).to.equal(0);
    });

    it('should handle negative page parameter', async () => {
      mockReq.query = { page: '-5' };
      notificationRepository.totalCount = 0;

      await controller.getNotifications(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.page).to.equal(0);
    });

    it('should redirect to login when user is not authenticated', async () => {
      mockReq.user = undefined;

      await controller.getNotifications(mockReq as Request, mockRes as Response, () => {});

      expect(redirectStub.calledWith('/login')).to.be.true;
      expect(renderStub.called).to.be.false;
    });

    it('should handle repository errors gracefully', async () => {
      notificationRepository.shouldThrow = true;

      await controller.getNotifications(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'Error loading notifications')).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
    });

    it('should pass flash messages to template', async () => {
      flashStub.withArgs('error').returns(['Some error']);
      flashStub.withArgs('info').returns(['Some info']);
      notificationRepository.totalCount = 0;

      await controller.getNotifications(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.errormessages).to.deep.equal(['Some error']);
      expect(templateData.infomessages).to.deep.equal(['Some info']);
    });
  });
});
