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
import { WebhooksController } from '../../../../src/controllers/webhooks.controller';
import type { IWebhookRepositoryForWebhooks } from '../../../../src/controllers/webhooks.controller';
import type { IWebhook, IOpenhab } from '../../../../src/types/models';
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

class MockWebhookRepository implements IWebhookRepositoryForWebhooks {
  webhooks: IWebhook[] = [];
  deletedIds: (string | Types.ObjectId)[] = [];
  shouldThrow = false;

  async findByOpenhab(openhabId: string | Types.ObjectId): Promise<IWebhook[]> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.webhooks.filter(
      (w) => w.openhab.toString() === openhabId.toString()
    );
  }

  async findByIdAndOpenhab(
    id: string | Types.ObjectId,
    openhabId: string | Types.ObjectId
  ): Promise<IWebhook | null> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return (
      this.webhooks.find(
        (w) =>
          w._id.toString() === id.toString() &&
          w.openhab.toString() === openhabId.toString()
      ) || null
    );
  }

  async deleteById(id: string | Types.ObjectId): Promise<void> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    this.deletedIds.push(id);
  }

  addWebhook(webhook: Partial<IWebhook>): IWebhook {
    const newWebhook = {
      _id: new Types.ObjectId(),
      uuid: 'test-uuid-' + Math.random().toString(36).slice(2),
      openhab: new Types.ObjectId(),
      localPath: '/test/path',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ...webhook,
    } as IWebhook;
    this.webhooks.push(newWebhook);
    return newWebhook;
  }

  clear(): void {
    this.webhooks = [];
    this.deletedIds = [];
    this.shouldThrow = false;
  }
}

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let webhookRepository: MockWebhookRepository;
  let logger: MockLogger;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let renderStub: sinon.SinonStub;
  let redirectStub: sinon.SinonStub;
  let flashStub: sinon.SinonStub;
  let openhabId: Types.ObjectId;

  const systemConfig = { getBaseURL: () => 'https://myopenhab.example.com/' };

  beforeEach(() => {
    webhookRepository = new MockWebhookRepository();
    logger = new MockLogger();
    controller = new WebhooksController(webhookRepository, systemConfig, logger);

    flashStub = sinon.stub();
    flashStub.withArgs('error').returns([]);
    flashStub.withArgs('info').returns([]);

    openhabId = new Types.ObjectId();

    mockReq = {
      params: {},
      user: { _id: new Types.ObjectId(), username: 'testuser' } as Express.User,
      openhab: { _id: openhabId } as IOpenhab,
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
    webhookRepository.clear();
    logger.clear();
  });

  describe('getWebhooks', () => {
    it('should render webhooks page with webhooks', async () => {
      webhookRepository.addWebhook({ openhab: openhabId, localPath: '/a' });
      webhookRepository.addWebhook({ openhab: openhabId, localPath: '/b' });

      await controller.getWebhooks(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('webhooks');

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.webhooks).to.have.lengthOf(2);
      expect(templateData.title).to.equal('Webhooks');
    });

    it('should only return webhooks for the user\'s openhab', async () => {
      const otherOpenhabId = new Types.ObjectId();
      webhookRepository.addWebhook({ openhab: openhabId, localPath: '/mine' });
      webhookRepository.addWebhook({ openhab: otherOpenhabId, localPath: '/other' });

      await controller.getWebhooks(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.webhooks).to.have.lengthOf(1);
      expect(templateData.webhooks[0].localPath).to.equal('/mine');
    });

    it('should build the full webhook URL with trailing slash stripped', async () => {
      webhookRepository.addWebhook({
        openhab: openhabId,
        localPath: '/path',
        uuid: 'abc-123',
      });

      await controller.getWebhooks(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.webhooks[0].url).to.equal(
        'https://myopenhab.example.com/api/hooks/abc-123'
      );
    });

    it('should pass user to template', async () => {
      await controller.getWebhooks(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.user).to.equal(mockReq.user);
    });

    it('should redirect to login when user is not authenticated', async () => {
      mockReq.user = undefined;

      await controller.getWebhooks(mockReq as Request, mockRes as Response, () => {});

      expect(redirectStub.calledWith('/login')).to.be.true;
      expect(renderStub.called).to.be.false;
    });

    it('should redirect to login when openhab is missing', async () => {
      mockReq.openhab = undefined;

      await controller.getWebhooks(mockReq as Request, mockRes as Response, () => {});

      expect(redirectStub.calledWith('/login')).to.be.true;
      expect(renderStub.called).to.be.false;
    });

    it('should handle repository errors gracefully', async () => {
      webhookRepository.shouldThrow = true;

      await controller.getWebhooks(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some((l) => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'Error loading webhooks')).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
    });

    it('should pass flash messages to template', async () => {
      flashStub.withArgs('error').returns(['Some error']);
      flashStub.withArgs('info').returns(['Some info']);

      await controller.getWebhooks(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.errormessages).to.deep.equal(['Some error']);
      expect(templateData.infomessages).to.deep.equal(['Some info']);
    });
  });

  describe('deleteWebhook', () => {
    it('should delete webhook and redirect with success message', async () => {
      const webhook = webhookRepository.addWebhook({ openhab: openhabId });
      mockReq.params = { id: webhook._id.toString() };

      await controller.deleteWebhook(mockReq as Request, mockRes as Response, () => {});

      expect(webhookRepository.deletedIds).to.have.lengthOf(1);
      expect(flashStub.calledWith('info', 'Webhook deleted')).to.be.true;
      expect(redirectStub.calledWith('/webhooks')).to.be.true;
    });

    it('should not delete webhook belonging to another openhab (IDOR protection)', async () => {
      const otherOpenhabId = new Types.ObjectId();
      const webhook = webhookRepository.addWebhook({ openhab: otherOpenhabId });
      mockReq.params = { id: webhook._id.toString() };

      await controller.deleteWebhook(mockReq as Request, mockRes as Response, () => {});

      expect(webhookRepository.deletedIds).to.have.lengthOf(0);
      expect(flashStub.calledWith('error', 'Webhook not found')).to.be.true;
      expect(redirectStub.calledWith('/webhooks')).to.be.true;
    });

    it('should flash error when webhook not found', async () => {
      mockReq.params = { id: new Types.ObjectId().toString() };

      await controller.deleteWebhook(mockReq as Request, mockRes as Response, () => {});

      expect(webhookRepository.deletedIds).to.have.lengthOf(0);
      expect(flashStub.calledWith('error', 'Webhook not found')).to.be.true;
      expect(redirectStub.calledWith('/webhooks')).to.be.true;
    });

    it('should redirect when id parameter is missing', async () => {
      mockReq.params = {};

      await controller.deleteWebhook(mockReq as Request, mockRes as Response, () => {});

      expect(redirectStub.calledWith('/webhooks')).to.be.true;
    });

    it('should reject invalid ObjectId format', async () => {
      mockReq.params = { id: 'invalid-id' };

      await controller.deleteWebhook(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Invalid webhook ID')).to.be.true;
      expect(redirectStub.calledWith('/webhooks')).to.be.true;
    });

    it('should redirect to login when user is not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.params = { id: new Types.ObjectId().toString() };

      await controller.deleteWebhook(mockReq as Request, mockRes as Response, () => {});

      expect(redirectStub.calledWith('/login')).to.be.true;
    });

    it('should redirect to login when openhab is missing', async () => {
      mockReq.openhab = undefined;
      mockReq.params = { id: new Types.ObjectId().toString() };

      await controller.deleteWebhook(mockReq as Request, mockRes as Response, () => {});

      expect(redirectStub.calledWith('/login')).to.be.true;
    });

    it('should handle repository errors gracefully', async () => {
      const webhook = webhookRepository.addWebhook({ openhab: openhabId });
      mockReq.params = { id: webhook._id.toString() };
      webhookRepository.shouldThrow = true;

      await controller.deleteWebhook(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some((l) => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'Error deleting webhook')).to.be.true;
      expect(redirectStub.calledWith('/webhooks')).to.be.true;
    });

    it('should log deletion', async () => {
      const webhook = webhookRepository.addWebhook({ openhab: openhabId });
      mockReq.params = { id: webhook._id.toString() };

      await controller.deleteWebhook(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some((l) => l.level === 'info' && l.message.includes('Deleted')))
        .to.be.true;
    });
  });
});
