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
import { StaffController } from '../../../../src/controllers/staff.controller';
import type {
  IEnrollmentRepositoryForStaff,
  IInvitationRepositoryForStaff,
  IOAuth2ClientRepositoryForStaff,
  IRedisClientForStaff,
} from '../../../../src/controllers/staff.controller';
import type { IEnrollment, IInvitation, IOAuth2Client } from '../../../../src/types/models';
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

class MockEnrollmentRepository implements IEnrollmentRepositoryForStaff {
  enrollments: IEnrollment[] = [];
  updatedInvitations: { id: string | Types.ObjectId; invitedAt: Date }[] = [];
  shouldThrow = false;

  async findPaginated(_options: {
    filter?: Record<string, unknown>;
    limit: number;
    skip: number;
    sort?: Record<string, 'asc' | 'desc'>;
  }): Promise<IEnrollment[]> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.enrollments;
  }

  async count(_filter?: Record<string, unknown>): Promise<number> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.enrollments.length;
  }

  async findById(id: string | Types.ObjectId): Promise<IEnrollment | null> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.enrollments.find(e => e._id.toString() === id.toString()) || null;
  }

  async updateInvited(id: string | Types.ObjectId, invitedAt: Date): Promise<void> {
    if (this.shouldThrow) throw new Error('Database error');
    this.updatedInvitations.push({ id, invitedAt });
  }

  addEnrollment(enrollment: Partial<IEnrollment>): IEnrollment {
    const newEnrollment = {
      _id: new Types.ObjectId(),
      email: 'test@example.com',
      created: new Date(),
      ...enrollment,
    } as IEnrollment;
    this.enrollments.push(newEnrollment);
    return newEnrollment;
  }

  clear(): void {
    this.enrollments = [];
    this.updatedInvitations = [];
    this.shouldThrow = false;
  }
}

class MockInvitationRepository implements IInvitationRepositoryForStaff {
  invitations: IInvitation[] = [];
  sentEmails: string[] = [];
  resentIds: (string | Types.ObjectId)[] = [];
  deletedIds: (string | Types.ObjectId)[] = [];
  shouldThrow = false;

  async findPaginated(_options: {
    filter?: Record<string, unknown>;
    limit: number;
    skip: number;
    sort?: Record<string, 'asc' | 'desc'>;
  }): Promise<IInvitation[]> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.invitations;
  }

  async count(_filter?: Record<string, unknown>): Promise<number> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.invitations.length;
  }

  async findById(id: string | Types.ObjectId): Promise<IInvitation | null> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.invitations.find(i => i._id.toString() === id.toString()) || null;
  }

  async send(email: string): Promise<IInvitation> {
    if (this.shouldThrow) throw new Error('Database error');
    this.sentEmails.push(email);
    return {
      _id: new Types.ObjectId(),
      email,
      invitationCode: 'code123',
      created: new Date(),
    } as IInvitation;
  }

  async resend(id: string | Types.ObjectId): Promise<void> {
    if (this.shouldThrow) throw new Error('Database error');
    this.resentIds.push(id);
  }

  async deleteById(id: string | Types.ObjectId): Promise<void> {
    if (this.shouldThrow) throw new Error('Database error');
    this.deletedIds.push(id);
  }

  addInvitation(invitation: Partial<IInvitation>): IInvitation {
    const newInvitation = {
      _id: new Types.ObjectId(),
      email: 'invited@example.com',
      invitationCode: 'code123',
      created: new Date(),
      ...invitation,
    } as IInvitation;
    this.invitations.push(newInvitation);
    return newInvitation;
  }

  clear(): void {
    this.invitations = [];
    this.sentEmails = [];
    this.resentIds = [];
    this.deletedIds = [];
    this.shouldThrow = false;
  }
}

class MockOAuth2ClientRepository implements IOAuth2ClientRepositoryForStaff {
  clients: IOAuth2Client[] = [];
  shouldThrow = false;

  async findPaginated(_options: {
    limit: number;
    skip: number;
    sort?: Record<string, 'asc' | 'desc'>;
  }): Promise<IOAuth2Client[]> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.clients;
  }

  async count(): Promise<number> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.clients.length;
  }

  addClient(client: Partial<IOAuth2Client>): IOAuth2Client {
    const newClient = {
      _id: new Types.ObjectId(),
      clientId: 'test-client',
      clientSecret: 'test-secret',
      redirectURI: 'http://localhost/callback',
      title: 'Test Client',
      ...client,
    } as IOAuth2Client;
    this.clients.push(newClient);
    return newClient;
  }

  clear(): void {
    this.clients = [];
    this.shouldThrow = false;
  }
}

class MockRedisClient implements IRedisClientForStaff {
  stats: (string | null)[] = [];
  shouldThrow = false;

  async mget(_keys: string[]): Promise<(string | null)[]> {
    if (this.shouldThrow) throw new Error('Redis error');
    return this.stats;
  }

  setStats(stats: (string | null)[]): void {
    this.stats = stats;
  }

  clear(): void {
    this.stats = [];
    this.shouldThrow = false;
  }
}

describe('StaffController', () => {
  let controller: StaffController;
  let enrollmentRepository: MockEnrollmentRepository;
  let invitationRepository: MockInvitationRepository;
  let oauth2ClientRepository: MockOAuth2ClientRepository;
  let redis: MockRedisClient;
  let logger: MockLogger;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let renderStub: sinon.SinonStub;
  let redirectStub: sinon.SinonStub;
  let flashStub: sinon.SinonStub;

  beforeEach(() => {
    enrollmentRepository = new MockEnrollmentRepository();
    invitationRepository = new MockInvitationRepository();
    oauth2ClientRepository = new MockOAuth2ClientRepository();
    redis = new MockRedisClient();
    logger = new MockLogger();

    controller = new StaffController(
      enrollmentRepository,
      invitationRepository,
      oauth2ClientRepository,
      redis,
      logger
    );

    flashStub = sinon.stub();
    flashStub.withArgs('error').returns([]);
    flashStub.withArgs('info').returns([]);

    mockReq = {
      query: {},
      params: {},
      user: { _id: new Types.ObjectId(), username: 'admin' } as Express.User,
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
    enrollmentRepository.clear();
    invitationRepository.clear();
    oauth2ClientRepository.clear();
    redis.clear();
    logger.clear();
  });

  describe('getEnrollments', () => {
    it('should render enrollments page', async () => {
      enrollmentRepository.addEnrollment({});

      await controller.getEnrollments(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('staff/staff');
      expect(renderStub.firstCall.args[1].title).to.equal('Enrollments');
    });

    it('should handle pagination', async () => {
      mockReq.query = { page: '2' };

      await controller.getEnrollments(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.firstCall.args[1].page).to.equal(2);
    });

    it('should handle repository errors', async () => {
      enrollmentRepository.shouldThrow = true;

      await controller.getEnrollments(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Error loading enrollments')).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
    });
  });

  describe('getStats', () => {
    it('should render stats page with Redis data', async () => {
      redis.setStats(['100', '50', '200', '150', '50', '300', '1234567890']);

      await controller.getStats(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('staff/stats');
      expect(renderStub.firstCall.args[1].openhabCount).to.equal('100');
      expect(renderStub.firstCall.args[1].userCount).to.equal('200');
    });

    it('should handle Redis errors', async () => {
      redis.shouldThrow = true;

      await controller.getStats(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Error loading stats')).to.be.true;
      expect(redirectStub.calledWith('/staff')).to.be.true;
    });
  });

  describe('processEnrollment', () => {
    it('should send invitation and update enrollment', async () => {
      const enrollment = enrollmentRepository.addEnrollment({ email: 'test@example.com' });
      mockReq.params = { id: enrollment._id.toString() };

      await controller.processEnrollment(mockReq as Request, mockRes as Response, () => {});

      expect(invitationRepository.sentEmails).to.include('test@example.com');
      expect(enrollmentRepository.updatedInvitations).to.have.lengthOf(1);
      expect(flashStub.calledWith('info', 'Invitation sent!')).to.be.true;
      expect(redirectStub.calledWith('/staff')).to.be.true;
    });

    it('should handle missing enrollment', async () => {
      mockReq.params = { id: new Types.ObjectId().toString() };

      await controller.processEnrollment(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', sinon.match(/error/))).to.be.true;
    });

  });

  describe('getInvitations', () => {
    it('should render invitations page', async () => {
      invitationRepository.addInvitation({});

      await controller.getInvitations(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('staff/invitations');
    });

    it('should filter by email', async () => {
      mockReq.query = { email: 'test@example.com' };

      await controller.getInvitations(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
    });

    it('should handle repository errors', async () => {
      invitationRepository.shouldThrow = true;

      await controller.getInvitations(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Error loading invitations')).to.be.true;
      expect(redirectStub.calledWith('/staff')).to.be.true;
    });
  });

  describe('resendInvitation', () => {
    it('should resend invitation', async () => {
      const invitation = invitationRepository.addInvitation({});
      mockReq.params = { id: invitation._id.toString() };

      await controller.resendInvitation(mockReq as Request, mockRes as Response, () => {});

      expect(invitationRepository.resentIds).to.have.lengthOf(1);
      expect(flashStub.calledWith('info', 'Invitation was resent!')).to.be.true;
    });

    it('should handle missing invitation', async () => {
      mockReq.params = { id: new Types.ObjectId().toString() };

      await controller.resendInvitation(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Invitation not found')).to.be.true;
    });

  });

  describe('deleteInvitation', () => {
    it('should delete invitation', async () => {
      const invitation = invitationRepository.addInvitation({});
      mockReq.params = { id: invitation._id.toString() };

      await controller.deleteInvitation(mockReq as Request, mockRes as Response, () => {});

      expect(invitationRepository.deletedIds).to.have.lengthOf(1);
      expect(flashStub.calledWith('info', 'Invitation was deleted')).to.be.true;
    });

    it('should handle missing invitation', async () => {
      mockReq.params = { id: new Types.ObjectId().toString() };

      await controller.deleteInvitation(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Invitation not found')).to.be.true;
    });

  });

  describe('getOAuthClients', () => {
    it('should render OAuth clients page', async () => {
      oauth2ClientRepository.addClient({});

      await controller.getOAuthClients(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('staff/oauthclients');
      expect(renderStub.firstCall.args[1].title).to.equal('OAuth Clients');
    });

    it('should handle pagination', async () => {
      mockReq.query = { page: '1' };

      await controller.getOAuthClients(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.firstCall.args[1].page).to.equal(1);
    });

    it('should handle repository errors', async () => {
      oauth2ClientRepository.shouldThrow = true;

      await controller.getOAuthClients(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Error loading OAuth clients')).to.be.true;
      expect(redirectStub.calledWith('/staff')).to.be.true;
    });
  });
});
