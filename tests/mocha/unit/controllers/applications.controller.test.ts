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
import { ApplicationsController } from '../../../../src/controllers/applications.controller';
import type { IOAuth2TokenRepositoryForApplications } from '../../../../src/controllers/applications.controller';
import type { IOAuth2Token } from '../../../../src/types/models';
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

class MockOAuth2TokenRepository implements IOAuth2TokenRepositoryForApplications {
  tokens: IOAuth2Token[] = [];
  deletedIds: (string | Types.ObjectId)[] = [];
  shouldThrow = false;

  async findByUserWithClient(_userId: string | Types.ObjectId): Promise<IOAuth2Token[]> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.tokens;
  }

  async findByIdAndUser(
    id: string | Types.ObjectId,
    _userId: string | Types.ObjectId
  ): Promise<IOAuth2Token | null> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.tokens.find(t => t._id.toString() === id.toString()) || null;
  }

  async deleteById(id: string | Types.ObjectId): Promise<void> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    this.deletedIds.push(id);
  }

  addToken(token: Partial<IOAuth2Token>): IOAuth2Token {
    const newToken = {
      _id: new Types.ObjectId(),
      user: new Types.ObjectId(),
      oAuthClient: new Types.ObjectId(),
      token: 'test-token',
      created: new Date(),
      ...token,
    } as IOAuth2Token;
    this.tokens.push(newToken);
    return newToken;
  }

  clear(): void {
    this.tokens = [];
    this.deletedIds = [];
    this.shouldThrow = false;
  }
}

describe('ApplicationsController', () => {
  let controller: ApplicationsController;
  let tokenRepository: MockOAuth2TokenRepository;
  let logger: MockLogger;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let renderStub: sinon.SinonStub;
  let redirectStub: sinon.SinonStub;
  let flashStub: sinon.SinonStub;

  beforeEach(() => {
    tokenRepository = new MockOAuth2TokenRepository();
    logger = new MockLogger();
    controller = new ApplicationsController(tokenRepository, logger);

    flashStub = sinon.stub();
    flashStub.withArgs('error').returns([]);
    flashStub.withArgs('info').returns([]);

    mockReq = {
      params: {},
      user: { _id: new Types.ObjectId(), username: 'testuser' } as Express.User,
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
    tokenRepository.clear();
    logger.clear();
  });

  describe('getApplications', () => {
    it('should render applications page with tokens', async () => {
      tokenRepository.addToken({ token: 'token1' });
      tokenRepository.addToken({ token: 'token2' });

      await controller.getApplications(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('applications');

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.oauth2tokens).to.have.lengthOf(2);
      expect(templateData.title).to.equal('Applications');
    });

    it('should pass user to template', async () => {
      await controller.getApplications(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.user).to.equal(mockReq.user);
    });

    it('should redirect to login when user is not authenticated', async () => {
      mockReq.user = undefined;

      await controller.getApplications(mockReq as Request, mockRes as Response, () => {});

      expect(redirectStub.calledWith('/login')).to.be.true;
      expect(renderStub.called).to.be.false;
    });

    it('should handle repository errors gracefully', async () => {
      tokenRepository.shouldThrow = true;

      await controller.getApplications(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'Error loading applications')).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
    });

    it('should pass flash messages to template', async () => {
      flashStub.withArgs('error').returns(['Some error']);
      flashStub.withArgs('info').returns(['Some info']);

      await controller.getApplications(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.errormessages).to.deep.equal(['Some error']);
      expect(templateData.infomessages).to.deep.equal(['Some info']);
    });
  });

  describe('deleteApplication', () => {
    it('should delete token and redirect with success message', async () => {
      const token = tokenRepository.addToken({});
      mockReq.params = { id: token._id.toString() };

      await controller.deleteApplication(mockReq as Request, mockRes as Response, () => {});

      expect(tokenRepository.deletedIds).to.have.lengthOf(1);
      expect(flashStub.calledWith('info', 'Application access revoked')).to.be.true;
      expect(redirectStub.calledWith('/applications')).to.be.true;
    });

    it('should redirect without error when token not found', async () => {
      mockReq.params = { id: new Types.ObjectId().toString() };

      await controller.deleteApplication(mockReq as Request, mockRes as Response, () => {});

      expect(tokenRepository.deletedIds).to.have.lengthOf(0);
      expect(redirectStub.calledWith('/applications')).to.be.true;
    });

    it('should redirect when id parameter is missing', async () => {
      mockReq.params = {};

      await controller.deleteApplication(mockReq as Request, mockRes as Response, () => {});

      expect(redirectStub.calledWith('/applications')).to.be.true;
    });

    it('should reject invalid ObjectId format', async () => {
      mockReq.params = { id: 'invalid-id' };

      await controller.deleteApplication(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Invalid application ID')).to.be.true;
      expect(redirectStub.calledWith('/applications')).to.be.true;
    });

    it('should redirect to login when user is not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.params = { id: new Types.ObjectId().toString() };

      await controller.deleteApplication(mockReq as Request, mockRes as Response, () => {});

      expect(redirectStub.calledWith('/login')).to.be.true;
    });

    it('should handle repository errors gracefully', async () => {
      const token = tokenRepository.addToken({});
      mockReq.params = { id: token._id.toString() };
      tokenRepository.shouldThrow = true;

      await controller.deleteApplication(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'Error revoking application access')).to.be.true;
      expect(redirectStub.calledWith('/applications')).to.be.true;
    });

    it('should log deletion attempt', async () => {
      const token = tokenRepository.addToken({});
      mockReq.params = { id: token._id.toString() };

      await controller.deleteApplication(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'info' && l.message.includes('Deleting'))).to.be
        .true;
    });
  });
});
