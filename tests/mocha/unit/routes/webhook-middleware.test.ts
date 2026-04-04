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
import { EventEmitter } from 'events';
import { Types } from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import {
  createSetOpenhabForWebhook,
  createBodySizeLimit,
} from '../../../../src/routes/middleware';
import type {
  IWebhookRepositoryForMiddleware,
  IOpenhabRepositoryForMiddleware,
} from '../../../../src/routes/middleware';

describe('Webhook Middleware', () => {
  let mockRedis: { get: sinon.SinonStub };
  let mockLogger: {
    debug: sinon.SinonStub;
    info: sinon.SinonStub;
    warn: sinon.SinonStub;
    error: sinon.SinonStub;
  };

  beforeEach(() => {
    mockRedis = { get: sinon.stub() };
    mockLogger = {
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('createSetOpenhabForWebhook', () => {
    let webhookRepo: { findByUuid: sinon.SinonStub };
    let openhabRepo: { findById: sinon.SinonStub };

    beforeEach(() => {
      webhookRepo = { findByUuid: sinon.stub() };
      openhabRepo = { findById: sinon.stub() };
    });

    function createMiddleware() {
      return createSetOpenhabForWebhook(
        webhookRepo as IWebhookRepositoryForMiddleware,
        openhabRepo as IOpenhabRepositoryForMiddleware,
        mockRedis as any,
        mockLogger as any
      );
    }

    it('should return 400 when uuid param is missing', async () => {
      const middleware = createMiddleware();
      const req = { params: {} } as unknown as Request;
      const statusStub = sinon.stub().returnsThis();
      const jsonStub = sinon.stub();
      const res = { status: statusStub, json: jsonStub } as unknown as Response;
      const next = sinon.spy();

      await middleware(req, res, next);

      expect(statusStub.calledWith(400)).to.be.true;
      expect(jsonStub.calledWithMatch({ error: 'Missing webhook UUID' })).to.be.true;
      expect(next.called).to.be.false;
    });

    it('should return 404 when webhook is not found', async () => {
      const middleware = createMiddleware();
      webhookRepo.findByUuid.resolves(null);

      const req = { params: { uuid: 'non-existent-uuid' } } as unknown as Request;
      const statusStub = sinon.stub().returnsThis();
      const jsonStub = sinon.stub();
      const res = { status: statusStub, json: jsonStub } as unknown as Response;
      const next = sinon.spy();

      await middleware(req, res, next);

      expect(statusStub.calledWith(404)).to.be.true;
      expect(jsonStub.calledWithMatch({ error: 'Webhook not found or expired' })).to.be.true;
      expect(next.called).to.be.false;
    });

    it('should return 404 when webhook is expired', async () => {
      const middleware = createMiddleware();
      webhookRepo.findByUuid.resolves({
        _id: new Types.ObjectId(),
        uuid: 'expired-uuid',
        openhab: new Types.ObjectId(),
        localPath: '/rest/hooks/test',
        createdAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
      });

      const req = { params: { uuid: 'expired-uuid' } } as unknown as Request;
      const statusStub = sinon.stub().returnsThis();
      const jsonStub = sinon.stub();
      const res = { status: statusStub, json: jsonStub } as unknown as Response;
      const next = sinon.spy();

      await middleware(req, res, next);

      expect(statusStub.calledWith(404)).to.be.true;
      expect(jsonStub.calledWithMatch({ error: 'Webhook not found or expired' })).to.be.true;
      expect(next.called).to.be.false;
    });

    it('should return 404 when openhab instance is not found', async () => {
      const middleware = createMiddleware();
      const openhabId = new Types.ObjectId();
      webhookRepo.findByUuid.resolves({
        _id: new Types.ObjectId(),
        uuid: 'valid-uuid',
        openhab: openhabId,
        localPath: '/rest/hooks/test',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      });
      openhabRepo.findById.resolves(null);

      const req = { params: { uuid: 'valid-uuid' } } as unknown as Request;
      const statusStub = sinon.stub().returnsThis();
      const jsonStub = sinon.stub();
      const res = { status: statusStub, json: jsonStub } as unknown as Response;
      const next = sinon.spy();

      await middleware(req, res, next);

      expect(statusStub.calledWith(404)).to.be.true;
      expect(jsonStub.calledWithMatch({ error: 'openHAB instance not found' })).to.be.true;
    });

    it('should return 502 when openhab instance is offline', async () => {
      const middleware = createMiddleware();
      const openhabId = new Types.ObjectId();
      webhookRepo.findByUuid.resolves({
        _id: new Types.ObjectId(),
        uuid: 'valid-uuid',
        openhab: openhabId,
        localPath: '/rest/hooks/test',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      });
      openhabRepo.findById.resolves({
        _id: openhabId,
        uuid: 'openhab-uuid',
      });
      mockRedis.get.resolves(null); // offline

      const req = { params: { uuid: 'valid-uuid' } } as unknown as Request;
      const statusStub = sinon.stub().returnsThis();
      const jsonStub = sinon.stub();
      const res = { status: statusStub, json: jsonStub } as unknown as Response;
      const next = sinon.spy();

      await middleware(req, res, next);

      expect(statusStub.calledWith(502)).to.be.true;
      expect(jsonStub.calledWithMatch({ error: 'openHAB instance is offline' })).to.be.true;
    });

    it('should set req.openhab and req.webhookLocalPath on success', async () => {
      const middleware = createMiddleware();
      const openhabId = new Types.ObjectId();
      const mockOpenhab = { _id: openhabId, uuid: 'openhab-uuid' };

      webhookRepo.findByUuid.resolves({
        _id: new Types.ObjectId(),
        uuid: 'valid-uuid',
        openhab: openhabId,
        localPath: '/rest/hooks/test',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      });
      openhabRepo.findById.resolves(mockOpenhab);
      mockRedis.get.resolves(JSON.stringify({
        serverAddress: 'server1:3000',
        connectionId: 'conn-1',
      }));

      const req = { params: { uuid: 'valid-uuid' } } as unknown as Request;
      const statusStub = sinon.stub().returnsThis();
      const jsonStub = sinon.stub();
      const res = { status: statusStub, json: jsonStub } as unknown as Response;
      const next = sinon.spy();

      await middleware(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect((req as any).openhab).to.equal(mockOpenhab);
      expect((req as any).webhookLocalPath).to.equal('/rest/hooks/test');
      expect((req as any).connectionInfo).to.deep.include({
        serverAddress: 'server1:3000',
      });
    });

    it('should append multi-segment subpath to webhookLocalPath', async () => {
      const middleware = createMiddleware();
      const openhabId = new Types.ObjectId();
      const mockOpenhab = { _id: openhabId, uuid: 'openhab-uuid' };

      webhookRepo.findByUuid.resolves({
        _id: new Types.ObjectId(),
        uuid: 'valid-uuid',
        openhab: openhabId,
        localPath: '/rest/hooks/test',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      });
      openhabRepo.findById.resolves(mockOpenhab);
      mockRedis.get.resolves(JSON.stringify({
        serverAddress: 'server1:3000',
        connectionId: 'conn-1',
      }));

      // Express 5 {*subpath} returns an array of path segments
      const req = {
        params: { uuid: 'valid-uuid', subpath: ['twilio:phone:main:15551234567', 'sms'] },
      } as unknown as Request;
      const statusStub = sinon.stub().returnsThis();
      const jsonStub = sinon.stub();
      const res = { status: statusStub, json: jsonStub } as unknown as Response;
      const next = sinon.spy();

      await middleware(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect((req as any).webhookLocalPath).to.equal(
        '/rest/hooks/test/twilio:phone:main:15551234567/sms'
      );
    });

    it('should return 500 on unexpected error', async () => {
      const middleware = createMiddleware();
      webhookRepo.findByUuid.rejects(new Error('DB failure'));

      const req = { params: { uuid: 'some-uuid' } } as unknown as Request;
      const statusStub = sinon.stub().returnsThis();
      const jsonStub = sinon.stub();
      const res = { status: statusStub, json: jsonStub } as unknown as Response;
      const next = sinon.spy();

      await middleware(req, res, next);

      expect(statusStub.calledWith(500)).to.be.true;
      expect(jsonStub.calledWithMatch({ error: 'Internal server error' })).to.be.true;
    });
  });

  describe('createBodySizeLimit', () => {
    it('should reject when Content-Length exceeds limit', () => {
      const middleware = createBodySizeLimit(1024);

      const req = {
        headers: { 'content-length': '2048' },
        on: sinon.stub(),
      } as unknown as Request;
      const statusStub = sinon.stub().returnsThis();
      const jsonStub = sinon.stub();
      const res = { status: statusStub, json: jsonStub } as unknown as Response;
      const next = sinon.spy();

      middleware(req, res, next);

      expect(statusStub.calledWith(413)).to.be.true;
      expect(jsonStub.calledWithMatch({ error: 'Request body too large' })).to.be.true;
      expect(next.called).to.be.false;
    });

    it('should allow requests within Content-Length limit', () => {
      const middleware = createBodySizeLimit(1024);

      const req = new EventEmitter() as unknown as Request;
      (req as any).headers = { 'content-length': '512' };
      const statusStub = sinon.stub().returnsThis();
      const jsonStub = sinon.stub();
      const res = { status: statusStub, json: jsonStub } as unknown as Response;
      const next = sinon.spy();

      middleware(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect(statusStub.called).to.be.false;
    });

    it('should reject when streamed data exceeds limit', () => {
      const middleware = createBodySizeLimit(10);

      const req = new EventEmitter() as unknown as Request;
      (req as any).headers = {};
      (req as any).destroy = sinon.stub();
      const statusStub = sinon.stub().returnsThis();
      const jsonStub = sinon.stub();
      const res = {
        status: statusStub,
        json: jsonStub,
        headersSent: false,
      } as unknown as Response;
      const next = sinon.spy();

      middleware(req, res, next);
      expect(next.calledOnce).to.be.true;

      // Emit data that exceeds the limit
      (req as any).emit('data', Buffer.alloc(15));

      expect((req as any).destroy.calledOnce).to.be.true;
      expect(statusStub.calledWith(413)).to.be.true;
    });

    it('should allow requests without Content-Length header', () => {
      const middleware = createBodySizeLimit(1024);

      const req = new EventEmitter() as unknown as Request;
      (req as any).headers = {};
      const next = sinon.spy();

      middleware(req, {} as Response, next);

      expect(next.calledOnce).to.be.true;
    });
  });
});
