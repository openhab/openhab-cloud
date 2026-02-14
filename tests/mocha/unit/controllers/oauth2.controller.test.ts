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
import { OAuth2Controller } from '../../../../src/controllers/oauth2.controller';
import type {
  IOAuth2ClientRepositoryForOAuth2,
  IOAuth2CodeRepositoryForOAuth2,
  IOAuth2TokenRepositoryForOAuth2,
  IOAuth2ScopeRepositoryForOAuth2,
} from '../../../../src/controllers/oauth2.controller';
import type { IOAuth2Client, IOAuth2Code, IOAuth2Token, IOAuth2Scope } from '../../../../src/types/models';
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

class MockOAuth2ClientRepository implements IOAuth2ClientRepositoryForOAuth2 {
  clients: IOAuth2Client[] = [];
  shouldThrow = false;

  async findById(id: string | Types.ObjectId): Promise<IOAuth2Client | null> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.clients.find(c => c._id.toString() === id.toString()) || null;
  }

  async findByClientId(clientId: string): Promise<IOAuth2Client | null> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.clients.find(c => c.clientId === clientId) || null;
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

class MockOAuth2CodeRepository implements IOAuth2CodeRepositoryForOAuth2 {
  codes: IOAuth2Code[] = [];
  createdCodes: Partial<IOAuth2Code>[] = [];
  invalidatedIds: (string | Types.ObjectId)[] = [];
  shouldThrow = false;

  async create(data: {
    user: Types.ObjectId | string;
    oAuthClient: Types.ObjectId | string;
    code: string;
    redirectURI: string;
    scope: string[];
  }): Promise<IOAuth2Code> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    const newCode = {
      _id: new Types.ObjectId(),
      user: new Types.ObjectId(data.user.toString()),
      oAuthClient: new Types.ObjectId(data.oAuthClient.toString()),
      code: data.code,
      redirectURI: data.redirectURI,
      scope: data.scope,
      valid: true,
      created: new Date(),
    } as IOAuth2Code;
    this.createdCodes.push(newCode);
    this.codes.push(newCode);
    return newCode;
  }

  async findByCodeAndClientAndRedirect(
    code: string,
    clientId: Types.ObjectId | string,
    redirectURI: string
  ): Promise<IOAuth2Code | null> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return (
      this.codes.find(
        c =>
          c.code === code &&
          c.oAuthClient.toString() === clientId.toString() &&
          c.redirectURI === redirectURI &&
          c.valid
      ) || null
    );
  }

  async invalidate(id: string | Types.ObjectId): Promise<void> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    this.invalidatedIds.push(id);
    const code = this.codes.find(c => c._id.toString() === id.toString());
    if (code) {
      code.valid = false;
    }
  }

  clear(): void {
    this.codes = [];
    this.createdCodes = [];
    this.invalidatedIds = [];
    this.shouldThrow = false;
  }
}

class MockOAuth2TokenRepository implements IOAuth2TokenRepositoryForOAuth2 {
  tokens: IOAuth2Token[] = [];
  createdTokens: Partial<IOAuth2Token>[] = [];
  shouldThrow = false;

  async create(data: {
    token: string;
    user: Types.ObjectId | string;
    oAuthClient: Types.ObjectId | string;
    scope: string[];
  }): Promise<IOAuth2Token> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    const newToken = {
      _id: new Types.ObjectId(),
      token: data.token,
      user: new Types.ObjectId(data.user.toString()),
      oAuthClient: new Types.ObjectId(data.oAuthClient.toString()),
      scope: data.scope,
      created: new Date(),
    } as IOAuth2Token;
    this.createdTokens.push(newToken);
    this.tokens.push(newToken);
    return newToken;
  }

  clear(): void {
    this.tokens = [];
    this.createdTokens = [];
    this.shouldThrow = false;
  }
}

class MockOAuth2ScopeRepository implements IOAuth2ScopeRepositoryForOAuth2 {
  scopes: IOAuth2Scope[] = [];
  shouldThrow = false;

  async findByName(name: string): Promise<IOAuth2Scope | null> {
    if (this.shouldThrow) {
      throw new Error('Database error');
    }
    return this.scopes.find(s => s.name === name) || null;
  }

  addScope(scope: Partial<IOAuth2Scope>): IOAuth2Scope {
    const newScope = {
      _id: new Types.ObjectId(),
      name: 'test-scope',
      description: 'Test scope',
      ...scope,
    } as IOAuth2Scope;
    this.scopes.push(newScope);
    return newScope;
  }

  clear(): void {
    this.scopes = [];
    this.shouldThrow = false;
  }
}

describe('OAuth2Controller', () => {
  let controller: OAuth2Controller;
  let clientRepository: MockOAuth2ClientRepository;
  let codeRepository: MockOAuth2CodeRepository;
  let tokenRepository: MockOAuth2TokenRepository;
  let scopeRepository: MockOAuth2ScopeRepository;
  let logger: MockLogger;

  beforeEach(() => {
    clientRepository = new MockOAuth2ClientRepository();
    codeRepository = new MockOAuth2CodeRepository();
    tokenRepository = new MockOAuth2TokenRepository();
    scopeRepository = new MockOAuth2ScopeRepository();
    logger = new MockLogger();

    controller = new OAuth2Controller(
      clientRepository,
      codeRepository,
      tokenRepository,
      scopeRepository,
      logger
    );
  });

  afterEach(() => {
    sinon.restore();
    clientRepository.clear();
    codeRepository.clear();
    tokenRepository.clear();
    scopeRepository.clear();
    logger.clear();
  });

  describe('constructor', () => {
    it('should create an oauth2orize server', () => {
      expect(controller.getServer()).to.exist;
    });
  });

  describe('authorization', () => {
    it('should return an array of middleware functions', () => {
      const authorizationHandlers = controller.authorization;
      expect(authorizationHandlers).to.be.an('array');
      expect(authorizationHandlers.length).to.be.greaterThan(0);
    });
  });

  describe('decision', () => {
    it('should return an array of middleware functions', () => {
      const decisionHandlers = controller.decision;
      expect(decisionHandlers).to.be.an('array');
      expect(decisionHandlers.length).to.be.greaterThan(0);
    });
  });

  describe('token', () => {
    it('should return an array of middleware functions', () => {
      const tokenHandlers = controller.token;
      expect(tokenHandlers).to.be.an('array');
      expect(tokenHandlers.length).to.be.greaterThan(0);
    });
  });

  describe('getServer', () => {
    it('should return the oauth2orize server instance', () => {
      const server = controller.getServer();
      expect(server).to.exist;
      expect(server.serializeClient).to.be.a('function');
      expect(server.deserializeClient).to.be.a('function');
    });
  });

  describe('server serialization', () => {
    it('should serialize client to its ID', done => {
      const server = controller.getServer();
      const client = clientRepository.addClient({});

      // Access internal serialize callback
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (server as any)._serializers[0](client, (err: Error | null, id: string | null) => {
        expect(err).to.be.null;
        expect(id).to.equal(client._id.toString());
        done();
      });
    });

    it('should deserialize client from ID', done => {
      const server = controller.getServer();
      const client = clientRepository.addClient({});

      // Access internal deserialize callback
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (server as any)._deserializers[0](
        client._id.toString(),
        (err: Error | null, foundClient: IOAuth2Client | null) => {
          expect(err).to.be.null;
          expect(foundClient).to.exist;
          expect(foundClient!._id.toString()).to.equal(client._id.toString());
          done();
        }
      );
    });

    it('should return error when client not found during deserialization', done => {
      const server = controller.getServer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (server as any)._deserializers[0](
        new Types.ObjectId().toString(),
        (err: Error | null, _foundClient: IOAuth2Client | null) => {
          expect(err).to.exist;
          expect(err!.message).to.equal('Client not found');
          done();
        }
      );
    });
  });
});
