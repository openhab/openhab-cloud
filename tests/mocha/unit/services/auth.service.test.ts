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
import { AuthService } from '../../../../src/services/auth.service';
import type {
  IUserRepository,
  IOAuth2ClientRepository,
  IOAuth2TokenRepository,
} from '../../../../src/services/auth.service';
import type { IUser, IOAuth2Client, IOAuth2Token } from '../../../../src/types/models';
import type { ILogger } from '../../../../src/types/notification';

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

class MockUserRepository implements IUserRepository {
  users: IUser[] = [];
  shouldThrow = false;

  async findById(id: string | Types.ObjectId): Promise<IUser | null> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.users.find(u => u._id.toString() === id.toString()) || null;
  }

  async findByUsername(username: string): Promise<IUser | null> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.users.find(u => u.username === username) || null;
  }

  async authenticate(
    username: string,
    password: string
  ): Promise<{ user: IUser | null; error?: Error; message?: { message: string } }> {
    if (this.shouldThrow) throw new Error('Database error');
    const user = this.users.find(u => u.username === username);
    if (!user) {
      return { user: null, message: { message: 'Unknown user or incorrect password' } };
    }
    // Simple password check for testing (in real code, this would use crypto)
    if (password !== 'correct-password') {
      return { user: null, message: { message: 'Unknown user or incorrect password' } };
    }
    if (!user.active) {
      return { user: null, message: { message: 'User is not active' } };
    }
    return { user };
  }

  addUser(user: Partial<IUser>): IUser {
    const newUser = {
      _id: new Types.ObjectId(),
      username: 'testuser@example.com',
      salt: 'salt',
      hash: 'hash',
      created: new Date(),
      active: true,
      role: 'master' as const,
      account: new Types.ObjectId(),
      verifiedEmail: true,
      registered: new Date(),
      ...user,
    } as IUser;
    this.users.push(newUser);
    return newUser;
  }

  clear(): void {
    this.users = [];
    this.shouldThrow = false;
  }
}

class MockOAuth2ClientRepository implements IOAuth2ClientRepository {
  clients: IOAuth2Client[] = [];
  shouldThrow = false;

  async findByClientId(clientId: string): Promise<IOAuth2Client | null> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.clients.find(c => c.clientId === clientId) || null;
  }

  addClient(client: Partial<IOAuth2Client>): IOAuth2Client {
    const newClient = {
      _id: new Types.ObjectId(),
      clientId: 'test-client',
      clientSecret: 'test-secret',
      redirectURI: 'http://localhost/callback',
      title: 'Test Client',
      active: true,
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

class MockOAuth2TokenRepository implements IOAuth2TokenRepository {
  tokens: IOAuth2Token[] = [];
  shouldThrow = false;

  async findByToken(token: string): Promise<IOAuth2Token | null> {
    if (this.shouldThrow) throw new Error('Database error');
    return this.tokens.find(t => t.token === token) || null;
  }

  addToken(token: Partial<IOAuth2Token>): IOAuth2Token {
    const newToken = {
      _id: new Types.ObjectId(),
      token: 'test-token',
      user: new Types.ObjectId(),
      oAuthClient: new Types.ObjectId(),
      scope: ['read', 'write'],
      valid: true,
      created: new Date(),
      ...token,
    } as IOAuth2Token;
    this.tokens.push(newToken);
    return newToken;
  }

  clear(): void {
    this.tokens = [];
    this.shouldThrow = false;
  }
}

describe('AuthService', () => {
  let authService: AuthService;
  let userRepository: MockUserRepository;
  let oauth2ClientRepository: MockOAuth2ClientRepository;
  let oauth2TokenRepository: MockOAuth2TokenRepository;
  let logger: MockLogger;

  beforeEach(() => {
    userRepository = new MockUserRepository();
    oauth2ClientRepository = new MockOAuth2ClientRepository();
    oauth2TokenRepository = new MockOAuth2TokenRepository();
    logger = new MockLogger();

    authService = new AuthService(
      userRepository,
      oauth2ClientRepository,
      oauth2TokenRepository,
      logger
    );
  });

  afterEach(() => {
    sinon.restore();
    userRepository.clear();
    oauth2ClientRepository.clear();
    oauth2TokenRepository.clear();
    logger.clear();
  });

  describe('validateCredentials', () => {
    it('should return user when credentials are valid', async () => {
      const user = userRepository.addUser({ username: 'test@example.com', active: true });

      const result = await authService.validateCredentials('test@example.com', 'correct-password');

      expect(result.user).to.exist;
      expect(result.user!._id.toString()).to.equal(user._id.toString());
    });

    it('should return null with message when user not found', async () => {
      const result = await authService.validateCredentials('nonexistent@example.com', 'password');

      expect(result.user).to.be.null;
      expect(result.message).to.exist;
    });

    it('should return null with message when password is incorrect', async () => {
      userRepository.addUser({ username: 'test@example.com', active: true });

      const result = await authService.validateCredentials('test@example.com', 'wrong-password');

      expect(result.user).to.be.null;
      expect(result.message).to.exist;
    });

    it('should return null with message when user is inactive', async () => {
      userRepository.addUser({ username: 'test@example.com', active: false });

      const result = await authService.validateCredentials('test@example.com', 'correct-password');

      expect(result.user).to.be.null;
      expect(result.message?.message).to.include('not active');
    });

    it('should handle repository errors', async () => {
      userRepository.shouldThrow = true;

      const result = await authService.validateCredentials('test@example.com', 'password');

      expect(result.user).to.be.null;
      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
    });
  });

  describe('validateOAuth2Client', () => {
    it('should return client when credentials are valid', async () => {
      const client = oauth2ClientRepository.addClient({
        clientId: 'my-client',
        clientSecret: 'my-secret',
        active: true,
      });

      const result = await authService.validateOAuth2Client('my-client', 'my-secret');

      expect(result).to.exist;
      expect(result!._id.toString()).to.equal(client._id.toString());
    });

    it('should return null when client not found', async () => {
      const result = await authService.validateOAuth2Client('nonexistent', 'secret');

      expect(result).to.be.null;
    });

    it('should return null when secret is incorrect', async () => {
      oauth2ClientRepository.addClient({
        clientId: 'my-client',
        clientSecret: 'correct-secret',
        active: true,
      });

      const result = await authService.validateOAuth2Client('my-client', 'wrong-secret');

      expect(result).to.be.null;
    });

    it('should return null when client is inactive', async () => {
      oauth2ClientRepository.addClient({
        clientId: 'my-client',
        clientSecret: 'my-secret',
        active: false,
      });

      const result = await authService.validateOAuth2Client('my-client', 'my-secret');

      expect(result).to.be.null;
    });

    it('should handle repository errors', async () => {
      oauth2ClientRepository.shouldThrow = true;

      const result = await authService.validateOAuth2Client('client', 'secret');

      expect(result).to.be.null;
      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
    });
  });

  describe('validateBearerToken', () => {
    it('should return user and scopes when token is valid', async () => {
      const user = userRepository.addUser({ active: true });
      oauth2TokenRepository.addToken({
        token: 'valid-token',
        user: user._id,
        scope: ['read', 'write'],
        valid: true,
      });

      const result = await authService.validateBearerToken('valid-token');

      expect(result).to.exist;
      expect(result!.user._id.toString()).to.equal(user._id.toString());
      expect(result!.scopes).to.deep.equal(['read', 'write']);
    });

    it('should return null when token not found', async () => {
      const result = await authService.validateBearerToken('nonexistent-token');

      expect(result).to.be.null;
    });

    it('should return null when token is invalid/revoked', async () => {
      const user = userRepository.addUser({ active: true });
      oauth2TokenRepository.addToken({
        token: 'revoked-token',
        user: user._id,
        valid: false,
      });

      const result = await authService.validateBearerToken('revoked-token');

      expect(result).to.be.null;
    });

    it('should return null when user not found', async () => {
      oauth2TokenRepository.addToken({
        token: 'orphan-token',
        user: new Types.ObjectId(),
        valid: true,
      });

      const result = await authService.validateBearerToken('orphan-token');

      expect(result).to.be.null;
    });

    it('should return null when user is inactive', async () => {
      const user = userRepository.addUser({ active: false });
      oauth2TokenRepository.addToken({
        token: 'inactive-user-token',
        user: user._id,
        valid: true,
      });

      const result = await authService.validateBearerToken('inactive-user-token');

      expect(result).to.be.null;
    });

    it('should handle repository errors', async () => {
      oauth2TokenRepository.shouldThrow = true;

      const result = await authService.validateBearerToken('token');

      expect(result).to.be.null;
      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
    });
  });

  describe('findUserById', () => {
    it('should return user when found', async () => {
      const user = userRepository.addUser({});

      const result = await authService.findUserById(user._id.toString());

      expect(result).to.exist;
      expect(result!._id.toString()).to.equal(user._id.toString());
    });

    it('should return null when user not found', async () => {
      const result = await authService.findUserById(new Types.ObjectId().toString());

      expect(result).to.be.null;
    });

    it('should handle repository errors', async () => {
      userRepository.shouldThrow = true;

      const result = await authService.findUserById('some-id');

      expect(result).to.be.null;
      expect(logger.logs.some(l => l.level === 'error')).to.be.true;
    });
  });
});
