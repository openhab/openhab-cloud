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
import { AccountController } from '../../../../src/controllers/account.controller';
import type { IAccountSystemConfig } from '../../../../src/controllers/account.controller';
import type { UserService, PasswordResult } from '../../../../src/services/user.service';
import type { OpenhabService } from '../../../../src/services/openhab.service';
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

class MockUserService {
  registerResult: { success: boolean; error?: string; user?: { _id: Types.ObjectId } } = {
    success: true,
    user: { _id: new Types.ObjectId() },
  };
  verifyEmailResult = { success: true };
  initiatePasswordResetResult = { success: true };
  resetPasswordResult = { success: true };
  changePasswordResult: PasswordResult = { success: true };
  deleteAccountResult = { success: true };
  deleteItemsAndEventsResult = { success: true };

  async register(_data: {
    username: string;
    password: string;
    openhabUuid: string;
    openhabSecret: string;
  }): Promise<{ success: boolean; error?: string; user?: { _id: Types.ObjectId } }> {
    return this.registerResult;
  }

  async verifyEmail(_code: string): Promise<{ success: boolean; error?: string }> {
    return this.verifyEmailResult;
  }

  async initiatePasswordReset(_email: string): Promise<{ success: boolean; error?: string }> {
    return this.initiatePasswordResetResult;
  }

  async resetPassword(
    _code: string,
    _password: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.resetPasswordResult;
  }

  async changePassword(
    _userId: Types.ObjectId,
    _oldPassword: string,
    _newPassword: string
  ): Promise<PasswordResult> {
    return this.changePasswordResult;
  }

  async deleteAccount(_userId: Types.ObjectId): Promise<{ success: boolean; error?: string }> {
    return this.deleteAccountResult;
  }

  async deleteItemsAndEvents(
    _userId: Types.ObjectId
  ): Promise<{ success: boolean; error?: string }> {
    return this.deleteItemsAndEventsResult;
  }

  clear(): void {
    this.registerResult = { success: true, user: { _id: new Types.ObjectId() } };
    this.verifyEmailResult = { success: true };
    this.initiatePasswordResetResult = { success: true };
    this.resetPasswordResult = { success: true };
    this.changePasswordResult = { success: true };
    this.deleteAccountResult = { success: true };
    this.deleteItemsAndEventsResult = { success: true };
  }
}

class MockOpenhabService {
  updateCredentialsResult = { success: true };
  createResult: { success: boolean; error?: string } = { success: true };

  async updateCredentials(
    _openhabId: Types.ObjectId,
    _uuid: string,
    _secret: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.updateCredentialsResult;
  }

  async create(_data: {
    account: Types.ObjectId;
    uuid: string;
    secret: string;
  }): Promise<{ success: boolean; error?: string }> {
    return this.createResult;
  }

  clear(): void {
    this.updateCredentialsResult = { success: true };
    this.createResult = { success: true };
  }
}

describe('AccountController', () => {
  let controller: AccountController;
  let userService: MockUserService;
  let openhabService: MockOpenhabService;
  let systemConfig: IAccountSystemConfig;
  let logger: MockLogger;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let renderStub: sinon.SinonStub;
  let redirectStub: sinon.SinonStub;
  let flashStub: sinon.SinonStub;
  let loginStub: sinon.SinonStub;
  let logoutStub: sinon.SinonStub;

  beforeEach(() => {
    userService = new MockUserService();
    openhabService = new MockOpenhabService();
    systemConfig = {
      getBaseURL: () => 'http://localhost',
      hasLegalTerms: () => false,
      hasLegalPolicy: () => false,
      isRegistrationEnabled: () => true,
    };
    logger = new MockLogger();
    controller = new AccountController(
      userService as unknown as UserService,
      openhabService as unknown as OpenhabService,
      systemConfig,
      logger
    );

    flashStub = sinon.stub();
    flashStub.withArgs('error').returns([]);
    flashStub.withArgs('info').returns([]);

    loginStub = sinon.stub().callsFake((_user, callback) => callback(null));
    logoutStub = sinon.stub().callsFake(callback => callback(null));

    mockReq = {
      query: {},
      user: { _id: new Types.ObjectId(), username: 'testuser' } as Express.User,
      openhab: { _id: new Types.ObjectId(), uuid: 'test-uuid' } as Request['openhab'],
      flash: flashStub,
      login: loginStub,
      logout: logoutStub,
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
    userService.clear();
    openhabService.clear();
    logger.clear();
  });

  describe('register', () => {
    beforeEach(() => {
      (mockReq as Request).validatedBody = {
        username: 'newuser@example.com',
        password: 'password123',
        openhabuuid: 'uuid-123',
        openhabsecret: 'secret-123',
        agree: true,
      };
    });

    it('should register user and redirect to home on success', async () => {
      await controller.register(mockReq as Request, mockRes as Response, () => {});

      expect(loginStub.calledOnce).to.be.true;
      expect(flashStub.calledWith('info', sinon.match(/successfully registered/))).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
    });

    it('should require terms agreement when legal terms exist', async () => {
      systemConfig.hasLegalTerms = () => true;
      (mockReq as Request).validatedBody.agree = false;

      await controller.register(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', sinon.match(/agree/))).to.be.true;
      expect(renderStub.calledWith('login')).to.be.true;
    });

    it('should show error when registration fails', async () => {
      userService.registerResult = { success: false, error: 'Username already exists' };

      await controller.register(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Username already exists')).to.be.true;
      expect(renderStub.calledWith('login')).to.be.true;
    });

    it('should handle login failure after registration', async () => {
      loginStub.callsFake((_user, callback) => callback(new Error('Login failed')));

      await controller.register(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
      expect(redirectStub.calledWith('/login')).to.be.true;
    });
  });

  describe('verifyEmail', () => {
    it('should verify email and redirect with success message', async () => {
      mockReq.query = { code: 'valid-code' };

      await controller.verifyEmail(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('info', sinon.match(/verified/))).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
    });

    it('should show error for invalid verification code', async () => {
      mockReq.query = {};

      await controller.verifyEmail(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Invalid verification code')).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
    });

    it('should show error when verification fails', async () => {
      mockReq.query = { code: 'invalid-code' };
      userService.verifyEmailResult = { success: false, error: 'Code expired' };

      await controller.verifyEmail(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Code expired')).to.be.true;
    });
  });

  describe('getLostPassword', () => {
    it('should render lost password page', () => {
      controller.getLostPassword(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('lostpassword');
      expect(renderStub.firstCall.args[1].title).to.equal('Lost my password');
    });
  });

  describe('postLostPassword', () => {
    beforeEach(() => {
      (mockReq as Request).validatedBody = { email: 'user@example.com' };
    });

    it('should initiate password reset and redirect with success', async () => {
      await controller.postLostPassword(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('info', sinon.match(/reset link/))).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
    });

    it('should redirect back with error on failure', async () => {
      userService.initiatePasswordResetResult = { success: false, error: 'Server error' };

      await controller.postLostPassword(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Server error')).to.be.true;
      expect(redirectStub.calledWith('/lostpassword')).to.be.true;
    });
  });

  describe('getLostPasswordReset', () => {
    it('should render password reset page with reset code', () => {
      mockReq.query = { resetCode: 'abc123' };

      controller.getLostPasswordReset(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('lostpasswordreset');
      expect(renderStub.firstCall.args[1].resetCode).to.equal('abc123');
    });

    it('should redirect to home if no reset code', () => {
      mockReq.query = {};

      controller.getLostPasswordReset(mockReq as Request, mockRes as Response, () => {});

      expect(redirectStub.calledWith('/')).to.be.true;
    });
  });

  describe('postLostPasswordReset', () => {
    beforeEach(() => {
      (mockReq as Request).validatedBody = { password: 'newpassword', resetCode: 'abc123' };
    });

    it('should reset password and redirect to login', async () => {
      await controller.postLostPasswordReset(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('info', sinon.match(/successfully set/))).to.be.true;
      expect(redirectStub.calledWith('/login')).to.be.true;
    });

    it('should redirect back with error on failure', async () => {
      userService.resetPasswordResult = { success: false, error: 'Code expired' };

      await controller.postLostPasswordReset(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Code expired')).to.be.true;
      expect(redirectStub.calledWith(sinon.match(/resetCode=abc123/))).to.be.true;
    });
  });

  describe('getAccount', () => {
    it('should render account page', () => {
      controller.getAccount(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('account');
      expect(renderStub.firstCall.args[1].title).to.equal('Account');
      expect(renderStub.firstCall.args[1].user).to.equal(mockReq.user);
      expect(renderStub.firstCall.args[1].openhab).to.equal(mockReq.openhab);
    });
  });

  describe('postAccount', () => {
    beforeEach(() => {
      (mockReq as Request).validatedBody = { openhabuuid: 'new-uuid', openhabsecret: 'new-secret' };
    });

    it('should update credentials and redirect with success', async () => {
      await controller.postAccount(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('info', sinon.match(/successfully updated/))).to.be.true;
      expect(redirectStub.calledWith('/account')).to.be.true;
    });

    it('should create new openhab when none exists', async () => {
      mockReq.openhab = undefined;

      await controller.postAccount(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('info', 'openHAB successfully registered')).to.be.true;
      expect(redirectStub.calledWith('/account')).to.be.true;
    });

    it('should show error when openhab creation fails', async () => {
      mockReq.openhab = undefined;
      openhabService.createResult = { success: false, error: 'UUID already exists' };

      await controller.postAccount(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'UUID already exists')).to.be.true;
      expect(redirectStub.calledWith('/account')).to.be.true;
    });

    it('should show error when update fails', async () => {
      openhabService.updateCredentialsResult = { success: false, error: 'UUID already exists' };

      await controller.postAccount(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'UUID already exists')).to.be.true;
    });
  });

  describe('postAccountPassword', () => {
    beforeEach(() => {
      (mockReq as Request).validatedBody = { oldpassword: 'oldpass', password: 'newpass' };
    });

    it('should change password and redirect with success', async () => {
      await controller.postAccountPassword(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('info', sinon.match(/changed/))).to.be.true;
      expect(redirectStub.calledWith('/account')).to.be.true;
    });

    it('should show error when password change fails', async () => {
      userService.changePasswordResult = { success: false, error: 'Old password incorrect' };

      await controller.postAccountPassword(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', 'Old password incorrect')).to.be.true;
    });
  });

  describe('getAccountDelete', () => {
    it('should render account delete confirmation page', () => {
      controller.getAccountDelete(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('accountdelete');
      expect(renderStub.firstCall.args[1].title).to.equal('Delete my account');
    });
  });

  describe('postAccountDelete', () => {
    it('should delete account and logout', async () => {
      await controller.postAccountDelete(mockReq as Request, mockRes as Response, () => {});

      expect(logoutStub.calledOnce).to.be.true;
      expect(redirectStub.calledWith('/')).to.be.true;
    });

    it('should show error when deletion fails', async () => {
      userService.deleteAccountResult = { success: false, error: 'Deletion failed' };

      await controller.postAccountDelete(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', sinon.match(/Deletion failed/))).to.be.true;
      expect(redirectStub.calledWith('/accountdelete')).to.be.true;
    });

    it('should log deletion attempt', async () => {
      await controller.postAccountDelete(mockReq as Request, mockRes as Response, () => {});

      expect(logger.logs.some(l => l.level === 'info' && l.message.includes('Deleting'))).to.be
        .true;
    });
  });

  describe('getItemsDelete', () => {
    it('should render items delete confirmation page', () => {
      controller.getItemsDelete(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('itemsdelete');
    });
  });

  describe('postItemsDelete', () => {
    it('should delete items and redirect with success', async () => {
      await controller.postItemsDelete(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('info', sinon.match(/deleted successfully/))).to.be.true;
      expect(redirectStub.calledWith('/account')).to.be.true;
    });

    it('should show error when deletion fails', async () => {
      userService.deleteItemsAndEventsResult = { success: false, error: 'Error occurred' };

      await controller.postItemsDelete(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error', sinon.match(/Error occurred/))).to.be.true;
    });
  });

  describe('legacy enrollment routes', () => {
    it('getEnroll should redirect to login', () => {
      controller.getEnroll(mockReq as Request, mockRes as Response, () => {});

      expect(redirectStub.calledWith('/login')).to.be.true;
    });

    it('postEnroll should redirect to login', () => {
      controller.postEnroll(mockReq as Request, mockRes as Response, () => {});

      expect(redirectStub.calledWith('/login')).to.be.true;
    });
  });
});
