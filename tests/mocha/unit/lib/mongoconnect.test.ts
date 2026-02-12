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
import { MongoConnect, createMongoConnect, type MongoConnectConfig } from '../../../../src/lib/mongoconnect';
import type { AppLogger } from '../../../../src/lib/logger';
import type { Mongoose } from 'mongoose';

// Mock logger
class MockLogger implements Partial<AppLogger> {
  logs: { level: string; message: string; meta?: unknown }[] = [];

  error(message: string, meta?: unknown): void {
    this.logs.push({ level: 'error', message, meta });
  }
  warn(message: string, meta?: unknown): void {
    this.logs.push({ level: 'warn', message, meta });
  }
  info(message: string, meta?: unknown): void {
    this.logs.push({ level: 'info', message, meta });
  }
  debug(message: string, meta?: unknown): void {
    this.logs.push({ level: 'debug', message, meta });
  }

  clear(): void {
    this.logs = [];
  }
}

// Helper to create mock config
function createMockConfig(overrides: Partial<{
  hasCredentials: boolean;
  user: string | undefined;
  password: string | undefined;
  hosts: string;
  db: string;
  authSource: string | undefined;
}> = {}): MongoConnectConfig {
  const defaults = {
    hasCredentials: false,
    user: undefined,
    password: undefined,
    hosts: 'localhost',
    db: 'openhab',
    authSource: undefined,
  };
  const config = { ...defaults, ...overrides };

  return {
    hasDbCredentials: () => config.hasCredentials,
    getDbUser: () => config.user,
    getDbPass: () => config.password,
    getDbHostsString: () => config.hosts,
    getDbName: () => config.db,
    getDbAuthSource: () => config.authSource,
  };
}

describe('MongoConnect', function () {
  let logger: MockLogger;
  let mockMongoose: { connect: sinon.SinonStub };

  beforeEach(function () {
    logger = new MockLogger();
    mockMongoose = {
      connect: sinon.stub().resolves(),
    };
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('createMongoConnect', function () {
    it('should create a MongoConnect instance', function () {
      const config = createMockConfig();
      const mongoConnect = createMongoConnect(config, logger as AppLogger);
      expect(mongoConnect).to.be.instanceOf(MongoConnect);
    });
  });

  describe('connect', function () {
    it('should connect with basic URI without credentials', async function () {
      const config = createMockConfig({
        hosts: 'localhost:27017',
        db: 'testdb',
      });
      const mongoConnect = new MongoConnect(config, logger as AppLogger);

      await mongoConnect.connect(mockMongoose as unknown as Mongoose);

      expect(mockMongoose.connect.calledOnce).to.be.true;
      const [uri] = mockMongoose.connect.firstCall.args;
      expect(uri).to.equal('mongodb://localhost:27017/testdb');
    });

    it('should embed credentials directly in URI (original behavior)', async function () {
      const config = createMockConfig({
        hasCredentials: true,
        user: 'testuser',
        password: 'testpass',
        hosts: 'localhost:27017',
        db: 'testdb',
      });
      const mongoConnect = new MongoConnect(config, logger as AppLogger);

      await mongoConnect.connect(mockMongoose as unknown as Mongoose);

      expect(mockMongoose.connect.calledOnce).to.be.true;
      const [uri] = mockMongoose.connect.firstCall.args;

      // Credentials should be embedded in URI
      expect(uri).to.equal('mongodb://testuser:testpass@localhost:27017/testdb');
    });

    it('should handle passwords with special characters without encoding', async function () {
      const config = createMockConfig({
        hasCredentials: true,
        user: 'openhab',
        password: 'pass%word',
        hosts: 'localhost',
        db: 'openhab',
      });
      const mongoConnect = new MongoConnect(config, logger as AppLogger);

      await mongoConnect.connect(mockMongoose as unknown as Mongoose);

      const [uri] = mockMongoose.connect.firstCall.args;

      // Password should be embedded as-is, not URL encoded
      expect(uri).to.equal('mongodb://openhab:pass%word@localhost/openhab');
      expect(uri).to.not.include('pass%25word');
    });

    it('should handle passwords with @ symbol', async function () {
      const config = createMockConfig({
        hasCredentials: true,
        user: 'user',
        password: 'p@ssword',
        hosts: 'localhost',
        db: 'testdb',
      });
      const mongoConnect = new MongoConnect(config, logger as AppLogger);

      await mongoConnect.connect(mockMongoose as unknown as Mongoose);

      const [uri] = mockMongoose.connect.firstCall.args;
      expect(uri).to.include('p@ssword');
    });

    it('should handle passwords with multiple special characters', async function () {
      const config = createMockConfig({
        hasCredentials: true,
        user: 'admin',
        password: 'p@ss%w0rd#123!',
        hosts: 'localhost',
        db: 'testdb',
      });
      const mongoConnect = new MongoConnect(config, logger as AppLogger);

      await mongoConnect.connect(mockMongoose as unknown as Mongoose);

      const [uri] = mockMongoose.connect.firstCall.args;
      expect(uri).to.equal('mongodb://admin:p@ss%w0rd#123!@localhost/testdb');
    });

    it('should handle multiple hosts', async function () {
      const config = createMockConfig({
        hosts: 'mongo1:27017,mongo2:27017,mongo3:27017',
        db: 'openhab',
      });
      const mongoConnect = new MongoConnect(config, logger as AppLogger);

      await mongoConnect.connect(mockMongoose as unknown as Mongoose);

      const [uri] = mockMongoose.connect.firstCall.args;
      expect(uri).to.equal('mongodb://mongo1:27017,mongo2:27017,mongo3:27017/openhab');
    });

    it('should log masked URI (not exposing password)', async function () {
      const config = createMockConfig({
        hasCredentials: true,
        user: 'testuser',
        password: 'secretpass',
        hosts: 'localhost',
        db: 'testdb',
      });
      const mongoConnect = new MongoConnect(config, logger as AppLogger);

      await mongoConnect.connect(mockMongoose as unknown as Mongoose);

      const infoLogs = logger.logs.filter(l => l.level === 'info');
      const connectLog = infoLogs.find(l => l.message.includes('Trying to connect'));
      expect(connectLog).to.exist;
      expect(connectLog!.message).to.include('testuser:***@');
      expect(connectLog!.message).to.not.include('secretpass');
    });

    it('should log success message on successful connection', async function () {
      const config = createMockConfig();
      const mongoConnect = new MongoConnect(config, logger as AppLogger);

      await mongoConnect.connect(mockMongoose as unknown as Mongoose);

      const infoLogs = logger.logs.filter(l => l.level === 'info');
      expect(infoLogs.some(l => l.message.includes('Successfully connected'))).to.be.true;
    });

    it('should log and throw error on connection failure', async function () {
      const config = createMockConfig();
      const mongoConnect = new MongoConnect(config, logger as AppLogger);
      const error = new Error('Connection refused');
      mockMongoose.connect.rejects(error);

      try {
        await mongoConnect.connect(mockMongoose as unknown as Mongoose);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).to.equal(error);
      }

      const errorLogs = logger.logs.filter(l => l.level === 'error');
      expect(errorLogs.length).to.be.greaterThan(0);
    });
  });
});
