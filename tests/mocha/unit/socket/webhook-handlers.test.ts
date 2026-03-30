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
import { SocketServer } from '../../../../src/socket/socket-server';
import type {
  IUserRepositoryForSocket,
  IOpenhabRepositoryForSocket,
  IEventRepositoryForSocket,
  IWebhookRepositoryForSocket,
} from '../../../../src/socket/socket-server';
import type { ISocketSystemConfig } from '../../../../src/socket/types';
import type { ILogger, INotificationService } from '../../../../src/types/notification';
import type { OpenhabSocket } from '../../../../src/socket/types';
import type { ConnectionManager } from '../../../../src/socket/connection-manager';

describe('SocketServer Webhook Handlers', () => {
  let server: SocketServer;
  let webhookRepo: sinon.SinonStubbedInstance<IWebhookRepositoryForSocket>;
  let mockLogger: ILogger;
  let logEntries: { level: string; message: string; meta: unknown[] }[];
  let mockSocket: OpenhabSocket;

  beforeEach(() => {
    logEntries = [];
    mockLogger = {
      error: (msg: string, ...meta: unknown[]) => logEntries.push({ level: 'error', message: msg, meta }),
      warn: (msg: string, ...meta: unknown[]) => logEntries.push({ level: 'warn', message: msg, meta }),
      info: (msg: string, ...meta: unknown[]) => logEntries.push({ level: 'info', message: msg, meta }),
      debug: (msg: string, ...meta: unknown[]) => logEntries.push({ level: 'debug', message: msg, meta }),
    };

    webhookRepo = {
      registerWebhook: sinon.stub(),
      removeWebhook: sinon.stub(),
    };

    const mockSystemConfig: ISocketSystemConfig = {
      getInternalAddress: () => 'localhost:3000',
      getConnectionLockTimeSeconds: () => 60,
      getBaseURL: () => 'https://mycloud.example.com',
    };

    server = new SocketServer(
      {} as ConnectionManager,
      {} as IUserRepositoryForSocket,
      {} as IOpenhabRepositoryForSocket,
      {} as IEventRepositoryForSocket,
      webhookRepo,
      {} as INotificationService,
      mockSystemConfig,
      mockLogger
    );

    mockSocket = {
      openhabId: new Types.ObjectId().toString(),
      handshake: { uuid: 'openhab-test-uuid' },
    } as unknown as OpenhabSocket;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('handleWebhookRegister', () => {
    it('should return error when localPath is missing', async () => {
      const ack = sinon.stub();

      await (server as any).handleWebhookRegister(mockSocket, {}, ack);

      expect(ack.calledOnce).to.be.true;
      expect(ack.firstCall.args[0]).to.deep.equal({
        success: false,
        error: 'localPath is required',
      });
    });

    it('should return error when localPath is empty string', async () => {
      const ack = sinon.stub();

      await (server as any).handleWebhookRegister(mockSocket, { localPath: '' }, ack);

      expect(ack.calledOnce).to.be.true;
      expect(ack.firstCall.args[0].success).to.be.false;
    });

    it('should register webhook and return URL, uuid and expiresAt', async () => {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      webhookRepo.registerWebhook.resolves({
        _id: new Types.ObjectId(),
        uuid: 'webhook-uuid-123',
        openhab: new Types.ObjectId(),
        localPath: '/rest/hooks/mytest',
        createdAt: new Date(),
        expiresAt,
      });

      const ack = sinon.stub();

      await (server as any).handleWebhookRegister(
        mockSocket,
        { localPath: '/rest/hooks/mytest' },
        ack
      );

      expect(webhookRepo.registerWebhook.calledOnce).to.be.true;
      expect(webhookRepo.registerWebhook.firstCall.args[0]).to.equal(mockSocket.openhabId);
      expect(webhookRepo.registerWebhook.firstCall.args[1]).to.equal('/rest/hooks/mytest');
      expect(webhookRepo.registerWebhook.firstCall.args[2]).to.equal(30);

      expect(ack.calledOnce).to.be.true;
      const response = ack.firstCall.args[0];
      expect(response.success).to.be.true;
      expect(response.webhookUrl).to.equal('https://mycloud.example.com/api/hooks/webhook-uuid-123');
      expect(response.uuid).to.equal('webhook-uuid-123');
      expect(response.expiresAt).to.equal(expiresAt.toISOString());
    });

    it('should strip trailing slashes from baseURL', async () => {
      // Rebuild server with trailing-slash baseURL
      const configWithSlash: ISocketSystemConfig = {
        getInternalAddress: () => 'localhost:3000',
        getConnectionLockTimeSeconds: () => 60,
        getBaseURL: () => 'https://mycloud.example.com/',
      };

      const serverWithSlash = new SocketServer(
        {} as ConnectionManager,
        {} as IUserRepositoryForSocket,
        {} as IOpenhabRepositoryForSocket,
        {} as IEventRepositoryForSocket,
        webhookRepo,
        {} as INotificationService,
        configWithSlash,
        mockLogger
      );

      webhookRepo.registerWebhook.resolves({
        _id: new Types.ObjectId(),
        uuid: 'uuid-456',
        openhab: new Types.ObjectId(),
        localPath: '/test',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      });

      const ack = sinon.stub();
      await (serverWithSlash as any).handleWebhookRegister(
        mockSocket,
        { localPath: '/test' },
        ack
      );

      expect(ack.firstCall.args[0].webhookUrl).to.equal('https://mycloud.example.com/api/hooks/uuid-456');
    });

    it('should not log the webhook UUID', async () => {
      webhookRepo.registerWebhook.resolves({
        _id: new Types.ObjectId(),
        uuid: 'secret-uuid-789',
        openhab: new Types.ObjectId(),
        localPath: '/rest/hooks/test',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      });

      const ack = sinon.stub();
      await (server as any).handleWebhookRegister(
        mockSocket,
        { localPath: '/rest/hooks/test' },
        ack
      );

      const infoLogs = logEntries.filter(e => e.level === 'info');
      expect(infoLogs.length).to.be.greaterThan(0);
      // The log should NOT contain the webhook UUID
      for (const log of infoLogs) {
        expect(log.message).to.not.include('secret-uuid-789');
      }
    });

    it('should return error when repository throws', async () => {
      webhookRepo.registerWebhook.rejects(new Error('DB error'));

      const ack = sinon.stub();
      await (server as any).handleWebhookRegister(
        mockSocket,
        { localPath: '/rest/hooks/test' },
        ack
      );

      expect(ack.calledOnce).to.be.true;
      expect(ack.firstCall.args[0]).to.deep.equal({
        success: false,
        error: 'Failed to register webhook',
      });
    });
  });

  describe('handleWebhookRemove', () => {
    it('should return error when localPath is missing', async () => {
      const ack = sinon.stub();

      await (server as any).handleWebhookRemove(mockSocket, {}, ack);

      expect(ack.calledOnce).to.be.true;
      expect(ack.firstCall.args[0]).to.deep.equal({
        success: false,
        error: 'localPath is required',
      });
    });

    it('should remove webhook and ack success', async () => {
      webhookRepo.removeWebhook.resolves();

      const ack = sinon.stub();
      await (server as any).handleWebhookRemove(
        mockSocket,
        { localPath: '/rest/hooks/test' },
        ack
      );

      expect(webhookRepo.removeWebhook.calledOnce).to.be.true;
      expect(webhookRepo.removeWebhook.firstCall.args[0]).to.equal(mockSocket.openhabId);
      expect(webhookRepo.removeWebhook.firstCall.args[1]).to.equal('/rest/hooks/test');

      expect(ack.calledOnce).to.be.true;
      expect(ack.firstCall.args[0]).to.deep.equal({ success: true });
    });

    it('should return error when repository throws', async () => {
      webhookRepo.removeWebhook.rejects(new Error('DB error'));

      const ack = sinon.stub();
      await (server as any).handleWebhookRemove(
        mockSocket,
        { localPath: '/rest/hooks/test' },
        ack
      );

      expect(ack.calledOnce).to.be.true;
      expect(ack.firstCall.args[0]).to.deep.equal({
        success: false,
        error: 'Failed to remove webhook',
      });
    });
  });
});
