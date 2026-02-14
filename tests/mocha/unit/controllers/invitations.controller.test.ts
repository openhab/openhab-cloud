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
import { InvitationsController } from '../../../../src/controllers/invitations.controller';
import type {
  IInvitationRepositoryForInvitations,
  IInvitationsSystemConfig,
} from '../../../../src/controllers/invitations.controller';
import type { IInvitation } from '../../../../src/types/models';
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

class MockInvitationRepository implements IInvitationRepositoryForInvitations {
  invitations: IInvitation[] = [];
  shouldThrow = false;
  lastSentEmail: string | null = null;

  async send(email: string): Promise<IInvitation> {
    if (this.shouldThrow) {
      throw new Error('Email sending failed');
    }
    this.lastSentEmail = email;
    const invitation = {
      _id: new Types.ObjectId(),
      email,
      invitationCode: 'test-code',
      created: new Date(),
    } as IInvitation;
    this.invitations.push(invitation);
    return invitation;
  }

  clear(): void {
    this.invitations = [];
    this.shouldThrow = false;
    this.lastSentEmail = null;
  }
}

describe('InvitationsController', () => {
  let controller: InvitationsController;
  let invitationRepository: MockInvitationRepository;
  let systemConfig: IInvitationsSystemConfig;
  let logger: MockLogger;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let renderStub: sinon.SinonStub;
  let redirectStub: sinon.SinonStub;
  let flashStub: sinon.SinonStub;

  beforeEach(() => {
    invitationRepository = new MockInvitationRepository();
    systemConfig = {
      getBaseURL: () => 'http://localhost',
    };
    logger = new MockLogger();
    controller = new InvitationsController(invitationRepository, systemConfig, logger);

    flashStub = sinon.stub();
    flashStub.withArgs('error').returns([]);
    flashStub.withArgs('info').returns([]);

    mockReq = {
      user: { _id: new Types.ObjectId(), username: 'testuser' } as Express.User,
      openhab: { _id: new Types.ObjectId(), uuid: 'test-uuid' } as Request['openhab'],
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
    invitationRepository.clear();
    logger.clear();
  });

  describe('getInvitations', () => {
    it('should render invitations page', async () => {
      await controller.getInvitations(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('invitations');

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.title).to.equal('Invitations');
    });

    it('should pass user and openhab to template', async () => {
      await controller.getInvitations(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.user).to.equal(mockReq.user);
      expect(templateData.openhab).to.equal(mockReq.openhab);
    });

    it('should pass flash messages to template', async () => {
      flashStub.withArgs('error').returns(['Some error']);
      flashStub.withArgs('info').returns(['Some info']);

      await controller.getInvitations(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.errormessages).to.deep.equal(['Some error']);
      expect(templateData.infomessages).to.deep.equal(['Some info']);
    });

    it('should handle errors gracefully', async () => {
      renderStub.throws(new Error('Render error'));

      await controller.getInvitations(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'Error loading invitations')).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
    });
  });

  describe('sendInvitation', () => {
    beforeEach(() => {
      (mockReq as Request).validatedBody = { inviteemail: 'invitee@example.com' };
    });

    it('should send invitation and redirect with success message', async () => {
      await controller.sendInvitation(mockReq as Request, mockRes as Response, () => {});

      expect(invitationRepository.lastSentEmail).to.equal('invitee@example.com');
      expect(flashStub.calledWith('info', 'Invitation sent!')).to.be.true;
      expect(redirectStub.calledWith('/invitations')).to.be.true;
    });

    it('should create invitation in repository', async () => {
      await controller.sendInvitation(mockReq as Request, mockRes as Response, () => {});

      expect(invitationRepository.invitations).to.have.lengthOf(1);
      expect(invitationRepository.invitations[0]!.email).to.equal('invitee@example.com');
    });

    it('should handle repository errors gracefully', async () => {
      invitationRepository.shouldThrow = true;

      await controller.sendInvitation(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'There was an error while processing your request')).to
        .be.true;
      expect(redirectStub.calledWith('/invitations')).to.be.true;
    });
  });
});
