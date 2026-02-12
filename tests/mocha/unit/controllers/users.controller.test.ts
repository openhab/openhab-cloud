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
import { UsersController } from '../../../../src/controllers/users.controller';
import type {
  IUserRepositoryForUsers,
  IPasswordService,
} from '../../../../src/controllers/users.controller';
import type { IUser, UserRole } from '../../../../src/types/models';
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

class MockUserRepository implements IUserRepositoryForUsers {
  users: IUser[] = [];
  deletedIds: (string | Types.ObjectId)[] = [];
  shouldThrow = false;

  async findByAccount(_accountId: string | Types.ObjectId): Promise<IUser[]> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.users;
  }

  async findByIdAndAccount(
    id: string | Types.ObjectId,
    _accountId: string | Types.ObjectId
  ): Promise<IUser | null> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.users.find(u => u._id.toString() === id.toString()) || null;
  }

  async findByUsername(username: string): Promise<IUser | null> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.users.find(u => u.username === username) || null;
  }

  async registerToAccount(
    username: string,
    _password: string,
    accountId: string | Types.ObjectId,
    role: UserRole
  ): Promise<IUser> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    const user = {
      _id: new Types.ObjectId(),
      username,
      account: new Types.ObjectId(accountId.toString()),
      role,
      active: true,
      verifiedEmail: false,
      registered: new Date(),
      created: new Date(),
    } as IUser;
    this.users.push(user);
    return user;
  }

  async deleteById(id: string | Types.ObjectId): Promise<void> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    this.deletedIds.push(id);
  }

  addUser(user: Partial<IUser>): IUser {
    const newUser = {
      _id: new Types.ObjectId(),
      username: 'testuser@example.com',
      account: new Types.ObjectId(),
      role: 'user' as UserRole,
      active: true,
      verifiedEmail: false,
      registered: new Date(),
      created: new Date(),
      ...user,
    } as IUser;
    this.users.push(newUser);
    return newUser;
  }

  clear(): void {
    this.users = [];
    this.deletedIds = [];
    this.shouldThrow = false;
  }
}

class MockPasswordService implements IPasswordService {
  isComplex = true;
  complexityError = 'Password must be at least 8 characters';

  isComplexEnough(_password: string): boolean {
    return this.isComplex;
  }

  getComplexityError(): string {
    return this.complexityError;
  }

  clear(): void {
    this.isComplex = true;
  }
}

describe('UsersController', () => {
  let controller: UsersController;
  let userRepository: MockUserRepository;
  let passwordService: MockPasswordService;
  let logger: MockLogger;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let renderStub: sinon.SinonStub;
  let redirectStub: sinon.SinonStub;
  let flashStub: sinon.SinonStub;
  let accountId: Types.ObjectId;
  let userId: Types.ObjectId;

  beforeEach(() => {
    userRepository = new MockUserRepository();
    passwordService = new MockPasswordService();
    logger = new MockLogger();
    controller = new UsersController(userRepository, passwordService, logger);

    accountId = new Types.ObjectId();
    userId = new Types.ObjectId();

    flashStub = sinon.stub();
    flashStub.withArgs('error').returns([]);
    flashStub.withArgs('info').returns([]);

    mockReq = {
      params: {},
      user: {
        _id: userId,
        username: 'admin@example.com',
        account: accountId,
      } as Express.User,
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
    userRepository.clear();
    passwordService.clear();
    logger.clear();
  });

  describe('getUsers', () => {
    it('should render users page with users list', async () => {
      userRepository.addUser({ username: 'user1@example.com' });
      userRepository.addUser({ username: 'user2@example.com' });

      await controller.getUsers(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('users');

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.users).to.have.lengthOf(2);
      expect(templateData.usersAction).to.equal('list');
      expect(templateData.title).to.equal('Users');
    });

    it('should select first user by default', async () => {
      const user1 = userRepository.addUser({ username: 'user1@example.com' });
      userRepository.addUser({ username: 'user2@example.com' });

      await controller.getUsers(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.selectedUserId).to.equal(user1._id.toString());
      expect(templateData.selectedUserArrayId).to.equal(0);
    });

    it('should select user by id param', async () => {
      userRepository.addUser({ username: 'user1@example.com' });
      const user2 = userRepository.addUser({ username: 'user2@example.com' });
      mockReq.params = { id: user2._id.toString() };

      await controller.getUsers(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.selectedUserId).to.equal(user2._id.toString());
      expect(templateData.selectedUserArrayId).to.equal(1);
    });

    it('should handle repository errors gracefully', async () => {
      userRepository.shouldThrow = true;

      await controller.getUsers(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'Error loading users')).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
    });
  });

  describe('getAddUser', () => {
    it('should render users page with add action', async () => {
      userRepository.addUser({});

      await controller.getAddUser(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('users');

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.usersAction).to.equal('add');
      expect(templateData.selectedUserId).to.equal('');
    });

    it('should handle repository errors gracefully', async () => {
      userRepository.shouldThrow = true;

      await controller.getAddUser(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'Error loading page')).to.be.true;
      expect(redirectStub.calledWith('/users')).to.be.true;
    });
  });

  describe('addUser', () => {
    beforeEach(() => {
      (mockReq as Request).validatedBody = {
        username: 'newuser@example.com',
        password: 'ComplexPass123!',
        role: 'user' as UserRole,
      };
    });

    it('should add user and redirect with success message', async () => {
      await controller.addUser(mockReq as Request, mockRes as Response, () => {});

      expect(userRepository.users).to.have.lengthOf(1);
      expect(userRepository.users[0]!.username).to.equal('newuser@example.com');
      expect(flashStub.calledWith('info', 'User was added successfully')).to.be.true;
      expect(redirectStub.calledWith('/users')).to.be.true;
    });

    it('should reject weak password', async () => {
      passwordService.isComplex = false;

      await controller.addUser(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', sinon.match(/Password/))).to.be.true;
      expect(redirectStub.calledWith('/users/add')).to.be.true;
    });

    it('should reject existing username', async () => {
      userRepository.addUser({ username: 'newuser@example.com' });

      await controller.addUser(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'This username already exists')).to.be.true;
      expect(redirectStub.calledWith('/users/add')).to.be.true;
    });

    it('should handle repository errors gracefully', async () => {
      userRepository.shouldThrow = true;

      await controller.addUser(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'There was an error adding user')).to.be.true;
      expect(redirectStub.calledWith('/users/add')).to.be.true;
    });
  });

  describe('deleteUser', () => {
    let userToDelete: IUser;

    beforeEach(() => {
      userToDelete = userRepository.addUser({ username: 'other@example.com' });
      mockReq.params = { id: userToDelete._id.toString() };
    });

    it('should delete user and redirect with success message', async () => {
      await controller.deleteUser(mockReq as Request, mockRes as Response, () => {});

      expect(userRepository.deletedIds).to.have.lengthOf(1);
      expect(flashStub.calledWith('info', 'User deleted')).to.be.true;
      expect(redirectStub.calledWith('/users')).to.be.true;
    });

    it('should prevent self-deletion', async () => {
      mockReq.params = { id: userId.toString() };

      await controller.deleteUser(mockReq as Request, mockRes as Response, () => {});

      expect(userRepository.deletedIds).to.have.lengthOf(0);
      expect(flashStub.calledWith('error', "You can't delete yourself")).to.be.true;
    });

    it('should reject when user not found', async () => {
      mockReq.params = { id: new Types.ObjectId().toString() };

      await controller.deleteUser(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', sinon.match(/not found/))).to.be.true;
    });

    it('should redirect when id param is missing', async () => {
      mockReq.params = {};

      await controller.deleteUser(mockReq as Request, mockRes as Response, () => {});

      expect(redirectStub.calledWith('/users')).to.be.true;
    });

    it('should reject invalid ObjectId format', async () => {
      mockReq.params = { id: 'invalid-id' };

      await controller.deleteUser(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Invalid user ID')).to.be.true;
    });

    it('should handle repository errors gracefully', async () => {
      userRepository.shouldThrow = true;

      await controller.deleteUser(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(flashStub.calledWith('error', 'There was an error processing your request')).to.be
        .true;
    });

    it('should log deletion', async () => {
      await controller.deleteUser(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'info' && l.message.includes('deleted'))).to.be.true;
    });
  });
});
